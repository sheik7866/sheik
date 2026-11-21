#!/usr/bin/env node
/* Build data/catalogue.js from the raw Foodstuffs pulls.
 *
 *   RAW_DIR=/tmp/foodstuffs node scripts/build-catalogue.mjs
 *
 * Raw files are produced by scripts/pull-foodstuffs.mjs. Prices are the same
 * across a banner within an island (the stores use one North Island and one
 * South Island price list), so the demo pulls one representative store per
 * banner per island and gives every branch that island's prices.
 *
 * The generated file is a compact union of the four pulls, keyed by productId
 * (the SKU shared by both Foodstuffs banners). Prices are integers in cents;
 * 0 means that price list did not return the product.
 */

import fs from "node:fs";
import path from "node:path";

const rawDir = process.env.RAW_DIR || "/tmp/foodstuffs";
const outPath = process.env.OUT || "data/catalogue.js";

/* One representative branch per banner per island. Branch prices are the same
   within an island, so these four pulls stand in for every branch. */
const PULLS = [
  {
    file: "paknsave.json",
    zone: "pns-ni",
    brand: "pns",
    name: "PAK'nSAVE",
    branch: "Mt Albert",
    island: "North Island",
  },
  {
    file: "newworld.json",
    zone: "nw-ni",
    brand: "nw",
    name: "New World",
    branch: "Point Chevalier",
    island: "North Island",
  },
  {
    file: "paknsave-si.json",
    zone: "pns-si",
    brand: "pns",
    name: "PAK'nSAVE",
    branch: "Riccarton",
    island: "South Island",
  },
  {
    file: "newworld-si.json",
    zone: "nw-si",
    brand: "nw",
    name: "New World",
    branch: "Ilam",
    island: "South Island",
  },
];

const PROMO_DEPARTMENTS = new Set(["Featured", "Cracker Deals"]);

function canonicalTree(product) {
  const trees = Array.isArray(product.categoryTrees) ? product.categoryTrees : [];
  return (
    trees.find((tree) => !PROMO_DEPARTMENTS.has(tree.level0)) ||
    trees[0] ||
    null
  );
}

function displayName(product) {
  const brand = String(product.brand || "").trim();
  const name = String(product.name || "").trim();
  if (!brand) return name;
  if (!name) return brand;
  const lowerName = name.toLowerCase();
  const lowerBrand = brand.toLowerCase();
  return lowerName.includes(lowerBrand) ? name : `${brand} ${name}`;
}

function unitPrice(product) {
  const cp = product.singlePrice?.comparativePrice;
  if (!cp || !Number.isFinite(cp.pricePerUnit) || !cp.measureDescription) return null;
  return `$${(cp.pricePerUnit / 100).toFixed(2)}/${cp.measureDescription}`;
}

const pulls = PULLS.map((pull) => {
  const filePath = path.join(rawDir, pull.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath} — run scripts/pull-foodstuffs.mjs first`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return { ...pull, raw, products: Array.isArray(raw.products) ? raw.products : [] };
});

const byId = new Map();

for (const pull of pulls) {
  for (const product of pull.products) {
    if (!product?.productId) continue;
    const price = product.singlePrice?.price;
    if (!Number.isFinite(price)) continue;

    let row = byId.get(product.productId);
    if (!row) {
      const tree = canonicalTree(product);
      row = {
        id: product.productId,
        name: displayName(product),
        brand: String(product.brand || "").trim(),
        size: String(product.displayName || "").trim(),
        department: tree?.level0 || "Other",
        subcategory: tree?.level1 || "",
        prices: {},
        units: {},
      };
      byId.set(product.productId, row);
    }
    if (!row.prices[pull.zone]) {
      row.prices[pull.zone] = price;
      row.units[pull.zone] = unitPrice(product);
    }
  }
}

const rows = [...byId.values()].sort(
  (a, b) =>
    a.department.localeCompare(b.department, "en-NZ") ||
    a.subcategory.localeCompare(b.subcategory, "en-NZ") ||
    a.name.localeCompare(b.name, "en-NZ")
);

const fetchedAt =
  process.env.FETCHED_AT ||
  String(
    pulls
      .map((pull) => String(pull.raw.fetchedAt || "").slice(0, 10))
      .filter(Boolean)
      .sort()
      .at(-1) || ""
  );
const checkedAt =
  process.env.CHECKED_AT ||
  pulls
    .map((pull) => pull.raw.checkedAt || pull.raw.fetchedAt || "")
    .filter(Boolean)
    .sort()
    .at(-1) ||
  "";

const items = rows.map((row) => [
  row.id,
  row.name,
  row.brand,
  row.size,
  row.department,
  row.subcategory,
  ...PULLS.map((pull) => row.prices[pull.zone] || 0),
  ...PULLS.map((pull) => row.units[pull.zone] || null),
]);

const zones = Object.fromEntries(
  pulls.map((pull) => [
    pull.zone,
    {
      name: pull.name,
      branch: pull.branch,
      island: pull.island,
      storeId: pull.raw.storeId || "",
      count: pull.products.filter((product) => product?.productId).length,
      fetchedAt: String(pull.raw.checkedAt || pull.raw.fetchedAt || "").slice(0, 10),
      checkedAt: pull.raw.checkedAt || pull.raw.fetchedAt || "",
    },
  ])
);

const output = {
  fetchedAt,
  checkedAt,
  source: "PAK'nSAVE and New World public online store pages",
  zones,
  productCount: rows.length,
  items,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  `/* Generated by scripts/build-catalogue.mjs from the dated public store pulls.
   ${rows.length.toLocaleString("en-NZ")} products; prices are shelf prices in
   cents from each banner's North Island and South Island price lists, fetched
   ${fetchedAt}. 0 means that price list did not return the product.
   Do not edit by hand — re-run the pull and build scripts instead. */
window.GROCER_CATALOGUE = ${JSON.stringify(output)};
`
);

console.log(
  `Wrote ${rows.length} products (${items.length} rows) to ${outPath} ` +
    `(${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB); ` +
    PULLS.map(
      (pull) =>
        `${pull.zone} ${items.filter((row) => row[6 + PULLS.indexOf(pull)]).length}`
    ).join(", ")
);
