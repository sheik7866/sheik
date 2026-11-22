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
  It also checks quantity-aware multi-buy totals, the club-card toggle, and the
  deal-adjusted receipt, and requires a loaded product picture plus the import
  banner's last price-check time and shelf-price coverage summary.

  Usage:
    npm run smoke:live
    npm run smoke:live -- https://example.com/app.html
    SMOKE_URL=https://example.com/app.html npm run smoke:live
*/

import { chromium } from "playwright";

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
const REAL_GTIN = "9300617075462";

const step = (message) => console.log(`[smoke] ${message}`);
const normalize = (value) => value.replace(/\s+/g, " ").trim();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForCurrentBuild(page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await page.waitForFunction(
        () => window.TROLLEYBIRD_BUILD === "basket-pricing-2026-11-22",
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
    await page.waitForFunction(
      () => Array.isArray(window.GROCER_CATALOGUE?.items) && window.GROCER_CATALOGUE.items.length > 0,
      { timeout: 20000 }
    );
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

    step("loading the demo's barcode decoder");
    await page.addScriptTag({ url: new URL("vendor/zxing.min.js", TARGET).href });

    step(`demo staple shows its real EAN-8 barcode: ${DEMO_STAPLE.name}`);
    await page.waitForSelector(`#product-grid [data-product="${DEMO_STAPLE.id}"]`, {
      timeout: 5000,
    });
    await page.locator(`#product-grid [data-product="${DEMO_STAPLE.id}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
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
    await albanyRow.locator("[data-remove-store]").click();
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

    step("checking multi-buy and club-card shelf tags");
    const multiCard = await searchProduct(page, {
      name: "Eta Uppercuts Sweet Chilli Relish Potato Chips",
      sku: "5092030-EA-000",
    });
    assert(
      multiCard.includes("Multi-buy"),
      `PAK'nSAVE multi-buy badge missing: ${multiCard}`
    );
    await page.locator('#product-grid [data-product="5092030-EA-000"]').click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const multiDialog = normalize(await page.locator("#product-dialog").innerText());
    assert(
      multiDialog.includes("Multi-buy 3 for") && multiDialog.includes("each"),
      `multi-buy terms missing from the price dialog: ${multiDialog}`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);

    await searchProduct(page, {
      name: "Cadbury Dairy Milk Caramello Chocolate Block",
      sku: "5249645-EA-000",
    });
    await page.locator('#product-grid [data-product="5249645-EA-000"]').click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const clubDialog = normalize(await page.locator("#product-dialog").innerText());
    assert(
      clubDialog.includes("Club member") && clubDialog.includes("with club card"),
      `club-card price missing from the price dialog: ${clubDialog}`
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open);

    step("checking quantity-aware multi-buy basket totals");
    await searchProduct(page, {
      name: "Eta Uppercuts Sweet Chilli Relish Potato Chips",
      sku: "5092030-EA-000",
    });
    await addToList(page, "5092030-EA-000", 1);
    const multiRow = page.locator('#list-items [data-row="5092030-EA-000"]');
    await multiRow.locator('[data-step="1"]').click();
    await multiRow.locator('[data-step="1"]').click();
    await page.waitForFunction(
      () => document.querySelector('#list-items [data-row="5092030-EA-000"] output')?.textContent === "3",
      null,
      { timeout: 5000 }
    );
    const multiTotals = normalize(await page.locator("#totals").innerText());
    assert(multiTotals.includes("$5.50"), `multi-buy total for PAK'nSAVE missing: ${multiTotals}`);
    assert(multiTotals.includes("$11.37"), `multi-buy comparison total missing: ${multiTotals}`);
    assert(/saves \$0\.47/i.test(multiTotals), `multi-buy savings missing: ${multiTotals}`);
    const multiListText = normalize(await page.locator("#list-items").innerText());
    assert(
      multiListText.includes("Multi-buy 3 for $5.50 applied"),
      `quantity-aware deal not shown in the list: ${multiListText}`
    );

    await page.click("#clear-list");
    await page.waitForFunction(
      () => document.querySelectorAll("#list-items .list-item").length === 0,
      null,
      { timeout: 5000 }
    );

    step("checking the club-card toggle and basket pricing");
    await searchProduct(page, {
      name: "Cadbury Dairy Milk Caramello Chocolate Block",
      sku: "5249645-EA-000",
    });
    await addToList(page, "5249645-EA-000", 1);
    let clubTotals = normalize(await page.locator("#totals").innerText());
    assert(clubTotals.includes("$6.99"), `club price applied while toggle was off: ${clubTotals}`);
    assert(
      clubTotals.includes("Club card is off"),
      `club-card-off note missing from totals: ${clubTotals}`
    );
    await page.locator("label.club-toggle").click();
    await page.waitForFunction(() => document.querySelector("#club-toggle")?.checked, null, {
      timeout: 5000,
    });
    await page.waitForFunction(() => document.querySelector("#totals")?.textContent.includes("$4.49"), null, {
      timeout: 5000,
    });
    clubTotals = normalize(await page.locator("#totals").innerText());
    assert(clubTotals.includes("$4.49"), `club-card total not applied: ${clubTotals}`);
    assert(clubTotals.includes("$5.89"), `shelf comparison missing: ${clubTotals}`);
    assert(clubTotals.includes("Club-card prices applied."), `club-card-on note missing: ${clubTotals}`);
    assert(/saves \$2\.50/i.test(clubTotals), `club-card savings missing: ${clubTotals}`);

    await page.click("#receipt-button");
    await page.waitForSelector("#receipt-dialog[open]", { timeout: 5000 });
    const dealReceipt = normalize(await page.locator("#receipt-body").innerText());
    assert(dealReceipt.includes("Club member $4.49"), `receipt is missing the club deal: ${dealReceipt}`);
    assert(dealReceipt.includes("$4.49"), `receipt total is not club-priced: ${dealReceipt}`);
    assert(dealReceipt.includes("deals save $2.50"), `receipt is missing deal savings: ${dealReceipt}`);
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
    const dashes = (totals.match(/—/g) || []).length;
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

    assert(
      consoleErrors.length === 0,
      `browser console errors:\n${consoleErrors.join("\n")}`
    );

    step("all availability, barcode, deal, picture and price-check checks passed");
    console.log(`[smoke] PASS ${TARGET}`);
  } catch (error) {
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
