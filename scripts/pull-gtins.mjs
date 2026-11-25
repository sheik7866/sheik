#!/usr/bin/env node
/* Pull real GTINs for the catalogue from the stores' public product records.
 *
 * Usage:
 *   node scripts/pull-gtins.mjs              # only products missing a GTIN
 *   node scripts/pull-gtins.mjs --all        # re-check every catalogue product
 *   LIMIT=20 OUT=/tmp/gtins.js CACHE=/tmp/gtins-cache.json \
 *     node scripts/pull-gtins.mjs
 *
 * Foodstuffs' search API does not expose barcodes, but the product-detail
 * endpoint used by each shop's own product page returns `sku`, which is the
 * GTIN for packaged goods (for example V Blue Guarana 250mL is 94129045).
 * The coreimg alternate-image path repeats the same number, so it is used as
 * a fallback when `sku` is absent.
 *
 * Only valid 8-, 12- and 13-digit GTINs are kept. Produce PLUs and internal
 * codes such as 4011 or 5021717 are deliberately discarded rather than
 * rendered as barcodes. The output is data/gtins.js, a static map loaded by
 * the demo; the price refresh does not need to fetch it every night.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = process.env.OUT || path.join(ROOT, "data/gtins.js");
const CACHE = process.env.CACHE || "/tmp/grocer-gtins-cache.json";
const CATALOGUE = process.env.CATALOGUE || path.join(ROOT, "data/catalogue.js");
const ALL = process.argv.includes("--all");
const LIMIT = Number(process.env.LIMIT || 0);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 8));

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

const BRANDS = {
  nw: {
    name: "New World",
    site: "https://www.newworld.co.nz",
    api: "https://api-prod.newworld.co.nz/v1/edge",
    storeName: "Point Chevalier",
    storeId: "871ff39f-99b5-4030-b035-b2dab7225082",
  },
  pns: {
    name: "PAK'nSAVE",
    site: "https://www.paknsave.co.nz",
    api: "https://api-prod.paknsave.co.nz/v1/edge",
    storeName: "Mt Albert",
    storeId: "b2e98a14-c8ca-401e-99ed-edf74570c6f6",
  },
};

/* Product detail is store-scoped: a South Island-only product is not found
   via the North Island anchors. Each price-list zone maps to a store that
   stocks it, and the catalogue row says which zones carry the product. */
const ZONE_STORES = {
  "pns-ni": { brand: "pns", storeId: "b2e98a14-c8ca-401e-99ed-edf74570c6f6" },
  "nw-ni": { brand: "nw", storeId: "871ff39f-99b5-4030-b035-b2dab7225082" },
  "pns-si": { brand: "pns", storeId: "4a279605-eaa8-470d-bcd4-0a9e3c9ab43b" },
  "nw-si": { brand: "nw", storeId: "c6abac35-b75f-4a02-9b43-7ad5a7c7aa37" },
};
const ZONE_KEYS = Object.keys(ZONE_STORES);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Mirrors the browser-side check, so a code is only stored if the demo can
   render and scan it. */
function checkDigit(base) {
  let sum = 0;
  let weight = 3;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += Number(base[index]) * weight;
    weight = 4 - weight;
  }
  return (10 - (sum % 10)) % 10;
}

function cleanGtin(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 14) digits = digits.replace(/^0+/, "");
  // Some imported US packs are filed as an 11-digit UPC-A with the leading
  // zero dropped (Purina Fancy Feast 85g is 50000426942 for 050000426942).
  if (digits.length === 11) digits = `0${digits}`;
  if (digits.length === 12) digits = `0${digits}`;
  if (digits.length !== 8 && digits.length !== 13) return "";
  if (Number(digits.at(-1)) !== checkDigit(digits.slice(0, -1))) return "";
  return digits;
}

function productGtin(product) {
  const direct = cleanGtin(product?.sku);
  if (direct) return direct;
  for (const image of product?.images?.alternateImages || []) {
    const match = /\/info\/(\d{8,14})\//.exec(String(image?.url || ""));
    const fromImage = cleanGtin(match?.[1]);
    if (fromImage) return fromImage;
  }
  return "";
}

function skuProductId(sku) {
  return String(sku || "")
    .replace(/(?:pns|nw)$/i, "")
    .replace(/_/g, "-")
    .toUpperCase();
}

function readCatalogueRows() {
  if (!fs.existsSync(CATALOGUE)) throw new Error(`No catalogue at ${CATALOGUE}`);
  const source = fs.readFileSync(CATALOGUE, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: CATALOGUE });
  const items = sandbox.window.GROCER_CATALOGUE?.items;
  if (!Array.isArray(items)) throw new Error(`No GROCER_CATALOGUE.items in ${CATALOGUE}`);
  return items;
}

function readImportIds() {
  const ids = [];
  for (const file of ["data/paknsave-import.js", "data/newworld-import.js"]) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) continue;
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(filePath, "utf8"), sandbox, { filename: file });
    for (const imported of Object.values(sandbox.window)) {
      for (const item of Object.values(imported?.items || {})) {
        const id = skuProductId(item.sku);
        if (id) ids.push(id);
      }
    }
  }
  return ids;
}

function readExisting() {
  if (!fs.existsSync(OUT)) return {};
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(OUT, "utf8"), sandbox, { filename: OUT });
  const map = sandbox.window.GROCER_GTINS;
  return map && typeof map === "object" ? map : {};
}

function readCache() {
  if (ALL || !fs.existsSync(CACHE)) return { gtins: {}, missing: [] };
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    return {
      gtins: cached.gtins && typeof cached.gtins === "object" ? cached.gtins : {},
      missing: Array.isArray(cached.missing) ? cached.missing : [],
    };
  } catch {
    return { gtins: {}, missing: [] };
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}

function writeOutput(gtins) {
  const sorted = Object.fromEntries(
    Object.entries(gtins).sort(([left], [right]) => left.localeCompare(right))
  );
  const count = Object.keys(sorted).length;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    `/* Generated by scripts/pull-gtins.mjs from the stores' public product records on ${new Date()
      .toISOString()
      .slice(0, 10)}.
   ${count.toLocaleString("en-NZ")} real GTINs keyed by Foodstuffs product id. Only codes with a
   valid check digit are included; produce PLUs and other internal codes are not barcodes.
   Re-run the script to add new products; do not edit by hand. */
window.GROCER_GTINS = ${JSON.stringify(sorted)};\n`
  );
  console.log(`Wrote ${count} GTINs to ${OUT}`);
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
    body: JSON.stringify({ fingerprintUser: "grocer-demo-price-check" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${brand.name} guest token ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error(`${brand.name} guest token had no access_token`);
  return json.access_token;
}

for (const brand of Object.values(BRANDS)) {
  brand.token = "";
  brand.tokenPromise = null;
}

async function accessToken(brand, refresh = false) {
  if (refresh) {
    brand.token = "";
    brand.tokenPromise = null;
  }
  if (brand.token) return brand.token;
  if (!brand.tokenPromise) {
    brand.tokenPromise = guestToken(brand).then((token) => {
      brand.token = token;
      return token;
    }).finally(() => {
      brand.tokenPromise = null;
    });
  }
  return brand.tokenPromise;
}

async function apiGet(brand, endpoint) {
  for (let attempt = 0; attempt <= 5; attempt += 1) {
    const token = await accessToken(brand);
    const res = await fetch(`${brand.api}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
    });
    if (res.status === 401) {
      await accessToken(brand, true);
      continue;
    }
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 5) throw new Error(`${brand.name} API ${res.status}`);
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${brand.name} API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }
  throw new Error(`${brand.name} API kept failing after retries`);
}

async function productDetail(brand, storeId, productId) {
  return apiGet(brand, `/store/${storeId}/product/${encodeURIComponent(productId)}`);
}

async function findGtin(productId, zones = []) {
  const candidates = (zones.length ? zones : ["nw-ni", "pns-ni"])
    .map((zone) => ZONE_STORES[zone])
    .filter(Boolean)
    .map(({ brand, storeId }) => ({ brand: BRANDS[brand], storeId }));
  const tried = new Set();

  for (const { brand, storeId } of candidates) {
    const key = `${brand.name}|${storeId}`;
    if (tried.has(key)) continue;
    tried.add(key);
    let product;
    try {
      product = await productDetail(brand, storeId, productId);
    } catch (error) {
      console.warn(`  ${productId} ${brand.name}: ${error.message}`);
      continue;
    }
    if (!product) continue;
    const gtin = productGtin(product);
    if (gtin) return gtin;
  }
  return "";
}

async function main() {
  const catalogueRows = readCatalogueRows();
  const zonesById = new Map();
  for (const row of catalogueRows) {
    const id = String(row[0] || "");
    if (!id) continue;
    zonesById.set(
      id,
      ZONE_KEYS.filter((zone, index) => Boolean(row[6 + index]))
    );
  }

  const importIds = readImportIds();
  const ids = [
    ...new Set([
      ...catalogueRows.map((row) => String(row[0] || "")).filter(Boolean),
      ...importIds,
    ]),
  ];
  const existing = ALL ? {} : readExisting();
  const cache = readCache();
  for (const [id, gtin] of Object.entries(existing)) {
    if (!cache.gtins[id]) cache.gtins[id] = gtin;
  }
  const done = new Set(Object.keys(cache.gtins));
  const missing = new Set(cache.missing);
  const todo = ids.filter((id) => !done.has(id) && !missing.has(id)).slice(0, LIMIT || undefined);

  console.log(
    `${ids.length.toLocaleString("en-NZ")} products; ${done.size.toLocaleString("en-NZ")} ` +
      `already mapped; ${todo.length.toLocaleString("en-NZ")} to check`
  );

  if (!todo.length) {
    writeOutput(cache.gtins);
    return;
  }

  let cursor = 0;
  let checked = 0;
  let found = 0;
  let blank = 0;
  const started = Date.now();

  async function worker() {
    while (cursor < todo.length) {
      const id = todo[cursor];
      cursor += 1;
      try {
        const gtin = await findGtin(id, zonesById.get(id) || []);
        if (gtin) {
          cache.gtins[id] = gtin;
          found += 1;
        } else {
          missing.add(id);
          cache.missing = [...missing];
          blank += 1;
        }
      } catch (error) {
        console.warn(`  ${id}: ${error.message}`);
      }
      checked += 1;
      if (checked % 250 === 0) {
        saveCache(cache);
        const rate = checked / ((Date.now() - started) / 1000);
        console.log(
          `  ${checked}/${todo.length} checked · ${found} GTINs · ${blank} without · ` +
            `${rate.toFixed(1)}/s`
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveCache(cache);
  writeOutput(cache.gtins);
  console.log(
    `Checked ${checked} products in ${((Date.now() - started) / 1000).toFixed(0)}s: ` +
      `${found} GTINs, ${blank} without a valid code, ` +
      `${Object.keys(cache.gtins).length.toLocaleString("en-NZ")} total mapped`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
