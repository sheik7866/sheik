#!/usr/bin/env node
/* Pull the four demo Four Square branches' weekly specials.
 *
 * Four Square publishes weekly specials on its public website, but no
 * everyday shelf-price list. This script selects each branch with the site's
 * own store cookie, reads the advertised specials, and maps their Foodstuffs
 * product ids onto catalogue rows so the demo can price the products it
 * already knows. It deliberately does not invent prices for anything else.
 *
 *   node scripts/pull-foursquare-specials.mjs
 *   OUT=/tmp/foursquare.js node scripts/pull-foursquare-specials.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = process.env.OUT || path.join(ROOT, "data/foursquare.js");
const CATALOGUE_PATH = process.env.CATALOGUE || path.join(ROOT, "data/catalogue.js");
const PAGE_URL = "https://www.foursquare.co.nz/local-specials-and-promotions";
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Pacific/Auckland",
}).format(new Date());
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

/* The four demo branches are real Auckland stores from Four Square's public
   store finder. Their ids are the GUIDs the store finder uses; the site's
   store cookie selects the branch whose specials we read. */
const STORES = [
  {
    branch: "Britomart",
    sourceId: "{5401B90C-2411-428C-990F-89BB575395B1}",
    address: "17 Galway Street, Auckland CBD, Auckland 1010",
    latitude: -36.844424160463085,
    longitude: 174.7677305423276,
    path: "/upper-north-island/auckland/britomart",
  },
  {
    branch: "Eden Terrace",
    sourceId: "{86D054C0-C527-4B78-9357-B583EB678B94}",
    address: "22-24 New North Road, Eden Terrace, Auckland 1021",
    latitude: -36.8509,
    longitude: 174.7598,
    path: "/upper-north-island/auckland/eden-terrace",
  },
  {
    branch: "Onehunga",
    sourceId: "{8D84325D-FB12-4E1E-9153-91150BF93BE6}",
    address: "310 Onehunga Mall, Onehunga, Auckland 1061",
    latitude: -36.918649,
    longitude: 174.784427,
    path: "/upper-north-island/auckland/onehunga",
  },
  {
    branch: "Ellerslie",
    sourceId: "{B7609BE7-C28B-470F-8CB8-BCD44005FFBF}",
    address: "126 Main Highway, Ellerslie, Auckland 0100",
    latitude: -36.897885,
    longitude: 174.809678,
    path: "/upper-north-island/auckland/ellerslie",
  },
];

function readWindow(file, name) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  const value = sandbox.window[name];
  if (!value) throw new Error(`No window.${name} in ${file}`);
  return value;
}

function findJsonArrayEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error("Could not find the end of the specials array");
}

/* The specials are embedded in the Next.js flight payload, so quotes are
   escaped once or twice depending on the field. Unescape, then parse the
   mappedProducts array by bracket matching rather than a greedy regex. */
function mappedProducts(html) {
  const unescaped = html.replace(/\\\\"/g, '"').replace(/\\"/g, '"');
  const marker = '"mappedProducts":[';
  const at = unescaped.indexOf(marker);
  if (at < 0) throw new Error("No mappedProducts in the specials page");
  const start = at + marker.length - 1;
  const end = findJsonArrayEnd(unescaped, start);
  return JSON.parse(unescaped.slice(start, end));
}

function productIdOf(product) {
  const src = product?.image?.src;
  const match = typeof src === "string" ? src.match(/\/image\/\d+x\d+\/(\d+)\./i) : null;
  return match ? match[1] : "";
}

function unitReference(product) {
  const price = Number(product?.unitPrice?.price);
  const measure = String(product?.unitPrice?.measure || "").trim();
  if (!(price > 0) || !measure) return undefined;
  return `$${price.toFixed(2)}/${measure}`;
}

function storeCookie(store) {
  const value = JSON.stringify({
    IsSuccess: true,
    StoreId: store.sourceId,
    StoreLat: String(store.latitude),
    StoreLng: String(store.longitude),
    UserLat: "",
    UserLng: "",
  });
  return `brands_server_nearest_store=${encodeURIComponent(value)}`;
}

function visibleText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function pullStore(store) {
  const res = await fetch(PAGE_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: storeCookie(store),
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`${store.branch}: specials page ${res.status}`);
  const html = await res.text();
  if (!visibleText(html).includes(`Your local store is Four Square ${store.branch}`)) {
    throw new Error(`${store.branch}: the site did not select this store`);
  }
  const products = mappedProducts(html);
  if (!products.length) throw new Error(`${store.branch}: no specials returned`);
  return products;
}

async function main() {
  const catalogue = readWindow(CATALOGUE_PATH, "GROCER_CATALOGUE");
  if (!Array.isArray(catalogue?.items)) {
    throw new Error("Could not read data/catalogue.js");
  }

  const rowsByProductId = new Map();
  for (const row of catalogue.items) {
    const rowId = String(row[0] || "");
    const productId = rowId.split("-")[0];
    if (!productId) continue;
    if (!rowsByProductId.has(productId)) rowsByProductId.set(productId, []);
    rowsByProductId.get(productId).push(rowId);
  }

  const stores = [];
  for (const store of STORES) {
    const products = await pullStore(store);
    const prices = {};
    const units = {};
    const specials = {};
    let unmatched = 0;

    for (const product of products) {
      const productId = productIdOf(product);
      const rows = rowsByProductId.get(productId) || [];
      if (rows.length !== 1) {
        unmatched += 1;
        continue;
      }
      const rowId = rows[0];
      const price = Number(product?.pricing?.price);
      if (!(price > 0)) continue;
      prices[rowId] = Math.round(price * 100);
      const unit = unitReference(product);
      if (unit) units[rowId] = unit;
      specials[rowId] = {
        endDate: String(product?.endDate || ""),
        label: "Weekly special",
      };
    }

    if (!Object.keys(prices).length) {
      throw new Error(`${store.branch}: no specials matched the catalogue`);
    }
    const endDates = [...new Set(products.map((product) => String(product?.endDate || "")).filter(Boolean))];
    const endDate = endDates.sort((a, b) => new Date(a) - new Date(b)).at(-1) || "";
    if (unmatched) {
      console.warn(
        `[foursquare] ${store.branch}: ${unmatched} specials are not in the catalogue and were skipped`
      );
    }

    stores.push({
      id: store.sourceId.replace(/[{}]/g, "").toLowerCase(),
      sourceId: store.sourceId,
      brand: "fsq",
      name: "Four Square",
      branch: store.branch,
      region: "NI",
      address: store.address,
      latitude: store.latitude,
      longitude: store.longitude,
      url: `https://www.foursquare.co.nz${store.path}`,
      specialsOnly: true,
      checkedAt: new Date().toISOString(),
      specialsEndDate: endDate,
      specialsCount: Object.keys(prices).length,
      prices: Object.fromEntries(Object.entries(prices).sort(([a], [b]) => a.localeCompare(b))),
      units: Object.fromEntries(Object.entries(units).sort(([a], [b]) => a.localeCompare(b))),
      specials: Object.fromEntries(
        Object.entries(specials).sort(([a], [b]) => a.localeCompare(b))
      ),
    });
    console.log(
      `[foursquare] ${store.branch}: ${Object.keys(prices).length} specials, ends ${endDate || "—"}`
    );
  }

  const payload = {
    fetchedAt: TODAY,
    checkedAt: new Date().toISOString(),
    source: "Four Square store finder and weekly specials",
    note: "Four Square publishes weekly specials, not everyday shelf prices. Anything not in this file has no published Four Square price.",
    stores,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    `/* Generated by scripts/pull-foursquare-specials.mjs on ${TODAY}.
   Four Square stores publish weekly specials, not a full shelf-price list.
   Only the advertised specials below are priced; everything else stays unknown.
   Do not edit by hand — re-run the script instead. */
window.GROCER_FOURSQUARE = ${JSON.stringify(payload, null, 2)};
`
  );
  console.log(
    `Wrote ${stores.length} Four Square branches and ${stores.reduce(
      (sum, store) => sum + store.specialsCount,
      0
    )} specials to ${OUT}`
  );
}

main().catch((error) => {
  console.error(`[foursquare] FAILED ${error.message}`);
  process.exitCode = 1;
});
