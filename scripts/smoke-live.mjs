#!/usr/bin/env node
/*
  Post-deploy smoke test for the Trolleybird demo.

  It replays the per-store availability check against the deployed site:
  a PAK'nSAVE-only product, a New World-only product and a mixed basket must
  show "not stocked" instead of an invented price, and a chain missing an item
  must not be ranked or totalled. It also verifies products show their real
  GTINs (including the V can's 8-digit EAN-8) and   decodes the rendered images
  with the site's own vendored ZXing build, so a broken barcode image fails the
  post-deploy check. Products without a valid GTIN must show no barcode card.
  A backfilled pack (Purina Fancy Feast, the UPC-A 050000426942 filed without
  its leading zero) must render and decode as EAN-13 0050000426942, and a pack
  picked out of a duplicated bakery listing (Apricot & Walnut Muffins 6pk) must
  carry the code belonging to its own spelling rather than its twin's.
  It also checks quantity-aware multi-buy totals, limited single-item specials
  at PAK'nSAVE and New World (including units beyond their limit reverting to
  shelf price and a limit shared across two PAK'nSAVE products), the club-card
  toggle, and the deal-adjusted receipt, and
  requires a loaded product picture plus the import banner's last price-check
  time and shelf-price coverage summary.

  Usage:
    npm run smoke:live
    npm run smoke:live -- https://example.com/app.html
    SMOKE_URL=https://example.com/app.html npm run smoke:live
*/

import { chromium } from "playwright";
import fs from "node:fs";

const DEFAULT_TARGET = "https://sheik7866.github.io/sheik/app.html";

function resolveTarget(value) {
  if (!value) return DEFAULT_TARGET;
  try {
    const url = new URL(value);
    if (!/\.html?$/i.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/app.html`;
    }
    return url.href;
  } catch {
    return value;
  }
}

const TARGET = resolveTarget(process.env.SMOKE_URL || process.argv[2]);

const PAK_ONLY = {
  sku: "5021717-EA-000",
  name: "Baby Mum-Mum Apple & Pumpkin First Rice Rusks",
  missingAt: "New World",
};

const BOTH_STORES = {
  sku: "5021721-EA-000",
  name: "Baby Mum-Mum Vegetable First Rice Rusks",
};

const NW_ONLY = {
  sku: "5330841-EA-000",
  name: "Ceres Organics Banana Baby Rice Puffs 10+ Months",
  missingAt: "Pak'nSave",
};

const DEMO_STAPLE = {
  id: "milk-2l",
  name: "Anchor Blue Milk",
  gtin: "94152210",
};
const CATALOGUE_GTIN = {
  sku: "5007495-EA-000",
  name: "V Blue Guarana Energy Drink",
  search: "V Blue Guarana",
  gtin: "94129045",
};
const BACKFILLED_GTIN = {
  sku: "5010289-EA-000",
  name: "Purina Fancy Feast Adult Chunky Chicken Feast",
  search: "Purina Fancy Feast Adult Chunky Chicken",
  gtin: "0050000426942",
};
const DISAMBIGUATED_GTIN = {
  sku: "5132804-EA-000",
  name: "Apricot & Walnut Muffins 6pk",
  search: "Apricot & Walnut Muffins",
  gtin: "9400989067987",
};
const REAL_GTIN = "9300617075462";

let smokeStage = "starting";
const step = (message) => {
  smokeStage = message;
  console.log(`[smoke] ${message}`);
};
const normalize = (value) => value.replace(/\s+/g, " ").trim();
const money = (cents) => `$${(Number(cents) / 100).toFixed(2)}`;
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The tab bar only exists on phone widths; desktop layouts show every panel at
// once, so clicking the hidden tab would hang until the Playwright timeout.
async function showShoppingList(page) {
  const listTab = page.locator('[data-tab="list"]');
  if (await listTab.isVisible()) await listTab.click();
}

async function currentDeals(page) {
  return page.evaluate(() => {
    const catalogue = window.GROCER_CATALOGUE;
    if (!catalogue?.zones || !Array.isArray(catalogue.items)) {
      throw new Error("the catalogue is not loaded");
    }
    const bySku = new Map(catalogue.items.map((row) => [row[0], row]));
    const groupDeals = (zoneName, shelfIndex) => {
      const groups = new Map();
      for (const [sku, deal] of Object.entries(catalogue.zones[zoneName]?.deals || {})) {
        const row = bySku.get(sku);
        if (!row || deal[6] !== 1) continue;
        const shelf = Number(row[shelfIndex]);
        if (!(shelf > 0)) continue;
        const id = String(deal[5] || "");
        if (!id) continue;
        if (!groups.has(id)) {
          groups.set(id, {
            groupId: id,
            qty: Number(deal[0]),
            price: Number(deal[1]),
            limit: Number(deal[3]),
            isClub: deal[2] === 1,
            products: [],
          });
        }
        groups.get(id).products.push({ sku, name: row[1], brand: row[2], shelf });
      }
      for (const group of groups.values()) {
        group.products.sort((a, b) => a.name.localeCompare(b.name));
      }
      return [...groups.values()];
    };
    const pnsGroups = groupDeals("pns-ni", 6);
    const nwGroups = groupDeals("nw-ni", 7);
    const multi = [];
    for (const [sku, deal] of Object.entries(catalogue.zones["pns-ni"]?.deals || {})) {
      const row = bySku.get(sku);
      if (!row) continue;
      const qty = Number(deal[0]);
      const price = Number(deal[1]);
      const pns = Number(row[6]);
      const nw = Number(row[7]);
      if (!Number.isInteger(qty) || qty < 2 || qty > 6) continue;
      if (!(price > 0) || !(pns > 0) || !(nw > 0)) continue;
      if (deal[2] === 1 || pns * qty <= price) continue;
      multi.push({ sku, name: row[1], qty, price, pns, nw });
    }
    const club = [];
    for (const [sku, deal] of Object.entries(catalogue.zones["nw-ni"]?.deals || {})) {
      const row = bySku.get(sku);
      if (!row) continue;
      const price = Number(deal[1]);
      const pns = Number(row[6]);
      const nw = Number(row[7]);
      if (deal[2] !== 1 || !(price > 0) || !(pns > 0) || !(nw > 0)) continue;
      if (!(price < pns) || !(price < nw)) continue;
      const pnsDeal = catalogue.zones["pns-ni"]?.deals?.[sku];
      if (pnsDeal && Number(pnsDeal[0]) >= 2 && Number(pnsDeal[1]) > 0) continue;
      club.push({ sku, name: row[1], price, pns, nw });
    }
    // Price another selected store's line exactly as the app would at this
    // quantity with no club card: a single-item special is capped by its own
    // limit, and any extra units stay at shelf price.
    const lineTotal = (sku, zone, shelfIndex, qty) => {
      const row = bySku.get(sku);
      const shelf = Number(row?.[shelfIndex]);
      if (!(shelf > 0)) return null;
      const deal = catalogue.zones[zone]?.deals?.[sku];
      if (!deal || deal[2] === 1) return shelf * qty;
      const threshold = Number(deal[0]);
      const price = Number(deal[1]);
      const dealLimit = Number(deal[3]);
      const eligible = dealLimit > 0 ? Math.min(qty, dealLimit) : qty;
      const groups = threshold > 1 ? Math.floor(eligible / threshold) : eligible;
      const units = threshold > 1 ? groups * threshold : eligible;
      const candidate = groups * price + (qty - units) * shelf;
      return Math.min(candidate, shelf * qty);
    };
    const singleDeals = [];
    for (const [sku, deal] of Object.entries(catalogue.zones["pns-ni"]?.deals || {})) {
      const row = bySku.get(sku);
      if (!row) continue;
      const qty = Number(deal[0]);
      const price = Number(deal[1]);
      const limit = Number(deal[3]);
      const shelf = Number(row[6]);
      if (qty !== 1 || deal[2] === 1 || deal[6] !== 1 || !(limit >= 2 && limit <= 12)) continue;
      if (!(price > 0) || !(shelf > 0) || !(price < shelf)) continue;
      if (shelf - price < 50) continue;
      // Keep Mt Albert the cheapest store at one unit, at the limit and one
      // unit past it, so the card, list, totals panel and receipt all feature
      // this mix & match special rather than the other store.
      const atLimit = price * limit;
      const overLimit = atLimit + shelf;
      if (!(lineTotal(sku, "nw-ni", 7, 1) > price)) continue;
      if (!(lineTotal(sku, "nw-ni", 7, limit) > atLimit)) continue;
      if (!(lineTotal(sku, "nw-ni", 7, limit + 1) > overLimit)) continue;
      singleDeals.push({ sku, name: row[1], price, shelf, limit, saving: shelf - price });
    }
    singleDeals.sort(
      (a, b) => a.limit - b.limit || a.price - b.price || a.sku.localeCompare(b.sku)
    );
    const single = singleDeals[0] || null;
    const pairGroups = new Map();
    for (const [sku, deal] of Object.entries(catalogue.zones["pns-ni"]?.deals || {})) {
      const row = bySku.get(sku);
      if (!row) continue;
      const qty = Number(deal[0]);
      const price = Number(deal[1]);
      const limit = Number(deal[3]);
      const promo = String(deal[5] || "");
      const shelf = Number(row[6]);
      const nw = Number(row[7]);
      if (qty !== 1 || deal[2] === 1 || deal[6] !== 1 || !promo) continue;
      if (!(limit >= 3 && limit <= 12) || !(price > 0) || !(shelf > 0) || !(price < shelf)) continue;
      if (shelf - price < 50 || !(nw > 0)) continue;
      if (catalogue.zones["nw-ni"]?.deals?.[sku]) continue;
      const key = `${promo}|${price}|${limit}`;
      if (!pairGroups.has(key)) {
        pairGroups.set(key, { promo, price, limit, shelf, products: [] });
      }
      pairGroups.get(key).products.push({ sku, name: row[1], shelf });
    }
    let pnsPair = null;
    for (const group of pairGroups.values()) {
      const products = group.products
        .filter((product) => product.shelf === group.shelf)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (products.length < 2) continue;
      const [a, b] = products;
      const qtyEach = Math.floor(group.limit / 2) + 1;
      const totalQty = qtyEach * 2;
      const pooled = group.limit * group.price + (totalQty - group.limit) * group.shelf;
      const nwTotal =
        lineTotal(a.sku, "nw-ni", 7, qtyEach) + lineTotal(b.sku, "nw-ni", 7, qtyEach);
      if (!(pooled < nwTotal)) continue;
      const savings = totalQty * group.shelf - pooled;
      const firstUnits = Math.min(qtyEach, group.limit);
      const secondUnits = group.limit - firstUnits;
      const firstSaving = Math.round((savings * firstUnits) / group.limit);
      const secondSaving = savings - firstSaving;
      pnsPair = {
        promoId: group.promo,
        price: group.price,
        limit: group.limit,
        shelf: group.shelf,
        qtyEach,
        totalQty,
        extraUnits: totalQty - group.limit,
        pooled,
        nwTotal,
        savings,
        products: [
          {
            sku: a.sku,
            name: a.name,
            promoUnits: firstUnits,
            shelfUnits: qtyEach - firstUnits,
            savings: firstSaving,
            lineTotal: qtyEach * group.shelf - firstSaving,
          },
          {
            sku: b.sku,
            name: b.name,
            promoUnits: secondUnits,
            shelfUnits: qtyEach - secondUnits,
            savings: secondSaving,
            lineTotal: qtyEach * group.shelf - secondSaving,
          },
        ],
      };
      break;
    }
    const nwSingles = [];
    for (const [sku, deal] of Object.entries(catalogue.zones["nw-si"]?.deals || {})) {
      const row = bySku.get(sku);
      if (!row) continue;
      const qty = Number(deal[0]);
      const price = Number(deal[1]);
      const limit = Number(deal[3]);
      const shelf = Number(row[9]);
      if (qty !== 1 || deal[2] === 1 || deal[6] !== 1 || !(limit >= 2 && limit <= 12)) continue;
      if (!(price > 0) || !(shelf > 0) || !(price < shelf)) continue;
      if (shelf - price < 50) continue;
      // Keep New World Ilam the cheapest store at one unit, at the limit and
      // one unit past it, so the card, list and receipt all feature this deal.
      if (!(lineTotal(sku, "pns-ni", 6, 1) > price)) continue;
      if (!(lineTotal(sku, "nw-ni", 7, 1) > price)) continue;
      const atLimit = price * limit;
      const overLimit = atLimit + shelf;
      if (!(lineTotal(sku, "pns-ni", 6, limit) > atLimit)) continue;
      if (!(lineTotal(sku, "nw-ni", 7, limit) > atLimit)) continue;
      if (!(lineTotal(sku, "pns-ni", 6, limit + 1) > overLimit)) continue;
      if (!(lineTotal(sku, "nw-ni", 7, limit + 1) > overLimit)) continue;
      nwSingles.push({ sku, name: row[1], price, shelf, limit, saving: shelf - price });
    }
    nwSingles.sort((a, b) => a.limit - b.limit || a.price - b.price || a.sku.localeCompare(b.sku));
    const nwSingle = nwSingles[0] || null;
    const uniformShelf = (group) =>
      group.products.length > 0 &&
      group.products.every((product) => product.shelf === group.products[0].shelf);
    const pool = pnsGroups
      .filter(
        (group) =>
          !group.isClub && group.limit === 0 && group.qty >= 2 && group.qty <= 3 && group.products.length >= 2
      )
      .filter((group) => uniformShelf(group) && group.products[0].shelf * group.qty > group.price)
      .sort((a, b) => a.qty - b.qty || a.groupId.localeCompare(b.groupId))[0];
    if (pool) pool.products = pool.products.slice(0, 2);
    const limited = nwGroups
      .filter(
        (group) =>
          group.isClub && group.qty === 1 && group.limit > 0 && group.limit < 6 && group.products.length >= 3
      )
      .filter((group) => uniformShelf(group) && group.price < group.products[0].shelf)
      .sort((a, b) => a.limit - b.limit || a.groupId.localeCompare(b.groupId))[0];
    if (limited) limited.products = limited.products.slice(0, 3);
    const byName = (a, b) => a.name.localeCompare(b.name);
    return {
      multi: multi.sort(byName),
      club: club.sort(byName),
      pool,
      limited,
      single,
      pnsPair,
      nwSingle,
    };
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForCurrentBuild(page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await page.waitForFunction(
        () => window.TROLLEYBIRD_BUILD === "halal-category-2026-11-26",
        null,
        { timeout: 5000 }
      );
      return;
    } catch {
      await page.reload({ waitUntil: "domcontentloaded" });
    }
  }
  throw new Error("the deployed app is still serving the previous build");
}

async function cardText(page, sku) {
  return normalize(
    await page.locator(`#product-grid li.product:has([data-product="${sku}"])`).innerText()
  );
}

async function searchProduct(page, { name, sku }) {
  await page.fill("#search", name);
  await page.waitForSelector(`#product-grid [data-add="${sku}"]`, { timeout: 20000 });
  return cardText(page, sku);
}

async function decodeRenderedBarcode(page, selector) {
  const svg = page.locator(selector);
  await svg.waitFor({ state: "visible", timeout: 5000 });
  const png = await svg.screenshot({ scale: "device" });
  return page.evaluate(async (base64) => {
    if (!window.ZXing) throw new Error("ZXing decoder is not loaded");
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    const reader = new ZXing.BrowserMultiFormatReader();
    const result = await reader.decodeFromImageElement(image);
    return {
      text: result.getText(),
      ean13: result.getBarcodeFormat() === ZXing.BarcodeFormat.EAN_13,
      ean8: result.getBarcodeFormat() === ZXing.BarcodeFormat.EAN_8,
    };
  }, png.toString("base64"));
}

async function addToList(page, sku, expectedCount) {
  await page.locator(`#product-grid [data-add="${sku}"]`).click();
  await page.waitForFunction(
    (count) => document.querySelectorAll("#list-items .list-item").length === count,
    expectedCount,
    { timeout: 5000 }
  );
}

async function addStore(page, { query, brand, branch }, expectedCount) {
  await page.fill("#store-search", query);
  const result = page
    .locator("#store-results [data-add-store]")
    .filter({ hasText: brand })
    .filter({ hasText: branch })
    .first();
  await result.waitFor({ state: "visible", timeout: 5000 });
  await result.click();
  await page.waitForFunction(
    ({ branch, count }) => {
      const rows = [...document.querySelectorAll("#store-list .store-selected")];
      return (
        rows.length === count &&
        rows.some(
          (row) => row.textContent.includes(branch) && row.dataset.priceStatus === "ready"
        )
      );
    },
    { branch, count: expectedCount },
    { timeout: 10000 }
  );
  await page.fill("#store-search", "");
}

async function removeStore(page, row) {
  const count = await page.locator("#store-list .store-selected").count();
  await row.locator("[data-store-menu]").click();
  await row.locator("[data-remove-store]").click();
  await page.waitForFunction(
    (n) => document.querySelectorAll("#store-list .store-selected").length < n,
    count,
    { timeout: 5000 }
  );
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    locale: "en-NZ",
  });

  // Always start from a clean demo state rather than a previous browser state.
  await context.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* storage can be unavailable */
    }
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    step(`opening ${TARGET}`);
    await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 30000 });
    step("waiting for the deployed basket-pricing build");
    await waitForCurrentBuild(page);
    step("waiting for the splash screen to finish");
    await page.waitForSelector("#splash", { state: "detached", timeout: 5000 });
    await page.waitForFunction(
      () => Array.isArray(window.GROCER_CATALOGUE?.items) && window.GROCER_CATALOGUE.items.length > 0,
      { timeout: 20000 }
    );
    step("waiting for lazy branch coverage data");
    await page.waitForFunction(() => Boolean(window.GROCER_COVERAGE), { timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelectorAll("#product-grid li.product").length >= 50,
      { timeout: 10000 }
    );

    step("checking product pictures");
    await page.waitForFunction(
      () => {
        const image = document.querySelector("#product-grid .product__thumb");
        return Boolean(image && image.complete && image.naturalWidth > 0);
      },
      null,
      { timeout: 15000 }
    );
    const pictureCount = await page.locator("#product-grid .product__thumb").count();
    assert(pictureCount > 0, "product cards have no pictures");

    step("checking the last price-check time");
    const importBanner = normalize(await page.locator("#import-banner").innerText());
    assert(
      importBanner.includes("Last successful price check:") &&
        /\d{1,2}:\d{2}\s*(am|pm)/i.test(importBanner),
      `import banner has no price-check time: ${importBanner}`
    );

    step("checking the price-coverage summary");
    const coverageLine = normalize(await page.locator("#coverage-line").innerText());
    assert(
      coverageLine.includes("at both stores") &&
        coverageLine.includes("at one store") &&
        coverageLine.includes("at neither"),
      `price-coverage summary missing: ${coverageLine}`
    );

    step("checking phone-width tabs");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".app-tabs")).display !== "none"
    );
    const tabPosition = await page.locator(".app-tabs").evaluate((bar) => {
      const rect = bar.getBoundingClientRect();
      return {
        bottom: Math.round(rect.bottom),
        viewport: window.innerHeight,
        position: getComputedStyle(bar).position,
      };
    });
    assert(
      tabPosition.position === "fixed" && Math.abs(tabPosition.bottom - tabPosition.viewport) <= 1,
      `phone tabs should be fixed to the bottom of the viewport: ${JSON.stringify(tabPosition)}`
    );
    const mobilePanels = async () => ({
      stores: await page.locator("#panel-stores").isVisible(),
      catalog: await page.locator("#panel-catalog").isVisible(),
      list: await page.locator("#panel-list").isVisible(),
    });
    let visiblePanels = await mobilePanels();
    assert(
      visiblePanels.stores && !visiblePanels.catalog && !visiblePanels.list,
      `phone tabs should open on Stores when no stores are selected: ${JSON.stringify(visiblePanels)}`
    );
    assert(
      normalize(await page.locator(".app-tab.is-active").innerText()) === "Stores",
      "phone tabs should mark Stores as active"
    );
    await page.locator('[data-tab="catalog"]').click();
    visiblePanels = await mobilePanels();
    assert(
      !visiblePanels.stores && visiblePanels.catalog && !visiblePanels.list,
      `phone Shop tab should show only the catalogue: ${JSON.stringify(visiblePanels)}`
    );
    await page.locator('[data-tab="list"]').click();
    visiblePanels = await mobilePanels();
    assert(
      !visiblePanels.stores && !visiblePanels.catalog && visiblePanels.list,
      `phone List tab should show only the shopping list: ${JSON.stringify(visiblePanels)}`
    );
    const mobileWidth = await page.evaluate(() => ({
      viewport: window.innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    assert(
      mobileWidth.content <= mobileWidth.viewport,
      `phone layout overflows horizontally: ${mobileWidth.content}px of content in ${mobileWidth.viewport}px`
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".app-tabs")).display === "none"
    );
    visiblePanels = await mobilePanels();
    assert(
      visiblePanels.stores && visiblePanels.catalog && visiblePanels.list,
      `desktop layout should show all three panels: ${JSON.stringify(visiblePanels)}`
    );

    step("loading the demo's barcode decoder");
    await page.addScriptTag({ url: new URL("vendor/zxing.min.js", TARGET).href });

    step(`demo staple shows its real EAN-8 barcode: ${DEMO_STAPLE.name}`);
    await page.waitForSelector(`#product-grid [data-product="${DEMO_STAPLE.id}"]`, {
      timeout: 5000,
    });
    await page.locator(`#product-grid [data-product="${DEMO_STAPLE.id}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    step("waiting for lazy barcode data");
    await page.waitForFunction(() => Boolean(window.GROCER_GTINS), { timeout: 20000 });
    await page.waitForSelector("#product-dialog .barcode-card", { timeout: 5000 });
    const stapleBarcodes = await page.locator("#product-dialog .barcode-card").count();
    assert(
      stapleBarcodes === 1,
      `demo staple should show its one real barcode, saw ${stapleBarcodes}`
    );
    const stapleCode = await page
      .locator("#product-dialog [data-copy-barcode]")
      .getAttribute("data-copy-barcode");
    assert(
      stapleCode === DEMO_STAPLE.gtin,
      `demo staple barcode is ${stapleCode}, expected ${DEMO_STAPLE.gtin}`
    );
    const stapleKind = normalize(await page.locator("#product-dialog .barcode-card__title").innerText());
    assert(stapleKind.includes("EAN-8"), `demo staple should be labelled EAN-8: ${stapleKind}`);
    const stapleDecoded = await decodeRenderedBarcode(page, "#product-dialog .barcode-card__svg");
    assert(
      stapleDecoded.ean8 && stapleDecoded.text === DEMO_STAPLE.gtin,
      `demo staple barcode decoded as ${stapleDecoded.text} (${stapleKind})`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);

    step(`rendering real GTIN: ${REAL_GTIN}`);
    await page.evaluate((code) => {
      const mount = document.createElement("div");
      mount.id = "smoke-barcode";
      mount.style.cssText =
        "position:fixed;left:0;top:0;width:234px;height:144px;background:#fff;z-index:99999";
      mount.innerHTML = barcodeSvg(code);
      document.body.append(mount);
    }, REAL_GTIN);
    const barcodeLabel = await page.locator("#smoke-barcode svg").getAttribute("aria-label");
    assert(barcodeLabel?.includes(REAL_GTIN), `barcode image label does not name ${REAL_GTIN}: ${barcodeLabel}`);

    const decoded = await decodeRenderedBarcode(page, "#smoke-barcode svg");
    assert(decoded.ean13, `rendered barcode is not an EAN-13 image: ${decoded.text}`);
    assert(
      decoded.text === REAL_GTIN,
      `rendered barcode decoded as ${decoded.text}, expected ${REAL_GTIN}`
    );
    await page.evaluate(() => document.querySelector("#smoke-barcode")?.remove());

    step("checking the merged catalogue");
    const resultsLine = normalize(await page.locator("#results-line").innerText());
    assert(
      /^\d[\d,]* products · showing \d/.test(resultsLine),
      `merged catalogue not listed: ${resultsLine}`
    );
    assert(
      (await page.locator("[data-mode]").count()) === 0,
      "catalogue mode toggle should be removed"
    );

    step("checking did-you-mean search");
    await page.fill("#search", "milkk");
    await page.waitForSelector("#search-suggestion:not([hidden])", { timeout: 10000 });
    const suggestion = normalize(await page.locator("#search-suggestion").innerText());
    assert(suggestion.includes("milk"), `did-you-mean should suggest milk: ${suggestion}`);
    assert(
      (await page.locator("#product-grid li.product").count()) > 0,
      "typo-tolerant search should show the suggested products"
    );
    await page.locator("#search-suggestion-button").click();
    await page.waitForSelector('#product-grid [data-product="milk-2l"]', { timeout: 10000 });
    await page.fill("#search", "");

    step(`catalogue product shows its real barcode: ${CATALOGUE_GTIN.name}`);
    await searchProduct(page, { name: CATALOGUE_GTIN.search, sku: CATALOGUE_GTIN.sku });
    await page.locator(`#product-grid [data-product="${CATALOGUE_GTIN.sku}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const vBarcodes = await page.locator("#product-dialog .barcode-card").count();
    assert(vBarcodes === 1, `V can should show its one barcode, saw ${vBarcodes}`);
    const vCode = await page
      .locator("#product-dialog [data-copy-barcode]")
      .getAttribute("data-copy-barcode");
    assert(vCode === CATALOGUE_GTIN.gtin, `V can barcode is ${vCode}, expected ${CATALOGUE_GTIN.gtin}`);
    const vKind = normalize(await page.locator("#product-dialog .barcode-card__title").innerText());
    assert(vKind.includes("EAN-8"), `V can should be labelled EAN-8: ${vKind}`);
    const vDecoded = await decodeRenderedBarcode(page, "#product-dialog .barcode-card__svg");
    assert(
      vDecoded.ean8 && vDecoded.text === CATALOGUE_GTIN.gtin,
      `V can barcode decoded as ${vDecoded.text} (${vKind})`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);

    step(`backfilled UPC barcode: ${BACKFILLED_GTIN.name}`);
    await searchProduct(page, { name: BACKFILLED_GTIN.search, sku: BACKFILLED_GTIN.sku });
    await page.locator(`#product-grid [data-product="${BACKFILLED_GTIN.sku}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const backfilledBarcodes = await page.locator("#product-dialog .barcode-card").count();
    assert(
      backfilledBarcodes === 1,
      `backfilled pack should show one barcode card, saw ${backfilledBarcodes}`
    );
    const backfilledCode = await page
      .locator("#product-dialog [data-copy-barcode]")
      .getAttribute("data-copy-barcode");
    assert(
      backfilledCode === BACKFILLED_GTIN.gtin,
      `backfilled pack barcode is ${backfilledCode}, expected ${BACKFILLED_GTIN.gtin}`
    );
    const backfilledDecoded = await decodeRenderedBarcode(page, "#product-dialog .barcode-card__svg");
    // ZXing reports a leading-zero EAN-13 in its UPC-A form, so compare digits.
    const bareDigits = (value) => String(value).replace(/^0+(?=\d)/, "");
    assert(
      bareDigits(backfilledDecoded.text) === bareDigits(BACKFILLED_GTIN.gtin),
      `backfilled pack barcode decoded as ${backfilledDecoded.text}`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);
    await page.fill("#search", "");

    step(`disambiguated bakery barcode: ${DISAMBIGUATED_GTIN.name}`);
    await searchProduct(page, { name: DISAMBIGUATED_GTIN.search, sku: DISAMBIGUATED_GTIN.sku });
    await page.locator(`#product-grid [data-product="${DISAMBIGUATED_GTIN.sku}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const bakeryCode = await page
      .locator("#product-dialog [data-copy-barcode]")
      .getAttribute("data-copy-barcode");
    assert(
      bakeryCode === DISAMBIGUATED_GTIN.gtin,
      `bakery pack barcode is ${bakeryCode}, expected ${DISAMBIGUATED_GTIN.gtin}`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);
    await page.fill("#search", "");

    step("adding branches through the store search");
    await page.fill("#store-search", "paknsave");
    await page.waitForSelector("#store-results [data-add-store]");
    const pnsMatches = await page.locator("#store-results [data-add-store]").count();
    assert(pnsMatches >= 2, `store search should offer multiple PAK'nSAVE branches, saw ${pnsMatches}`);
    await page.fill("#store-search", "");

    await addStore(page, { query: "Mt Albert", brand: "Pak'nSave", branch: "Mt Albert" }, 1);
    await addStore(page, { query: "Albany", brand: "Pak'nSave", branch: "Albany" }, 2);
    await addStore(page, { query: "Point Chevalier", brand: "New World", branch: "Point Chevalier" }, 3);
    assert(
      normalize(await page.locator("#store-counter").innerText()) === "3 / 6",
      "store counter should show 3 / 6 after adding a second PAK'nSAVE branch"
    );

    const albanyRow = page.locator("#store-list .store-selected").filter({ hasText: "Albany" }).first();
    await removeStore(page, albanyRow);
    await page.waitForFunction(
      () => document.querySelectorAll("#store-list .store-selected").length === 2,
      null,
      { timeout: 5000 }
    );
    assert(
      normalize(await page.locator("#store-counter").innerText()) === "2 / 6",
      "store counter should return to 2 / 6 after removing Albany"
    );
    const selectedStores = normalize(await page.locator("#store-list").innerText());
    assert(
      selectedStores.includes("Mt Albert") && selectedStores.includes("Point Chevalier"),
      `selected stores missing after search: ${selectedStores}`
    );

    step("checking unit prices and cheapest-first sorting");
    await page.selectOption("#product-sort", "unit");
    await page.waitForFunction(
      () => Boolean(document.querySelector("#product-grid .product__unit")),
      null,
      { timeout: 10000 }
    );
    const firstUnit = normalize(await page.locator("#product-grid .product__unit").first().innerText());
    assert(firstUnit.includes("/"), `unit-price sorting should show a per-unit price: ${firstUnit}`);
    await page.selectOption("#product-sort", "price");
    const sortedPrices = await page.locator("#product-grid .product__best b").evaluateAll((nodes) =>
      nodes
        .slice(0, 12)
        .map((node) => {
          const match = node.textContent.match(/\$([\d.]+)/);
          return match ? Number(match[1]) : null;
        })
        .filter((price) => price != null)
    );
    assert(
      sortedPrices.length > 1 && sortedPrices.every((price, index) => index === 0 || price >= sortedPrices[index - 1]),
      `price sorting is not cheapest-first: ${sortedPrices.join(", ")}`
    );
    await page.selectOption("#product-sort", "relevance");

    step("checking every branch price has the same Auckland import date");
    await page.fill("#search", "Anchor Blue Milk");
    await page.waitForSelector('#product-grid [data-product="milk-2l"]', { timeout: 20000 });
    await page.locator('#product-grid [data-product="milk-2l"]').click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const storePriceRows = page.locator("#product-dialog table tbody tr");
    const storePriceRowCount = await storePriceRows.count();
    assert(
      storePriceRowCount >= 2,
      `expected at least two branch price rows, saw ${storePriceRowCount}`
    );
    const expectedImportDates = await page.evaluate(() => {
      const fetchedAt = window.GROCER_CATALOGUE?.fetchedAt;
      if (!fetchedAt) throw new Error("the catalogue has no fetchedAt date");
      const date = /^\d{4}-\d{2}-\d{2}$/.test(fetchedAt)
        ? new Date(`${fetchedAt}T00:00:00Z`)
        : new Date(fetchedAt);
      const format = (withYear) =>
        new Intl.DateTimeFormat("en-NZ", {
          day: "numeric",
          month: "short",
          ...(withYear ? { year: "numeric" } : {}),
          timeZone: "Pacific/Auckland",
        }).format(date);
      return { short: format(false), long: format(true) };
    });
    const importBannerDateText = normalize(await page.locator("#import-banner").innerText());
    assert(
      importBannerDateText.includes(`Import dated ${expectedImportDates.long}`),
      `import banner is not dated ${expectedImportDates.long} in Auckland: ${importBannerDateText}`
    );
    step("checking the visible shelf-price date");
    const freshnessText = normalize(await page.locator("#price-freshness").innerText());
    assert(
      freshnessText.includes(`Shelf prices ${expectedImportDates.short}`),
      `top-bar shelf-price date is not ${expectedImportDates.short}: ${freshnessText}`
    );
    const storePriceNotes = await storePriceRows.evaluateAll((rows) =>
      rows.map((row) => row.innerText.replace(/\s+/g, " ").trim())
    );
    for (const note of storePriceNotes) {
      assert(
        note.includes(`imported ${expectedImportDates.short}`),
        `branch price is not dated ${expectedImportDates.short} in Auckland: ${note}`
      );
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);
    await page.fill("#search", "");

    step("choosing current deals from the live catalogue");
    const deals = await currentDeals(page);
    assert(deals.multi.length > 0, "no current PAK'nSAVE multi-buy deal found in the catalogue");
    assert(deals.club.length > 0, "no current New World club deal found in the catalogue");
    assert(deals.pool, "no current assorted PAK'nSAVE multi-buy group found in the catalogue");
    assert(
      deals.limited,
      "no current New World club group with a shared limit found in the catalogue"
    );
    assert(
      deals.single,
      "no current PAK'nSAVE mix & match single-item special with a limit found in the catalogue"
    );
    assert(
      deals.pnsPair,
      "no current PAK'nSAVE mix & match promotion shared by two products found in the catalogue"
    );
    assert(
      deals.nwSingle,
      "no current New World mix & match single-item special with a limit found in the catalogue"
    );
    const multiDeal = deals.multi[0];
    const clubDeal = deals.club[0];
    const poolGroup = deals.pool;
    const limitedGroup = deals.limited;
    const singleDeal = deals.single;
    const pairDeal = deals.pnsPair;
    const nwSingleDeal = deals.nwSingle;
    const limitedLabel = limitedGroup.products.every(
      (product) => product.brand === limitedGroup.products[0].brand
    )
      ? limitedGroup.products[0].brand
      : limitedGroup.products[0].name;
    console.log(
      `[smoke] current multi-buy: ${multiDeal.name} (${multiDeal.qty} for ${money(multiDeal.price)})`
    );
    console.log(`[smoke] current club deal: ${clubDeal.name} (${money(clubDeal.price)} with club card)`);
    console.log(
      `[smoke] current assorted group: ${poolGroup.products
        .map((product) => product.name)
        .join(" + ")} (${poolGroup.qty} for ${money(poolGroup.price)})`
    );
    console.log(
      `[smoke] current shared limit: ${limitedLabel} (${limitedGroup.limit} units at ${money(
        limitedGroup.price
      )})`
    );
    console.log(
      `[smoke] current single-item special: ${singleDeal.name} (${money(
        singleDeal.price
      )}, limit ${singleDeal.limit}, shelf ${money(singleDeal.shelf)})`
    );
    console.log(
      `[smoke] current shared mix & match limit: ${pairDeal.products
        .map((product) => product.name)
        .join(" + ")} (${pairDeal.limit} units at ${money(pairDeal.price)})`
    );
    console.log(
      `[smoke] current New World single-item special: ${nwSingleDeal.name} (${money(
        nwSingleDeal.price
      )}, limit ${nwSingleDeal.limit}, shelf ${money(nwSingleDeal.shelf)})`
    );

    step("checking multi-buy and club-card shelf tags");
    const multiCard = await searchProduct(page, { name: multiDeal.name, sku: multiDeal.sku });
    assert(
      multiCard.includes("Multi-buy"),
      `PAK'nSAVE multi-buy badge missing: ${multiCard}`
    );
    const multiTerm = `Multi-buy ${multiDeal.qty} for ${money(multiDeal.price)}`;
    await page.locator(`#product-grid [data-product="${multiDeal.sku}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const multiDialog = normalize(await page.locator("#product-dialog").innerText());
    assert(
      multiDialog.includes(multiTerm) && multiDialog.includes("each"),
      `multi-buy terms missing from the price dialog: ${multiDialog}`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);

    await searchProduct(page, { name: clubDeal.name, sku: clubDeal.sku });
    await page.locator(`#product-grid [data-product="${clubDeal.sku}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const clubDialog = normalize(await page.locator("#product-dialog").innerText());
    assert(
      clubDialog.includes("Club member") && clubDialog.includes("with club card"),
      `club-card price missing from the price dialog: ${clubDialog}`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);

    step("checking quantity-aware multi-buy basket totals");
    await searchProduct(page, { name: multiDeal.name, sku: multiDeal.sku });
    await addToList(page, multiDeal.sku, 1);
    const multiRow = page.locator(`#list-items [data-row="${multiDeal.sku}"]`);
    for (let units = 1; units < multiDeal.qty; units += 1) {
      await multiRow.locator('[data-step="1"]').click();
    }
    await page.waitForFunction(
      ({ sku, qty }) =>
        document.querySelector(`#list-items [data-row="${sku}"] output`)?.textContent ===
        String(qty),
      { sku: multiDeal.sku, qty: multiDeal.qty },
      { timeout: 5000 }
    );
    const multiTotals = normalize(await page.locator("#totals").innerText());
    const multiTotal = money(multiDeal.price);
    const multiOther = money(multiDeal.nw * multiDeal.qty);
    const multiSaving = money(multiDeal.pns * multiDeal.qty - multiDeal.price);
    assert(multiTotals.includes(multiTotal), `multi-buy total for PAK'nSAVE missing: ${multiTotals}`);
    assert(multiTotals.includes(multiOther), `multi-buy comparison total missing: ${multiTotals}`);
    assert(
      new RegExp(`saves ${escapeRegExp(multiSaving)}`, "i").test(multiTotals),
      `multi-buy savings missing: ${multiTotals}`
    );
    const multiListText = normalize(await page.locator("#list-items").innerText());
    assert(
      multiListText.includes(`Multi-buy ${multiDeal.qty} for ${multiTotal} applied`),
      `quantity-aware deal not shown in the list: ${multiListText}`
    );

    await page.click("#clear-list");
    await page.waitForFunction(
      () => document.querySelectorAll("#list-items .list-item").length === 0,
      null,
      { timeout: 5000 }
    );

    step("checking the club-card toggle and basket pricing");
    await searchProduct(page, { name: clubDeal.name, sku: clubDeal.sku });
    await addToList(page, clubDeal.sku, 1);
    const clubPrice = money(clubDeal.price);
    const clubSaving = money(clubDeal.nw - clubDeal.price);
    const clubOffTotal = money(Math.min(clubDeal.pns, clubDeal.nw));
    let clubTotals = normalize(await page.locator("#totals").innerText());
    assert(
      clubTotals.includes(clubOffTotal),
      `club price applied while toggle was off: ${clubTotals}`
    );
    assert(
      clubTotals.includes("Club card is off"),
      `club-card-off note missing from totals: ${clubTotals}`
    );
    await page.locator("label.club-toggle").click();
    await page.waitForFunction(() => document.querySelector("#club-toggle")?.checked, null, {
      timeout: 5000,
    });
    await page.waitForFunction(
      (expected) => document.querySelector("#totals")?.textContent.includes(expected),
      clubPrice,
      { timeout: 5000 }
    );
    clubTotals = normalize(await page.locator("#totals").innerText());
    assert(clubTotals.includes(clubPrice), `club-card total not applied: ${clubTotals}`);
    assert(
      clubTotals.includes(money(clubDeal.pns)),
      `shelf comparison missing: ${clubTotals}`
    );
    assert(clubTotals.includes("Club-card prices applied."), `club-card-on note missing: ${clubTotals}`);
    assert(
      new RegExp(`saves ${escapeRegExp(clubSaving)}`, "i").test(clubTotals),
      `club-card savings missing: ${clubTotals}`
    );

    await page.click("#receipt-button");
    await page.waitForSelector("#receipt-dialog[open]", { timeout: 5000 });
    const dealReceipt = normalize(await page.locator("#receipt-body").innerText());
    assert(
      dealReceipt.includes(`Club member ${clubPrice}`),
      `receipt is missing the club deal: ${dealReceipt}`
    );
    assert(dealReceipt.includes(clubPrice), `receipt total is not club-priced: ${dealReceipt}`);
    assert(
      dealReceipt.includes(`deals save ${clubSaving}`),
      `receipt is missing deal savings: ${dealReceipt}`
    );
    const expectedReceiptDate = await page.evaluate(() =>
      new Intl.DateTimeFormat("en-NZ", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Pacific/Auckland",
      }).format(new Date())
    );
    assert(
      dealReceipt.includes(`${expectedReceiptDate} · Interactive demo`),
      `receipt is not dated ${expectedReceiptDate} in Auckland: ${dealReceipt}`
    );
    assert(
      dealReceipt.includes(`Imported shelf prices dated ${expectedImportDates.long}`),
      `receipt import date is not ${expectedImportDates.long} in Auckland: ${dealReceipt}`
    );
    await page.click("[data-close-receipt]");
    await page.waitForFunction(() => !document.querySelector("#receipt-dialog")?.open);

    await page.locator("label.club-toggle").click();
    await page.waitForFunction(() => !document.querySelector("#club-toggle")?.checked, null, {
      timeout: 5000,
    });
    await page.click("#clear-list");
    await page.waitForFunction(
      () => document.querySelectorAll("#list-items .list-item").length === 0,
      null,
      { timeout: 5000 }
    );

    step("checking an assorted multi-buy shared across different products");
    const [poolA, poolB] = poolGroup.products;
    await searchProduct(page, { name: poolA.name, sku: poolA.sku });
    await addToList(page, poolA.sku, 1);
    await searchProduct(page, { name: poolB.name, sku: poolB.sku });
    await addToList(page, poolB.sku, 2);
    const poolBRow = page.locator(`#list-items [data-row="${poolB.sku}"]`);
    for (let units = 1; units < poolGroup.qty - 1; units += 1) {
      await poolBRow.locator('[data-step="1"]').click();
    }
    await page.waitForFunction(
      ({ sku, qty }) =>
        document.querySelector(`#list-items [data-row="${sku}"] output`)?.textContent ===
        String(qty),
      { sku: poolB.sku, qty: poolGroup.qty - 1 },
      { timeout: 5000 }
    );
    const pooledTotals = normalize(await page.locator("#totals").innerText());
    const poolTerm = `Multi-buy ${poolGroup.qty} for ${money(poolGroup.price)}`;
    const poolSaving = money(poolGroup.products[0].shelf * poolGroup.qty - poolGroup.price);
    assert(
      pooledTotals.includes(money(poolGroup.price)),
      `assorted multi-buy did not pool across products: ${pooledTotals}`
    );
    assert(
      new RegExp(`saves ${escapeRegExp(poolSaving)}`, "i").test(pooledTotals),
      `assorted multi-buy savings missing: ${pooledTotals}`
    );
    assert(
      /assorted multi-buy at/i.test(pooledTotals) &&
        new RegExp(escapeRegExp(poolA.name), "i").test(pooledTotals) &&
        new RegExp(escapeRegExp(poolB.name), "i").test(pooledTotals),
      `assorted group did not name the products that formed it: ${pooledTotals}`
    );
    assert(
      /no shared limit/i.test(pooledTotals),
      `assorted group did not report its shared limit: ${pooledTotals}`
    );
    const pooledList = normalize(await page.locator("#list-items").innerText());
    assert(
      (pooledList.match(new RegExp(`${escapeRegExp(poolTerm)} applied`, "g")) || []).length === 2,
      `assorted multi-buy was not applied to both products: ${pooledList}`
    );
    await page.click("#clear-list");
    await page.waitForFunction(
      () => document.querySelectorAll("#list-items .list-item").length === 0,
      null,
      { timeout: 5000 }
    );

    step("checking that an assorted promotion has one shared limit");
    await page.locator("label.club-toggle").click();
    await page.waitForFunction(() => document.querySelector("#club-toggle")?.checked, null, {
      timeout: 5000,
    });
    for (let index = 0; index < limitedGroup.products.length; index += 1) {
      const product = limitedGroup.products[index];
      await searchProduct(page, { name: product.name, sku: product.sku });
      await addToList(page, product.sku, index + 1);
      const row = page.locator(`#list-items [data-row="${product.sku}"]`);
      await row.locator('[data-step="1"]').click();
      await page.waitForFunction(
        (expectedSku) =>
          document.querySelector(`#list-items [data-row="${expectedSku}"] output`)?.textContent ===
          "2",
        product.sku,
        { timeout: 5000 }
      );
    }
    const limitedUnits = limitedGroup.products.length * 2;
    const limitedExtra = limitedUnits - limitedGroup.limit;
    const limitedTotal = money(
      limitedGroup.limit * limitedGroup.price +
        limitedExtra * limitedGroup.products[0].shelf
    );
    const limitedSaving = money(
      limitedGroup.limit * (limitedGroup.products[0].shelf - limitedGroup.price)
    );
    const limitedTotals = normalize(await page.locator("#totals").innerText());
    assert(
      limitedTotals.includes(limitedTotal),
      `assorted promotion did not enforce its shared limit: ${limitedTotals}`
    );
    assert(
      new RegExp(`saves ${escapeRegExp(limitedSaving)}`, "i").test(limitedTotals),
      `shared-limit savings missing: ${limitedTotals}`
    );
    assert(
      new RegExp(escapeRegExp(limitedLabel), "i").test(limitedTotals),
      `assorted group did not name the products that formed it: ${limitedTotals}`
    );
    assert(
      new RegExp(`${limitedGroup.limit} of ${limitedGroup.limit} shared units used`, "i").test(
        limitedTotals
      ) &&
        new RegExp(`${limitedExtra} units? at shelf price`, "i").test(limitedTotals),
      `assorted group did not report its shared limit: ${limitedTotals}`
    );
    await page.click("#receipt-button");
    await page.waitForFunction(() => document.querySelector("#receipt-dialog")?.open, null, {
      timeout: 5000,
    });
    const limitedReceipt = normalize(await page.locator("#receipt-body").innerText());
    assert(
      new RegExp(`${limitedGroup.limit} of ${limitedGroup.limit} shared units used`, "i").test(
        limitedReceipt
      ) && new RegExp(escapeRegExp(limitedLabel), "i").test(limitedReceipt),
      `receipt did not show the assorted group and its shared limit: ${limitedReceipt}`
    );
    await page.click("[data-close-receipt]");
    await page.waitForFunction(() => !document.querySelector("#receipt-dialog")?.open);
    await page.click("#clear-list");
    await page.waitForFunction(
      () => document.querySelectorAll("#list-items .list-item").length === 0,
      null,
      { timeout: 5000 }
    );
    await page.locator("label.club-toggle").click();
    await page.waitForFunction(() => !document.querySelector("#club-toggle")?.checked, null, {
      timeout: 5000,
    });

    step(`checking a limited PAK'nSAVE mix & match single-item special: ${singleDeal.name}`);
    const specialPrice = money(singleDeal.price);
    const specialSaving = money(singleDeal.saving * singleDeal.limit);
    const specialCard = await searchProduct(page, { name: singleDeal.name, sku: singleDeal.sku });
    assert(
      specialCard.includes(`Special ${specialPrice}`),
      `single-item special price missing from the card: ${specialCard}`
    );
    assert(
      specialCard.includes(`limit ${singleDeal.limit}`),
      `single-item special limit missing from the card: ${specialCard}`
    );
    await page.locator(`#product-grid [data-product="${singleDeal.sku}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const specialDialog = normalize(await page.locator("#product-dialog").innerText());
    assert(
      specialDialog.includes(`Special ${specialPrice}`) &&
        new RegExp(`limit ${singleDeal.limit}\\b`, "i").test(specialDialog),
      `single-item special terms missing from the price dialog: ${specialDialog}`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);

    await addToList(page, singleDeal.sku, 1);
    const specialRow = page.locator(`#list-items [data-row="${singleDeal.sku}"]`);
    for (let units = 1; units < singleDeal.limit; units += 1) {
      await specialRow.locator('[data-step="1"]').click();
    }
    await page.waitForFunction(
      ({ sku, qty }) =>
        document.querySelector(`#list-items [data-row="${sku}"] output`)?.textContent ===
        String(qty),
      { sku: singleDeal.sku, qty: singleDeal.limit },
      { timeout: 5000 }
    );
    const atLimitTotal = money(singleDeal.price * singleDeal.limit);
    const mtAlbertRow = page.locator("#totals .total-row").filter({ hasText: "Mt Albert" }).first();
    let mtAlbertText = normalize(await mtAlbertRow.innerText());
    assert(
      mtAlbertText.includes(atLimitTotal),
      `single-item special was not applied to all ${singleDeal.limit} units: ${mtAlbertText}`
    );
    const specialTotals = normalize(await page.locator("#totals").innerText());
    assert(
      /mix & match special at/i.test(specialTotals) &&
        new RegExp(escapeRegExp(singleDeal.name), "i").test(specialTotals),
      `PAK'nSAVE single-item special was not grouped as a mix & match special: ${specialTotals}`
    );
    assert(
      !/assorted multi-buy/i.test(specialTotals),
      `PAK'nSAVE single-item special was presented as an assorted multi-buy: ${specialTotals}`
    );
    assert(
      new RegExp(
        `${singleDeal.limit} of ${singleDeal.limit} shared units used`,
        "i"
      ).test(specialTotals),
      `PAK'nSAVE mix & match special did not report its shared limit: ${specialTotals}`
    );
    const specialList = normalize(
      await page.locator(`#list-items [data-row="${singleDeal.sku}"]`).innerText()
    );
    assert(
      specialList.includes(`Special ${specialPrice} applied`) &&
        specialList.includes(`limit ${singleDeal.limit}`) &&
        new RegExp(`save ${escapeRegExp(specialSaving)}`, "i").test(specialList),
      `single-item special note missing from the list: ${specialList}`
    );

    await specialRow.locator('[data-step="1"]').click();
    await page.waitForFunction(
      ({ sku, qty }) =>
        document.querySelector(`#list-items [data-row="${sku}"] output`)?.textContent ===
        String(qty),
      { sku: singleDeal.sku, qty: singleDeal.limit + 1 },
      { timeout: 5000 }
    );
    const overLimitTotal = money(
      singleDeal.price * singleDeal.limit + singleDeal.shelf
    );
    mtAlbertText = normalize(await mtAlbertRow.innerText());
    assert(
      mtAlbertText.includes(overLimitTotal),
      `the unit beyond the limit was not charged at shelf price: ${mtAlbertText}`
    );

    await page.click("#receipt-button");
    await page.waitForSelector("#receipt-dialog[open]", { timeout: 5000 });
    const specialReceipt = normalize(
      await page
        .locator("#receipt-body .receipt-store")
        .filter({ hasText: "Mt Albert" })
        .first()
        .innerText()
    );
    assert(
      specialReceipt.includes(overLimitTotal) &&
        new RegExp(`Special ${escapeRegExp(specialPrice)}`, "i").test(specialReceipt) &&
        new RegExp(`deals save ${escapeRegExp(specialSaving)}`, "i").test(specialReceipt),
      `receipt did not carry the single-item special and its limit: ${specialReceipt}`
    );
    assert(
      /mix & match special/i.test(specialReceipt) &&
        !/assorted multi-buy/i.test(specialReceipt),
      `PAK'nSAVE receipt labelled the single-item special as an assorted multi-buy: ${specialReceipt}`
    );
    assert(
      new RegExp(
        `${singleDeal.limit} of ${singleDeal.limit} shared units used`,
        "i"
      ).test(specialReceipt) && /1 unit at shelf price/i.test(specialReceipt),
      `PAK'nSAVE receipt did not report the shared limit and the over-limit unit: ${specialReceipt}`
    );
    await page.click("[data-close-receipt]");
    await page.waitForFunction(() => !document.querySelector("#receipt-dialog")?.open);

    await page.click("#clear-list");
    await page.waitForFunction(
      () => document.querySelectorAll("#list-items .list-item").length === 0,
      null,
      { timeout: 5000 }
    );

    step("checking a mix & match limit shared across two PAK'nSAVE products");
    const [pairA, pairB] = pairDeal.products;
    const pairPrice = money(pairDeal.price);
    const pairSaving = money(pairDeal.savings);
    await searchProduct(page, { name: pairA.name, sku: pairA.sku });
    await addToList(page, pairA.sku, 1);
    const pairARow = page.locator(`#list-items [data-row="${pairA.sku}"]`);
    for (let units = 1; units < pairDeal.qtyEach; units += 1) {
      await pairARow.locator('[data-step="1"]').click();
    }
    await page.waitForFunction(
      ({ sku, qty }) =>
        document.querySelector(`#list-items [data-row="${sku}"] output`)?.textContent ===
        String(qty),
      { sku: pairA.sku, qty: pairDeal.qtyEach },
      { timeout: 5000 }
    );
    await searchProduct(page, { name: pairB.name, sku: pairB.sku });
    await addToList(page, pairB.sku, 2);
    const pairBRow = page.locator(`#list-items [data-row="${pairB.sku}"]`);
    for (let units = 1; units < pairDeal.qtyEach; units += 1) {
      await pairBRow.locator('[data-step="1"]').click();
    }
    await page.waitForFunction(
      ({ sku, qty }) =>
        document.querySelector(`#list-items [data-row="${sku}"] output`)?.textContent ===
        String(qty),
      { sku: pairB.sku, qty: pairDeal.qtyEach },
      { timeout: 5000 }
    );

    const pairTotal = money(pairDeal.pooled);
    const pairOther = money(pairDeal.nwTotal);
    const pairTotals = normalize(await page.locator("#totals").innerText());
    const pairMtAlbert = page
      .locator("#totals .total-row")
      .filter({ hasText: "Mt Albert" })
      .first();
    assert(
      (await pairMtAlbert.innerText()).includes(pairTotal),
      `shared mix & match special was not pooled at the limit: ${pairTotals}`
    );
    const pairNewWorld = page
      .locator("#totals .total-row")
      .filter({ hasText: "Point Chevalier" })
      .first();
    assert(
      (await pairNewWorld.innerText()).includes(pairOther),
      `shared mix & match comparison total is wrong: ${pairTotals}`
    );
    assert(
      /mix & match special at/i.test(pairTotals) &&
        new RegExp(escapeRegExp(pairA.name), "i").test(pairTotals) &&
        new RegExp(escapeRegExp(pairB.name), "i").test(pairTotals),
      `shared group did not name both products: ${pairTotals}`
    );
    assert(
      new RegExp(`${pairDeal.limit} of ${pairDeal.limit} shared units used`, "i").test(
        pairTotals
      ) &&
        new RegExp(`${pairDeal.extraUnits} units? at shelf price`, "i").test(pairTotals),
      `shared group did not report its pooled limit: ${pairTotals}`
    );
    assert(
      new RegExp(`saves ${escapeRegExp(pairSaving)}`, "i").test(pairTotals),
      `shared group savings missing: ${pairTotals}`
    );
    assert(
      !/assorted multi-buy/i.test(pairTotals),
      `shared special was presented as an assorted multi-buy: ${pairTotals}`
    );
    const pairList = normalize(await page.locator("#list-items").innerText());
    assert(
      (pairList.match(new RegExp(`Special ${escapeRegExp(pairPrice)} applied`, "g")) || [])
        .length === 2 && new RegExp(`limit ${pairDeal.limit}\\b`, "i").test(pairList),
      `both pooled products should show the special and its limit: ${pairList}`
    );
    for (const product of pairDeal.products) {
      const rowText = normalize(
        await page.locator(`#list-items [data-row="${product.sku}"]`).innerText()
      );
      assert(
        new RegExp(`save ${escapeRegExp(money(product.savings))}`, "i").test(rowText),
        `shared-limit savings split is wrong for ${product.name}: ${rowText}`
      );
      assert(
        rowText.includes(
          `${product.promoUnits} at special price · ${product.shelfUnits} at shelf price`
        ),
        `shared-limit unit split is wrong for ${product.name}: ${rowText}`
      );
    }

    await page.click("#receipt-button");
    await page.waitForSelector("#receipt-dialog[open]", { timeout: 5000 });
    const pairReceipt = normalize(await page.locator("#receipt-body").innerText());
    assert(
      pairReceipt.includes(pairTotal) &&
        new RegExp(`deals save ${escapeRegExp(pairSaving)}`, "i").test(pairReceipt),
      `shared mix & match receipt total or savings missing: ${pairReceipt}`
    );
    assert(
      /mix & match special/i.test(pairReceipt) &&
        !/assorted multi-buy/i.test(pairReceipt) &&
        new RegExp(escapeRegExp(pairA.name), "i").test(pairReceipt) &&
        new RegExp(escapeRegExp(pairB.name), "i").test(pairReceipt),
      `shared group was mislabelled in the receipt: ${pairReceipt}`
    );
    assert(
      new RegExp(`${pairDeal.limit} of ${pairDeal.limit} shared units used`, "i").test(
        pairReceipt
      ) &&
        new RegExp(`${pairDeal.extraUnits} units? at shelf price`, "i").test(pairReceipt),
      `receipt did not report the shared limit and shelf-priced units: ${pairReceipt}`
    );
    for (const product of pairDeal.products) {
      assert(
        pairReceipt.includes(money(product.lineTotal)),
        `receipt line total is wrong for ${product.name}: ${pairReceipt}`
      );
    }
    await page.click("[data-close-receipt]");
    await page.waitForFunction(() => !document.querySelector("#receipt-dialog")?.open);
    await page.click("#clear-list");
    await page.waitForFunction(
      () => document.querySelectorAll("#list-items .list-item").length === 0,
      null,
      { timeout: 5000 }
    );

    step("adding a New World branch for its single-item special");
    await addStore(page, { query: "Ilam", brand: "New World", branch: "Ilam" }, 3);
    assert(
      normalize(await page.locator("#store-counter").innerText()) === "3 / 6",
      "store counter should show 3 / 6 with New World Ilam selected"
    );

    step(`checking a limited New World single-item special: ${nwSingleDeal.name}`);
    const nwSpecialPrice = money(nwSingleDeal.price);
    const nwSpecialSaving = money(nwSingleDeal.saving * nwSingleDeal.limit);
    const nwSpecialCard = await searchProduct(page, {
      name: nwSingleDeal.name,
      sku: nwSingleDeal.sku,
    });
    assert(
      nwSpecialCard.includes(`Special ${nwSpecialPrice}`),
      `New World single-item special price missing from the card: ${nwSpecialCard}`
    );
    assert(
      nwSpecialCard.includes(`limit ${nwSingleDeal.limit}`),
      `New World single-item special limit missing from the card: ${nwSpecialCard}`
    );
    await page.locator(`#product-grid [data-product="${nwSingleDeal.sku}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const nwSpecialDialog = normalize(await page.locator("#product-dialog").innerText());
    assert(
      nwSpecialDialog.includes(`Special ${nwSpecialPrice}`) &&
        new RegExp(`limit ${nwSingleDeal.limit}\\b`, "i").test(nwSpecialDialog),
      `New World single-item special terms missing from the price dialog: ${nwSpecialDialog}`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);

    await addToList(page, nwSingleDeal.sku, 1);
    const nwSpecialRow = page.locator(`#list-items [data-row="${nwSingleDeal.sku}"]`);
    for (let units = 1; units < nwSingleDeal.limit; units += 1) {
      await nwSpecialRow.locator('[data-step="1"]').click();
    }
    await page.waitForFunction(
      ({ sku, qty }) =>
        document.querySelector(`#list-items [data-row="${sku}"] output`)?.textContent ===
        String(qty),
      { sku: nwSingleDeal.sku, qty: nwSingleDeal.limit },
      { timeout: 5000 }
    );
    const nwAtLimitTotal = money(nwSingleDeal.price * nwSingleDeal.limit);
    const ilamRow = page.locator("#totals .total-row").filter({ hasText: "Ilam" }).first();
    let ilamText = normalize(await ilamRow.innerText());
    assert(
      ilamText.includes(nwAtLimitTotal),
      `New World single-item special was not applied to all ${nwSingleDeal.limit} units: ${ilamText}`
    );
    const nwSpecialTotals = normalize(await page.locator("#totals").innerText());
    assert(
      /mix & match special at/i.test(nwSpecialTotals) &&
        new RegExp(escapeRegExp(nwSingleDeal.name), "i").test(nwSpecialTotals),
      `New World single-item special was not grouped as a mix & match special: ${nwSpecialTotals}`
    );
    assert(
      !/assorted multi-buy/i.test(nwSpecialTotals),
      `New World single-item special was presented as an assorted multi-buy: ${nwSpecialTotals}`
    );
    const nwSpecialList = normalize(
      await page.locator(`#list-items [data-row="${nwSingleDeal.sku}"]`).innerText()
    );
    assert(
      nwSpecialList.includes(`Special ${nwSpecialPrice} applied`) &&
        nwSpecialList.includes(`limit ${nwSingleDeal.limit}`) &&
        new RegExp(`save ${escapeRegExp(nwSpecialSaving)}`, "i").test(nwSpecialList),
      `New World single-item special note missing from the list: ${nwSpecialList}`
    );

    await nwSpecialRow.locator('[data-step="1"]').click();
    await page.waitForFunction(
      ({ sku, qty }) =>
        document.querySelector(`#list-items [data-row="${sku}"] output`)?.textContent ===
        String(qty),
      { sku: nwSingleDeal.sku, qty: nwSingleDeal.limit + 1 },
      { timeout: 5000 }
    );
    const nwOverLimitTotal = money(
      nwSingleDeal.price * nwSingleDeal.limit + nwSingleDeal.shelf
    );
    ilamText = normalize(await ilamRow.innerText());
    assert(
      ilamText.includes(nwOverLimitTotal),
      `the New World unit beyond the limit was not charged at shelf price: ${ilamText}`
    );

    await page.click("#receipt-button");
    await page.waitForSelector("#receipt-dialog[open]", { timeout: 5000 });
    const nwSpecialReceipt = normalize(
      await page
        .locator("#receipt-body .receipt-store")
        .filter({ hasText: "Ilam" })
        .first()
        .innerText()
    );
    assert(
      nwSpecialReceipt.includes(nwOverLimitTotal) &&
        new RegExp(`Special ${escapeRegExp(nwSpecialPrice)}`, "i").test(nwSpecialReceipt) &&
        new RegExp(`deals save ${escapeRegExp(nwSpecialSaving)}`, "i").test(nwSpecialReceipt),
      `New World receipt did not carry the single-item special and its limit: ${nwSpecialReceipt}`
    );
    assert(
      /mix & match special/i.test(nwSpecialReceipt) &&
        !/assorted multi-buy/i.test(nwSpecialReceipt),
      `New World receipt labelled the single-item special as an assorted multi-buy: ${nwSpecialReceipt}`
    );
    await page.click("[data-close-receipt]");
    await page.waitForFunction(() => !document.querySelector("#receipt-dialog")?.open);
    await page.click("#clear-list");
    await page.waitForFunction(
      () => document.querySelectorAll("#list-items .list-item").length === 0,
      null,
      { timeout: 5000 }
    );
    const ilamStore = page
      .locator("#store-list .store-selected")
      .filter({ hasText: "Ilam" })
      .first();
    await removeStore(page, ilamStore);
    await page.waitForFunction(
      () => document.querySelectorAll("#store-list .store-selected").length === 2,
      null,
      { timeout: 5000 }
    );
    assert(
      normalize(await page.locator("#store-counter").innerText()) === "2 / 6",
      "store counter should return to 2 / 6 after removing New World Ilam"
    );

    step(`PAK'nSAVE-only product: ${PAK_ONLY.name}`);
    let card = await searchProduct(page, PAK_ONLY);
    assert(card.includes("Not at New World"), `PAK'nSAVE-only card missing stock note: ${card}`);
    assert(card.includes("1 store"), `PAK'nSAVE-only card should price 1 store: ${card}`);

    await page.locator(`#product-grid [data-product="${PAK_ONLY.sku}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const pakDialog = normalize(await page.locator("#product-dialog").innerText());
    assert(
      pakDialog.includes("Not stocked at New World"),
      `PAK'nSAVE-only dialog missing stock note: ${pakDialog}`
    );
    const priceRows = await page.locator("#product-dialog table tbody tr").count();
    assert(priceRows === 1, `PAK'nSAVE-only dialog should show 1 store row, saw ${priceRows}`);
    const catalogueBarcodes = await page.locator("#product-dialog .barcode-card").count();
    assert(
      catalogueBarcodes === 0,
      `catalogue product without a GTIN should not show a barcode card, saw ${catalogueBarcodes}`
    );
    const missingBarcodeNote = normalize(
      await page.locator("#product-dialog .dialog__barcode-note").innerText()
    );
    assert(
      missingBarcodeNote.includes("No barcode is recorded"),
      `product without a GTIN should explain the missing barcode: ${missingBarcodeNote}`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);

    await addToList(page, PAK_ONLY.sku, 1);

    step(`both-stores product: ${BOTH_STORES.name}`);
    card = await searchProduct(page, BOTH_STORES);
    assert(!card.includes("Not at"), `both-stores card should have no stock note: ${card}`);
    await addToList(page, BOTH_STORES.sku, 2);

    step(`New World-only product: ${NW_ONLY.name}`);
    card = await searchProduct(page, NW_ONLY);
    assert(card.includes("Not at Pak'nSave"), `New World-only card missing stock note: ${card}`);
    await addToList(page, NW_ONLY.sku, 3);

    step("checking basket totals");
    await page.waitForFunction(
      () => document.querySelector("#totals")?.textContent.includes("not stocked"),
      { timeout: 5000 }
    );
    const totals = normalize(await page.locator("#totals").innerText());
    assert(totals.includes("Pak'nSave · Mt Albert"), `PAK'nSAVE branch missing from totals: ${totals}`);
    assert(totals.includes("New World · Point Chevalier"), `New World branch missing from totals: ${totals}`);
    assert(
      (totals.match(/1 not stocked/g) || []).length === 2,
      `both stores should show one missing line: ${totals}`
    );
    assert(
      totals.includes("No selected store has a price for every item on this list."),
      `incomplete basket not identified: ${totals}`
    );
    const dashes = await page.locator("#totals .total-row b").evaluateAll(
      (nodes) => nodes.filter((node) => node.textContent.trim() === "—").length
    );
    assert(dashes === 2, `incomplete stores should show no total, saw ${dashes} dashes: ${totals}`);

    step("checking the basket receipt");
    await page.click("#receipt-button");
    await page.waitForSelector("#receipt-dialog[open]", { timeout: 5000 });
    const receipt = normalize(await page.locator("#receipt-body").innerText());
    const notAvailable = (receipt.match(/Not available/g) || []).length;
    const notStocked = (receipt.match(/Not stocked/g) || []).length;
    const missingItems = (receipt.match(/Missing items/g) || []).length;
    assert(notAvailable === 2, `receipt should mark 2 stores unavailable, saw ${notAvailable}`);
    assert(notStocked === 2, `receipt should mark 2 missing lines, saw ${notStocked}`);
    assert(missingItems === 2, `receipt should show missing-item footers, saw ${missingItems}`);
    assert(
      (receipt.match(/Basket total/g) || []).length === 0,
      `receipt should have no complete basket total: ${receipt}`
    );
    assert(/imp\./i.test(receipt), `receipt should label imported prices: ${receipt}`);

    step("checking Four Square's specials-only stores");
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForCurrentBuild(page);
    await page.waitForFunction(
      () => Array.isArray(window.GROCER_FOURSQUARE?.stores) && window.GROCER_FOURSQUARE.stores.length === 4,
      null,
      { timeout: 10000 }
    );
    while ((await page.locator("#store-list .store-selected").count()) > 0) {
      await removeStore(page, page.locator("#store-list .store-selected").first());
    }
    await page.waitForFunction(
      () => document.querySelectorAll("#store-list .store-selected").length === 0,
      null,
      { timeout: 5000 }
    );
    await page.fill("#store-search", "Four Square");
    await page.waitForSelector("#store-results [data-add-store]");
    const fourSquareResults = normalize(
      await page.locator("#store-results").innerText()
    ).toLowerCase();
    for (const branch of ["britomart", "eden terrace", "ellerslie", "onehunga"]) {
      assert(
        fourSquareResults.includes(branch),
        `Four Square store search is missing ${branch}: ${fourSquareResults}`
      );
    }
    await page.locator("#store-results [data-add-store]").filter({ hasText: "Britomart" }).click();
    await page.waitForFunction(
      () => document.querySelector("#store-list")?.innerText.includes("Specials only"),
      null,
      { timeout: 5000 }
    );

    await page.fill("#search", "Driscolls Blueberries");
    await page.waitForSelector('#product-grid [data-product="5045821-EA-000"]', { timeout: 20000 });
    const blueberryCard = normalize(
      await page.locator('#product-grid li.product:has([data-product="5045821-EA-000"])').innerText()
    ).toLowerCase();
    assert(blueberryCard.includes("$6.49"), `Four Square special price is missing: ${blueberryCard}`);
    assert(
      blueberryCard.includes("weekly special"),
      `Four Square special is not labelled: ${blueberryCard}`
    );
    assert(
      !blueberryCard.includes("est."),
      `Four Square special should not be estimated: ${blueberryCard}`
    );

    await page.locator('#product-grid [data-product="5045821-EA-000"]').click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const fourSquareDialog = normalize(await page.locator("#product-dialog").innerText()).toLowerCase();
    assert(
      fourSquareDialog.includes("weekly special") &&
        fourSquareDialog.includes("advertised specials, not shelf prices"),
      `Four Square dialog does not explain its special-only price: ${fourSquareDialog}`
    );
    assert(
      fourSquareDialog.includes("no price history"),
      `Four Square should not show an estimated price history: ${fourSquareDialog}`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);

    await page.fill("#search", "Anchor Blue Milk");
    await page.waitForSelector('#product-grid [data-product="milk-2l"]', { timeout: 20000 });
    const milkCard = normalize(
      await page.locator('#product-grid li.product:has([data-product="milk-2l"])').innerText()
    ).toLowerCase();
    assert(
      milkCard.includes("no published price"),
      `unpriced Four Square product should say no published price: ${milkCard}`
    );
    assert(
      !milkCard.includes("not stocked"),
      `unpriced Four Square product should not be called not stocked: ${milkCard}`
    );

    await page.fill("#search", "Driscolls Blueberries");
    await page.waitForSelector('#product-grid [data-add="5045821-EA-000"]', { timeout: 20000 });
    await page.locator('#product-grid [data-add="5045821-EA-000"]').click();
    await showShoppingList(page);
    const fourSquareTotals = normalize(await page.locator("#totals").innerText()).toLowerCase();
    assert(
      fourSquareTotals.includes("publishes weekly specials only"),
      `Four Square basket total does not explain the missing shelf prices: ${fourSquareTotals}`
    );
    assert(
      fourSquareTotals.includes("specials only") && fourSquareTotals.includes("—"),
      `Four Square should not show a full basket total: ${fourSquareTotals}`
    );

    await page.click("#receipt-button");
    await page.waitForSelector("#receipt-dialog[open]", { timeout: 5000 });
    const fourSquareReceipt = normalize(
      await page.locator("#receipt-body").innerText()
    ).toLowerCase();
    assert(
      fourSquareReceipt.includes("specials only") &&
        fourSquareReceipt.includes("advertised weekly specials"),
      `Four Square receipt should list specials only: ${fourSquareReceipt}`
    );
    await page.keyboard.press("Escape");

    step("checking Woolworths branch prices from Grocer's public dataset");
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForCurrentBuild(page);
    await page.waitForFunction(
      () =>
        Array.isArray(window.GROCER_WOOLWORTHS?.stores) &&
        window.GROCER_WOOLWORTHS.stores.length >= 4,
      null,
      { timeout: 10000 }
    );
    const woolworths = await page.evaluate(async () => {
      const data = window.GROCER_WOOLWORTHS;
      const store = data.stores.find((row) => row.branch === "Glenfield") || data.stores[0];
      const res = await fetch(`data/woolworths-prices/${store.id}.json`, { cache: "no-cache" });
      const prices = (await res.json()).prices || {};
      const byId = new Map(window.GROCER_CATALOGUE.items.map((row) => [row[0], row]));
      const priced = Object.entries(prices)
        .map(([id, cents]) => ({ id, cents, name: byId.get(id)?.[1] || "" }))
        .filter((row) => row.name.length > 3)
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        fetchedAt: data.fetchedAt,
        branches: data.stores.map((row) => row.branch),
        branch: store.branch,
        checkedAt: store.checkedAt,
        count: Object.keys(prices).length,
        entry: priced[0] || null,
      };
    });
    assert(
      woolworths.branches.length >= 50,
      `Woolworths has too few branches: ${woolworths.branches.join(", ")}`
    );
    assert(
      woolworths.branches.includes("Glenfield"),
      `Woolworths branches are missing Glenfield: ${woolworths.branches.join(", ")}`
    );
    assert(woolworths.checkedAt, "the Woolworths price list has no check time");
    assert(woolworths.count > 1000, `Woolworths only has ${woolworths.count} prices`);
    assert(woolworths.entry, "no Woolworths price matches the demo catalogue");
    console.log(
      `[smoke] Woolworths ${woolworths.branch}: ${woolworths.count} prices, e.g. ${woolworths.entry.name}`
    );

    await page.fill("#store-search", `Woolworths ${woolworths.branch}`);
    await page.waitForSelector("#store-results [data-add-store]", { timeout: 5000 });
    const woolworthsResults = normalize(
      await page.locator("#store-results").innerText()
    ).toLowerCase();
    assert(
      woolworthsResults.includes("woolworths"),
      `store search is missing Woolworths: ${woolworthsResults}`
    );
    assert(
      woolworthsResults.includes(woolworths.branch.toLowerCase()),
      `store search is missing ${woolworths.branch}: ${woolworthsResults}`
    );
    await page
      .locator("#store-results [data-add-store]")
      .filter({ hasText: woolworths.branch })
      .first()
      .click();
    await page.waitForFunction(
      (branch) => document.querySelector("#store-list")?.innerText.includes(branch),
      woolworths.branch,
      { timeout: 5000 }
    );
    await page.waitForFunction(
      () => !/loading (branch )?prices/i.test(document.querySelector("#store-list")?.innerText || ""),
      null,
      { timeout: 20000 }
    );
    const woolworthsStoreCard = normalize(
      await page.locator("#store-list").innerText()
    ).toLowerCase();
    assert(
      woolworthsStoreCard.includes(woolworths.branch.toLowerCase()),
      `selected Woolworths branch is missing: ${woolworthsStoreCard}`
    );
    assert(
      woolworthsStoreCard.includes("· auckland"),
      `selected Woolworths branch is missing its city: ${woolworthsStoreCard}`
    );
    assert(
      !woolworthsStoreCard.includes("weekly specials only"),
      `Woolworths should now have branch prices, not specials only: ${woolworthsStoreCard}`
    );

    const woolworthsPrice = money(woolworths.entry.cents);
    await page.fill("#search", woolworths.entry.name);
    await page.waitForSelector(`#product-grid [data-product="${woolworths.entry.id}"]`, {
      timeout: 20000,
    });
    const woolworthsCard = normalize(
      await page
        .locator(`#product-grid li.product:has([data-product="${woolworths.entry.id}"])`)
        .innerText()
    ).toLowerCase();
    assert(
      woolworthsCard.includes(woolworthsPrice),
      `Woolworths price ${woolworthsPrice} is missing: ${woolworthsCard}`
    );
    assert(
      !woolworthsCard.includes("est."),
      `Woolworths price should not be estimated: ${woolworthsCard}`
    );

    await page.locator(`#product-grid [data-product="${woolworths.entry.id}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const woolworthsDialog = normalize(
      await page.locator("#product-dialog").innerText()
    ).toLowerCase();
    assert(
      !woolworthsDialog.includes("advertised specials, not shelf prices"),
      `Woolworths dialog still claims special-only pricing: ${woolworthsDialog}`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);

    await page.fill("#search", woolworths.entry.name);
    await page.waitForSelector(`#product-grid [data-add="${woolworths.entry.id}"]`, {
      timeout: 20000,
    });
    await page.locator(`#product-grid [data-add="${woolworths.entry.id}"]`).click();
    await page.waitForFunction(
      () => document.querySelectorAll("#list-items .list-item").length === 1,
      null,
      { timeout: 5000 }
    );
    await showShoppingList(page);
    const woolworthsTotals = normalize(
      await page.locator("#totals").innerText()
    ).toLowerCase();
    assert(
      woolworthsTotals.includes("woolworths") && woolworthsTotals.includes(woolworthsPrice),
      `Woolworths basket total is missing its price: ${woolworthsTotals}`
    );
    assert(
      !woolworthsTotals.includes("specials only"),
      `Woolworths basket should no longer be specials only: ${woolworthsTotals}`
    );

    await page.click("#receipt-button");
    await page.waitForSelector("#receipt-dialog[open]", { timeout: 5000 });
    const woolworthsReceipt = normalize(
      await page.locator("#receipt-body").innerText()
    ).toLowerCase();
    assert(
      woolworthsReceipt.includes("woolworths") && !woolworthsReceipt.includes("specials only"),
      `Woolworths receipt should price the basket: ${woolworthsReceipt}`
    );
    await page.keyboard.press("Escape");

    assert(
      consoleErrors.length === 0,
      `browser console errors:\n${consoleErrors.join("\n")}`
    );

    step("all availability, barcode, deal, picture and price-check checks passed");
    console.log(`[smoke] PASS ${TARGET}`);
  } catch (error) {
    const failure = `Stage: ${smokeStage}\nURL: ${page.url()}\n\n${error?.stack || error}`;
    fs.writeFileSync("smoke-failure.txt", `${failure}\n`);
    console.error(`::error title=Smoke failed::${failure.replace(/\s+/g, " ")}`);
    await page.screenshot({ path: "smoke-failure.png", fullPage: false }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[smoke] FAIL ${error.message}`);
  process.exitCode = 1;
});
