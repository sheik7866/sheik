#!/usr/bin/env node
/* Merge the all-store pull into data/store-prices/ and data/catalogue.js.
 *
 * The four base lists in data/catalogue.js cover most prices. This script
 * copies each branch's sparse override file and adds products that only appear
 * in branch pulls to the shared catalogue, so selecting that branch can show
 * them. Override files carry that branch's prices and deal terms. It refuses to
 * build if any non-base branch is missing its files.
 *
 *   node scripts/build-store-price-data.mjs
 *   SOURCE_DIR=/tmp/store-price-pull node scripts/build-store-price-data.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_DIR = process.env.SOURCE_DIR || "/tmp/store-price-pull";
const OVERRIDE_DIR = path.join(SOURCE_DIR, "overrides");
const NEW_PRODUCT_DIR = path.join(SOURCE_DIR, "new-products");
const CATALOGUE_PATH = process.env.CATALOGUE || path.join(ROOT, "data/catalogue.js");
const OUT_DIR = process.env.OUT_DIR || path.join(ROOT, "data/store-prices");

function loadWindow(file, globalName) {
  const text = fs.readFileSync(file, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(text, sandbox, { filename: file });
  return sandbox.window[globalName];
}

function sortRows(a, b) {
  return (
    String(a[4] || "").localeCompare(String(b[4] || ""), "en-NZ") ||
    String(a[5] || "").localeCompare(String(b[5] || ""), "en-NZ") ||
    String(a[1] || "").localeCompare(String(b[1] || ""), "en-NZ")
  );
}

const catalogue = loadWindow(CATALOGUE_PATH, "GROCER_CATALOGUE");
const directory = loadWindow(path.join(ROOT, "data/stores.js"), "GROCER_STORES");
if (!catalogue?.items || !Array.isArray(directory?.stores)) {
  throw new Error("Could not load the catalogue or branch directory");
}

const baseStoreIds = new Set(
  Object.values(catalogue.zones || {})
    .map((zone) => zone.storeId)
    .filter(Boolean)
);
const stores = directory.stores.filter((store) => !baseStoreIds.has(store.id));
const missing = stores.filter(
  (store) =>
    !fs.existsSync(path.join(OVERRIDE_DIR, `${store.id}.json`)) ||
    !fs.existsSync(path.join(NEW_PRODUCT_DIR, `${store.id}.json`))
);
if (missing.length) {
  throw new Error(
    `${missing.length} branch pulls are incomplete: ` +
      missing
        .slice(0, 8)
        .map((store) => `${store.name} ${store.branch}`)
        .join(", ")
  );
}

const baseIds = new Set(catalogue.items.map((row) => String(row[0]).toUpperCase()));
const newProducts = new Map();

for (const store of stores) {
  const rows = JSON.parse(
    fs.readFileSync(path.join(NEW_PRODUCT_DIR, `${store.id}.json`), "utf8")
  );
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const id = String(row[0] || "").toUpperCase();
    if (!id || baseIds.has(id) || newProducts.has(id)) continue;
    newProducts.set(id, [
      id,
      String(row[1] || ""),
      String(row[2] || ""),
      String(row[3] || ""),
      String(row[4] || "Other"),
      String(row[5] || ""),
      0,
      0,
      0,
      0,
      null,
      null,
      null,
      null,
    ]);
  }
}

const rows = [...catalogue.items, ...newProducts.values()].sort(sortRows);
const checkedAt =
  [catalogue.checkedAt, ...stores.map((store) => {
    const data = JSON.parse(
      fs.readFileSync(path.join(OVERRIDE_DIR, `${store.id}.json`), "utf8")
    );
    return data.checkedAt || "";
  })]
    .filter(Boolean)
    .sort()
    .at(-1) || "";

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const file of fs.readdirSync(OUT_DIR)) {
  if (file.endsWith(".json")) fs.rmSync(path.join(OUT_DIR, file));
}

let overrideCount = 0;
let dealCount = 0;
let overrideBytes = 0;
const manifestStores = {};

for (const store of stores) {
  const source = path.join(OVERRIDE_DIR, `${store.id}.json`);
  const data = JSON.parse(fs.readFileSync(source, "utf8"));
  const prices = data.prices && typeof data.prices === "object" ? data.prices : {};
  const deals = data.deals && typeof data.deals === "object" ? data.deals : {};
  // Stable key order keeps nightly commits small when only a few prices move.
  const sortedPrices = Object.fromEntries(
    Object.entries(prices).sort(([a], [b]) => a.localeCompare(b))
  );
  const sortedDeals = Object.fromEntries(
    Object.entries(deals).sort(([a], [b]) => a.localeCompare(b))
  );
  const target = path.join(OUT_DIR, `${store.id}.json`);
  fs.writeFileSync(
    target,
    JSON.stringify({
      storeId: store.id,
      brand: store.brand,
      checkedAt: data.checkedAt || "",
      productCount: data.productCount || 0,
      prices: sortedPrices,
      deals: sortedDeals,
    })
  );
  overrideCount += Object.keys(prices).length;
  dealCount += Object.keys(deals).length;
  overrideBytes += fs.statSync(target).size;
  manifestStores[store.id] = {
    checkedAt: data.checkedAt || "",
    productCount: data.productCount || 0,
    overrides: Object.keys(prices).length,
    deals: Object.keys(deals).length,
  };
}

const baseCatalogue = {
  ...catalogue,
  checkedAt,
  productCount: rows.length,
  storePrices: {
    checkedAt,
    stores: stores.length,
    overrides: overrideCount,
    deals: dealCount,
  },
  items: rows,
};

const header = `/* Generated by scripts/build-catalogue.mjs and build-store-price-data.mjs from the dated public store pulls.
   ${rows.length.toLocaleString("en-NZ")} products; prices are shelf prices in
   cents from each banner's North Island and South Island base price lists, fetched
   ${catalogue.fetchedAt}. Branch-specific overrides are in data/store-prices/;
   they also carry that branch's multi-buy and club-card terms. 0 means that
   price list did not return the product.
   Do not edit by hand — re-run the pull and build scripts instead. */\n`;

fs.writeFileSync(
  CATALOGUE_PATH,
  `${header}window.GROCER_CATALOGUE = ${JSON.stringify(baseCatalogue)};\n`
);

fs.writeFileSync(
  path.join(OUT_DIR, "index.json"),
  JSON.stringify({
    fetchedAt: catalogue.fetchedAt,
    checkedAt,
    baseStoreIds: [...baseStoreIds],
    stores: manifestStores,
  })
);

console.log(
  `[build-store-prices] ${rows.length} products (${newProducts.size} branch-only), ` +
    `${stores.length} branch files, ${overrideCount} overrides, ${dealCount} deals, ` +
    `${(overrideBytes / 1024 / 1024).toFixed(2)} MB overrides`
);
