#!/usr/bin/env node
/* Pull Woolworths branch prices from Grocer's public price dataset.
 *
 * Grocer publishes its price database as static files on assets-prod.grocer.nz:
 * a DuckDB catalogue with GTINs plus one parquet file per store. There is no
 * account, token or hidden endpoint involved, and nothing here touches
 * woolworths.co.nz. This script reads the Woolworths branches the demo shows,
 * maps each store's prices onto demo catalogue rows by GTIN, and writes one
 * sparse price file per branch. They live in data/woolworths-prices rather than
 * data/store-prices because the nightly Foodstuffs rebuild clears that folder.
 *
 * The price recorded is the price advertised today: the sale price when the
 * store has one, otherwise the shelf price. Club/member prices and multi-buy
 * thresholds are ignored so the comparison stays like-for-like.
 *
 *   node scripts/pull-grocer-prices.mjs
 *   STORES=9,45 CACHE=/tmp/grocer OUT_DIR=/tmp/store-prices node scripts/pull-grocer-prices.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { DuckDBInstance } from "@duckdb/node-api";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE = "https://assets-prod.grocer.nz/public";
const OUT_DIR = process.env.OUT_DIR || path.join(ROOT, "data/woolworths-prices");
const DIRECTORY_OUT = process.env.DIRECTORY_OUT || path.join(ROOT, "data/woolworths.js");
const GTINS_PATH = process.env.GTINS || path.join(ROOT, "data/gtins.js");
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Pacific/Auckland",
}).format(new Date());
const CACHE = process.env.CACHE || `/tmp/trolleybird-grocer-${TODAY}`;
const USER_AGENT = "TrolleybirdDemo/1.0 (price comparison demo; contact via GitHub)";

/* Every Woolworths branch in the Auckland region, from Grocer's public store
   table. Grocer publishes no island field, so the nationwide set is out of
   scope here: every id below is an Auckland store. */
const ALL_STORES = [
  { id: 8, branch: "Auckland Airport" },
  { id: 9, branch: "Auckland City" },
  { id: 15, branch: "Beachlands" },
  { id: 18, branch: "Birkenhead" },
  { id: 21, branch: "Botany Downs" },
  { id: 24, branch: "Browns Bay" },
  { id: 45, branch: "Glenfield" },
  { id: 47, branch: "Greenlane" },
  { id: 50, branch: "Grey Lynn" },
  { id: 56, branch: "Helensville" },
  { id: 57, branch: "Henderson" },
  { id: 58, branch: "Highland Park" },
  { id: 59, branch: "Hobsonville" },
  { id: 61, branch: "Howick" },
  { id: 70, branch: "Kelston" },
  { id: 77, branch: "Lynfield" },
  { id: 78, branch: "Lynnmall" },
  { id: 81, branch: "Mairangi Bay" },
  { id: 82, branch: "Mangere East" },
  { id: 84, branch: "Manukau" },
  { id: 85, branch: "Manukau City Mall" },
  { id: 86, branch: "Manurewa" },
  { id: 90, branch: "Meadowbank" },
  { id: 91, branch: "Meadowlands" },
  { id: 300323, branch: "Metro Albert Street" },
  { id: 10, branch: "Metro Auckland Victoria Street West" },
  { id: 300325, branch: "Metro Halsey Street" },
  { id: 300326, branch: "Metro Herne Bay" },
  { id: 92, branch: "Milford" },
  { id: 97, branch: "Mount Eden" },
  { id: 98, branch: "Mount Roskill" },
  { id: 99, branch: "Mount Wellington" },
  { id: 104, branch: "Newmarket" },
  { id: 106, branch: "Northcote" },
  { id: 108, branch: "Northwest" },
  { id: 110, branch: "Onehunga" },
  { id: 111, branch: "Orewa" },
  { id: 116, branch: "Pakuranga" },
  { id: 118, branch: "Papakura" },
  { id: 120, branch: "Papatoetoe" },
  { id: 124, branch: "Ponsonby" },
  { id: 126, branch: "Pt Chevalier" },
  { id: 127, branch: "Pukekohe" },
  { id: 128, branch: "Pukekohe South" },
  { id: 141, branch: "Silverdale" },
  { id: 145, branch: "St Johns" },
  { id: 146, branch: "St Lukes" },
  { id: 149, branch: "Sunnynook" },
  { id: 150, branch: "Takanini" },
  { id: 151, branch: "Takapuna" },
  { id: 157, branch: "Te Atatu South" },
  { id: 163, branch: "Three Kings" },
  { id: 172, branch: "Waiata Shores" },
  { id: 155089, branch: "Waiheke Island" },
  { id: 181, branch: "Warkworth" },
  { id: 182, branch: "Westgate" },
  { id: 185, branch: "Whangaparaoa" },
]
const STORES = process.env.STORES
  ? ALL_STORES.filter((store) => process.env.STORES.split(",").map(Number).includes(store.id))
  : ALL_STORES;

function readWindow(file, name) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  const value = sandbox.window[name];
  if (!value) throw new Error(`No window.${name} in ${file}`);
  return value;
}

function sqlPath(file) {
  return `'${String(file).replace(/'/g, "''")}'`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Grocer's CDN answers with brotli when asked (Node decodes it for us) and
   occasionally rate-limits a burst. Retry with a short backoff and keep the
   previous file when a download fails. */
async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let lastError = "unknown";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          referer: "https://grocer.nz/",
          "accept-encoding": "br",
        },
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = `${res.status} ${res.statusText}`;
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.length) throw new Error(`empty response for ${url}`);
      fs.writeFileSync(`${file}.part`, bytes);
      fs.renameSync(`${file}.part`, file);
      return file;
    } catch (error) {
      lastError = error.message;
      if (attempt === 4) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`Gave up on ${url} (${lastError})`);
}

/* One GTIN -> catalogue row table, written once and reused for every store. */
function writeGtinTable() {
  const gtins = readWindow(GTINS_PATH, "GROCER_GTINS");
  const lines = ["catalogue_id,gtin"];
  for (const [catalogueId, gtin] of Object.entries(gtins)) {
    const digits = String(gtin || "").replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 14) lines.push(`${catalogueId},${digits}`);
  }
  const file = path.join(CACHE, "gtins.csv");
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  console.log(`[grocer] ${lines.length - 1} catalogue GTINs`);
  return { file, count: lines.length - 1 };
}

async function main() {
  if (!STORES.length) throw new Error(`No Woolworths stores in STORES=${process.env.STORES}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });

  const { file: gtinsFile, count: gtinCount } = writeGtinTable();
  const baseDb = await download(`${BASE}/base_v3.duckdb.br`, path.join(CACHE, "base_v3.duckdb"));

  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  await conn.run(`attach ${sqlPath(baseDb)} as base (READ_ONLY)`);
  await conn.run(
    `create table gtins as select * from read_csv_auto(${sqlPath(gtinsFile)}, header=true)`
  );

  const directory = [];
  for (const store of STORES) {
    const url = `${BASE}/prices_per_store_v3/public_prices_${store.id}.parquet`;
    let parquet;
    try {
      parquet = await download(url, path.join(CACHE, `public_prices_${store.id}.parquet`));
    } catch (error) {
      console.warn(`[grocer] ${store.branch}: no price file (${error.message})`);
      continue;
    }

    const reader = await conn.runAndReadAll(`
      select g.catalogue_id as id,
             min(coalesce(pr.sale_price_cent, pr.original_price_cent)) as cents,
             max(case when pr.sale_price_cent is not null then 1 else 0 end) as on_sale,
             epoch(max(pr.updated_at))::bigint as checked
      from read_parquet(${sqlPath(parquet)}) pr
      join base.public_barcodes b on b.product_id = pr.product_id
      join gtins g
        on lpad(regexp_replace(g.gtin, '[^0-9]', '', 'g'), 14, '0')
         = lpad(regexp_replace(b.barcode, '[^0-9]', '', 'g'), 14, '0')
      where coalesce(pr.sale_price_cent, pr.original_price_cent) > 0
      group by 1
      order by 1
    `);
    const rows = reader.getRowObjects();
    if (rows.length < 1000) {
      throw new Error(
        `${store.branch} matched only ${rows.length} of ${gtinCount} catalogue GTINs; refusing to publish a partial price list`
      );
    }

    const prices = {};
    let checked = 0;
    let onSale = 0;
    for (const row of rows) {
      prices[row.id] = Number(row.cents);
      checked = Math.max(checked, Number(row.checked));
      if (Number(row.on_sale) > 0) onSale += 1;
    }
    const checkedAt = checked ? new Date(checked * 1000).toISOString() : "";
    const payload = {
      storeId: store.id,
      brand: "wow",
      source: "grocer.nz",
      checkedAt,
      productCount: rows.length,
      prices,
    };
    fs.writeFileSync(
      path.join(OUT_DIR, `${store.id}.json`),
      `${JSON.stringify(payload)}\n`
    );
    directory.push({
      id: store.id,
      brand: "wow",
      branch: store.branch,
      region: "NI",
      address: "",
      checkedAt,
      priceCount: rows.length,
      specialsCount: onSale,
    });
    console.log(
      `[grocer] Woolworths ${store.branch}: ${rows.length} prices ` +
        `(${onSale} on sale, checked ${checkedAt.slice(0, 16).replace("T", " ")})`
    );
  }

  if (!directory.length) throw new Error("No Woolworths branch prices were written");

  const header = `/* Generated by scripts/pull-grocer-prices.mjs on ${TODAY}.
   Woolworths branches come from Grocer's public price dataset
   (assets-prod.grocer.nz/public), which mirrors the prices Woolworths NZ
   publishes for each store. Branch prices live in data/woolworths-prices/<id>.json.
   Do not edit by hand — re-run the script instead. */
`;
  const body = {
    fetchedAt: TODAY,
    source: "Grocer public price dataset (Woolworths NZ)",
    note:
      "Per-branch Woolworths prices, read from grocer.nz's published static dataset. " +
      "A product shows the price advertised today: the sale price when there is one, " +
      "otherwise the shelf price. Club and multi-buy prices are excluded.",
    stores: directory,
  };
  fs.writeFileSync(
    DIRECTORY_OUT,
    `${header}window.GROCER_WOOLWORTHS = ${JSON.stringify(body, null, 2)};\n`
  );
  console.log(
    `[grocer] wrote ${directory.length} branches and ${path.relative(ROOT, DIRECTORY_OUT)}`
  );
}

main().catch((error) => {
  console.error(`[grocer] FAILED ${error.stack || error.message}`);
  process.exitCode = 1;
});
