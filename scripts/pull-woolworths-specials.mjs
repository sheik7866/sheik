#!/usr/bin/env node
/* Pull Woolworths' advertised specials for the Auckland delivery zone.
 *
 * Woolworths publishes prices per delivery zone through Baskt's public API,
 * with no account or token. The demo's Auckland branches need the Auckland
 * zone's prices, so this script walks Baskt's Woolworths item list one page at
 * a time (the API has no promotion or GTIN filter) asking only for zone 3, and
 * keeps just the prices flagged as a promotion. It maps each item's GTIN onto a
 * catalogue row and deliberately does not invent a price for anything else.
 *
 *   node scripts/pull-woolworths-specials.mjs
 *   OUT=/tmp/woolworths.js node scripts/pull-woolworths-specials.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = process.env.OUT || path.join(ROOT, "data/woolworths.js");
const CATALOGUE_PATH = process.env.CATALOGUE || path.join(ROOT, "data/catalogue.js");
const GTINS_PATH = process.env.GTINS || path.join(ROOT, "data/gtins.js");
const BASE = "https://baskt.nz";
const CHAIN = "countdown";
const ZONE_EXTERNAL_ID = "countdown-auckland-default";
const PAGE_DELAY_MS = Number(process.env.PAGE_DELAY_MS || 220);
const USER_AGENT = "TrolleybirdDemo/1.0 (price comparison demo; contact via GitHub)";
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Pacific/Auckland",
}).format(new Date());
/* A page cache means a rate-limited or interrupted run resumes where it stopped
   instead of walking the whole list again. It lives in /tmp, not the repo. */
const CACHE = process.env.CACHE || `/tmp/trolleybird-woolworths-${TODAY}.jsonl`;

function readWindow(file, name) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  const value = sandbox.window[name];
  if (!value) throw new Error(`No window.${name} in ${file}`);
  return value;
}

function normalizeGtin(value) {
  return String(value || "").replace(/\D/g, "");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Baskt rate-limits bursts (HTTP 429). Wait for its Retry-After when it sends
   one, otherwise back off up to 30 s before giving up on the page. */
async function getJson(url, tries = 6) {
  let lastError = "rate-limited";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
      });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(30000, 3000 * (attempt + 1) ** 2);
        lastError = `${res.status} ${res.statusText}`;
        console.warn(`[woolworths] ${lastError} at offset, waiting ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return await res.json();
    } catch (error) {
      lastError = error.message;
      if (attempt === tries - 1) throw error;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error(`Gave up on ${url} (${lastError})`);
}

function unitReference(price) {
  const unit = Number(price?.unitPriceCents);
  const measure = String(price?.unitMeasure || "").trim();
  if (!(unit > 0) || !measure) return undefined;
  return `$${(unit / 100).toFixed(2)}/${measure}`;
}

async function aucklandZone() {
  const body = await getJson(`${BASE}/api/v1/locations`);
  const locations = body?.data?.locations || [];
  const zone = locations.find(
    (location) =>
      String(location.chain).toLowerCase() === CHAIN && location.externalId === ZONE_EXTERNAL_ID
  );
  if (!zone?.id) throw new Error("Baskt did not list the Woolworths Auckland delivery zone");
  return zone;
}

/* Walk the whole Woolworths list, one page at a time. The API clamps limit to
 * 100 and reports a lower-bound total, so drive the loop from nextOffset/hasMore
 * rather than the advertised count. */
function cachedPages() {
  if (!fs.existsSync(CACHE)) return [];
  return fs
    .readFileSync(CACHE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function promoPrices(zoneId) {
  const cached = cachedPages();
  const pricesByItem = new Map();
  for (const page of cached) {
    for (const price of page.prices) pricesByItem.set(price.itemId, price);
  }
  let offset = cached.length ? cached.at(-1).offset + 100 : 0;
  let pages = cached.length;
  let items = pages * 100;
  if (pages) console.log(`[woolworths] resuming at offset ${offset} from ${CACHE}`);
  const out = pages ? fs.openSync(CACHE, "a") : fs.openSync(CACHE, "w");

  for (;;) {
    const url = `${BASE}/api/v1/items?chain=${CHAIN}&limit=100&offset=${offset}&locationId=${encodeURIComponent(
      zoneId
    )}`;
    const body = await getJson(url);
    const page = body?.data || {};
    const pageItems = page.items || [];
    const pageRecords = [];
    for (const price of page.latestPrices || []) {
      if (!price.promoFlag || !(Number(price.priceCents) > 0)) continue;
      if (String(price.locationId) !== String(zoneId)) continue;
      const item = pageItems.find((entry) => entry.id === price.itemId);
      if (!item?.gtin) continue;
      const record = {
        itemId: String(item.id),
        gtin: normalizeGtin(item.gtin),
        name: item.name || "",
        priceCents: Math.round(Number(price.priceCents)),
        unit: unitReference(price),
        observedAt: String(price.observedAt || ""),
        label: String(price.promoLabel || "Advertised special"),
      };
      pageRecords.push(record);
      const existing = pricesByItem.get(record.itemId);
      if (!existing || record.priceCents < existing.priceCents) {
        pricesByItem.set(record.itemId, record);
      }
    }
    fs.writeSync(out, `${JSON.stringify({ offset, prices: pageRecords })}\n`);
    pages += 1;
    items += pageItems.length;
    offset += pageItems.length;
    if (pages % 25 === 0) console.log(`[woolworths] page ${pages}, ${items} items`);
    const pagination = page.pagination || {};
    if (pagination.hasMore === false || pageItems.length === 0) break;
    if (typeof pagination.nextOffset === "number") offset = pagination.nextOffset;
    await sleep(PAGE_DELAY_MS);
  }
  fs.closeSync(out);

  return { pricesByItem, pages, items };
}

async function main() {
  const catalogue = readWindow(CATALOGUE_PATH, "GROCER_CATALOGUE");
  if (!Array.isArray(catalogue?.items)) throw new Error("Could not read data/catalogue.js");
  const gtins = readWindow(GTINS_PATH, "GROCER_GTINS");

  const rowsByGtin = new Map();
  for (const row of catalogue.items) {
    const gtin = normalizeGtin(gtins[row[0]]);
    if (!gtin) continue;
    if (!rowsByGtin.has(gtin)) rowsByGtin.set(gtin, []);
    rowsByGtin.get(gtin).push(String(row[0]));
  }

  const zone = await aucklandZone();
  console.log(
    `[woolworths] zone ${zone.id} ${zone.name} (store ${zone.fulfilmentStoreId}, ${zone.pricingMode})`
  );

  const { pricesByItem, pages, items } = await promoPrices(zone.id);

  const prices = {};
  const units = {};
  const specials = {};
  const byRow = new Map();
  let unmatched = 0;
  let ambiguous = 0;

  for (const price of pricesByItem.values()) {
    const rows = rowsByGtin.get(price.gtin) || [];
    if (rows.length === 0) {
      unmatched += 1;
      continue;
    }
    if (rows.length > 1) {
      ambiguous += 1;
      continue;
    }
    const rowId = rows[0];
    const existing = byRow.get(rowId);
    if (existing && existing.priceCents <= price.priceCents) continue;
    byRow.set(rowId, price);
    prices[rowId] = price.priceCents;
    if (price.unit) units[rowId] = price.unit;
    specials[rowId] = {
      endDate: "",
      label: price.label,
      observedAt: price.observedAt,
    };
  }

  if (!Object.keys(prices).length) {
    throw new Error("No Auckland-zone Woolworths specials matched the demo catalogue");
  }

  const observedAt = Object.values(specials)
    .map((special) => special.observedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const sorted = (object) =>
    Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
  const checkedAt = new Date().toISOString();

  const store = {
    id: "auckland-default",
    brand: "wow",
    name: "Woolworths",
    branch: "Auckland (delivery zone)",
    region: "NI",
    address: zone.address || "",
    latitude: Number.isFinite(zone.lat) ? zone.lat : null,
    longitude: Number.isFinite(zone.lng) ? zone.lng : null,
    url: "https://www.woolworths.co.nz",
    specialsOnly: true,
    checkedAt,
    specialsEndDate: "",
    specialsCount: Object.keys(prices).length,
    prices: sorted(prices),
    units: sorted(units),
    specials: sorted(specials),
  };

  const payload = {
    fetchedAt: TODAY,
    checkedAt,
    observedAt,
    source: "Baskt public Woolworths price feed (Auckland delivery zone)",
    note: "Woolworths prices are per delivery zone. Only the Auckland zone's advertised specials below are priced; anything else has no published Woolworths price.",
    zone: {
      locationId: String(zone.id),
      externalId: zone.externalId,
      name: zone.name,
      address: zone.address || "",
      fulfilmentStoreId: String(zone.fulfilmentStoreId || ""),
      pricingMode: zone.pricingMode || "",
    },
    stores: [store],
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    `/* Generated by scripts/pull-woolworths-specials.mjs on ${TODAY}.
   Woolworths prices come from Baskt's public feed for the Auckland delivery
   zone. Only the advertised specials below are priced; everything else has no
   published Woolworths price. Do not edit by hand — re-run the script instead. */
window.GROCER_WOOLWORTHS = ${JSON.stringify(payload, null, 2)};
`
  );

  console.log(
    `[woolworths] ${pages} pages, ${items} items, ` +
      `${pricesByItem.size} Auckland promotions, ${store.specialsCount} matched catalogue rows, ` +
      `${unmatched} rows not in the catalogue, ${ambiguous} ambiguous GTINs`
  );
  console.log(`Wrote ${OUT}`);
}

main().catch((error) => {
  console.error(`[woolworths] FAILED ${error.message}`);
  process.exitCode = 1;
});
