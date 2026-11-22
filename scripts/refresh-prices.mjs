#!/usr/bin/env node
/* Refresh the dated PAK'nSAVE and New World prices in the demo.
 *
 * Called by .github/workflows/pages.yml at midnight Pacific/Auckland. It pulls
 * one representative branch per banner per island with the existing
 * Foodstuffs puller (which discovers a fresh guest token and store UUID),
 * refreshes the full branch directory, rebuilds data/catalogue.js, updates
 * the curated demo-staple imports, and then pulls every other branch's sparse
 * price overrides.
 *
 * Usage:
 *   node scripts/refresh-prices.mjs
 *   RAW_DIR=/tmp/foodstuffs OUT=/tmp/catalogue.js node scripts/refresh-prices.mjs
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW_DIR = process.env.RAW_DIR || "/tmp/foodstuffs";
const CATALOGUE_OUT = process.env.OUT || path.join(ROOT, "data/catalogue.js");
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Pacific/Auckland",
}).format(new Date());

/* Prices are the same across a banner within an island, so one representative
   branch per banner per island covers every PAK'nSAVE and New World branch.
   Only the two North Island branches have hand-curated staple imports. */
const STORES = [
  {
    brand: "pns",
    name: "Mt Albert",
    raw: "paknsave.json",
    importFile: "data/paknsave-import.js",
    globalName: "GROCER_PAKNSAVE_IMPORT",
  },
  {
    brand: "nw",
    name: "Point Chevalier",
    raw: "newworld.json",
    importFile: "data/newworld-import.js",
    globalName: "GROCER_NEWWORLD_IMPORT",
  },
  { brand: "pns", name: "Riccarton", raw: "paknsave-si.json" },
  { brand: "nw", name: "Ilam", raw: "newworld-si.json" },
];

function run(script, env) {
  console.log(`\n[refresh] ${script}`);
  const result = spawnSync(process.execPath, [path.join(ROOT, script)], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} exited with status ${result.status}`);
  }
}

function pullStore(store) {
  const env = {
    ...process.env,
    BRAND: store.brand,
    STORE_NAME: store.name,
    OUT: path.join(RAW_DIR, store.raw),
  };
  // Always discover a fresh token and store UUID; stale ones must not survive.
  delete env.TOKEN;
  delete env.STORE_ID;
  run("scripts/pull-foodstuffs.mjs", env);
}

/* Keep the imports' hand-written style: bare keys, quoted item ids and a
   trailing comma per entry, so a refresh only changes values that moved. */
function formatImport(imported) {
  const lines = ["{"];
  for (const [key, value] of Object.entries(imported)) {
    if (key === "checkedAt") continue;
    if (key !== "items") {
      lines.push(`  ${key}: ${JSON.stringify(value)},`);
      if (key === "fetchedAt" && imported.checkedAt) {
        lines.push(`  checkedAt: ${JSON.stringify(imported.checkedAt)},`);
      }
      continue;
    }
    lines.push("  items: {");
    for (const [itemId, item] of Object.entries(value)) {
      lines.push(`    ${JSON.stringify(itemId)}: {`);
      for (const [field, fieldValue] of Object.entries(item)) {
        lines.push(`      ${field}: ${JSON.stringify(fieldValue)},`);
      }
      lines.push("    },");
    }
    lines.push("  },");
  }
  lines.push("};");
  return lines.join("\n");
}

function skuProductId(sku) {
  return String(sku || "")
    .replace(/(?:pns|nw)$/i, "")
    .replace(/_/g, "-")
    .toUpperCase();
}

function updateImport(store, checkedAt) {
  const raw = JSON.parse(fs.readFileSync(path.join(RAW_DIR, store.raw), "utf8"));
  const products = new Map(
    (raw.products || []).map((product) => [String(product.productId).toUpperCase(), product])
  );
  const filePath = path.join(ROOT, store.importFile);
  const text = fs.readFileSync(filePath, "utf8");
  const assignment = text.indexOf("window.");
  if (assignment < 0) throw new Error(`Could not read ${store.importFile}`);

  // The import is a hand-formatted JavaScript object (with trailing commas),
  // so evaluate it in an empty context rather than parsing it as JSON.
  const sandbox = { window: {} };
  vm.runInNewContext(text.slice(assignment), sandbox, { filename: store.importFile });
  const imported = sandbox.window[store.globalName];
  if (!imported?.items) throw new Error(`No ${store.globalName} items in ${store.importFile}`);
  let missing = 0;
  let changed = 0;

  for (const [demoId, item] of Object.entries(imported.items)) {
    const product = products.get(skuProductId(item.sku));
    const cents = product?.singlePrice?.price;
    if (!Number.isFinite(cents)) {
      missing += 1;
      console.warn(`  ${demoId}: ${item.sku} not in today's ${store.name} pull`);
      continue;
    }
    const price = Math.round(cents) / 100;
    const comparative = product.singlePrice?.comparativePrice;
    const unit =
      comparative &&
      Number.isFinite(comparative.pricePerUnit) &&
      comparative.measureDescription
        ? `$${(comparative.pricePerUnit / 100).toFixed(2)}/${comparative.measureDescription}`
        : null;
    if (item.price !== price || item.unit !== unit) changed += 1;
    item.price = price;
    item.unit = unit;
  }

  imported.fetchedAt = TODAY;
  imported.checkedAt = checkedAt;
  const header = text
    .slice(0, assignment)
    .replace(/on \d{4}-\d{2}-\d{2}/g, `on ${TODAY}`);
  fs.writeFileSync(
    filePath,
    `${header}window.${store.globalName} = ${formatImport(imported)}\n`
  );

  console.log(
    `[refresh] ${store.importFile}: ${Object.keys(imported.items).length} prices checked, ` +
      `${changed} changed${missing ? `, ${missing} missing` : ""}`
  );
}

function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });

  // The branch directory changes rarely, but keeping it in the nightly run
  // means a new or closed branch shows up without a manual step.
  run("scripts/pull-stores.mjs", {});

  for (const store of STORES) pullStore(store);

  const checkedAt = new Date().toISOString();
  run("scripts/build-catalogue.mjs", {
    RAW_DIR,
    OUT: CATALOGUE_OUT,
    FETCHED_AT: TODAY,
    CHECKED_AT: checkedAt,
  });

  for (const store of STORES) {
    if (store.importFile) updateImport(store, checkedAt);
  }

  // Prices vary by branch often enough that four island lists are not enough;
  // this is the long part of the nightly run. A dated directory keeps a rerun
  // from reusing yesterday's completed branch files.
  const storePullDir = `/tmp/store-price-pull-${TODAY}`;
  run("scripts/pull-all-store-prices.mjs", {
    CONCURRENCY: process.env.CONCURRENCY || "4",
    OUT_DIR: storePullDir,
  });
  run("scripts/build-store-price-data.mjs", { SOURCE_DIR: storePullDir });

  console.log(`\n[refresh] prices checked for ${TODAY} (Pacific/Auckland)`);
}

try {
  main();
} catch (error) {
  console.error(`[refresh] FAILED ${error.message}`);
  process.exitCode = 1;
}
