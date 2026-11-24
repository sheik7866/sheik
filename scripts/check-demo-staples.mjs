#!/usr/bin/env node
/* Fail the refresh when a demo staple has a branch price that the app would
 * not show, at any priced chain.
 *
 * The app resolves a staple through demo-sku-map.js, so this check loads that
 * same file rather than re-implementing the rule. A staple fails the check at
 * a branch when:
 *
 *   - the staple's own catalogue id for that chain is priced there, but the
 *     app's lookup resolves to a different id without a price (or to none);
 *   - or that id has no price while another catalogue row carrying the same
 *     GTIN is priced at that branch.
 *
 * It also fails when a stocked branch has no price file, is missing from the
 * last refresh, or its file carries an older checkedAt than the chain's
 * directory/index, so a partial pull cannot leave a branch on old prices.
 *
 * Covered chains:
 *   - Woolworths: data/woolworths.js + data/woolworths-prices/<id>.json
 *   - PAK'nSAVE and New World: data/stores.js + data/store-prices/<id>.json
 *     overrides on top of the island price lists in data/catalogue.js.
 *
 * In other words: never show an estimate where a published branch price for
 * the same product exists, and never ship a branch the last refresh missed.
 *
 *   node scripts/check-demo-staples.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = process.env.APP || path.join(ROOT, "app.js");

function loadWindow(files) {
  const sandbox = { window: {} };
  for (const file of files) {
    vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  }
  return sandbox.window;
}

/* The app's own staple mapping. Loading the same file means a rule change here
   cannot drift from what the browser does. */
const appWindow = loadWindow([
  path.join(ROOT, "data/paknsave-import.js"),
  path.join(ROOT, "data/newworld-import.js"),
  path.join(ROOT, "demo-sku-map.js"),
]);
const resolveStaple = appWindow.demoSkuId;
const stapleMap = appWindow.DEMO_SKU_IDS;
if (typeof resolveStaple !== "function" || typeof stapleMap?.get !== "function") {
  throw new Error("demo-sku-map.js did not expose demoSkuId and DEMO_SKU_IDS");
}

/* The staple list is the product(...) calls in app.js. Only the id and label
   are needed; the app itself owns what each staple is. */
const staples = [...fs.readFileSync(APP, "utf8").matchAll(
  /^\s*product\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/gm
)].map((match) => ({ id: match[1], name: match[2], size: match[3] }));
if (!staples.length) throw new Error(`No demo staples found in ${APP}`);

const gtins = loadWindow([path.join(ROOT, "data/gtins.js")]).GROCER_GTINS || {};
const normalizeGtin = (value) => String(value || "").replace(/\D/g, "").padStart(14, "0");
const idsByGtin = new Map();
for (const [id, gtin] of Object.entries(gtins)) {
  const key = normalizeGtin(gtin);
  if (!idsByGtin.has(key)) idsByGtin.set(key, []);
  idsByGtin.get(key).push(id);
}

/* Every other catalogue id that carries the same barcode as one of these. */
function aliasIds(ids) {
  const aliases = new Set();
  const given = new Set(ids);
  for (const id of ids) {
    for (const alias of idsByGtin.get(normalizeGtin(gtins[id])) || []) {
      if (!given.has(alias)) aliases.add(alias);
    }
  }
  return aliases;
}

/* The id the staple's own mapping says to look up at a chain. A staple can map
   to different packs per banner (the demo's "Long Grain Rice" is Pams at
   PAK'nSAVE and King's Choice at New World), so other chains' ids are not
   evidence of the same product and are deliberately not included. */
function referenceId(stapleId, chain) {
  const mapped = stapleMap.get(stapleId) || {};
  return mapped[chain] || mapped.pns || mapped.nw || null;
}

/* That id plus any catalogue row sharing its barcode: the same physical pack
   under another id is still a published price for this staple. */
function evidenceIds(stapleId, chain) {
  const reference = referenceId(stapleId, chain);
  if (!reference) return [];
  return [reference, ...aliasIds([reference])];
}

const failures = [];
const totals = { branches: 0, pairs: 0, priced: 0 };

function note(chain, text) {
  failures.push({ chain, text });
}

function report(chain, store, staple, knownPrice, appId) {
  note(
    chain,
    `${chain} ${store.branch}: ${staple.name} ${staple.size} is priced at ` +
      `${knownPrice.cents}c under ${knownPrice.id}, but the app resolves ${appId || "nothing"}`
  );
}

/* Woolworths branch files are exactly the branch's priced range (no base list
   to inherit), so a known id is either in the file or absent. */
function checkWoolworths() {
  const directoryPath = process.env.DIRECTORY || path.join(ROOT, "data/woolworths.js");
  const priceDir = process.env.PRICE_DIR || path.join(ROOT, "data/woolworths-prices");
  const directory = loadWindow([directoryPath]).GROCER_WOOLWORTHS;
  if (!Array.isArray(directory?.stores) || !directory.stores.length) {
    throw new Error(`No Woolworths branches in ${directoryPath}`);
  }

  for (const store of directory.stores) {
    const file = path.join(priceDir, `${store.id}.json`);
    if (!fs.existsSync(file)) {
      note("Woolworths", `${store.branch}: missing price file ${path.relative(ROOT, file)}`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const expected = store.checkedAt || directory.checkedAt || "";
    if (!data.checkedAt) {
      note("Woolworths", `Woolworths ${store.branch}: price file has no checkedAt`);
    } else if (expected && data.checkedAt !== expected) {
      note(
        "Woolworths",
        `Woolworths ${store.branch}: price file is stale ` +
          `(${data.checkedAt} vs directory ${expected})`
      );
    }
    const prices = data.prices || {};
    for (const staple of staples) {
      const appId = resolveStaple(staple.id, "wow");
      const known = evidenceIds(staple.id, "wow");
      if (!known.length) continue;
      totals.pairs += 1;
      const appPrice = appId ? prices[appId] : undefined;
      if (Number.isFinite(appPrice) && appPrice > 0) {
        totals.priced += 1;
        continue;
      }
      const knownPrice = known
        .map((id) => ({ id, cents: prices[id] }))
        .find((row) => Number.isFinite(row.cents) && row.cents > 0);
      if (knownPrice) report("Woolworths", store, staple, knownPrice, appId);
    }
  }
  totals.branches += directory.stores.length;
}

/* PAK'nSAVE and New World: the app prices from the banner's island list and
   lets a branch override it, so the check resolves the same combination. */
function checkFoodstuffs() {
  const zones = ["pns-ni", "nw-ni", "pns-si", "nw-si"];
  const catalogue = loadWindow([path.join(ROOT, "data/catalogue.js")]).GROCER_CATALOGUE;
  if (!Array.isArray(catalogue?.items)) throw new Error("No catalogue rows in data/catalogue.js");
  const zonePrices = Object.fromEntries(zones.map((zone) => [zone, new Map()]));
  for (const row of catalogue.items) {
    zones.forEach((zone, index) => {
      if (row[6 + index]) zonePrices[zone].set(row[0], row[6 + index]);
    });
  }

  const stores = loadWindow([path.join(ROOT, "data/stores.js")]).GROCER_STORES?.stores || [];
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const priceDir = path.join(ROOT, "data/store-prices");
  const files = fs
    .readdirSync(priceDir)
    .filter((file) => file.endsWith(".json") && file !== "index.json");

  /* Every stocked branch except the four base stores must have been written by
     the same refresh as the index: a branch missing from the index or carrying
     an older checkedAt was left behind by a partial pull. */
  const index = JSON.parse(fs.readFileSync(path.join(priceDir, "index.json"), "utf8"));
  if (!index.stores || typeof index.stores !== "object") {
    throw new Error("data/store-prices/index.json has no stores map");
  }
  const baseIds = new Set(Array.isArray(index.baseStoreIds) ? index.baseStoreIds : []);
  for (const store of stores) {
    if (baseIds.has(store.id)) continue;
    const chainLabel = store.brand === "pns" ? "PAK'nSAVE" : "New World";
    const manifest = index.stores[store.id];
    const file = path.join(priceDir, `${store.id}.json`);
    if (!manifest) {
      note(chainLabel, `${chainLabel} ${store.branch}: not in the last branch-price refresh`);
      continue;
    }
    if (!fs.existsSync(file)) {
      note(chainLabel, `${chainLabel} ${store.branch}: missing branch price file`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data.checkedAt) {
      note(chainLabel, `${chainLabel} ${store.branch}: branch price file has no checkedAt`);
    } else if (manifest.checkedAt && data.checkedAt !== manifest.checkedAt) {
      note(
        chainLabel,
        `${chainLabel} ${store.branch}: branch price file is stale ` +
          `(${data.checkedAt} vs index ${manifest.checkedAt})`
      );
    }
  }

  for (const file of files) {
    const entry = JSON.parse(fs.readFileSync(path.join(priceDir, file), "utf8"));
    const store = storeById.get(entry.storeId);
    if (!store) {
      note("Foodstuffs", `${file}: no store with that id in data/stores.js`);
      continue;
    }
    const brand = entry.brand || store.brand;
    const chainLabel = brand === "pns" ? "PAK'nSAVE" : "New World";
    const zone = `${brand}-${String(store.region || "").toLowerCase()}`;
    const base = zonePrices[zone];
    if (!base) {
      note(chainLabel, `${file}: unknown price zone ${zone}`);
      continue;
    }
    const priceOf = (id) => {
      const override = entry.prices?.[id];
      if (Number.isFinite(override) && override > 0) return override;
      return base.get(id);
    };

    for (const staple of staples) {
      const appId = resolveStaple(staple.id, store.brand);
      const known = evidenceIds(staple.id, store.brand);
      if (!known.length) continue;
      totals.pairs += 1;
      if (appId && Number.isFinite(priceOf(appId)) && priceOf(appId) > 0) {
        totals.priced += 1;
        continue;
      }
      const knownPrice = known
        .map((id) => ({ id, cents: priceOf(id) }))
        .find((row) => Number.isFinite(row.cents) && row.cents > 0);
      if (knownPrice) report(chainLabel, store, staple, knownPrice, appId);
    }
  }
  totals.branches += files.length;
}

checkWoolworths();
checkFoodstuffs();

if (failures.length) {
  const byChain = new Map();
  for (const failure of failures) byChain.set(failure.chain, (byChain.get(failure.chain) || 0) + 1);
  const breakdown = [...byChain].map(([chain, count]) => `${chain} ${count}`).join(", ");
  console.error(`[staples] FAIL ${failures.length} problem(s) with published branch prices (${breakdown}):`);
  for (const failure of failures.slice(0, 12)) console.error(`  - ${failure.text}`);
  if (failures.length > 12) console.error(`  … and ${failures.length - 12} more`);
  process.exitCode = 1;
} else {
  console.log(
    `[staples] OK ${totals.priced.toLocaleString("en-NZ")} staple prices across ` +
      `${totals.branches} branches ` +
      `(${totals.pairs.toLocaleString("en-NZ")} staple/branch pairs checked)`
  );
}
