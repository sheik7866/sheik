#!/usr/bin/env node
/* Pull each branch's own online range from the public Foodstuffs edge API.
 *
 *   node scripts/pull-coverage.mjs            # reuse today's cached pulls
 *   node scripts/pull-coverage.mjs --all      # re-pull every branch
 *   LIMIT=2 STORE_CONCURRENCY=2 node scripts/pull-coverage.mjs
 *
 * Both banners expose a store-scoped search API: filtering by stores:<uuid>
 * returns only the lines that branch carries, and those ranges differ
 * substantially between nearby branches (Mt Albert and Royal Oak share fewer
 * than 400 of their ~500 snack lines). The four island price lists still
 * supply the prices, because shelf prices match within a banner and island;
 * this script supplies the per-branch stock coverage the demo was missing.
 *
 * The API pages at 50 rows and caps a query at 1000, so a branch is walked
 * department by department and split by subcategory where a department is
 * larger than that ceiling. Raw product-id sets are cached per branch in
 * COVERAGE_CACHE so an interrupted run resumes where it stopped.
 *
 * Output is data/coverage.js: one base64 bitmap per branch over the catalogue
 * ids, plus those ids so the file stays valid when the nightly price refresh
 * rebuilds the catalogue. It is the branch's published range, not live shelf
 * stock, and a branch whose pull had failures is retried on the next run.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = process.env.OUT || path.join(ROOT, "data/coverage.js");
const STORES_FILE = process.env.STORES || path.join(ROOT, "data/stores.js");
const CATALOGUE = process.env.CATALOGUE || path.join(ROOT, "data/catalogue.js");
const CACHE_DIR = process.env.COVERAGE_CACHE || "/tmp/grocer-coverage";
const ALL = process.argv.includes("--all");
const LIMIT = Number(process.env.LIMIT || 0);
const STORE_CONCURRENCY = Math.max(1, Number(process.env.STORE_CONCURRENCY || 3));
const WORKERS = Math.max(1, Number(process.env.WORKERS || 4));

const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Pacific/Auckland",
}).format(new Date());

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

const BRANDS = {
  pns: {
    name: "PAK'nSAVE",
    site: "https://www.paknsave.co.nz",
    api: "https://api-prod.paknsave.co.nz/v1/edge",
  },
  nw: {
    name: "New World",
    site: "https://www.newworld.co.nz",
    api: "https://api-prod.newworld.co.nz/v1/edge",
  },
};

const PAGE_SIZE = 50;
const MAX_PAGES = 20; // API ceiling: 20 × 50 = 1000 rows per query.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function q(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

for (const brand of Object.values(BRANDS)) {
  brand.token = "";
  brand.tokenPromise = null;
}

async function guestToken(brand) {
  const res = await fetch(`${brand.site}/api/user/get-current-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: brand.site,
      Referer: `${brand.site}/`,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ fingerprintUser: "grocer-demo-coverage-check" }),
  });
  if (!res.ok) throw new Error(`${brand.name} guest token ${res.status}`);
  const json = await res.json();
  if (!json.access_token) throw new Error(`${brand.name} guest token had no access_token`);
  return json.access_token;
}

async function accessToken(brand, refresh = false) {
  if (refresh) {
    brand.token = "";
    brand.tokenPromise = null;
  }
  if (brand.token) return brand.token;
  if (!brand.tokenPromise) {
    brand.tokenPromise = guestToken(brand)
      .then((token) => {
        brand.token = token;
        return token;
      })
      .finally(() => {
        brand.tokenPromise = null;
      });
  }
  return brand.tokenPromise;
}

async function api(brand, body, attempt = 0) {
  const token = await accessToken(brand);
  let res;
  try {
    res = await fetch(`${brand.api}/search/paginated/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (attempt >= 6) throw error;
    const wait = 1000 * 2 ** Math.min(attempt, 4) + Math.random() * 500;
    await sleep(wait);
    return api(brand, body, attempt + 1);
  }
  if (res.status === 401 && attempt < 2) {
    await accessToken(brand, true);
    return api(brand, body, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`${brand.name} API ${res.status}`);
    const wait = 1000 * 2 ** Math.min(attempt, 4) + Math.random() * 500;
    await sleep(wait);
    return api(brand, body, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${brand.name} API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function queryBody(storeId, filter, { page = 0, facets = [], maxValuesPerFacet = 100 } = {}) {
  return {
    algoliaQuery: {
      query: "",
      hitsPerPage: PAGE_SIZE,
      page,
      filters: filter,
      facets,
      maxValuesPerFacet,
      analyticsTags: ["fs#WEB:mobile"],
    },
    algoliaFacetQueries: [],
    storeId,
    hitsPerPage: PAGE_SIZE,
    page,
    sortOrder: "NI_POPULARITY_ASC",
    tobaccoQuery: true,
    precisionMedia: {
      adDomain: "SEARCH_PAGE",
      adPositions: [3, 6, 9],
      publishImpressionEvent: false,
      disableAds: true,
    },
  };
}

async function facets(brand, storeId, filter, name) {
  const json = await api(
    brand,
    queryBody(storeId, filter, { facets: [name], maxValuesPerFacet: 1000 })
  );
  return json.algoliaSearchResult?.facets?.[name] || {};
}

/* Every page of one filtered query. `capped` means the API's 1000-row ceiling
   stopped the query short, so the caller has to split it further. */
async function fetchQuery(brand, storeId, filter) {
  const first = await api(brand, queryBody(storeId, filter));
  const rows = [...(first.products || [])];
  const pages = Math.min(first.totalPages || 0, MAX_PAGES);
  for (let p = 1; p < pages; p += 1) {
    const next = await api(brand, queryBody(storeId, filter, { page: p }));
    rows.push(...(next.products || []));
  }
  return {
    rows,
    capped: (first.totalHits || 0) >= 1000 && (first.totalPages || 0) >= MAX_PAGES,
  };
}

/* A department under the ceiling is one query chain; a bigger one is split by
   subcategory, and a still-bigger subcategory by brand. */
async function collect(brand, storeId, filter, ids, label) {
  const result = await fetchQuery(brand, storeId, filter);
  if (!result.capped) {
    for (const product of result.rows) if (product?.productId) ids.add(product.productId);
    return;
  }

  const subs = await facets(brand, storeId, filter, "category1NI");
  const entries = Object.entries(subs).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    for (const product of result.rows) if (product?.productId) ids.add(product.productId);
    console.warn(`  ${label}: capped with no subcategories; kept ${result.rows.length} rows`);
    return;
  }
  for (const [sub, count] of entries) {
    const subFilter = `${filter} AND category1NI:${q(sub)}`;
    if (count > 1000) {
      const brands = await facets(brand, storeId, subFilter, "brand");
      for (const [brandName, brandCount] of Object.entries(brands).sort((a, b) => b[1] - a[1])) {
        const rows = await fetchQuery(
          brand,
          storeId,
          `${subFilter} AND brand:${q(brandName)}`
        );
        for (const product of rows.rows) if (product?.productId) ids.add(product.productId);
        if (rows.capped) {
          console.warn(`  ${label} / ${sub} / ${brandName} (${brandCount}): still capped`);
        }
      }
    } else {
      const rows = await fetchQuery(brand, storeId, subFilter);
      for (const product of rows.rows) if (product?.productId) ids.add(product.productId);
    }
  }
}

async function pullStore(brand, store) {
  const base = `stores:${store.id}`;
  const departments = await facets(brand, store.id, base, "category0NI");
  const tasks = [];
  for (const [department, count] of Object.entries(departments).sort((a, b) => b[1] - a[1])) {
    const filter = `${base} AND category0NI:${q(department)}`;
    if (count > 1000) {
      const subs = await facets(brand, store.id, filter, "category1NI");
      for (const [sub, subCount] of Object.entries(subs).sort((a, b) => b[1] - a[1])) {
        if (subCount > 0) {
          tasks.push({ filter: `${filter} AND category1NI:${q(sub)}`, label: `${department} / ${sub}` });
        }
      }
    } else if (count > 0) {
      tasks.push({ filter, label: department });
    }
  }

  const ids = new Set();
  let cursor = 0;
  let failed = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      try {
        await collect(brand, store.id, task.filter, ids, task.label);
      } catch (error) {
        failed += 1;
        console.warn(`  ${store.branch} / ${task.label}: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(WORKERS, tasks.length) }, worker));

  return {
    storeId: store.id,
    brand: store.brand,
    branch: store.branch,
    productIds: [...ids],
    failed,
  };
}

function readWindow(file, name) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  const value = sandbox.window[name];
  if (!value) throw new Error(`No window.${name} in ${file}`);
  return value;
}

function cachePath(storeId) {
  return path.join(CACHE_DIR, `${storeId}.json`);
}

function readCache(storeId) {
  const file = cachePath(storeId);
  if (!fs.existsSync(file)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(cached.productIds)) return null;
    if (cached.failed) return null; // a partial pull is retried, not reused
    if (!ALL && String(cached.fetchedAt || "").slice(0, 10) !== TODAY) return null;
    return cached;
  } catch {
    return null;
  }
}

function saveCache(result) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    cachePath(result.storeId),
    JSON.stringify({ ...result, fetchedAt: new Date().toISOString() })
  );
}

function writeOutput(stores, catalogue, results) {
  const ids = catalogue.items.map((row) => String(row[0] || "")).filter(Boolean);
  const index = new Map(ids.map((id, position) => [id.toUpperCase(), position]));
  const byteLength = Math.ceil(ids.length / 8);
  const branches = {};

  for (const store of stores) {
    const result = results.get(store.id);
    if (!result) continue;
    const bits = new Uint8Array(byteLength);
    let stocked = 0;
    for (const productId of result.productIds) {
      const position = index.get(String(productId).toUpperCase());
      if (position == null) continue;
      bits[position >> 3] |= 0x80 >> (position & 7);
      stocked += 1;
    }
    branches[store.id] = {
      stocked,
      raw: result.productIds.length,
      bits: Buffer.from(bits).toString("base64"),
    };
  }

  const payload = {
    fetchedAt: TODAY,
    checkedAt: new Date().toISOString(),
    source: "PAK'nSAVE and New World store-scoped product ranges",
    note: "Each branch's own published range, not live shelf stock.",
    catalogueFetchedAt: catalogue.fetchedAt || "",
    productCount: ids.length,
    ids,
    branches,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
            `/* Generated by scripts/pull-coverage.mjs from each branch's store-scoped product
   range on ${TODAY}. ${Object.keys(branches).length} branches, ${ids.length.toLocaleString("en-NZ")} catalogue
   products. A bitmap per branch says which catalogue lines that branch stocks online;
   prices still come from the banner's North or South Island price list. Not live stock.
   Do not edit by hand — re-run the script instead. */
window.GROCER_COVERAGE = ${JSON.stringify(payload)};
`
  );
  return { branches: Object.keys(branches).length, bytes: fs.statSync(OUT).size };
}

async function main() {
  const directory = readWindow(STORES_FILE, "GROCER_STORES");
  const catalogue = readWindow(CATALOGUE, "GROCER_CATALOGUE");
  const allStores = (directory.stores || []).filter((store) => BRANDS[store.brand]);
  const stores = LIMIT ? allStores.slice(0, LIMIT) : allStores;
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const results = new Map();
  const queue = [];
  for (const store of stores) {
    const cached = readCache(store.id);
    if (cached) {
      results.set(store.id, cached);
      console.log(`${store.brand.toUpperCase()} ${store.branch}: cached ${cached.productIds.length} products`);
    } else {
      queue.push(store);
    }
  }
  console.log(
    `${stores.length} branches: ${results.size} cached, ${queue.length} to pull ` +
      `(${STORE_CONCURRENCY} branches × ${WORKERS} workers)`
  );

  let cursor = 0;
  let pulled = 0;
  const started = Date.now();

  async function storeWorker() {
    while (cursor < queue.length) {
      const store = queue[cursor];
      cursor += 1;
      const brand = BRANDS[store.brand];
      const storeStarted = Date.now();
      try {
        const result = await pullStore(brand, store);
        saveCache(result);
        results.set(store.id, result);
        pulled += 1;
        const seconds = (Date.now() - storeStarted) / 1000;
        const rate = pulled / ((Date.now() - started) / 1000);
        const remaining = queue.length - pulled;
        console.log(
          `${store.brand.toUpperCase()} ${store.branch}: ${result.productIds.length} products ` +
            `in ${seconds.toFixed(0)}s · ${pulled}/${queue.length} · ` +
            `${(rate * 60).toFixed(1)} branches/min · ~${(remaining / rate / 60).toFixed(0)} min left`
        );
      } catch (error) {
        console.warn(`${store.brand.toUpperCase()} ${store.branch}: FAILED ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(STORE_CONCURRENCY, queue.length) }, storeWorker));

  const missing = stores.filter((store) => !results.has(store.id));
  if (missing.length) {
    console.warn(`${missing.length} branches have no coverage: ${missing.map((s) => s.branch).join(", ")}`);
  }

  const written = writeOutput(stores, catalogue, results);
  console.log(
    `Wrote ${written.branches}/${stores.length} branches to ${OUT} ` +
      `(${(written.bytes / 1024 / 1024).toFixed(2)} MB)`
  );
  // A partially failed pull is still useful (those branches fall back to their
  // island price list), but a run with no coverage at all is a real failure.
  if (!written.branches) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[coverage] FAILED ${error.message}`);
  process.exit(1);
});
