#!/usr/bin/env node
/* Pull one store's price list and write only what differs from its banner's
 * island base list.
 *
 * Driven by scripts/pull-all-store-prices.mjs. This deliberately does not keep
 * a full raw catalogue on disk: on a 200-store run the raw JSON would be
 * several gigabytes. It keeps the price overrides, the single-item, multi-buy
 * and club-card deal terms, and metadata for products that are not already in
 * the base union.
 *
 *   STORE_ID=... BRAND=pns ZONE=pns-ni \
 *     BASE_MAP_FILE=/tmp/base-prices.json BASE_IDS_FILE=/tmp/base-ids.json \
 *     OUT_DIR=/tmp/store-price-pull node scripts/pull-store-price.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { dealForProduct } from "./deal-utils.mjs";

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

const storeId = process.env.STORE_ID;
const brandKey = process.env.BRAND;
const zone = process.env.ZONE;
const outDir = process.env.OUT_DIR || "/tmp/store-price-pull";
const baseMapFile = process.env.BASE_MAP_FILE || "/tmp/base-prices.json";
const baseIdsFile = process.env.BASE_IDS_FILE || "/tmp/base-ids.json";
const brand = BRANDS[brandKey];

if (!storeId || !brand || !zone) {
  console.error("Set STORE_ID, BRAND (pns|nw) and ZONE.");
  process.exit(1);
}

const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const CONCURRENCY = 4;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const baseData = JSON.parse(fs.readFileSync(baseMapFile, "utf8"));
const basePrices = baseData.zones?.[zone];
if (!basePrices) throw new Error(`No base prices for zone ${zone} in ${baseMapFile}`);
const baseIds = new Set(JSON.parse(fs.readFileSync(baseIdsFile, "utf8")));

function canonicalTree(product) {
  const trees = Array.isArray(product.categoryTrees) ? product.categoryTrees : [];
  return (
    trees.find((tree) => !["Featured", "Cracker Deals"].includes(tree.level0)) ||
    trees[0] ||
    null
  );
}

function displayName(product) {
  const brandName = String(product.brand || "").trim();
  const name = String(product.name || "").trim();
  if (!brandName) return name;
  if (!name) return brandName;
  return name.toLowerCase().includes(brandName.toLowerCase())
    ? name
    : `${brandName} ${name}`;
}

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
    throw new Error(`Guest token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("Guest token response had no access_token");
  return json.access_token;
}

let token = await guestToken();

async function api(body, attempt = 0) {
  const res = await fetch(`${brand.api}/search/paginated/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401 && attempt === 0) {
    token = await guestToken();
    return api(body, 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`API ${res.status} after ${attempt} retries`);
    const wait = 1000 * 2 ** attempt;
    await sleep(wait);
    return api(body, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
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

async function page(filter, pageNumber) {
  const json = await api(queryBody({ filter, page: pageNumber }));
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

async function fetchQuery(filter) {
  const first = await page(filter, 0);
  const rows = [...first.products];
  const pages = Math.min(first.totalPages, MAX_PAGES);
  for (let p = 1; p < pages; p += 1) {
    const next = await page(filter, p);
    rows.push(...next.products);
  }
  const capped = first.totalHits >= 1000 && first.totalPages >= MAX_PAGES;
  return { rows, capped };
}

function q(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const seen = new Map();

function addRows(rows, department, subcategory) {
  for (const product of rows) {
    const id = String(product?.productId || "").toUpperCase();
    if (!id || seen.has(id)) continue;
    seen.set(id, {
      ...product,
      productId: id,
      _department: department,
      _subcategory: subcategory || null,
    });
  }
}

async function fetchLeaf(filter) {
  const result = await fetchQuery(filter);
  if (!result.capped) return result.rows;

  const rows = [];
  const leaves = await facets(filter, "category2NI");
  for (const [leaf] of Object.entries(leaves).sort((a, b) => b[1] - a[1])) {
    const leafFilter = `${filter} AND category2NI:${q(leaf)}`;
    const sub = await fetchQuery(leafFilter);
    if (sub.capped) {
      const brands = await facets(leafFilter, "brand");
      for (const [b] of Object.entries(brands).sort((a, b) => b[1] - a[1])) {
        const brandResult = await fetchQuery(`${leafFilter} AND brand:${q(b)}`);
        rows.push(...brandResult.rows);
      }
    } else {
      rows.push(...sub.rows);
    }
  }
  return rows;
}

const baseFilter = `stores:${storeId}`;
const departments = await facets(baseFilter, "category0NI");
if (!Object.keys(departments).length) {
  throw new Error(`No departments returned for ${brand.name} ${storeId}`);
}

const pairs = [];
for (const [department] of Object.entries(departments).sort((a, b) => b[1] - a[1])) {
  const filter = `${baseFilter} AND category0NI:${q(department)}`;
  const subs = await facets(filter, "category1NI");
  for (const [subcategory, count] of Object.entries(subs)) {
    if (count > 0) pairs.push({ department, subcategory });
  }
}

let cursor = 0;
let done = 0;
const failures = [];
async function worker() {
  while (cursor < pairs.length) {
    const pair = pairs[cursor];
    cursor += 1;
    done += 1;
    const filter = `${baseFilter} AND category0NI:${q(pair.department)} AND category1NI:${q(
      pair.subcategory
    )}`;
    try {
      const rows = await fetchLeaf(filter);
      addRows(rows, pair.department, pair.subcategory);
    } catch (error) {
      failures.push(`${pair.department} / ${pair.subcategory}: ${error.message}`);
      console.error(
        `[pull-store-price] ${brand.name} ${storeId} failed ${pair.department} / ${pair.subcategory}: ${error.message}`
      );
    }
    if (done % 25 === 0 || done === pairs.length) {
      console.log(`[pull-store-price] ${storeId} ${done}/${pairs.length}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

if (failures.length) {
  console.error(
    `[pull-store-price] ${storeId} incomplete: ${failures.length} category failures`
  );
  process.exit(1);
}

const checkedAt = new Date().toISOString();
const prices = {};
const deals = {};
const newProducts = [];
let same = 0;
let changed = 0;
let missingBase = 0;

for (const [id, product] of seen) {
  const price = product.singlePrice?.price;
  if (!Number.isFinite(price) || price <= 0) continue;
  const cents = Math.round(price);
  const base = basePrices[id];
  if (base === undefined) {
    missingBase += 1;
    prices[id] = cents;
  } else if (base !== cents) {
    changed += 1;
    prices[id] = cents;
  } else {
    same += 1;
  }

  const deal = dealForProduct(product, cents);
  if (deal) deals[id] = deal;

  if (!baseIds.has(id)) {
    const tree = canonicalTree(product);
    newProducts.push([
      id,
      displayName(product),
      String(product.brand || "").trim(),
      String(product.displayName || "").trim(),
      tree?.level0 || product._department || "Other",
      tree?.level1 || product._subcategory || "",
    ]);
  }
}

if (!seen.size) {
  throw new Error(`No products returned for ${brand.name} ${storeId}`);
}

const overrideDir = path.join(outDir, "overrides");
const newProductDir = path.join(outDir, "new-products");
fs.mkdirSync(overrideDir, { recursive: true });
fs.mkdirSync(newProductDir, { recursive: true });

const overridePath = path.join(overrideDir, `${storeId}.json`);
fs.writeFileSync(
  overridePath,
  JSON.stringify({
    storeId,
    brand: brandKey,
    zone,
    checkedAt,
    productCount: seen.size,
    prices,
    deals,
  })
);
fs.writeFileSync(
  path.join(newProductDir, `${storeId}.json`),
  JSON.stringify(newProducts)
);

console.log(
  `[pull-store-price] ${brand.name} ${storeId}: ${seen.size} products, ` +
    `${missingBase} outside base, ${changed} changed, ${same} same, ` +
    `${Object.keys(prices).length} overrides, ${Object.keys(deals).length} deals`
);
