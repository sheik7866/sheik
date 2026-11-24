#!/usr/bin/env node
/* Fail the refresh when a demo staple has a Woolworths branch price that the
 * app would not show.
 *
 * The app resolves a staple through demo-sku-map.js, so this check loads that
 * same file rather than re-implementing the rule. A staple fails the check at
 * a branch when:
 *
 *   - its PAK'nSAVE/New World catalogue id is priced there, but the app's
 *     Woolworths lookup resolves to a different id without a price (or none);
 *   - or the id cannot be resolved while another catalogue row carrying the
 *     same GTIN is priced at that branch.
 *
 * In other words: never show an estimate where a published branch price for
 * the same product exists.
 *
 *   node scripts/check-demo-staples.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = process.env.APP || path.join(ROOT, "app.js");
const DIRECTORY = process.env.DIRECTORY || path.join(ROOT, "data/woolworths.js");
const PRICE_DIR = process.env.PRICE_DIR || path.join(ROOT, "data/woolworths-prices");
const GTINS_PATH = process.env.GTINS || path.join(ROOT, "data/gtins.js");

function loadWindow(files) {
  const sandbox = { window: {} };
  for (const file of files) {
    vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  }
  return sandbox.window;
}

const win = loadWindow([
  path.join(ROOT, "data/paknsave-import.js"),
  path.join(ROOT, "data/newworld-import.js"),
  path.join(ROOT, "demo-sku-map.js"),
]);
const resolve = win.demoSkuId;
if (typeof resolve !== "function") {
  throw new Error("demo-sku-map.js did not expose demoSkuId");
}

/* The staple list is the product(...) calls in app.js. Only the id and label
   are needed; the app itself owns what each staple is. */
const staples = [...fs.readFileSync(APP, "utf8").matchAll(
  /^\s*product\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/gm
)].map((match) => ({ id: match[1], name: match[2], size: match[3] }));
if (!staples.length) throw new Error(`No demo staples found in ${APP}`);

const gtins = loadWindow([GTINS_PATH]).GROCER_GTINS || {};
const normalizeGtin = (value) => String(value || "").replace(/\D/g, "").padStart(14, "0");
const byGtin = new Map();
for (const [id, gtin] of Object.entries(gtins)) {
  const key = normalizeGtin(gtin);
  if (!byGtin.has(key)) byGtin.set(key, []);
  byGtin.get(key).push(id);
}

const directory = loadWindow([DIRECTORY]).GROCER_WOOLWORTHS;
if (!Array.isArray(directory?.stores) || !directory.stores.length) {
  throw new Error(`No Woolworths branches in ${DIRECTORY}`);
}

const failures = [];
let compared = 0;
let priced = 0;

for (const store of directory.stores) {
  const file = path.join(PRICE_DIR, `${store.id}.json`);
  if (!fs.existsSync(file)) {
    failures.push(`${store.branch}: missing price file ${path.relative(ROOT, file)}`);
    continue;
  }
  const prices = JSON.parse(fs.readFileSync(file, "utf8")).prices || {};
  for (const staple of staples) {
    const foodstuffsId = resolve(staple.id, "pns");
    if (!foodstuffsId) continue;
    compared += 1;
    const appId = resolve(staple.id, "wow");
    const appPrice = appId ? prices[appId] : undefined;
    if (Number.isFinite(appPrice) && appPrice > 0) {
      priced += 1;
      continue;
    }
    if (Number.isFinite(prices[foodstuffsId]) && prices[foodstuffsId] > 0) {
      failures.push(
        `${store.branch}: ${staple.name} ${staple.size} is priced at ${prices[foodstuffsId]}c ` +
          `under ${foodstuffsId}, but the app resolves ${appId || "nothing"} for Woolworths`
      );
      continue;
    }
    const aliases = byGtin.get(normalizeGtin(gtins[appId || foodstuffsId])) || [];
    const aliasPrice = aliases
      .filter((id) => id !== appId)
      .map((id) => ({ id, cents: prices[id] }))
      .find((row) => Number.isFinite(row.cents) && row.cents > 0);
    if (aliasPrice) {
      failures.push(
        `${store.branch}: ${staple.name} ${staple.size} has the same GTIN priced at ` +
          `${aliasPrice.cents}c under ${aliasPrice.id}, but the app resolves ${appId || "nothing"}`
      );
    }
  }
}

if (failures.length) {
  console.error(`[staples] FAIL ${failures.length} estimate(s) hide a published Woolworths price:`);
  for (const failure of failures.slice(0, 12)) console.error(`  - ${failure}`);
  if (failures.length > 12) console.error(`  … and ${failures.length - 12} more`);
  process.exitCode = 1;
} else {
  console.log(
    `[staples] OK ${priced.toLocaleString("en-NZ")} staple prices across ` +
      `${directory.stores.length} Woolworths branches ` +
      `(${compared.toLocaleString("en-NZ")} staple/branch pairs checked)`
  );
}
