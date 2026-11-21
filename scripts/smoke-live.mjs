#!/usr/bin/env node
/*
  Post-deploy smoke test for the Grocer demo.

  It replays the per-store availability check against the deployed site:
  a PAK'nSAVE-only product, a New World-only product and a mixed basket must
  show "not stocked" instead of an invented price, and a chain missing an item
  must not be ranked or totalled.

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

const step = (message) => console.log(`[smoke] ${message}`);
const normalize = (value) => value.replace(/\s+/g, " ").trim();

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

async function addToList(page, sku, expectedCount) {
  await page.locator(`#product-grid [data-add="${sku}"]`).click();
  await page.waitForFunction(
    (count) => document.querySelectorAll("#list-items .list-item").length === count,
    expectedCount,
    { timeout: 5000 }
  );
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "en-NZ",
  });

  // Always start from the demo defaults rather than a previous browser state.
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
    await page.waitForSelector('[data-mode="all"]', { timeout: 20000 });
    await page.waitForFunction(
      () => Array.isArray(window.GROCER_CATALOGUE?.items) && window.GROCER_CATALOGUE.items.length > 0,
      { timeout: 20000 }
    );

    step("switching to the full catalogue");
    await page.click('[data-mode="all"]');
    await page.waitForFunction(
      () => document.querySelectorAll("#product-grid li.product").length >= 50,
      { timeout: 10000 }
    );

    const catalogueCount = await page.evaluate(
      () => window.GROCER_CATALOGUE.productCount || window.GROCER_CATALOGUE.items.length
    );
    const resultsLine = normalize(await page.locator("#results-line").innerText());
    assert(
      resultsLine.includes(`${new Intl.NumberFormat("en-NZ").format(catalogueCount)} products`),
      `full catalogue not listed: ${resultsLine}`
    );

    step(`PAK'nSAVE-only product: ${PAK_ONLY.name}`);
    let card = await searchProduct(page, PAK_ONLY);
    assert(card.includes("Not at New World"), `PAK'nSAVE-only card missing stock note: ${card}`);
    assert(card.includes("2 stores"), `PAK'nSAVE-only card should price 2 stores: ${card}`);

    await page.locator(`#product-grid [data-product="${PAK_ONLY.sku}"]`).click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 5000 });
    const pakDialog = normalize(await page.locator("#product-dialog").innerText());
    assert(
      pakDialog.includes("Not stocked at New World"),
      `PAK'nSAVE-only dialog missing stock note: ${pakDialog}`
    );
    const priceRows = await page.locator("#product-dialog table tbody tr").count();
    assert(priceRows === 2, `PAK'nSAVE-only dialog should show 2 store rows, saw ${priceRows}`);
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
    assert(/Pak'nSave\s+1 not stocked/.test(totals), `PAK'nSAVE total not marked missing: ${totals}`);
    assert(/New World\s+1 not stocked/.test(totals), `New World total not marked missing: ${totals}`);
    assert(
      totals.includes("Only Woolworths has a price for every item on this list."),
      `complete basket not identified: ${totals}`
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
      (receipt.match(/Basket total/g) || []).length === 1,
      `receipt should total only the complete basket: ${receipt}`
    );
    assert(/imp\./i.test(receipt), `receipt should label imported prices: ${receipt}`);

    assert(
      consoleErrors.length === 0,
      `browser console errors:\n${consoleErrors.join("\n")}`
    );

    step("all availability checks passed");
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
