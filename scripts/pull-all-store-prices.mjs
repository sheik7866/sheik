#!/usr/bin/env node
/* Pull every PAK'nSAVE and New World branch price list.
 *
 * The four representative branches in data/catalogue.js provide the base
 * North/South Island price lists. Every other branch is pulled once and stored
 * as a sparse override file, because most prices match the base list but
 * enough differ (and enough products are branch-only) that four lists are not
 * accurate for a whole country.
 *
 * Usage:
 *   node scripts/pull-all-store-prices.mjs
 *   CONCURRENCY=4 OUT_DIR=/tmp/store-price-pull node scripts/pull-all-store-prices.mjs
 *
 * Resumable: a store is skipped only when both its override and branch-only
 * product files exist. Failed or interrupted stores are retried on the next run.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = process.env.OUT_DIR || "/tmp/store-price-pull";
const RAW_DIR = process.env.RAW_DIR || "/tmp/foodstuffs";
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 4);
const BASE_MAP_FILE = path.join(OUT_DIR, "base-prices.json");
const BASE_IDS_FILE = path.join(OUT_DIR, "base-ids.json");
const OVERRIDE_DIR = path.join(OUT_DIR, "overrides");
const NEW_PRODUCT_DIR = path.join(OUT_DIR, "new-products");
const LOG_DIR = path.join(OUT_DIR, "logs");
const PROGRESS_FILE = path.join(OUT_DIR, "progress.json");

const BASE_PULLS = [
  ["pns-ni", "paknsave.json"],
  ["nw-ni", "newworld.json"],
  ["pns-si", "paknsave-si.json"],
  ["nw-si", "newworld-si.json"],
];

function loadWindow(file, globalName) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(text, sandbox, { filename: file });
  return sandbox.window[globalName];
}

function buildBaseFiles() {
  const zones = {};
  const rawPaths = BASE_PULLS.map(([, file]) => path.join(RAW_DIR, file));
  const canRebuild = rawPaths.every((file) => fs.existsSync(file));

  if (canRebuild) {
    for (const [zone, file] of BASE_PULLS) {
      const raw = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), "utf8"));
      const prices = {};
      for (const product of raw.products || []) {
        const price = product?.singlePrice?.price;
        if (product?.productId && Number.isFinite(price) && price > 0) {
          prices[String(product.productId).toUpperCase()] = Math.round(price);
        }
      }
      zones[zone] = prices;
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(BASE_MAP_FILE, JSON.stringify({ zones }));
  } else if (fs.existsSync(BASE_MAP_FILE)) {
    Object.assign(zones, JSON.parse(fs.readFileSync(BASE_MAP_FILE, "utf8")).zones || {});
  } else {
    throw new Error(`Missing base pulls in ${RAW_DIR}; run npm run prices:refresh first`);
  }

  const catalogue = loadWindow("data/catalogue.js", "GROCER_CATALOGUE");
  const ids = new Set(Object.values(zones).flatMap((prices) => Object.keys(prices)));
  for (const row of catalogue?.items || []) ids.add(String(row[0]).toUpperCase());
  fs.writeFileSync(BASE_IDS_FILE, JSON.stringify([...ids]));
  console.log(`[pull-all] base lists: ${ids.size} catalogue products`);
}

function loadStores() {
  const directory = loadWindow("data/stores.js", "GROCER_STORES");
  if (!Array.isArray(directory?.stores)) throw new Error("No stores in data/stores.js");
  return directory.stores;
}

function baseStoreIds() {
  const catalogue = loadWindow("data/catalogue.js", "GROCER_CATALOGUE");
  return new Set(
    Object.values(catalogue?.zones || {})
      .map((zone) => zone.storeId)
      .filter(Boolean)
  );
}

function writeProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(OVERRIDE_DIR, { recursive: true });
  fs.mkdirSync(NEW_PRODUCT_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  buildBaseFiles();

  const baseIds = baseStoreIds();
  const stores = loadStores();
  const jobs = stores
    .filter((store) => !baseIds.has(store.id))
    .map((store) => ({
      id: store.id,
      brand: store.brand,
      zone: `${store.brand}-${String(store.region || "").toLowerCase()}`,
      label: `${store.name} ${store.branch}`,
    }));

  const isComplete = (job) =>
    fs.existsSync(path.join(OVERRIDE_DIR, `${job.id}.json`)) &&
    fs.existsSync(path.join(NEW_PRODUCT_DIR, `${job.id}.json`));
  const completed = jobs.filter(isComplete).length;
  const pending = jobs.filter((job) => !isComplete(job));

  console.log(
    `[pull-all] ${stores.length} branches, ${baseIds.size} base branches, ` +
      `${pending.length} to pull (${completed} already done), concurrency ${CONCURRENCY}`
  );

  const progress = {
    startedAt: new Date().toISOString(),
    total: jobs.length,
    completed,
    failed: 0,
    pending: pending.length,
    current: [],
    failures: [],
  };
  writeProgress(progress);

  let cursor = 0;
  const failures = [];
  let finished = 0;

  async function worker() {
    while (cursor < pending.length) {
      const job = pending[cursor];
      cursor += 1;
      progress.current.push(job.label);
      writeProgress(progress);

      const logPath = path.join(LOG_DIR, `${job.id}.log`);
      const logFd = fs.openSync(logPath, "w");
      const child = spawn(process.execPath, [path.join(ROOT, "scripts/pull-store-price.mjs")], {
        cwd: ROOT,
        env: {
          ...process.env,
          STORE_ID: job.id,
          BRAND: job.brand,
          ZONE: job.zone,
          OUT_DIR,
          BASE_MAP_FILE,
          BASE_IDS_FILE,
        },
        stdio: ["ignore", logFd, logFd],
      });

      const result = await new Promise((resolve) => {
        child.on("error", (error) => resolve({ code: 1, error }));
        child.on("exit", (code) => resolve({ code: code ?? 1 }));
      });
      fs.closeSync(logFd);
      finished += 1;
      progress.current = progress.current.filter((label) => label !== job.label);

      const overridePath = path.join(OVERRIDE_DIR, `${job.id}.json`);
      const newProductsPath = path.join(NEW_PRODUCT_DIR, `${job.id}.json`);
      if (result.code === 0 && fs.existsSync(overridePath) && fs.existsSync(newProductsPath)) {
        progress.completed += 1;
        const data = JSON.parse(fs.readFileSync(overridePath, "utf8"));
        const count = Object.keys(data.prices || {}).length;
        console.log(
          `[pull-all] ${finished}/${pending.length} ${job.label}: ` +
            `${data.productCount} products, ${count} overrides`
        );
      } else {
        failures.push(job);
        progress.failed += 1;
        console.log(`[pull-all] ${finished}/${pending.length} FAILED ${job.label} (${logPath})`);
      }
      writeProgress(progress);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  progress.finishedAt = new Date().toISOString();
  progress.failures = failures.map((job) => ({
    id: job.id,
    label: job.label,
    log: path.join(LOG_DIR, `${job.id}.log`),
  }));
  progress.current = [];
  writeProgress(progress);

  console.log(
    `[pull-all] done: ${progress.completed}/${jobs.length} stores, ${progress.failed} failed`
  );
  if (failures.length) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(`[pull-all] FAILED ${error.message}`);
  process.exitCode = 1;
}
