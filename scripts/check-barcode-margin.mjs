#!/usr/bin/env node
/*
  Barcode scannability margin check for the Trolleybird demo.

  It opens the app, opens products until one shows a barcode card, screenshots
  the rendered symbol, and decodes it with the site's own vendored ZXing build.
  It then decodes the same image downscaled and softened, which stands in for a
  scanner with a shorter working range or softer optics: a symbol that still
  reads at half size and with a soft edge has margin to spare, while one that
  only reads as a pristine screenshot is living on the edge.

  This is a decode check, not a laser head: ZXing is more forgiving than a
  point-of-sale scanner, so a pass here is necessary, not sufficient.

  Usage:
    npm run barcode:check
    npm run barcode:check -- https://example.com/app.html
    BARCODE_URL=http://localhost:8000/app.html npm run barcode:check

  Exits non-zero when the symbol does not decode as rendered, when it decodes to
  something other than the barcode the card says it is, or when no product on
  the page shows a barcode card.
*/

import { chromium } from "playwright";

const DEFAULT_TARGET = "https://sheik7866.github.io/sheik/app.html";
const MAX_PRODUCTS = 12;
/* Frames are decoded at 2x, the way a phone renders the dialog. */
const DEVICE_SCALE = 2;

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

const TARGET = resolveTarget(process.env.BARCODE_URL || process.argv[2]);

/* The same screenshot, put through progressively harsher conditions. */
const VARIANTS = [
  { label: "as rendered", scale: 1, blur: 0 },
  { label: "downscaled to 75%", scale: 0.75, blur: 0 },
  { label: "downscaled to 50%", scale: 0.5, blur: 0 },
  { label: "soft edge, 0.7px blur", scale: 1, blur: 0.7 },
  { label: "soft edge, 1.4px blur", scale: 1, blur: 1.4 },
];

function pad(value, width) {
  return String(value).padEnd(width);
}

/* Products without a valid GTIN show a note instead of a barcode, and the GTIN
   data loads lazily, so try several products before giving up. */
async function openBarcodeCard(page) {
  const cards = page.locator("#product-grid [data-product]");
  const total = await cards.count();
  const limit = Math.min(total, MAX_PRODUCTS);

  for (let index = 0; index < limit; index += 1) {
    const card = cards.nth(index);
    const sku = (await card.getAttribute("data-product")) || `product ${index + 1}`;
    await card.click();
    await page.waitForSelector("#product-dialog[open]", { timeout: 10000 });

    try {
      await page.waitForSelector("#product-dialog .barcode-card__svg", { timeout: 20000 });
      return { sku };
    } catch {
      console.log(`  ${sku}: no barcode card, trying the next product`);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("#product-dialog")?.open, null, {
        timeout: 10000,
      });
    }
  }
  return null;
}

async function decodeVariants(page, base64, variants) {
  return page.evaluate(
    async ({ base64, variants }) => {
      function loadImage(src) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("image failed to load"));
          image.src = src;
        });
      }

      function formatName(value) {
        const formats = ZXing.BarcodeFormat;
        for (const name of Object.keys(formats)) {
          if (formats[name] === value) return name;
        }
        return String(value);
      }

      async function prepare(scale, blur) {
        const image = await loadImage(`data:image/png;base64,${base64}`);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        if (blur) context.filter = `blur(${blur}px)`;
        context.drawImage(image, 0, 0, width, height);
        return { url: canvas.toDataURL("image/png"), width, height };
      }

      if (!window.ZXing) throw new Error("the vendored ZXing decoder did not load");

      const results = [];
      for (const variant of variants) {
        const { url, width, height } = await prepare(variant.scale, variant.blur);
        let decoded = null;
        try {
          const image = await loadImage(url);
          const result = await new ZXing.BrowserMultiFormatReader().decodeFromImageElement(image);
          decoded = { text: result.getText(), format: formatName(result.getBarcodeFormat()) };
        } catch {
          decoded = null;
        }
        results.push({ label: variant.label, width, height, decoded });
      }
      return results;
    },
    { base64, variants }
  );
}

async function main() {
  console.log(`Barcode margin check against ${TARGET}`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: DEVICE_SCALE,
    });

    await page.goto(TARGET, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.TROLLEYBIRD_BUILD), null, { timeout: 30000 });
    const build = await page.evaluate(() => window.TROLLEYBIRD_BUILD);
    await page.waitForSelector("#product-grid [data-product]", { timeout: 30000 });
    console.log(`  build ${build}`);

    await page.addScriptTag({ url: new URL("vendor/zxing.min.js", TARGET).href });

    const opened = await openBarcodeCard(page);
    if (!opened) {
      throw new Error(`no product on the page showed a barcode card (tried up to ${MAX_PRODUCTS})`);
    }

    const svg = page.locator("#product-dialog .barcode-card__svg").first();
    const card = page.locator("#product-dialog .barcode-card").first();
    const kind = (await card.locator(".barcode-card__title").innerText()).trim();
    const modules = Number(await svg.getAttribute("data-modules"));
    const expected = await card.locator("[data-copy-barcode]").getAttribute("data-copy-barcode");
    const png = await svg.screenshot({ scale: "device" });

    const results = await decodeVariants(page, png.toString("base64"), VARIANTS);

    const widest = results[0];
    const modulePx = modules ? widest.width / modules : 0;
    console.log(
      `\n${kind} ${expected} — ${modules} modules at ${modulePx.toFixed(2)}px each, ` +
        `${widest.width}×${widest.height}px screenshot`
    );

    const baseline = results[0].decoded;
    let failed = false;

    for (const result of results) {
      const decoded = result.decoded;
      const ok = decoded && decoded.text === expected;
      if (!ok && result === results[0]) failed = true;
      console.log(
        `  ${ok ? "ok  " : "fail"}  ${pad(result.label, 24)}` +
          (decoded ? `${decoded.format} ${decoded.text}` : "not decoded")
      );
    }

    const matching = results.filter((result) => result.decoded?.text === expected);
    const worst = matching.at(-1);

    if (failed) {
      console.log(
        baseline
          ? `\nFAIL: the symbol decodes as ${baseline.text}, but the card says ${expected}.`
          : "\nFAIL: the rendered symbol did not decode at all."
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      worst === results[0]
        ? "\nMargin: reads only as a pristine screenshot — no tolerance to spare."
        : `\nMargin: still reads ${worst.label}.`
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\nBarcode margin check failed: ${error.message}`);
  process.exitCode = 1;
});
