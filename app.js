/* =========================================================
   Grocer — interactive demo
   Client-side only: demo catalogue, demo stores, localStorage.
   ========================================================= */

const STORES = [
  { id: "paknsave", name: "Pak'nSave", branch: "Mt Albert", factor: 0.92, tint: "#f3c623" },
  { id: "woolworths", name: "Woolworths", branch: "Grey Lynn", factor: 1.0, tint: "#2f8f4e" },
  { id: "newworld", name: "New World", branch: "Point Chevalier", factor: 1.07, tint: "#c22032" },
  { id: "freshchoice", name: "FreshChoice", branch: "Parnell", factor: 1.04, tint: "#1d7a45" },
  { id: "supervalue", name: "SuperValue", branch: "Kingsland", factor: 1.01, tint: "#e05a2b" },
  { id: "warehouse", name: "The Warehouse", branch: "St Lukes", factor: 0.95, tint: "#1f5fbf" },
  { id: "farro", name: "Farro Fresh", branch: "Grey Lynn", factor: 1.25, tint: "#7a5a34" },
  { id: "bininn", name: "Bin Inn", branch: "Karangahape Rd", factor: 1.1, tint: "#9b7a2f" },
  { id: "moorewilson", name: "Moore Wilson's", branch: "City", factor: 1.18, tint: "#4c5b6b" },
  { id: "huckleberry", name: "Huckleberry", branch: "Wairau Valley", factor: 1.3, tint: "#4f7d4f" },
];

function product(id, name, size, category, base) {
  return { id, name, size, category, base };
}

const DEMO_PRODUCTS = [
  product("milk-2l", "Anchor Blue Milk", "2L", "Dairy & eggs", 4.99),
  product("eggs-12", "Free Range Eggs", "12 pack", "Dairy & eggs", 9.49),
  product("butter-500", "Salted Butter", "500g", "Dairy & eggs", 7.29),
  product("cheese-1kg", "Tasty Cheddar", "1kg", "Dairy & eggs", 14.99),
  product("yoghurt-1kg", "Greek Yoghurt", "1kg", "Dairy & eggs", 8.49),
  product("bread-toast", "White Toast Bread", "700g", "Bakery", 3.29),
  product("bagels-6", "Plain Bagels", "6 pack", "Bakery", 5.49),
  product("bananas-kg", "Bananas", "1kg", "Produce", 3.49),
  product("apples-kg", "Royal Gala Apples", "1kg", "Produce", 4.49),
  product("tomatoes-kg", "Tomatoes", "1kg", "Produce", 6.99),
  product("onions-kg", "Brown Onions", "1kg", "Produce", 3.19),
  product("potatoes-2kg", "Agria Potatoes", "2kg", "Produce", 5.99),
  product("carrots-kg", "Carrots", "1kg", "Produce", 2.79),
  product("avocado-each", "Hass Avocado", "each", "Produce", 2.49),
  product("chicken-1kg", "Chicken Breast", "1kg", "Meat & seafood", 15.99),
  product("mince-500", "Beef Mince", "500g", "Meat & seafood", 9.99),
  product("salmon-250", "Salmon Fillets", "250g", "Meat & seafood", 13.49),
  product("bacon-250", "Streaky Bacon", "250g", "Meat & seafood", 7.49),
  product("pasta-500", "Spaghetti", "500g", "Pantry", 2.29),
  product("rice-1kg", "Long Grain Rice", "1kg", "Pantry", 3.49),
  product("beans-420", "Baked Beans", "420g", "Pantry", 2.49),
  product("weebix-750", "Weet-Bix", "750g", "Pantry", 7.99),
  product("coffee-1kg", "Roasted Coffee Beans", "1kg", "Pantry", 34.99),
  product("tea-100", "Black Tea Bags", "100 pack", "Pantry", 6.49),
  product("oil-500", "Olive Oil", "500ml", "Pantry", 12.99),
  product("peas-1kg", "Frozen Peas", "1kg", "Frozen", 4.49),
  product("icecream-2l", "Vanilla Ice Cream", "2L", "Frozen", 8.99),
  product("juice-1l", "Orange Juice", "1L", "Drinks", 4.29),
  product("chips-150", "Salted Chips", "150g", "Snacks", 3.79),
  product("chocolate-180", "Milk Chocolate Block", "180g", "Snacks", 4.99),
  product("dish-1l", "Dish Liquid", "1L", "Household", 4.59),
  product("laundry-1kg", "Laundry Powder", "1kg", "Household", 9.99),
  product("toilet-12", "Toilet Paper", "12 pack", "Household", 12.99),
  product("toothpaste", "Toothpaste", "110g", "Household", 5.49),
];

/* With one product list, use the catalogue's department names for the demo
   staples too, so there aren't two chips for the same aisle. */
const DEMO_CATEGORY_ALIASES = {
  "Dairy & eggs": "Fridge, Deli & Eggs",
  Produce: "Fruit & Vegetables",
  "Meat & seafood": "Meat, Poultry & Seafood",
  Drinks: "Hot & Cold Drinks",
  Snacks: "Snacks, Treats & Easy Meals",
  Household: "Household & Cleaning",
};
function normalizeCategory(category) {
  return DEMO_CATEGORY_ALIASES[category] || category;
}
for (const item of DEMO_PRODUCTS) {
  item.category = normalizeCategory(item.category);
}

const MONTHS = ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];

/* The full PAK'nSAVE + New World catalogue, pulled from the stores' public
   pages. Each row is [id, name, brand, size, department, subcategory,
   paknsavePrice, newworldPrice, paknsaveUnit, newworldUnit] with prices in
   cents. Curated staples are merged into it below, so the demo has one
   product list rather than a separate "All products" mode. */
const CATALOGUE = window.GROCER_CATALOGUE || null;
const CATALOGUE_ROWS = Array.isArray(CATALOGUE?.items) ? CATALOGUE.items : [];

/* Dated imports for the curated staples, loaded before the catalogue so
   catalogue rows already represented by a staple can be removed. */
const BASE_IMPORTS = [window.GROCER_PAKNSAVE_IMPORT, window.GROCER_NEWWORLD_IMPORT].filter(
  (imp) => imp && imp.storeId && imp.items
);

function catalogueBase(pnsPrice, nwPrice) {
  const prices = [pnsPrice, nwPrice].filter((price) => price > 0);
  return prices.length ? Math.min(...prices) / 100 : 4.99;
}

/* Catalogue ids look like 5000527-EA-000; import SKUs append a chain suffix
   and use underscores (5000527_ea_000pns). */
function skuProductId(sku) {
  return String(sku || "")
    .replace(/(?:pns|nw)$/i, "")
    .replace(/_/g, "-")
    .toUpperCase();
}

const CURATED_SKUS = new Set();
for (const imp of BASE_IMPORTS) {
  for (const item of Object.values(imp.items || {})) {
    const id = skuProductId(item.sku);
    if (id) CURATED_SKUS.add(id);
  }
}

const STORE_PRODUCTS = CATALOGUE_ROWS.filter(([id]) => !CURATED_SKUS.has(id)).map(
  ([id, name, brand, size, department, subcategory, pnsPrice, nwPrice]) => ({
    id,
    name,
    brand,
    size,
    category: department,
    subcategory,
    base: catalogueBase(pnsPrice, nwPrice),
    source: "catalogue",
    estimated: true,
    code: "",
    // The chains whose pulled catalogue contained this product. A missing
    // chain means the store did not stock it on the fetch date, not that we
    // should fall back to a demo estimate there.
    catalogueStores: [pnsPrice ? "paknsave" : null, nwPrice ? "newworld" : null].filter(Boolean),
    stores: (pnsPrice ? 1 : 0) + (nwPrice ? 1 : 0),
  })
);

/* Curated staples keep their barcodes and imported prices; catalogue rows
   they replace are already filtered out above. */
const PRODUCTS = [...DEMO_PRODUCTS, ...STORE_PRODUCTS];
const CATEGORIES = ["All", ...new Set(PRODUCTS.map((p) => p.category))];
const PAGE_SIZE = 60;
let visibleLimit = PAGE_SIZE;

const MAX_FREE_STORES = 6;
const MAX_PRO_STORES = 30;
const STORAGE_KEY = "grocer-demo-v1";

/* Real product identity comes from Open Food Facts (open database, no key).
   It has no prices, so anything found there is priced with a clearly-labelled
   estimate from the demo pricing model. */
const OFF_API = "https://world.openfoodfacts.org/api/v2/product/";
const OFF_FIELDS = "code,product_name,generic_name,brands,quantity,image_front_small_url,categories_tags";
const OFF_CACHE_KEY = "grocer-off-cache-v1";
const OFF_CACHE_TTL = 1000 * 60 * 60 * 24 * 30;
const OFF_CACHE_LIMIT = 80;

/* Grocer's own public product catalogue: the Meilisearch index its web client
   queries from the browser with a public search key. It returns real product
   names, brands, sizes, categories and store coverage, but no prices — those
   sit behind Grocer's signed-in API, so prices here stay estimates unless you
   record a shelf price. */
const GROCER_SEARCH_URL = "https://meilisearch.grocer.nz/indexes/products/search";
const GROCER_SEARCH_KEY = "7f58239330307ec585c86863f985ab83cbb9ce951a9601c66e158548fb632fd1";
const GROCER_RESULT_LIMIT = 12;
/* Short-lived local cache so retyping or refining a search renders instantly
   and doesn't re-hit Grocer's index for the same term. */
const GROCER_CACHE_KEY = "grocer-catalogue-cache-v1";
const GROCER_CACHE_TTL = 1000 * 60 * 10;
const GROCER_CACHE_LIMIT = 40;
const GROCER_SIZE = /^(\d+(?:\.\d+)?)\s*(l|ml|kg|g|pk|pack|each)$/i;

/* Keyword buckets for turning a real product into a demo price estimate. */
const PRICE_HINTS = [
  [/chocolate/, 4.99, "Snacks"],
  [/coffee/, 16.99, "Pantry"],
  [/\btea\b/, 6.49, "Pantry"],
  [/cheese/, 14.99, "Dairy & eggs"],
  [/butter|margarine/, 7.29, "Dairy & eggs"],
  [/yoghurt|yogurt/, 8.49, "Dairy & eggs"],
  [/\bmilk\b/, 4.99, "Dairy & eggs"],
  [/\beggs?\b/, 9.49, "Dairy & eggs"],
  [/bagel|bread|toast|wrap|bakery/, 4.29, "Bakery"],
  [/chicken|beef|mince|lamb|pork|bacon|salmon|fish|sausage/, 12.99, "Meat & seafood"],
  [/ice cream|frozen|peas/, 8.49, "Frozen"],
  [/juice|water|soda|drink|cola/, 3.49, "Drinks"],
  [/chips|crisps|biscuit|cracker|snack|nuts/, 4.49, "Snacks"],
  [/pasta|spaghetti|noodle|rice|sauce|oil|bean|lentil|cereal|muesli|oat/, 3.99, "Pantry"],
  [/soap|detergent|laundry|cleaner|dish|toilet|tissue|paper|toothpaste|shampoo/, 7.99, "Household"],
  [/apple|banana|avocado|tomato|potato|onion|carrot|lettuce|fruit|vegetable|berry|berries|kiwifruit/, 4.29, "Produce"],
];

const STORE_MAP = new Map(STORES.map((s) => [s.id, s]));
const PRODUCT_MAP = new Map(PRODUCTS.map((p) => [p.id, p]));

/* The dated imports (data/*-import.js) plus the full catalogue price maps.
   Both are one store, one day; the catalogue file holds every product the
   store returned. */
const CATALOGUE_PRICES = { paknsave: {}, newworld: {} };
for (const row of CATALOGUE_ROWS) {
  if (row[6]) CATALOGUE_PRICES.paknsave[row[0]] = { price: row[6] / 100 };
  if (row[7]) CATALOGUE_PRICES.newworld[row[0]] = { price: row[7] / 100 };
}
const IMPORTS = ["paknsave", "newworld"]
  .map((storeId) => {
    const base = BASE_IMPORTS.find((imp) => imp.storeId === storeId);
    const meta = CATALOGUE?.stores?.[storeId];
    const catalogueItems = CATALOGUE_PRICES[storeId];
    return {
      storeId,
      store: base?.store || meta?.name || storeId,
      branch: base?.branch || meta?.branch || "",
      fetchedAt: base?.fetchedAt || CATALOGUE?.fetchedAt || "",
      checkedAt: base?.checkedAt || CATALOGUE?.checkedAt || "",
      source: base?.source || CATALOGUE?.source || "",
      productCount: Object.keys(catalogueItems).length || Object.keys(base?.items || {}).length,
      items: { ...(base?.items || {}), ...catalogueItems },
    };
  })
  .filter((imp) => Object.keys(imp.items).length > 0);

/* The stores' public image CDN keys product photos by the numeric part of
   the product id. Curated staples use the SKU in their dated import. */
const FOODSTUFFS_IMAGE_ID = /^(\d+)[-_]/;
const DEMO_IMAGE_IDS = new Map();
for (const imp of BASE_IMPORTS) {
  for (const [demoId, item] of Object.entries(imp.items || {})) {
    const match = FOODSTUFFS_IMAGE_ID.exec(String(item.sku || ""));
    if (match && !DEMO_IMAGE_IDS.has(demoId)) DEMO_IMAGE_IDS.set(demoId, match[1]);
  }
}
for (const product of PRODUCTS) {
  if (product.image) continue;
  const imageId = DEMO_IMAGE_IDS.get(product.id) || FOODSTUFFS_IMAGE_ID.exec(product.id)?.[1];
  if (imageId) {
    product.image = `https://a.fsimg.co.nz/product/retail/fan/image/200x200/${imageId}.png`;
  }
}

const money = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

const el = {
  storeList: document.getElementById("store-list"),
  storeCounter: document.getElementById("store-counter"),
  storeHint: document.getElementById("store-hint"),
  storeFoot: document.getElementById("store-foot"),
  search: document.getElementById("search"),
  categories: document.getElementById("categories"),
  resultsLine: document.getElementById("results-line"),
  showMore: document.getElementById("show-more"),
  grocerPanel: document.getElementById("grocer-panel"),
  grocerCount: document.getElementById("grocer-live-count"),
  grocerStatus: document.getElementById("grocer-live-status"),
  grocerResults: document.getElementById("grocer-results"),
  offLookup: document.getElementById("off-lookup"),
  offLookupText: document.getElementById("off-lookup-text"),
  offLookupButton: document.getElementById("off-lookup-button"),
  productGrid: document.getElementById("product-grid"),
  emptyProducts: document.getElementById("empty-products"),
  listItems: document.getElementById("list-items"),
  emptyList: document.getElementById("empty-list"),
  totals: document.getElementById("totals"),
  clearList: document.getElementById("clear-list"),
  receiptButton: document.getElementById("receipt-button"),
  receiptDialog: document.getElementById("receipt-dialog"),
  receiptBody: document.getElementById("receipt-body"),
  receiptStatus: document.getElementById("receipt-status"),
  receiptCopy: document.getElementById("receipt-copy"),
  receiptShare: document.getElementById("receipt-share"),
  bulkButton: document.getElementById("bulk-price-button"),
  bulkDialog: document.getElementById("bulk-price-dialog"),
  bulkStore: document.getElementById("bulk-store"),
  bulkDate: document.getElementById("bulk-date"),
  bulkRows: document.getElementById("bulk-rows"),
  bulkStatus: document.getElementById("bulk-status"),
  bulkSave: document.getElementById("bulk-save"),
  importBanner: document.getElementById("import-banner"),
  coverageLine: document.getElementById("coverage-line"),
  proToggle: document.getElementById("pro-toggle"),
  reset: document.getElementById("reset-demo"),
  dialog: document.getElementById("product-dialog"),
  dialogContent: document.getElementById("dialog-content"),
  toast: document.getElementById("toast"),
};

const defaults = {
  stores: ["paknsave", "woolworths", "newworld"],
  pro: false,
  list: [],
  live: [],
  prices: {},
  category: "All",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(iso) {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(iso || "");
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short" }).format(date);
}

function loadState() {
  const fresh = () => ({ ...defaults, stores: [...defaults.stores], list: [], live: [], prices: {} });
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw);
    const savedCategory = normalizeCategory(parsed.category);

    // Discovered products must exist before the saved list is filtered,
    // otherwise their basket rows would be dropped on reload.
    const live = Array.isArray(parsed.live)
      ? parsed.live
          .filter(
            (row) =>
              row &&
              typeof row.id === "string" &&
              typeof row.code === "string" &&
              typeof row.name === "string" &&
              Number.isFinite(row.base) &&
              row.base > 0 &&
              CATEGORIES.includes(normalizeCategory(row.category))
          )
          .slice(0, 200)
          .map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            size: typeof row.size === "string" ? row.size : "",
            brand: typeof row.brand === "string" ? row.brand : "",
            image: typeof row.image === "string" ? row.image : "",
            source: row.source === "grocer" ? "grocer" : "off",
            stores: Number.isFinite(row.stores) ? row.stores : 0,
            category: normalizeCategory(row.category),
            base: row.base,
          }))
      : [];
    live.forEach(createLiveProduct);

    const prices = {};
    if (parsed.prices && typeof parsed.prices === "object") {
      Object.keys(parsed.prices).slice(0, 500).forEach((key) => {
        const row = parsed.prices[key];
        const [productId, storeId] = key.split("|");
        if (!row || !PRODUCT_MAP.has(productId) || !STORE_MAP.has(storeId)) return;
        if (!Number.isFinite(row.price) || row.price <= 0) return;
        prices[key] = {
          price: Math.round(row.price * 100) / 100,
          at: typeof row.at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.at) ? row.at : todayIso(),
        };
      });
    }

    return {
      stores: Array.isArray(parsed.stores) ? parsed.stores.filter((id) => STORE_MAP.has(id)) : [...defaults.stores],
      pro: Boolean(parsed.pro),
      prices,
      list: Array.isArray(parsed.list)
        ? parsed.list
            .filter((row) => row && PRODUCT_MAP.has(row.id) && Number.isFinite(row.qty) && row.qty > 0)
            .map((row) => ({ id: row.id, qty: Math.min(Math.round(row.qty), 99) }))
        : [],
      category: CATEGORIES.includes(savedCategory) ? savedCategory : "All",
      live,
    };
  } catch {
    return fresh();
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable — the demo still works for this session */
  }
}

/* ---------- Demo pricing ---------- */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function noise(seed, min, max) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const fraction = x - Math.floor(x);
  return min + fraction * (max - min);
}

function roundPrice(value) {
  return Math.round(value * 20) / 20;
}

/* A price recorded in store is real; anything else is a labelled estimate. */
function checkedPrice(productId, storeId) {
  const row = state.prices && state.prices[`${productId}|${storeId}`];
  return row && Number.isFinite(row.price) && row.price > 0 ? row : null;
}

/* Shelf prices imported from PAK'nSAVE on the date in the data file. They are
   real numbers, but one store on one day — so they are labelled, not treated
   as live prices. */
function importFor(storeId) {
  return IMPORTS.find((imp) => imp.storeId === storeId) || null;
}

function importedPrice(productId, storeId) {
  const imp = importFor(storeId);
  if (!imp) return null;
  const row = imp.items[productId];
  return row && Number.isFinite(row.price) && row.price > 0 ? row : null;
}

/* The real price for a product at a store: your own recorded price wins,
   then the dated import, then nothing (estimate). */
function priceState(productId, storeId) {
  const checked = checkedPrice(productId, storeId);
  if (checked) return { price: checked.price, at: checked.at, kind: "checked" };
  const imported = importedPrice(productId, storeId);
  if (imported) return { price: imported.price, at: importFor(storeId).fetchedAt, kind: "imported" };
  return null;
}

function priceKind(productId, storeId) {
  const real = priceState(productId, storeId);
  return real ? real.kind : "est.";
}

function importDateLabel(imp = IMPORTS[0]) {
  if (!imp) return "";
  const date = new Date(`${imp.fetchedAt}T00:00:00`);
  if (Number.isNaN(date.getTime())) return imp.fetchedAt;
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function priceCheckLabel() {
  const iso = IMPORTS.map((imp) => imp.checkedAt).find(Boolean) || CATALOGUE?.checkedAt || "";
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Pacific/Auckland",
    timeZoneName: "short",
  }).format(date);
}

function priceIsChecked(productId, storeId) {
  return Boolean(priceState(productId, storeId));
}

const CATALOGUE_STORE_IDS = new Set(["paknsave", "newworld"]);

/* True only when we know the product is absent from that chain's catalogue.
   The app has no stock feed for the other demo stores, so they stay estimates. */
function knownUnavailable(productId, storeId) {
  const product = PRODUCT_MAP.get(productId);
  if (!product) return false;
  // A price you recorded (or a dated import) is evidence the store had it,
  // even if the catalogue pull missed it.
  if (priceState(productId, storeId)) return false;
  return Boolean(
    product.source === "catalogue" &&
      CATALOGUE_STORE_IDS.has(storeId) &&
      Array.isArray(product.catalogueStores) &&
      !product.catalogueStores.includes(storeId)
  );
}

function priceFor(productId, storeId) {
  const real = priceState(productId, storeId);
  if (real) return real.price;
  const p = PRODUCT_MAP.get(productId);
  const s = STORE_MAP.get(storeId);
  if (!p || !s || knownUnavailable(productId, storeId)) return null;
  const jitter = noise(hash(productId + storeId), -0.06, 0.06);
  return roundPrice(p.base * s.factor * (1 + jitter));
}

function historyFor(productId, storeId, months) {
  const p = PRODUCT_MAP.get(productId);
  const s = STORE_MAP.get(storeId);
  const current = priceFor(productId, storeId);
  if (!p || !s || current == null) return [];
  const values = MONTHS.slice(12 - months).map((label, index) => {
    const monthIndex = 12 - months + index;
    const drift = (monthIndex - 11) * 0.004;
    const jitter = noise(hash(productId + storeId + monthIndex), -0.09, 0.09);
    return roundPrice(p.base * s.factor * (1 + drift + jitter));
  });
  values[values.length - 1] = current;
  return values;
}

/* EAN-13 check-digit validation for real GTINs shown in the product dialog. */
function ean13CheckDigit(base12) {
  const sum = base12
    .slice(0, 12)
    .split("")
    .map(Number)
    .reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/* Barcodes are only rendered for products with a real GTIN. Curated staples
   and Grocer's product index do not include one, so they show no barcode
   rather than a made-up code. */

/* EAN-13 encoding for the scannable barcode in the product dialog. */
const EAN13_L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const EAN13_G = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const EAN13_R = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];
const EAN13_PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

function ean13Digits(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12) return `0${digits}`; // UPC-A is an EAN-13 with a leading zero.
  return digits.length === 13 ? digits : "";
}

function ean13Svg(raw) {
  const code = ean13Digits(raw);
  if (!code) return "";
  if (Number(code[12]) !== ean13CheckDigit(code.slice(0, 12))) return "";

  const parity = EAN13_PARITY[Number(code[0])];
  let bits = "101";
  for (let index = 0; index < 6; index += 1) {
    const digit = Number(code[index + 1]);
    bits += parity[index] === "L" ? EAN13_L[digit] : EAN13_G[digit];
  }
  bits += "01010";
  for (let index = 7; index < 13; index += 1) {
    bits += EAN13_R[Number(code[index])];
  }
  bits += "101";

  const quiet = 11;
  const bars = [...bits]
    .map((bit, index) => {
      if (bit !== "1") return "";
      const guard = index < 3 || (index >= 45 && index < 50) || index >= 92;
      return `<rect x="${quiet + index}" y="3" width="1" height="${guard ? 58 : 52}"/>`;
    })
    .join("");

  return `<svg class="barcode-card__svg" viewBox="0 0 117 72" role="img" aria-label="EAN-13 barcode ${code}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="117" height="72" fill="#fff"/><g fill="#000">${bars}</g><text x="58.5" y="68" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="7" letter-spacing="1.1">${code}</text></svg>`;
}

function barcodeCard(product) {
  const svg = ean13Svg(product.code);
  if (!svg) return "";
  const code = ean13Digits(product.code);
  return `
    <section class="barcode-card" aria-label="EAN-13 barcode">
      <div class="barcode-card__head">
        <span class="barcode-card__title">EAN-13 barcode</span>
        <button class="barcode-card__copy" type="button" data-copy-barcode="${code}">Copy barcode</button>
      </div>
      ${svg}
      <p class="barcode-card__hint">Scan with the demo scanner or any barcode app.</p>
      <p class="barcode-card__status" role="status" aria-live="polite"></p>
    </section>`;
}

/* ---------- Derived helpers ---------- */

function selectedStores() {
  return state.stores.map((id) => STORE_MAP.get(id)).filter(Boolean);
}

function storeCap() {
  return state.pro ? MAX_PRO_STORES : MAX_FREE_STORES;
}

function historyMonths() {
  return state.pro ? 12 : 3;
}

function offersFor(productId) {
  const stores = selectedStores();
  return stores
    .map((store) => ({ store, price: priceFor(productId, store.id) }))
    .filter((offer) => offer.price != null)
    .sort((a, b) => a.price - b.price);
}

function bestOffer(productId) {
  const offers = offersFor(productId);
  return offers.length ? offers[0] : null;
}

function visibleProducts() {
  const query = (el.search.value || "").trim().toLowerCase();
  return PRODUCTS.filter((p) => {
    if (state.category !== "All" && p.category !== state.category) return false;
    if (!query) return true;
    return (
      p.name.toLowerCase().includes(query) ||
      (p.brand || "").toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query) ||
      (p.subcategory || "").toLowerCase().includes(query) ||
      p.size.toLowerCase().includes(query) ||
      (p.code || "").includes(query)
    );
  });
}

function listTotals() {
  const stores = selectedStores();
  if (!stores.length || !state.list.length) return null;
  const rows = stores.map((store) => {
    const lines = state.list.map((row) => ({ row, price: priceFor(row.id, store.id) }));
    const missing = lines.filter((line) => line.price == null).length;
    const total = lines.reduce((sum, line) => sum + (line.price || 0) * line.row.qty, 0);
    return { store, total, missing, available: missing === 0 };
  });
  const available = rows.filter((row) => row.available).sort((a, b) => a.total - b.total);
  const unavailable = rows.filter((row) => !row.available).sort((a, b) => a.missing - b.missing);
  const cheapest = available[0] || null;
  const dearest = available[available.length - 1] || null;
  return {
    rows: [...available, ...unavailable],
    cheapest,
    dearest,
    savings: cheapest && dearest ? dearest.total - cheapest.total : 0,
    hasAvailable: available.length > 0,
  };
}

/* ---------- Rendering ---------- */

function renderStores() {
  el.storeList.innerHTML = STORES.map((store) => {
        const on = state.stores.includes(store.id);
        return `
          <li>
            <button class="store-chip${on ? " is-on" : ""}" type="button" data-store="${store.id}" aria-pressed="${on}">
              <span class="store-chip__dot" style="--dot:${store.tint}"></span>
              <span class="store-chip__body">
                <b>${escapeHtml(store.name)}</b>
                <small>${escapeHtml(store.branch)}</small>
              </span>
              <span class="store-chip__check" aria-hidden="true">✓</span>
            </button>
          </li>`;
      }).join("");

  el.storeCounter.textContent = `${state.stores.length} / ${state.pro ? "∞" : MAX_FREE_STORES}`;
  el.storeHint.textContent = state.stores.length
    ? state.stores.length === 1
      ? "Add another store to see a comparison."
      : "Tap a store to include or remove it."
    : "Pick at least one store to compare.";
  el.storeFoot.textContent = state.pro
    ? "Pro demo: every store unlocked."
    : `Free demo covers ${MAX_FREE_STORES} stores. Turn on Pro for the rest.`;
  el.storeFoot.classList.toggle("is-pro", state.pro);
}

function renderCategories() {
  el.categories.innerHTML = CATEGORIES
    .map(
      (category) => `
      <button class="chip${state.category === category ? " is-on" : ""}" type="button" data-category="${escapeHtml(category)}" aria-pressed="${state.category === category}">
        ${escapeHtml(category)}
      </button>`
    )
    .join("");
}

function renderProducts() {
  const allProducts = visibleProducts();
  const products = allProducts.slice(0, visibleLimit);
  const stores = selectedStores();

  el.productGrid.innerHTML = products
    .map((product) => {
      const best = bestOffer(product.id);
      const bestKind = best ? priceKind(product.id, best.store.id) : null;
      const unavailableStores = stores.filter((store) => knownUnavailable(product.id, store.id));
      const prices = stores.map((store) => priceFor(product.id, store.id)).filter((price) => price != null);
      const range = prices.length > 1 ? ` · ${money.format(Math.min(...prices))}–${money.format(Math.max(...prices))}` : "";
      return `
        <li class="product">
          <button class="product__open" type="button" data-product="${product.id}" aria-label="View prices for ${escapeHtml(product.name)}">
            ${product.image ? `<img class="product__thumb" src="${escapeHtml(product.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="56" height="56" />` : ""}
            <span class="product__body">
              <span class="product__name">${escapeHtml(product.name)}</span>
              <span class="product__meta">${escapeHtml(product.size)} · ${escapeHtml(product.category)}${product.subcategory ? ` · ${escapeHtml(product.subcategory)}` : ""}${product.source === "grocer" && product.stores ? ` · at ${product.stores} stores` : ""}</span>
              <span class="product__best">
                ${best ? `<b>${money.format(best.price)}${bestKind === "checked" ? ' <em class="product__est is-real">checked</em>' : bestKind === "imported" ? ' <em class="product__est is-real">imported</em>' : product.estimated ? ' <em class="product__est">est.</em>' : ""}</b><small>${escapeHtml(best.store.name)}</small>` : `<b>—</b><small>${stores.length ? "not stocked" : "no stores selected"}</small>`}
              </span>
              <span class="product__range">${best ? `${prices.length} store${prices.length === 1 ? "" : "s"}${range}` : stores.length ? "Not stocked at your selected stores" : "Choose a store to price this"}</span>
              ${unavailableStores.length ? `<span class="product__stock">Not at ${unavailableStores.map((store) => escapeHtml(store.name)).join(" & ")}</span>` : ""}
            </span>
          </button>
          <button class="product__add" type="button" data-add="${product.id}">Add to list</button>
        </li>`;
    })
    .join("");

  const grocerActive = grocerStatus !== "idle";
  el.emptyProducts.hidden = allProducts.length > 0 || grocerActive;
  el.resultsLine.textContent = allProducts.length
    ? `${allProducts.length.toLocaleString("en-NZ")} product${allProducts.length === 1 ? "" : "s"}${state.category !== "All" ? ` in ${state.category}` : ""} · showing ${products.length.toLocaleString("en-NZ")}${stores.length ? ` · priced at ${stores.length} store${stores.length === 1 ? "" : "s"}` : ""}`
    : grocerStatus === "ready" && grocerHits.size
      ? `${grocerHits.size} live match${grocerHits.size === 1 ? "" : "es"} from Grocer's catalogue`
      : grocerStatus === "loading"
        ? "Searching Grocer's catalogue…"
        : "No products found";

  if (el.showMore) {
    el.showMore.hidden = allProducts.length <= visibleLimit;
    el.showMore.textContent = `Show ${Math.min(PAGE_SIZE, allProducts.length - visibleLimit)} more products`;
  }

  // A long digit string is probably a real barcode: offer a live lookup.
  const query = normalizeBarcode(el.search.value || "");
  const offerLookup = allProducts.length === 0 && query.length >= 8 && query.length <= 14;
  el.offLookup.hidden = !offerLookup;
  if (offerLookup) {
    el.offLookupText.textContent = `Barcode ${query} isn't in the demo catalogue.`;
    el.offLookupButton.disabled = false;
  }
}

function renderList() {
  el.listItems.innerHTML = state.list
    .map((row) => {
      const product = PRODUCT_MAP.get(row.id);
      if (!product) return "";
      const best = bestOffer(row.id);
      const bestKind = best ? priceKind(row.id, best.store.id) : null;
      return `
        <li class="list-item" data-row="${row.id}">
          <span class="list-item__body">
            <b>${escapeHtml(product.name)}</b>
            <small>${escapeHtml(product.size)}${best ? ` · ${bestKind} from ${money.format(best.price)} at ${escapeHtml(best.store.name)}` : ""}</small>
          </span>
          <span class="qty">
            <button type="button" data-step="-1" data-id="${row.id}" aria-label="Decrease quantity of ${escapeHtml(product.name)}">−</button>
            <output aria-label="Quantity">${row.qty}</output>
            <button type="button" data-step="1" data-id="${row.id}" aria-label="Increase quantity of ${escapeHtml(product.name)}">+</button>
          </span>
          <button class="list-item__remove" type="button" data-remove="${row.id}" aria-label="Remove ${escapeHtml(product.name)}">×</button>
        </li>`;
    })
    .join("");

  el.emptyList.hidden = state.list.length > 0;
  el.clearList.hidden = state.list.length === 0;
  el.receiptButton.hidden = state.list.length === 0;
  el.bulkButton.hidden = state.list.length === 0;
}

function renderTotals() {
  const totals = listTotals();
  if (!totals) {
    el.totals.innerHTML = `<p class="totals__empty">${state.list.length ? "Select a store to total your list." : ""}</p>`;
    return;
  }
  const itemCount = state.list.reduce((sum, row) => sum + row.qty, 0);
  const availableRows = totals.rows.filter((row) => row.available);
  const summary = !totals.hasAvailable
    ? "No selected store has a price for every item on this list."
    : availableRows.length === 1
      ? `Only ${escapeHtml(totals.cheapest.store.name)} has a price for every item on this list.`
      : totals.savings > 0.004
        ? `Save ${money.format(totals.savings)} shopping at ${escapeHtml(totals.cheapest.store.name)}.`
        : "Prices are level across your stores for this basket.";
  el.totals.innerHTML = `
    <h3>Basket total <span>${itemCount} item${itemCount === 1 ? "" : "s"}</span></h3>
    <ul class="total-rows">
      ${totals.rows
        .map(
          (row) => `
        <li class="total-row${row.available && row === totals.cheapest && availableRows.length > 1 ? " is-best" : ""}${row.available ? "" : " is-unavailable"}">
          <span>${escapeHtml(row.store.name)}${row.available && row === totals.cheapest && availableRows.length > 1 ? ' <em>cheapest</em>' : ""}${row.available ? "" : ` <em class="total-row__missing">${row.missing} not stocked</em>`}</span>
          <b>${row.available ? money.format(row.total) : "—"}</b>
        </li>`
        )
        .join("")}
    </ul>
    <p class="totals__save">${summary}</p>`;
}

/* ---------- Basket receipt ---------- */

function receiptGroups() {
  return selectedStores()
    .map((store) => {
      const lines = state.list
        .map((row) => {
          const product = PRODUCT_MAP.get(row.id);
          if (!product) return null;
          const price = priceFor(row.id, store.id);
          const unavailable = price == null;
          const kind = unavailable ? null : priceKind(row.id, store.id);
          return {
            product,
            qty: row.qty,
            price,
            line: unavailable ? 0 : price * row.qty,
            checked: kind === "checked",
            imported: kind === "imported",
            unavailable,
          };
        })
        .filter(Boolean);
      const missing = lines.filter((line) => line.unavailable).length;
      const total = lines.reduce((sum, line) => sum + line.line, 0);
      return { store, lines, total, missing, available: missing === 0 };
    })
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.available ? a.total - b.total : a.missing - b.missing;
    });
}

function receiptDate() {
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" }).format(new Date());
}

function receiptSummaryText(groups) {
  const itemCount = listQuantity();
  const availableGroups = groups.filter((group) => group.available);
  const best = availableGroups[0] || null;
  const dearest = availableGroups[availableGroups.length - 1] || null;
  const lines = [
    `Grocer demo basket — ${receiptDate()}`,
    `${itemCount} item${itemCount === 1 ? "" : "s"} · ${groups.length} store${groups.length === 1 ? "" : "s"} compared`,
    "",
  ];
  groups.forEach((group) => {
    const status = group.available
      ? `${money.format(group.total)}${group === best && availableGroups.length > 1 ? "  ← cheapest" : ""}`
      : `not available — ${group.missing} item${group.missing === 1 ? "" : "s"} not stocked`;
    lines.push(`${group.store.name} (${group.store.branch}) — ${status}`);
    group.lines.forEach((line) => {
      lines.push(
        `  ${line.qty}× ${line.product.name} ${line.product.size}  ${line.unavailable ? "not stocked" : `${money.format(line.line)}${line.checked ? " ✓" : line.imported ? " (imported)" : ""}`}`
      );
    });
    lines.push("");
  });
  if (groups.some((group) => !group.available)) {
    lines.push("A store missing an item is shown as not available.");
    lines.push("");
  }
  if (best && dearest && best !== dearest && dearest.total - best.total > 0.004) {
    lines.push(`Save ${money.format(dearest.total - best.total)} shopping at ${best.store.name}.`);
    lines.push("");
  }
  lines.push("Demo prices from the Grocer interactive demo — not live supermarket data.");
  return lines.join("\n");
}

function renderReceipt() {
  const groups = receiptGroups();
  const itemCount = listQuantity();

  if (!state.list.length) {
    el.receiptBody.innerHTML = `<p class="receipt-empty">Your list is empty, so there's nothing to receipt yet.</p>`;
    el.receiptStatus.textContent = "";
    return;
  }

  const availableGroups = groups.filter((group) => group.available);
  const best = availableGroups[0] || null;
  const dearest = availableGroups[availableGroups.length - 1] || null;
  const savings = best && dearest && best !== dearest ? dearest.total - best.total : 0;
  const hasChecked = groups.some((group) => group.lines.some((line) => line.checked));
  const hasImported = groups.some((group) => group.lines.some((line) => line.imported));

  el.receiptBody.innerHTML = `
    <div class="receipt-paper">
      <div class="receipt-paper__top">
        <p class="receipt-paper__brand">Grocer</p>
        <p class="receipt-paper__meta">${receiptDate()} · Interactive demo<br />Demo prices, not live supermarket data</p>
        <span class="receipt-item-count">${itemCount} item${itemCount === 1 ? "" : "s"} · ${groups.length} store${groups.length === 1 ? "" : "s"}</span>
      </div>

      ${
        groups.length
          ? groups
              .map(
                (group) => `
        <section class="receipt-store${group === best && availableGroups.length > 1 ? " is-best" : ""}${group.available ? "" : " is-unavailable"}" aria-label="${escapeHtml(group.store.name)} basket">
          <div class="receipt-store__head">
            <h3 class="receipt-store__name">${escapeHtml(group.store.name)}<span class="receipt-store__branch">${escapeHtml(group.store.branch)}</span></h3>
            <p class="receipt-store__total">
              ${group.available ? money.format(group.total) : "Not available"}
              ${group === best && availableGroups.length > 1 ? '<span class="receipt-store__badge">Cheapest</span>' : ""}
            </p>
          </div>
          <ul class="receipt-lines">
            ${group.lines
              .map(
                (line) => `
              <li class="receipt-line">
                <span class="receipt-line__qty">${line.qty}×</span>
                <span class="receipt-line__name">${escapeHtml(line.product.name)}<small>${escapeHtml(line.product.size)}</small></span>
                <span class="receipt-line__amount${line.unavailable ? " is-missing" : ""}">${line.unavailable ? "Not stocked" : money.format(line.line)}${line.checked ? '<span class="receipt-line__checked" title="Price recorded in store">✓</span>' : line.imported ? '<span class="receipt-line__imported" title="Shelf price imported from the store">imp.</span>' : ""}</span>
              </li>`
              )
              .join("")}
          </ul>
          <div class="receipt-store__foot">
            <span>${group.available ? "Basket total" : "Missing items"}</span>
            <b>${group.available ? money.format(group.total) : `${group.missing} not stocked`}</b>
          </div>
        </section>`
              )
              .join("")
          : `<p class="receipt-empty">Select at least one store to price this basket.</p>`
      }

      ${
        savings > 0.004 && best && dearest
          ? `<p class="receipt-save">Cheapest basket: ${escapeHtml(best.store.name)} at ${money.format(best.total)} — ${money.format(savings)} less than ${escapeHtml(dearest.store.name)}.</p>`
          : ""
      }

      <p class="receipt-note">${
        hasChecked
          ? `✓ price recorded in store${hasImported ? `; imported shelf prices dated ${importDateLabel()}` : ""}. Other prices are estimates from the Grocer interactive demo.`
          : hasImported
            ? `Imported shelf prices dated ${importDateLabel()}. Other prices are estimates from the Grocer interactive demo.`
            : "Prices are illustrative demo data from the Grocer interactive demo."
      }</p>
    </div>`;

  el.receiptStatus.textContent = "";
  el.receiptStatus.removeAttribute("data-tone");
  el.receiptShare.hidden = typeof navigator.share !== "function";
}

function openReceipt() {
  if (!state.list.length) {
    toast("Add something to your list first.");
    return;
  }
  renderReceipt();
  if (typeof el.receiptDialog.showModal === "function") {
    el.receiptDialog.showModal();
  } else {
    el.receiptDialog.setAttribute("open", "");
  }
}

function closeReceipt() {
  if (el.receiptDialog.open) el.receiptDialog.close();
  else el.receiptDialog.removeAttribute("open");
}

async function writeTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const scratch = document.createElement("textarea");
  scratch.value = text;
  scratch.setAttribute("readonly", "");
  scratch.style.position = "fixed";
  scratch.style.opacity = "0";
  document.body.appendChild(scratch);
  scratch.select();
  const copied = document.execCommand("copy");
  scratch.remove();
  if (!copied) throw new Error("copy failed");
}

async function copyBarcode(button) {
  const code = button.dataset.copyBarcode || "";
  const card = button.closest(".barcode-card");
  const status = card ? card.querySelector(".barcode-card__status") : null;
  try {
    await writeTextToClipboard(code);
    if (status) {
      status.textContent = `Copied ${code}`;
      status.dataset.tone = "ok";
    }
    toast("Barcode copied.");
  } catch {
    if (status) {
      status.textContent = "Couldn't copy automatically — select the number instead.";
      status.removeAttribute("data-tone");
    }
  }
}

async function copyReceiptSummary() {
  const text = receiptSummaryText(receiptGroups());
  try {
    await writeTextToClipboard(text);
    el.receiptStatus.textContent = "Summary copied — paste it into a message or note.";
    el.receiptStatus.dataset.tone = "ok";
    toast("Receipt summary copied.");
  } catch {
    el.receiptStatus.textContent = "Couldn't copy automatically. Try Share, or select the text yourself.";
    el.receiptStatus.removeAttribute("data-tone");
  }
}

async function shareReceiptSummary() {
  const groups = receiptGroups();
  try {
    await navigator.share({
      title: "Grocer demo basket",
      text: receiptSummaryText(groups),
    });
    el.receiptStatus.textContent = "Summary shared.";
    el.receiptStatus.dataset.tone = "ok";
  } catch (error) {
    if (error && error.name === "AbortError") return;
    el.receiptStatus.textContent = "Sharing isn't available here — use Copy summary instead.";
    el.receiptStatus.removeAttribute("data-tone");
  }
}

function renderAll() {
  renderStores();
  el.search.placeholder = `Search ${PRODUCTS.length.toLocaleString("en-NZ")} products or type a barcode…`;
  renderCategories();
  renderProducts();
  renderList();
  renderTotals();
  el.proToggle.checked = state.pro;
  document.body.classList.toggle("is-pro", state.pro);
}

/* ---------- Actions ---------- */

function toggleStore(storeId) {
  if (!STORE_MAP.has(storeId)) return;
  const selected = state.stores.includes(storeId);
  if (!selected && state.stores.length >= storeCap()) {
    toast(state.pro ? "That's every store in the demo." : "Free demo is limited to 6 stores — turn on Pro.");
    return;
  }
  state.stores = selected ? state.stores.filter((id) => id !== storeId) : [...state.stores, storeId];
  saveState();
  renderAll();
}

function addToList(productId) {
  const product = PRODUCT_MAP.get(productId);
  if (!product) return;
  const row = state.list.find((item) => item.id === productId);
  if (row) {
    row.qty = Math.min(row.qty + 1, 99);
  } else {
    state.list.push({ id: productId, qty: 1 });
  }
  saveState();
  renderList();
  renderTotals();
  toast(`${product.name} added to your list.`);
}

function stepQuantity(productId, delta) {
  const row = state.list.find((item) => item.id === productId);
  if (!row) return;
  row.qty = Math.max(0, Math.min(row.qty + delta, 99));
  if (row.qty === 0) state.list = state.list.filter((item) => item.id !== productId);
  saveState();
  renderList();
  renderTotals();
}

function removeFromList(productId) {
  state.list = state.list.filter((item) => item.id !== productId);
  saveState();
  renderList();
  renderTotals();
}

function clearList() {
  if (!state.list.length) return;
  state.list = [];
  saveState();
  renderList();
  renderTotals();
  toast("Shopping list cleared.");
}

function setCategory(category) {
  if (!CATEGORIES.includes(category)) return;
  state.category = category;
  visibleLimit = PAGE_SIZE;
  saveState();
  renderCategories();
  renderProducts();
}

let toastTimer;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("is-on"), 2400);
}

/* ---------- Product dialog ---------- */

function sparkline(values) {
  if (values.length < 2) return "";
  const width = 440;
  const height = 96;
  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y];
  });
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(width - pad).toFixed(1)} ${height - pad} L${pad} ${height - pad} Z`;
  return `
    <svg class="history-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Price history from ${money.format(values[0])} to ${money.format(values[values.length - 1])}">
      <path d="${area}" class="history-chart__area" />
      <path d="${line}" class="history-chart__line" />
      ${points
        .map(([x, y], index) =>
          index === points.length - 1
            ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="history-chart__dot" />`
            : ""
        )
        .join("")}
    </svg>`;
}

function historyLabels(months) {
  return MONTHS.slice(12 - months);
}

let dialogProductId = null;

function recordedPricesFor(productId) {
  return selectedStores()
    .map((store) => {
      const row = checkedPrice(productId, store.id);
      return row ? { store, price: row.price, at: row.at } : null;
    })
    .filter(Boolean);
}

function recordPrice(productId, storeId, rawPrice, date) {
  if (!PRODUCT_MAP.has(productId) || !STORE_MAP.has(storeId)) return;
  const price = Math.round(Number(rawPrice) * 100) / 100;
  if (!Number.isFinite(price) || price <= 0) {
    toast("Enter a shelf price above zero.");
    return;
  }
  const at = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIso();
  state.prices[`${productId}|${storeId}`] = { price, at };
  saveState();
  renderProducts();
  renderList();
  renderTotals();
  openProduct(productId);
  toast(`${money.format(price)} at ${STORE_MAP.get(storeId).name} — now used in your totals.`);
}

function removeRecordedPrice(productId, storeId) {
  const key = `${productId}|${storeId}`;
  if (!state.prices[key]) return;
  delete state.prices[key];
  saveState();
  renderProducts();
  renderList();
  renderTotals();
  openProduct(productId);
  toast(
    importedPrice(productId, storeId)
      ? "Recorded price removed — that store is back to its imported shelf price."
      : "Recorded price removed — that store is back to an estimate."
  );
}

/* ---------- Bulk shelf-price entry ---------- */

function renderBulkRows() {
  const storeId = el.bulkStore.value;
  const store = STORE_MAP.get(storeId);

  el.bulkRows.innerHTML = state.list
    .map((row) => {
      const product = PRODUCT_MAP.get(row.id);
      if (!product) return "";
      const checked = checkedPrice(row.id, storeId);
      const real = priceState(row.id, storeId);
      const estimate = priceFor(row.id, storeId);
      const missing = estimate == null;
      return `
        <label class="bulk-row${real ? " is-checked" : ""}${missing ? " is-missing" : ""}">
          <span class="bulk-row__body">
            <b>${escapeHtml(product.name)}</b>
            <small>${escapeHtml(product.size)} · ${row.qty} on list · ${missing ? "not stocked at this store" : real ? `${real.kind === "imported" ? "imported" : "checked"} ${shortDate(real.at)}` : `estimate ${money.format(estimate)}`}</small>
          </span>
          <span class="bulk-row__input">
            <span aria-hidden="true">$</span>
            <input type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="${missing ? "—" : estimate.toFixed(2)}" aria-label="Price paid for ${escapeHtml(product.name)}" data-bulk-input="${row.id}" value="${checked ? checked.price.toFixed(2) : ""}"${missing ? " disabled" : ""} />
          </span>
        </label>`;
    })
    .join("");

  el.bulkStatus.textContent = store ? `Prices are saved for ${store.name} · ${store.branch}.` : "";
  el.bulkStatus.removeAttribute("data-tone");
}

function openBulkPrices() {
  const stores = selectedStores();
  if (!state.list.length) {
    toast("Add something to your list first.");
    return;
  }
  if (!stores.length) {
    toast("Select at least one store first.");
    return;
  }
  el.bulkStore.innerHTML = stores
    .map((store) => `<option value="${store.id}">${escapeHtml(store.name)} · ${escapeHtml(store.branch)}</option>`)
    .join("");
  el.bulkDate.value = todayIso();
  el.bulkDate.max = todayIso();
  renderBulkRows();

  if (typeof el.bulkDialog.showModal === "function") el.bulkDialog.showModal();
  else el.bulkDialog.setAttribute("open", "");
}

function closeBulkPrices() {
  if (el.bulkDialog.open) el.bulkDialog.close();
  else el.bulkDialog.removeAttribute("open");
}

function saveBulkPrices() {
  const storeId = el.bulkStore.value;
  const store = STORE_MAP.get(storeId);
  if (!store) return;
  const at = /^\d{4}-\d{2}-\d{2}$/.test(el.bulkDate.value) ? el.bulkDate.value : todayIso();
  const inputs = [...el.bulkRows.querySelectorAll("[data-bulk-input]")];
  const entries = [];

  for (const input of inputs) {
    const raw = input.value.trim();
    if (!raw) continue;
    const price = Math.round(Number(raw) * 100) / 100;
    if (!Number.isFinite(price) || price <= 0) {
      el.bulkStatus.textContent = "Prices need to be more than zero — clear the row to skip it.";
      el.bulkStatus.dataset.tone = "error";
      input.focus();
      return;
    }
    entries.push({ productId: input.dataset.bulkInput, price });
  }

  if (!entries.length) {
    el.bulkStatus.textContent = "Type at least one price to save.";
    el.bulkStatus.dataset.tone = "error";
    return;
  }

  entries.forEach(({ productId, price }) => {
    state.prices[`${productId}|${storeId}`] = { price, at };
  });
  saveState();
  renderProducts();
  renderList();
  renderTotals();
  closeBulkPrices();
  toast(`${entries.length} price${entries.length === 1 ? "" : "s"} saved for ${store.name}.`);
}

function openProduct(productId) {
  const product = PRODUCT_MAP.get(productId);
  if (!product) return;
  const offers = offersFor(productId);
  const months = historyMonths();
  const recorded = recordedPricesFor(productId);
  const unavailable = selectedStores().filter((store) => knownUnavailable(productId, store.id));
  const anyEstimate = offers.some((offer) => !priceIsChecked(productId, offer.store.id));
  const hasImport = offers.some((offer) => priceKind(productId, offer.store.id) === "imported");
  const barcode = barcodeCard(product);
  dialogProductId = productId;

  el.dialogContent.innerHTML = `
    <div class="dialog__head">
      <div class="dialog__head-main">
        <p class="dialog__eyebrow">${escapeHtml(product.category)}</p>
        <h2 id="dialog-title">${escapeHtml(product.name)}</h2>
        <p class="dialog__meta">${product.brand ? `${escapeHtml(product.brand)} · ` : ""}${escapeHtml(product.size || "size not listed")}${product.source === "grocer" ? " · Grocer catalogue" : product.code ? ` · Barcode ${product.code}` : ""}</p>
        ${
          product.source === "grocer"
            ? `<p class="dialog__source">Real product data from <a href="https://grocer.nz" target="_blank" rel="noopener">Grocer's catalogue</a>${product.stores ? ` · stocked at ${product.stores} stores` : ""}</p>`
            : product.source === "catalogue"
              ? `<p class="dialog__source">Shelf prices imported from PAK'nSAVE and New World on ${CATALOGUE ? shortDate(CATALOGUE.fetchedAt) : ""} · stocked at ${product.stores} of 2 stores</p>`
              : product.estimated
                ? `<p class="dialog__source">Real product data from <a href="https://world.openfoodfacts.org/product/${product.code}" target="_blank" rel="noopener">Open Food Facts</a></p>`
                : ""
        }
      </div>
      ${product.image ? `<img class="dialog__thumb" src="${escapeHtml(product.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}
      <button class="dialog__close" type="button" data-close-dialog aria-label="Close">×</button>
    </div>

    ${barcode}
    ${barcode ? "" : `<p class="dialog__barcode-note">No EAN-13 barcode is recorded for this product.</p>`}

    ${
      anyEstimate
        ? `          <p class="dialog__estimate">${
            hasImport
              ? `${IMPORTS.map((imp) => imp.store).join(" and ")} prices here are shelf prices imported on ${importDateLabel()}. Anything else is an estimate from demo pricing.`
              : product.estimated
                ? "Product details are real, but prices and history are estimates from demo pricing."
                : "Prices you haven't checked in store are estimates from demo pricing."
          } Record a shelf price below to make it real.</p>`
        : ""
    }

    ${
      offers.length
        ? `<table class="dialog__prices">
            <caption class="sr-only">Prices for ${escapeHtml(product.name)} at your selected stores</caption>
            <thead><tr><th scope="col">Store</th><th scope="col">Price</th><th scope="col">Difference</th></tr></thead>
            <tbody>
              ${offers
                .map((offer, index) => {
                  const kind = priceKind(productId, offer.store.id);
                  const note =
                    kind === "checked"
                      ? `checked ${shortDate(checkedPrice(productId, offer.store.id).at)}`
                      : kind === "imported"
                        ? `imported ${shortDate(importFor(offer.store.id).fetchedAt)}`
                        : "";
                  return `
                <tr class="${index === 0 ? "is-best" : ""}">
                  <th scope="row">${escapeHtml(offer.store.name)}<span>${escapeHtml(offer.store.branch)}</span></th>
                  <td>${money.format(offer.price)}${note ? `<small class="dialog__checked">${note}</small>` : ""}</td>
                  <td>${index === 0 ? "Cheapest" : `+${money.format(offer.price - offers[0].price)}`}</td>
                </tr>`;
                })
                .join("")}
            </tbody>
          </table>`
        : `<p class="dialog__empty">${unavailable.length ? `Not stocked at ${unavailable.map((store) => escapeHtml(store.name)).join(" or ")}.` : "Select at least one store in the sidebar to price this product."}</p>`
    }

    ${
      unavailable.length && offers.length
        ? `<p class="dialog__stock">Not stocked at ${unavailable.map((store) => escapeHtml(store.name)).join(" or ")} — no price to compare there.</p>`
        : ""
    }

    ${
      offers.length
        ? `<section class="check-price" aria-label="Record a shelf price">
            <details${recorded.length ? " open" : ""}>
              <summary>Record a price you saw in store${recorded.length ? ` · ${recorded.length} checked` : ""}</summary>
              <form class="check-price__form" data-price-form>
                <label class="check-price__field">
                  <span>Store</span>
                  <select name="store">
                    ${offers.map((offer) => `<option value="${offer.store.id}">${escapeHtml(offer.store.name)}</option>`).join("")}
                  </select>
                </label>
                <label class="check-price__field">
                  <span>Price (NZD)</span>
                  <input name="price" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="${money.format(offers[0].price).replace("$", "")}" required />
                </label>
                <label class="check-price__field">
                  <span>Seen on</span>
                  <input name="date" type="date" value="${todayIso()}" max="${todayIso()}" required />
                </label>
                <button class="btn btn--leaf btn--sm" type="submit">Save price</button>
              </form>
              ${
                recorded.length
                  ? `<ul class="check-price__list">${recorded
                      .map(
                        (row) =>
                          `<li><span>${escapeHtml(row.store.name)} · ${money.format(row.price)} <small>checked ${shortDate(row.at)}</small></span><button type="button" data-remove-price="${row.store.id}" aria-label="Remove recorded price for ${escapeHtml(row.store.name)}">×</button></li>`
                      )
                      .join("")}</ul>`
                  : `<p class="check-price__hint">Add the price on the shelf tag and it replaces the estimate in every total and receipt.</p>`
              }
            </details>
          </section>`
        : ""
    }

    <section class="dialog__history" aria-label="Price history">
      <div class="dialog__history-head">
        <h3>Price history</h3>
        <span>${product.estimated ? "Estimated history · demo data" : months === 12 ? "Last 12 months · Pro demo" : "Last 3 months · Free demo"}</span>
      </div>
      ${
        offers.length
          ? `${sparkline(historyFor(productId, offers[0].store.id, months))}
             <div class="history-labels">${historyLabels(months).map((m) => `<span>${m}</span>`).join("")}</div>
             <p class="dialog__note">Showing ${escapeHtml(offers[0].store.name)}. Prices elsewhere move differently — that's the point.</p>`
          : `<p class="dialog__empty">${unavailable.length ? "No price history at your selected stores." : "Pick a store to see its price history."}</p>`
      }
    </section>

    <div class="dialog__actions">
      <button class="btn btn--leaf" type="button" data-add="${product.id}">Add to list</button>
      <button class="btn btn--outline" type="button" data-close-dialog>Close</button>
      <span class="dialog__demo">Demo prices</span>
    </div>`;

  // Re-rendering an open dialog (after saving a price) must not reopen it.
  if (el.dialog.open) return;
  if (typeof el.dialog.showModal === "function") {
    el.dialog.showModal();
  } else {
    el.dialog.setAttribute("open", "");
  }
}

function closeDialog() {
  if (el.dialog.open) el.dialog.close();
  else el.dialog.removeAttribute("open");
}

/* ---------- Events ---------- */

el.storeList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-store]");
  if (button) toggleStore(button.dataset.store);
});

el.categories.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-category]");
  if (chip) setCategory(chip.dataset.category);
});

if (el.showMore) {
  el.showMore.addEventListener("click", () => {
    visibleLimit += PAGE_SIZE;
    renderProducts();
  });
}

el.productGrid.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add]");
  if (add) {
    addToList(add.dataset.add);
    return;
  }
  const open = event.target.closest("[data-product]");
  if (open) openProduct(open.dataset.product);
});

function hideBrokenImage(event) {
  if (event.target instanceof HTMLImageElement) event.target.hidden = true;
}
el.productGrid.addEventListener("error", hideBrokenImage, true);
el.dialogContent.addEventListener("error", hideBrokenImage, true);

el.listItems.addEventListener("click", (event) => {
  const step = event.target.closest("[data-step]");
  if (step) {
    stepQuantity(step.dataset.id, Number(step.dataset.step));
    return;
  }
  const remove = event.target.closest("[data-remove]");
  if (remove) removeFromList(remove.dataset.remove);
});

el.dialogContent.addEventListener("click", (event) => {
  const copyBarcodeButton = event.target.closest("[data-copy-barcode]");
  if (copyBarcodeButton) {
    copyBarcode(copyBarcodeButton);
    return;
  }
  const removePriceButton = event.target.closest("[data-remove-price]");
  if (removePriceButton) {
    removeRecordedPrice(dialogProductId, removePriceButton.dataset.removePrice);
    return;
  }
  if (event.target.closest("[data-close-dialog]")) {
    closeDialog();
    return;
  }
  const add = event.target.closest("[data-add]");
  if (add) {
    addToList(add.dataset.add);
    closeDialog();
  }
});

el.dialogContent.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-price-form]");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  recordPrice(dialogProductId, String(data.get("store") || ""), data.get("price"), data.get("date"));
});

el.dialog.addEventListener("click", (event) => {
  if (event.target === el.dialog) closeDialog();
});

el.search.addEventListener("input", () => {
  visibleLimit = PAGE_SIZE;
  renderProducts();
  scheduleGrocerSearch();
});

el.grocerResults.addEventListener("click", (event) => {
  const priceButton = event.target.closest("[data-grocer-price]");
  if (priceButton) {
    toggleGrocerPriceEntry(priceButton.dataset.grocerPrice);
    return;
  }
  if (event.target.closest("[data-grocer-price-cancel]")) {
    grocerPriceOpenId = null;
    renderGrocerResults();
    return;
  }
  const add = event.target.closest("[data-grocer-add]");
  if (!add) return;
  const row = grocerHits.get(add.dataset.grocerAdd);
  if (!row) return;
  const product = registerGrocerProduct(row);
  addToList(product.id);
  renderGrocerResults();
  toast(`${product.name} added — price is an estimate.`);
});

el.grocerResults.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-grocer-price-form]");
  if (!form) return;
  event.preventDefault();
  saveGrocerPrice(form);
});

el.offLookupButton.addEventListener("click", async () => {
  const code = normalizeBarcode(el.search.value || "");
  if (code.length < 8) return;
  el.offLookupButton.disabled = true;
  el.offLookupText.textContent = `Looking up ${code} on Open Food Facts…`;
  const lookup = await lookUpBarcode(code);
  el.offLookupButton.disabled = false;
  if (lookup.status === "found") {
    const product = registerLiveProduct(lookup.product);
    el.search.value = "";
    resetGrocerPanel();
    renderProducts();
    openProduct(product.id);
    toast(`${product.name} loaded from Open Food Facts — prices estimated.`);
    return;
  }
  el.offLookupText.textContent =
    lookup.status === "missing"
      ? `Barcode ${code} isn't in Open Food Facts yet.`
      : "Couldn't reach Open Food Facts. Check your connection and try again.";
});
el.clearList.addEventListener("click", clearList);
el.bulkButton.addEventListener("click", openBulkPrices);
el.bulkStore.addEventListener("change", renderBulkRows);
el.bulkSave.addEventListener("click", saveBulkPrices);
el.bulkRows.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("[data-bulk-input]")) {
    event.preventDefault();
    saveBulkPrices();
  }
});
el.bulkDialog.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-bulk]") || event.target === el.bulkDialog) closeBulkPrices();
});

el.receiptButton.addEventListener("click", openReceipt);
el.receiptCopy.addEventListener("click", copyReceiptSummary);
el.receiptShare.addEventListener("click", shareReceiptSummary);

el.receiptDialog.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-receipt]")) {
    closeReceipt();
    return;
  }
  if (event.target === el.receiptDialog) closeReceipt();
});

el.proToggle.addEventListener("change", () => {
  state.pro = el.proToggle.checked;
  if (!state.pro && state.stores.length > MAX_FREE_STORES) {
    state.stores = state.stores.slice(0, MAX_FREE_STORES);
  }
  saveState();
  renderAll();
  toast(state.pro ? "Pro demo on: all stores and 12 months of history." : "Free demo: 6 stores and 3 months of history.");
});

el.reset.addEventListener("click", () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  state = { ...defaults, stores: [...defaults.stores], list: [], live: [...state.live], prices: {} };
  el.search.value = "";
  resetGrocerPanel();
  saveState();
  renderAll();
  toast("Demo reset.");
});

/* ---------- Camera scanning ---------- */

function matchBarcode(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const padded = digits.padStart(13, "0");
  return (
    PRODUCTS.find((p) => p.code && p.code === digits) ||
    PRODUCTS.find((p) => p.code && p.code === padded) ||
    PRODUCTS.find(
      (p) => p.code && digits.length >= 12 && (p.code.endsWith(digits) || digits.endsWith(p.code))
    ) ||
    null
  );
}

function listQuantity() {
  return state.list.reduce((sum, row) => sum + row.qty, 0);
}

/* ---------- Real product lookup (Open Food Facts) ---------- */

function normalizeBarcode(raw) {
  return String(raw || "").replace(/\D/g, "");
}

/* Typical pack size behind each hint, so a 1L milk and a 3L milk don't both
   estimate at the 2L price. Sub-linear because bigger packs cost less per unit. */
const SIZE_REFERENCE = { l: 2, ml: 500, kg: 1, g: 250, pack: 6, pk: 6, each: 1 };

function sizeFactor(info) {
  const text = `${info.size || ""} ${info.name || ""}`.toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)\s*(ml|kg|l|g|pack|pk|each)\b/);
  if (!match) return 1;
  const amount = Number(match[1]);
  const reference = SIZE_REFERENCE[match[2]];
  if (!amount || !reference) return 1;
  return Math.min(3, Math.max(0.5, Math.pow(amount / reference, 0.55)));
}

function estimatePrice(info) {
  const haystack = `${info.name || ""} ${info.brand || ""} ${(info.categories || []).join(" ")}`.toLowerCase();
  const factor = sizeFactor(info);
  for (const [pattern, base, category] of PRICE_HINTS) {
    if (pattern.test(haystack)) return { base: roundPrice(base * factor), category };
  }
  return { base: roundPrice(4.99 * factor), category: "Pantry" };
}

function createLiveProduct(row) {
  const existing = PRODUCT_MAP.get(row.id);
  if (existing) return existing;
  const product = {
    id: row.id,
    code: row.code,
    name: row.name,
    size: row.size || "",
    category: normalizeCategory(row.category),
    base: row.base,
    brand: row.brand || "",
    image: row.image || "",
    source: row.source === "grocer" ? "grocer" : "off",
    stores: Number.isFinite(row.stores) ? row.stores : 0,
    estimated: true,
  };
  PRODUCT_MAP.set(product.id, product);
  PRODUCTS.push(product);
  return product;
}

function registerLiveProduct(info) {
  const id = `off-${info.code}`;
  const existing = PRODUCT_MAP.get(id);
  if (existing) return existing;

  const { base, category } = estimatePrice(info);
  const row = {
    id,
    code: info.code,
    name: info.name,
    size: info.size || "",
    brand: info.brand || "",
    image: info.image || "",
    category,
    base,
  };
  const product = createLiveProduct(row);
  if (!state.live.some((item) => item.id === id)) {
    state.live.push(row);
    saveState();
  }
  return product;
}

function readLookupCache(code) {
  try {
    const raw = localStorage.getItem(OFF_CACHE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    const entry = all && all[code];
    if (!entry || !entry.result || Date.now() - entry.at > OFF_CACHE_TTL) return null;
    return entry.result;
  } catch {
    return null;
  }
}

function writeLookupCache(code, result) {
  try {
    const raw = localStorage.getItem(OFF_CACHE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[code] = { at: Date.now(), result };
    const kept = Object.keys(all)
      .sort((a, b) => (all[b].at || 0) - (all[a].at || 0))
      .slice(0, OFF_CACHE_LIMIT)
      .reduce((acc, key) => {
        acc[key] = all[key];
        return acc;
      }, {});
    localStorage.setItem(OFF_CACHE_KEY, JSON.stringify(kept));
  } catch {
    /* the cache is a nicety; lookups still work without it */
  }
}

const pendingLookups = new Map();

async function lookUpBarcode(raw) {
  const code = normalizeBarcode(raw);
  if (code.length < 8) return { status: "invalid" };

  const cached = readLookupCache(code);
  if (cached) return cached;
  if (pendingLookups.has(code)) return pendingLookups.get(code);

  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(`${OFF_API}${code}.json?fields=${OFF_FIELDS}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (response.status === 404) {
        const missing = { status: "missing" };
        writeLookupCache(code, missing);
        return missing;
      }
      if (!response.ok) return { status: "error" };
      const data = await response.json();
      const found = data && data.status === 1 && data.product;
      const name = found ? String(data.product.product_name || data.product.generic_name || "").trim() : "";
      if (!name) {
        const missing = { status: "missing" };
        writeLookupCache(code, missing);
        return missing;
      }
      const result = {
        status: "found",
        product: {
          code,
          name,
          brand: String(data.product.brands || "").split(",")[0].trim(),
          size: String(data.product.quantity || "").trim(),
          image: String(data.product.image_front_small_url || ""),
          categories: Array.isArray(data.product.categories_tags) ? data.product.categories_tags : [],
        },
      };
      writeLookupCache(code, result);
      return result;
    } catch {
      return { status: "error" };
    } finally {
      clearTimeout(timer);
    }
  })();

  pendingLookups.set(code, request);
  try {
    return await request;
  } finally {
    pendingLookups.delete(code);
  }
}

function applyScanProduct(product, options) {
  // Scan-to-list mode: keep the camera running and stack items into the basket.
  if (options && options.addToList) {
    const row = state.list.find((item) => item.id === product.id);
    if (row) row.qty = Math.min(row.qty + 1, 99);
    else state.list.push({ id: product.id, qty: 1 });
    saveState();
    renderList();
    renderTotals();
    const count = listQuantity();
    return {
      handled: true,
      keepScanning: true,
      message: `Added ${product.name} · ${count} item${count === 1 ? "" : "s"} on your list`,
    };
  }

  const scanDialog = document.getElementById("scan-dialog");
  if (scanDialog && scanDialog.open) scanDialog.close();
  openProduct(product.id);
  toast(product.estimated ? `Scanned ${product.name} — prices are estimated.` : `Scanned ${product.name}.`);
  return { handled: true };
}

async function handleScanCode(raw, options) {
  const product = matchBarcode(raw);
  if (product) return applyScanProduct(product, options);

  const code = normalizeBarcode(raw);
  if (code.length < 8) return { handled: false, message: `Barcode ${raw} isn't a grocery barcode.` };

  const lookup = await lookUpBarcode(code);
  if (lookup.status === "found") return applyScanProduct(registerLiveProduct(lookup.product), options);
  if (lookup.status === "missing") {
    return { handled: false, message: `Barcode ${code} isn't in Open Food Facts yet.` };
  }
  return { handled: false, message: "Couldn't reach Open Food Facts. Check your connection and try again." };
}

const scanButton = document.getElementById("scan-button");
if (scanButton) {
  scanButton.addEventListener("click", () => {
    if (typeof window.GrocerScan !== "function") {
      toast("The camera scanner isn't available in this browser.");
      return;
    }
    const demo = DEMO_PRODUCTS[Math.floor(Math.random() * DEMO_PRODUCTS.length)];
    window.GrocerScan({ onCode: handleScanCode, demoCode: demo.code });
  });
}

/* ---------- Live Grocer catalogue ---------- */

let grocerTimer = 0;
let grocerController = null;
let grocerHits = new Map();
let grocerTotal = 0;
let grocerStatus = "idle"; // idle | loading | ready | error
let grocerPriceOpenId = null; // catalogue row with its quick price form open

function formatGrocerSize(size) {
  const raw = String(size || "").trim();
  if (!raw) return "size not listed";
  return raw.replace(GROCER_SIZE, (match, amount, unit) => {
    const label = unit.toLowerCase();
    return `${amount}${label === "l" || label === "ml" || label === "kg" ? label.toUpperCase() : label}`;
  });
}

function grocerRow(hit) {
  const name = String((hit && hit.name) || "").trim();
  if (!name) return null;
  const categories = (hit && hit.categories) || {};
  const categoryText = [categories.level_1, categories.level_2, categories.level_3].filter(Boolean).join(" ");
  const { base, category } = estimatePrice({ name, size: hit.size, brand: hit.brand, categories: [categoryText] });
  const id = `grocer-${hit.id}`;
  return {
    id,
    // The public index does not expose a GTIN, so leave this blank.
    code: "",
    name,
    brand: String(hit.brand || "").trim(),
    size: formatGrocerSize(hit.size),
    stores: Array.isArray(hit.stores) ? hit.stores.length : 0,
    category,
    base,
    source: "grocer",
  };
}

function registerGrocerProduct(row) {
  const existing = PRODUCT_MAP.get(row.id);
  if (existing) return existing;
  const product = createLiveProduct(row);
  if (!state.live.some((item) => item.id === row.id)) {
    state.live.push(row);
    saveState();
  }
  return product;
}

function grocerCacheTerm(term) {
  return String(term || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function readGrocerCache(term) {
  try {
    const raw = localStorage.getItem(GROCER_CACHE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    const entry = all && all[grocerCacheTerm(term)];
    if (!entry || !Array.isArray(entry.rows) || Date.now() - entry.at > GROCER_CACHE_TTL) return null;
    const rows = entry.rows.filter(
      (row) => row && typeof row.id === "string" && typeof row.name === "string" && Number.isFinite(row.base) && row.base > 0
    );
    return rows.length ? { rows, total: Number(entry.total) || rows.length } : null;
  } catch {
    return null;
  }
}

function writeGrocerCache(term, rows, total) {
  try {
    const raw = localStorage.getItem(GROCER_CACHE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[grocerCacheTerm(term)] = { at: Date.now(), total, rows };
    const kept = Object.keys(all)
      .sort((a, b) => (all[b].at || 0) - (all[a].at || 0))
      .slice(0, GROCER_CACHE_LIMIT)
      .reduce((acc, key) => {
        acc[key] = all[key];
        return acc;
      }, {});
    localStorage.setItem(GROCER_CACHE_KEY, JSON.stringify(kept));
  } catch {
    /* the cache is a nicety; searches still work without it */
  }
}

function resetGrocerPanel() {
  window.clearTimeout(grocerTimer);
  if (grocerController) {
    grocerController.abort();
    grocerController = null;
  }
  grocerPriceOpenId = null;
  grocerHits = new Map();
  grocerTotal = 0;
  grocerStatus = "idle";
  el.grocerPanel.hidden = true;
  el.grocerResults.innerHTML = "";
  el.grocerStatus.textContent = "";
  el.grocerCount.textContent = "";
}

function scheduleGrocerSearch() {
  const term = (el.search.value || "").trim();
  const digits = normalizeBarcode(term);
  const barcodeish = digits.length >= 8 && digits.length === term.length;
  window.clearTimeout(grocerTimer);
  if (grocerController) {
    grocerController.abort();
    grocerController = null;
  }
  grocerPriceOpenId = null;
  if (term.length < 2 || barcodeish) {
    resetGrocerPanel();
    return;
  }

  const cached = readGrocerCache(term);
  if (cached) {
    grocerTotal = cached.total;
    grocerHits = new Map(cached.rows.map((row) => [row.id, row]));
    grocerStatus = "ready";
    renderGrocerResults();
    return;
  }

  grocerHits = new Map();
  grocerTotal = 0;
  grocerStatus = "loading";
  renderGrocerResults();
  grocerTimer = window.setTimeout(() => runGrocerSearch(term), 320);
}

async function runGrocerSearch(term) {
  if (grocerController) grocerController.abort();
  const controller = new AbortController();
  grocerController = controller;
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(GROCER_SEARCH_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROCER_SEARCH_KEY}` },
      body: JSON.stringify({ q: term, limit: GROCER_RESULT_LIMIT }),
    });
    if (!response.ok) throw new Error(`Grocer catalogue returned ${response.status}`);
    const data = await response.json();
    if (controller.signal.aborted) return;
    grocerTotal = Number(data.estimatedTotalHits) || 0;
    grocerHits = new Map(
      (Array.isArray(data.hits) ? data.hits : [])
        .map(grocerRow)
        .filter(Boolean)
        .map((row) => [row.id, row])
    );
    grocerStatus = "ready";
    writeGrocerCache(term, [...grocerHits.values()], grocerTotal);
  } catch {
    if (grocerController !== controller && controller.signal.aborted) return;
    grocerHits = new Map();
    grocerTotal = 0;
    grocerStatus = "error";
  } finally {
    window.clearTimeout(timer);
    if (grocerController !== controller) return;
    grocerController = null;
    renderGrocerResults();
  }
}

/* A checked price on a catalogue row, using the stores the user has selected. */
function grocerCheckedPrice(rowId) {
  let best = null;
  selectedStores().forEach((store) => {
    const row = checkedPrice(rowId, store.id);
    if (row && (!best || row.price < best.price)) best = { price: row.price, at: row.at, store };
  });
  return best;
}

function toggleGrocerPriceEntry(rowId) {
  if (!selectedStores().length) {
    toast("Select at least one store first.");
    return;
  }
  grocerPriceOpenId = grocerPriceOpenId === rowId ? null : rowId;
  renderGrocerResults();
  if (!grocerPriceOpenId) return;
  const input = el.grocerResults.querySelector(`[data-grocer-price-form="${grocerPriceOpenId}"] input[name="price"]`);
  if (input) input.focus();
}

function saveGrocerPrice(form) {
  const rowId = form.dataset.grocerPriceForm;
  const row = grocerHits.get(rowId) || PRODUCT_MAP.get(rowId);
  const storeId = form.elements.store ? form.elements.store.value : "";
  if (!row || !STORE_MAP.has(storeId)) return;

  const price = Math.round(Number(form.elements.price.value) * 100) / 100;
  if (!Number.isFinite(price) || price <= 0) {
    toast("Enter a shelf price above zero.");
    form.elements.price.focus();
    return;
  }

  const product = registerGrocerProduct(row);
  state.prices[`${product.id}|${storeId}`] = { price, at: todayIso() };
  saveState();
  grocerPriceOpenId = null;
  renderGrocerResults();
  renderList();
  renderTotals();
  toast(`${money.format(price)} at ${STORE_MAP.get(storeId).name} recorded for ${product.name}.`);
}

function renderGrocerResults() {
  if (grocerStatus === "idle") {
    el.grocerPanel.hidden = true;
    return;
  }

  el.grocerPanel.hidden = false;
  el.grocerCount.textContent =
    grocerStatus === "ready" ? `${grocerTotal.toLocaleString("en-NZ")} products match` : "";

  if (grocerStatus === "loading") {
    el.grocerStatus.textContent = "Searching Grocer's catalogue…";
    el.grocerResults.innerHTML = "";
    renderProducts();
    return;
  }

  if (grocerStatus === "error") {
    el.grocerStatus.textContent = "Couldn't reach Grocer's catalogue. The demo products above still work.";
    el.grocerResults.innerHTML = "";
    renderProducts();
    return;
  }

  el.grocerStatus.textContent = grocerHits.size ? "" : "Nothing in Grocer's catalogue matches that.";
  const stores = selectedStores();
  el.grocerResults.innerHTML = [...grocerHits.values()]
    .map((row) => {
      const meta = [row.brand, row.size, row.stores ? `${row.stores} stores` : ""].filter(Boolean).map((part) => escapeHtml(part)).join(" · ");
      const checked = grocerCheckedPrice(row.id);
      const open = grocerPriceOpenId === row.id;
      const priceLine = checked
        ? `${money.format(checked.price)} <em class="is-real">checked</em>`
        : `${money.format(row.base)} <em>est.</em>`;
      const priceTitle = checked
        ? `${money.format(checked.price)} recorded at ${checked.store.name} on ${shortDate(checked.at)} — record another shelf price`
        : "Record the shelf price you saw";
      const entry = open
        ? `<li class="grocer-entry">
            <form class="grocer-entry__form" data-grocer-price-form="${row.id}">
              <label class="grocer-entry__store">
                <span class="sr-only">Store for ${escapeHtml(row.name)}</span>
                <select name="store">
                  ${stores.map((store) => `<option value="${store.id}"${checked && checked.store.id === store.id ? " selected" : ""}>${escapeHtml(store.name)}</option>`).join("")}
                </select>
              </label>
              <label class="grocer-entry__amount">
                <span aria-hidden="true">$</span>
                <input name="price" type="number" inputmode="decimal" step="0.01" min="0.01" required placeholder="0.00" aria-label="Shelf price for ${escapeHtml(row.name)}" />
              </label>
              <button class="btn btn--leaf btn--sm" type="submit">Save price</button>
              <button class="btn btn--outline btn--sm" type="button" data-grocer-price-cancel>Cancel</button>
            </form>
          </li>`
        : "";
      return `
        <li class="grocer-item">
          <span class="grocer-item__body">
            <b>${escapeHtml(row.name)}</b>
            <small>${meta || "Grocer catalogue"}</small>
          </span>
          <button class="grocer-item__price" type="button" data-grocer-price="${row.id}" aria-expanded="${open}" aria-label="Record a shelf price for ${escapeHtml(row.name)}" title="${escapeHtml(priceTitle)}"${stores.length ? "" : " disabled"}>${priceLine}</button>
          <button class="grocer-item__add" type="button" data-grocer-add="${row.id}">Add</button>
        </li>${entry}`;
    })
    .join("");

  renderProducts();
}

function renderCoverageLine() {
  if (!el.coverageLine || !PRODUCTS.length) return;
  let both = 0;
  let one = 0;
  let neither = 0;
  for (const product of PRODUCTS) {
    const stores =
      (importedPrice(product.id, "paknsave") ? 1 : 0) +
      (importedPrice(product.id, "newworld") ? 1 : 0);
    if (stores === 2) both += 1;
    else if (stores === 1) one += 1;
    else neither += 1;
  }
  const count = (value) => value.toLocaleString("en-NZ");
  el.coverageLine.textContent =
    `Shelf-price coverage: ${count(both)} products priced at both stores, ` +
    `${count(one)} at one store, ${count(neither)} at neither (${count(PRODUCTS.length)} total).`;
  el.coverageLine.hidden = false;
}

function renderImportBanner() {
  if (!el.importBanner || !IMPORTS.length) return;
  const labels = IMPORTS.map((imp) => `${imp.store} ${imp.branch}`).join(" and ");
  const counts = IMPORTS.map((imp) => imp.productCount || Object.keys(imp.items).length);
  const countText =
    counts.length === 2
      ? `${counts[0].toLocaleString("en-NZ")} and ${counts[1].toLocaleString("en-NZ")} products`
      : `${counts.reduce((sum, count) => sum + count, 0).toLocaleString("en-NZ")} products`;
  const checkedAt = priceCheckLabel();
  el.importBanner.textContent = `${labels} shelf prices for ${countText}. Last successful price check: ${checkedAt || "not recorded"}. Import dated ${importDateLabel()}. Everything else is an estimate unless you record it.`;
  el.importBanner.hidden = false;
}

renderImportBanner();
renderCoverageLine();
renderAll();

/* ---------- Small utilities ---------- */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
