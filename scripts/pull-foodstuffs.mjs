#!/usr/bin/env node
/* Pull a store's full online catalogue from the public Foodstuffs edge API.
 *
 * Usage:
 *   BRAND=pns TOKEN=... STORE_ID=... OUT=/tmp/paknsave.json \
 *     node scripts/pull-foodstuffs.mjs
 *
 * The shop's own web client uses this anonymous endpoint. Product prices are
 * in cents and are scoped to the selected store. The API caps a query at 1000
 * rows, so the catalogue is walked department by department and subcategory
 * by subcategory, de-duplicating by productId.
 */

import fs from "node:fs";
import path from "node:path";

const BRANDS = {
  pns: {
    name: "PAK'nSAVE",
    api: "https://api-prod.paknsave.co.nz/v1/edge",
    site: "https://www.paknsave.co.nz",
  },
  nw: {
    name: "New World",
    api: "https://api-prod.newworld.co.nz/v1/edge",
    site: "https://www.newworld.co.nz",
  },
};

const brandKey = process.env.BRAND;
const brand = BRANDS[brandKey];
let token = process.env.TOKEN || "";
let storeId = process.env.STORE_ID || "";
const storeName = process.env.STORE_NAME || "";
const outPath = process.env.OUT;

if (!brand || !outPath) {
  console.error(
    "Set BRAND (pns|nw) and OUT. Set TOKEN and STORE_ID, or STORE_NAME to discover them."
  );
  process.exit(1);
}

const PAGE_SIZE = 50;
const CONCURRENCY = 4;
const MAX_PAGES = 20; // API ceiling: 20 × 50 = 1000 rows per query.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* The shop's own web client gets a short-lived anonymous JWT from this
   endpoint. It needs no account, so a scheduled refresh can fetch a fresh
   token instead of storing one that expires. */
async function guestToken() {
  const res = await fetch(`${brand.site}/api/user/get-current-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: brand.site,
      Referer: `${brand.site}/`,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ fingerprintUser: "grocer-demo-price-check" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guest token ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("Guest token response had no access_token");
  return json.access_token;
}

async function findStoreId(name) {
  const res = await fetch(`${brand.api}/store`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Store list ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const stores = Array.isArray(json) ? json : json.stores || [];
  const match = stores.find((store) =>
    String(store.name || "").toLowerCase().includes(name.toLowerCase())
  );
  if (!match) throw new Error(`No ${brand.name} store matching "${name}"`);
  console.log(`  using ${match.name} (${match.id})`);
  return match.id;
}

async function api(body, attempt = 0) {
  const res = await fetch(`${brand.api}/search/paginated/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`API ${res.status} after ${attempt} retries`);
    const wait = 1000 * 2 ** attempt;
    console.warn(`  ${res.status}; retrying in ${wait}ms`);
    await sleep(wait);
    return api(body, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

function queryBody({ filter, page = 0, facets = [], maxValuesPerFacet = 100 }) {
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

async function page(filter, page) {
  const json = await api(queryBody({ filter, page }));
  return {
    products: json.products || [],
    totalHits: json.totalHits || 0,
    totalPages: json.totalPages || 0,
  };
}

async function facets(filter, facetName, maxValuesPerFacet = 1000) {
  const json = await api(
    queryBody({ filter, page: 0, facets: [facetName], maxValuesPerFacet })
  );
  return json.algoliaSearchResult?.facets?.[facetName] || {};
}

/* Fetch every page of one filtered query. Returns the rows plus a flag when
   the 1000-row ceiling was reached, so the caller can split the query. */
async function fetchQuery(filter, label) {
  const first = await page(filter, 0);
  const rows = [...first.products];
  const pages = Math.min(first.totalPages, MAX_PAGES);
  for (let p = 1; p < pages; p += 1) {
    const next = await page(filter, p);
    rows.push(...next.products);
  }
  const capped = first.totalHits >= 1000 && first.totalPages >= MAX_PAGES;
  console.log(
    `  ${label}: ${rows.length} rows${capped ? " (CAPPED)" : ""}`
  );
  return { rows, capped };
}

function q(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const seen = new Map();

function addRows(rows, department, subcategory) {
  for (const product of rows) {
    if (!product?.productId) continue;
    const existing = seen.get(product.productId);
    if (existing) continue;
    seen.set(product.productId, {
      ...product,
      _department: department,
      _subcategory: subcategory || null,
    });
  }
}

/* A capped query is narrowed by category2, then by brand. */
async function fetchLeaf(filter, label) {
  const result = await fetchQuery(filter, label);
  if (!result.capped) return result.rows;

  console.warn(`  ${label} hit the 1000-row ceiling; splitting by subcategory`);
  const leaves = await facets(filter, "category2NI");
  const rows = [];
  for (const [leaf, count] of Object.entries(leaves).sort((a, b) => b[1] - a[1])) {
    const leafFilter = `${filter} AND category2NI:${q(leaf)}`;
    const sub = await fetchQuery(leafFilter, `${label} / ${leaf} (${count})`);
    if (sub.capped) {
      console.warn(`  ${label} / ${leaf} still capped; splitting by brand`);
      const brands = await facets(leafFilter, "brand");
      for (const [b, bCount] of Object.entries(brands).sort((a, b) => b[1] - a[1])) {
        const brandFilter = `${leafFilter} AND brand:${q(b)}`;
        const brandResult = await fetchQuery(brandFilter, `${leaf} / ${b} (${bCount})`);
        rows.push(...brandResult.rows);
      }
    } else {
      rows.push(...sub.rows);
    }
  }
  return rows;
}

async function main() {
  if (!token) {
    console.log(`  requesting a guest token for ${brand.name}`);
    token = await guestToken();
  }
  if (!storeId) {
    if (!storeName) throw new Error("Set STORE_ID or STORE_NAME.");
    storeId = await findStoreId(storeName);
  }
  console.log(`${brand.name} — store ${storeId}`);
  const base = `stores:${storeId}`;

  const departments = await facets(base, "category0NI");
  const pairs = [];
  for (const [department, deptCount] of Object.entries(departments).sort(
    (a, b) => b[1] - a[1]
  )) {
    const filter = `${base} AND category0NI:${q(department)}`;
    const subs = await facets(filter, "category1NI");
    for (const [subcategory, count] of Object.entries(subs)) {
      if (count > 0) pairs.push({ department, subcategory, count });
    }
    console.log(`  ${department}: ${Object.keys(subs).length} subcategories`);
  }

  let done = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < pairs.length) {
      const pair = pairs[cursor];
      cursor += 1;
      done += 1;
      const filter = `${base} AND category0NI:${q(pair.department)} AND category1NI:${q(
        pair.subcategory
      )}`;
      try {
        const rows = await fetchLeaf(filter, `${done}/${pairs.length} ${pair.department} / ${pair.subcategory}`);
        addRows(rows, pair.department, pair.subcategory);
      } catch (error) {
        console.error(`  FAILED ${pair.department} / ${pair.subcategory}: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const products = [...seen.values()];
  const output = {
    brand: brandKey,
    brandName: brand.name,
    storeId,
    fetchedAt: new Date().toISOString(),
    source: `${brand.site}/shop/category/`,
    categories: pairs.map(({ department, subcategory, count }) => ({
      department,
      subcategory,
      count,
    })),
    productCount: products.length,
    products,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log(`Wrote ${products.length} unique products to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
