/* =========================================================
   Trolleybird — interactive demo
   Client-side only: demo catalogue, real branch list, localStorage.
   ========================================================= */

/* The live smoke test waits for this marker so a just-deployed page cannot
   pass (or fail) against a cached copy of the previous app bundle. */
window.TROLLEYBIRD_BUILD = "cheapest-price-red-ties-2026-11-23";

/* Every PAK'nSAVE and New World branch, from the stores' public locators
   (scripts/pull-stores.mjs). Branches fall back to their banner's North or
   South Island base list and use a small branch-specific override file where
   their prices differ (scripts/pull-all-store-prices.mjs). Stock coverage is
   that branch's own product range (scripts/pull-coverage.mjs). The two branches
   the demo has always priced keep their old ids so saved lists and the dated
   staple imports keep working. */
const ANCHOR_BRANCHES = {
  "b2e98a14-c8ca-401e-99ed-edf74570c6f6": "paknsave",
  "871ff39f-99b5-4030-b035-b2dab7225082": "newworld",
};
const BRAND_NAMES = { pns: "Pak'nSave", nw: "New World" };
const BRAND_TINTS = { pns: "#f3c623", nw: "#c22032" };
const BRANCH_DIRECTORY = Array.isArray(window.GROCER_STORES?.stores)
  ? window.GROCER_STORES.stores
  : [];

function branchStore(store) {
  return {
    id: ANCHOR_BRANCHES[store.id] || `${store.brand}:${store.id}`,
    storeId: store.id,
    chain: store.brand,
    name: BRAND_NAMES[store.brand] || store.name,
    branch: store.branch,
    address: store.address || "",
    region: store.region,
    zone: `${store.brand}-${String(store.region || "").toLowerCase()}`,
    factor: 1,
    tint: BRAND_TINTS[store.brand] || "#4c5b6b",
  };
}

const BRANCH_STORES = BRANCH_DIRECTORY.map(branchStore);
if (!BRANCH_STORES.length) {
  BRANCH_STORES.push(
    { id: "paknsave", storeId: "b2e98a14-c8ca-401e-99ed-edf74570c6f6", chain: "pns", name: "Pak'nSave", branch: "Mt Albert", address: "", region: "NI", zone: "pns-ni", factor: 1, tint: BRAND_TINTS.pns },
    { id: "newworld", storeId: "871ff39f-99b5-4030-b035-b2dab7225082", chain: "nw", name: "New World", branch: "Point Chevalier", address: "", region: "NI", zone: "nw-ni", factor: 1, tint: BRAND_TINTS.nw }
  );
}

const STORES = BRANCH_STORES;

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

/* Real GTINs from the stores' public product-detail records, keyed by
   Foodstuffs product id. data/gtins.js is generated by
   scripts/pull-gtins.mjs; a product without a verified code stays blank.
   The file is loaded only when a barcode is searched, scanned or opened. */
let GTINS =
  window.GROCER_GTINS && typeof window.GROCER_GTINS === "object" ? window.GROCER_GTINS : {};
let GTINS_STATE = Object.keys(GTINS).length ? "ready" : "idle";
let gtinsPromise = null;
let searchPrewarmed = false;

window.TROLLEYBIRD_DATA = { coverage: false, gtins: GTINS_STATE === "ready" };

/* Data files stay outside the initial HTML so the shell can render without
   paying for barcode and branch-coverage data first. */
const DATA_SCRIPTS = new Map();
function loadDataScript(globalName, url) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (DATA_SCRIPTS.has(globalName)) return DATA_SCRIPTS.get(globalName);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (window[globalName]) resolve(window[globalName]);
      else reject(new Error(`${globalName} did not initialise`));
    };
    script.onerror = () => reject(new Error(`${url} failed to load`));
    document.head.appendChild(script);
  });
  DATA_SCRIPTS.set(globalName, promise);
  promise.catch(() => DATA_SCRIPTS.delete(globalName));
  return promise;
}

/* Dated imports for the curated staples, loaded before the catalogue so
   catalogue rows already represented by a staple can be removed. */
const BASE_IMPORTS = [window.GROCER_PAKNSAVE_IMPORT, window.GROCER_NEWWORLD_IMPORT].filter(
  (imp) => imp && imp.storeId && imp.items
);

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

/* Which real catalogue pack each demo staple matches at each chain, so a
   staple can be priced from any branch's island price list. */
const DEMO_SKU_IDS = new Map();
for (const imp of BASE_IMPORTS) {
  const chain = imp.storeId === "paknsave" ? "pns" : imp.storeId === "newworld" ? "nw" : null;
  if (!chain) continue;
  for (const [demoId, item] of Object.entries(imp.items || {})) {
    const id = skuProductId(item.sku);
    if (!id) continue;
    if (!DEMO_SKU_IDS.has(demoId)) DEMO_SKU_IDS.set(demoId, {});
    if (!DEMO_SKU_IDS.get(demoId)[chain]) DEMO_SKU_IDS.get(demoId)[chain] = id;
  }
}

/* Four price lists: PAK'nSAVE and New World on the North and South Island.
   Catalogue rows are [id, name, brand, size, department, subcategory,
   pnsNI, nwNI, pnsSI, nwSI, pnsNIUnit, nwNIUnit, pnsSIUnit, nwSIUnit]. */
const ZONE_KEYS = ["pns-ni", "nw-ni", "pns-si", "nw-si"];
const ZONE_META =
  CATALOGUE?.zones && typeof CATALOGUE.zones === "object" ? CATALOGUE.zones : {};
const BASE_STORE_IDS = new Set(
  Object.values(ZONE_META)
    .map((zone) => zone.storeId)
    .filter(Boolean)
);
const ZONE_DEALS = Object.fromEntries(
  ZONE_KEYS.map((zone) => [
    zone,
    ZONE_META[zone]?.deals && typeof ZONE_META[zone].deals === "object"
      ? ZONE_META[zone].deals
      : {},
  ])
);
/* Branch overrides are fetched lazily when a branch is selected. The four
   base branches have no override file; every other branch does. */
const STORE_PRICE_CACHE = new Map();
const ZONE_PRICES = Object.fromEntries(ZONE_KEYS.map((zone) => [zone, {}]));
const ZONE_UNITS = Object.fromEntries(ZONE_KEYS.map((zone) => [zone, {}]));
for (const row of CATALOGUE_ROWS) {
  ZONE_KEYS.forEach((zone, index) => {
    if (row[6 + index]) ZONE_PRICES[zone][row[0]] = row[6 + index] / 100;
    if (row[10 + index]) ZONE_UNITS[zone][row[0]] = row[10 + index];
  });
}

/* Per-branch stock coverage: one base64 bitmap per branch over COVERAGE_IDS
   (scripts/pull-coverage.mjs). A branch missing from the last pull falls back
   to its island price list, so old saved state and partial pulls still work.
   The file is loaded after the first paint, or immediately if a store is
   already selected. */
let COVERAGE =
  window.GROCER_COVERAGE && typeof window.GROCER_COVERAGE === "object"
    ? window.GROCER_COVERAGE
    : null;
let COVERAGE_IDS = Array.isArray(COVERAGE?.ids) ? COVERAGE.ids : [];
let COVERAGE_INDEX = new Map(
  COVERAGE_IDS.map((id, index) => [String(id).toUpperCase(), index])
);
let COVERAGE_BRANCHES =
  COVERAGE?.branches && typeof COVERAGE.branches === "object" ? COVERAGE.branches : {};
const COVERAGE_BYTES = new Map();
let coveragePromise = null;

window.TROLLEYBIRD_DATA.coverage = Boolean(COVERAGE);

function coverageFor(store) {
  const id = store?.storeId;
  const entry = id ? COVERAGE_BRANCHES[id] : null;
  if (!entry || typeof entry.bits !== "string") return null;
  let bytes = COVERAGE_BYTES.get(id);
  if (!bytes) {
    try {
      const binary = atob(entry.bits);
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
    } catch {
      return null;
    }
    COVERAGE_BYTES.set(id, bytes);
  }
  return bytes;
}

/* true or false when that branch's range was checked, null when the branch or
   product was not in the last coverage pull. */
function branchStocks(productId, store) {
  const bytes = coverageFor(store);
  const index = COVERAGE_INDEX.get(String(productId || "").toUpperCase());
  if (!bytes || index == null) return null;
  return (bytes[index >> 3] & (0x80 >> (index & 7))) !== 0;
}

/* Catalogue lines the branch's last range pull stocked, so the picker can show
   how different nearby branches are. null when the branch was not pulled. */
function stockedLineCount(store) {
  const entry = store?.storeId ? COVERAGE_BRANCHES[store.storeId] : null;
  return Number.isFinite(entry?.stocked) ? entry.stocked : null;
}

function applyCoverage(data) {
  COVERAGE = data && typeof data === "object" ? data : null;
  COVERAGE_IDS = Array.isArray(COVERAGE?.ids) ? COVERAGE.ids : [];
  COVERAGE_INDEX = new Map(
    COVERAGE_IDS.map((id, index) => [String(id).toUpperCase(), index])
  );
  COVERAGE_BRANCHES =
    COVERAGE?.branches && typeof COVERAGE.branches === "object" ? COVERAGE.branches : {};
  COVERAGE_BYTES.clear();
  window.TROLLEYBIRD_DATA.coverage = Boolean(COVERAGE);
  if (typeof state !== "undefined" && state.stores.length) renderAll();
  else {
    renderImportBanner();
    renderStores();
  }
}

function ensureCoverage() {
  if (COVERAGE) return Promise.resolve(true);
  if (coveragePromise) return coveragePromise;
  const promise = loadDataScript("GROCER_COVERAGE", "data/coverage.js")
    .then((data) => {
      applyCoverage(data);
      return true;
    })
    .catch((error) => {
      console.warn("Branch coverage unavailable", error);
      return false;
    });
  coveragePromise = promise;
  promise.then(
    () => {
      if (coveragePromise === promise) coveragePromise = null;
    },
    () => {
      if (coveragePromise === promise) coveragePromise = null;
    }
  );
  return promise;
}

const STORE_PRODUCTS = CATALOGUE_ROWS.filter(([id]) => !CURATED_SKUS.has(id)).map(
  ([id, name, brand, size, department, subcategory, ...prices]) => {
    const zonePrices = {};
    ZONE_KEYS.forEach((zone, index) => {
      if (prices[index]) zonePrices[zone] = prices[index] / 100;
    });
    return {
      id,
      name,
      brand,
      size,
      category: department,
      subcategory,
      base: Object.keys(zonePrices).length ? Math.min(...Object.values(zonePrices)) : 4.99,
      source: "catalogue",
      estimated: true,
      code: normalizeGtin(GTINS[id] || ""),
      // The price lists that contained this product. A missing zone means the
      // store did not stock it on the fetch date, not that we should fall back
      // to a demo estimate there.
      catalogueZones: Object.keys(zonePrices),
      stores: new Set(Object.keys(zonePrices).map((zone) => zone.split("-")[0])).size,
    };
  }
);

/* Curated staples keep their imported prices; catalogue rows they replace are
   already filtered out above. */
const PRODUCTS = [...DEMO_PRODUCTS, ...STORE_PRODUCTS];

/* A staple can stand for different packs at each chain (for example PAK'nSAVE
   spaghetti and New World spaghetti are different products). Only show a
   barcode when every imported pack resolves to the same real GTIN. */
const DEMO_GTINS = new Map();
for (const imp of BASE_IMPORTS) {
  for (const [demoId, item] of Object.entries(imp.items || {})) {
    const gtin = normalizeGtin(GTINS[skuProductId(item.sku)] || "");
    if (!gtin) continue;
    if (!DEMO_GTINS.has(demoId)) DEMO_GTINS.set(demoId, new Set());
    DEMO_GTINS.get(demoId).add(gtin);
  }
}
for (const product of DEMO_PRODUCTS) {
  const codes = DEMO_GTINS.get(product.id);
  if (codes && codes.size === 1) product.code = [...codes][0];
}

function applyGtins(data) {
  GTINS = data && typeof data === "object" ? data : {};
  for (const product of STORE_PRODUCTS) {
    product.code = normalizeGtin(GTINS[product.id] || "");
  }
  DEMO_GTINS.clear();
  for (const imp of BASE_IMPORTS) {
    for (const [demoId, item] of Object.entries(imp.items || {})) {
      const gtin = normalizeGtin(GTINS[skuProductId(item.sku)] || "");
      if (!gtin) continue;
      if (!DEMO_GTINS.has(demoId)) DEMO_GTINS.set(demoId, new Set());
      DEMO_GTINS.get(demoId).add(gtin);
    }
  }
  for (const product of DEMO_PRODUCTS) {
    const codes = DEMO_GTINS.get(product.id);
    if (codes && codes.size === 1) product.code = [...codes][0];
    else delete product.code;
  }
  PRODUCT_SEARCH_FIELDS = new WeakMap();
  searchPrewarmed = false;
  GTINS_STATE = "ready";
  window.TROLLEYBIRD_DATA.gtins = true;
  renderProducts();
  refreshOpenBarcode();
  whenIdle(prewarmSearchFields);
}

function ensureGtins() {
  if (GTINS_STATE === "ready") return Promise.resolve(true);
  if (GTINS_STATE === "error") GTINS_STATE = "idle";
  if (gtinsPromise) return gtinsPromise;
  GTINS_STATE = "loading";
  const promise = loadDataScript("GROCER_GTINS", "data/gtins.js")
    .then((data) => {
      applyGtins(data);
      return true;
    })
    .catch((error) => {
      GTINS_STATE = "error";
      console.warn("Barcode data unavailable", error);
      renderProducts();
      refreshOpenBarcode();
      return false;
    });
  gtinsPromise = promise;
  promise.then(
    () => {
      if (gtinsPromise === promise) gtinsPromise = null;
    },
    () => {
      if (gtinsPromise === promise) gtinsPromise = null;
    }
  );
  return promise;
}

const CATEGORIES = ["All", ...new Set(PRODUCTS.map((p) => p.category))];
const STAPLE_IDS = new Set(DEMO_PRODUCTS.map((product) => product.id));
const PAGE_SIZE = 60;
let visibleLimit = PAGE_SIZE;

const MAX_FREE_STORES = 6;
const MAX_PRO_STORES = 30;
const STORAGE_KEY = "grocer-demo-v1";
const TAB_IDS = ["stores", "catalog", "list"];
const SORT_MODES = ["relevance", "price", "unit"];
const LIST_FILTER_STATUSES = ["all", "special", "missing"];
const listFilters = { query: "", category: "all", status: "all" };

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

/* The two dated staple imports (data/*-import.js). Everything else comes from
   the catalogue's four price-list columns. */
const IMPORTS = BASE_IMPORTS.map((base) => ({
  ...base,
  productCount: Object.keys(base.items || {}).length,
})).filter((imp) => imp.productCount > 0);

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

/* Prices are kept to cents, but compare with a half-cent tolerance so a
   floating-point remainder never hides a tied cheapest price. */
function samePrice(a, b) {
  return a != null && b != null && Math.abs(a - b) < 0.005;
}

const el = {
  storeList: document.getElementById("store-list"),
  storeCounter: document.getElementById("store-counter"),
  storeHint: document.getElementById("store-hint"),
  storeFoot: document.getElementById("store-foot"),
  storeSearch: document.getElementById("store-search"),
  storeResults: document.getElementById("store-results"),
  search: document.getElementById("search"),
  categories: document.getElementById("categories"),
  sort: document.getElementById("product-sort"),
  resultsLine: document.getElementById("results-line"),
  showMore: document.getElementById("show-more"),
  grocerPanel: document.getElementById("grocer-panel"),
  grocerCount: document.getElementById("grocer-live-count"),
  grocerStatus: document.getElementById("grocer-live-status"),
  grocerResults: document.getElementById("grocer-results"),
  offLookup: document.getElementById("off-lookup"),
  offLookupText: document.getElementById("off-lookup-text"),
  searchSuggestion: document.getElementById("search-suggestion"),
  searchSuggestionLead: document.getElementById("search-suggestion-lead"),
  searchSuggestionButton: document.getElementById("search-suggestion-button"),
  offLookupButton: document.getElementById("off-lookup-button"),
  productGrid: document.getElementById("product-grid"),
  emptyProducts: document.getElementById("empty-products"),
  listItems: document.getElementById("list-items"),
  listTools: document.getElementById("list-tools"),
  listFilter: document.getElementById("list-filter"),
  listFilterReset: document.getElementById("list-filter-reset"),
  listFilterStatus: document.getElementById("list-filter-status"),
  listFilterEmpty: document.getElementById("list-filter-empty"),
  listFilterEmptyReset: document.getElementById("list-filter-empty-reset"),
  listCategoryFilter: document.getElementById("list-category-filter"),
  listStatusFilters: document.getElementById("list-status-filters"),
  listStatusButtons: [...document.querySelectorAll("[data-list-status]")],
  emptyList: document.getElementById("empty-list"),
  totals: document.getElementById("totals"),
  clearList: document.getElementById("clear-list"),
  listHeading: document.getElementById("list-heading"),
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
  clubToggle: document.getElementById("club-toggle"),
  tabButtons: [...document.querySelectorAll("[data-tab]")],
  tabPanels: [...document.querySelectorAll("[data-tab-panel]")],
  tabStoreCount: document.getElementById("tab-store-count"),
  tabListCount: document.getElementById("tab-list-count"),
  dialog: document.getElementById("product-dialog"),
  dialogContent: document.getElementById("dialog-content"),
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toast-message"),
  toastAction: document.getElementById("toast-action"),
};

const defaults = {
  stores: [],
  pro: false,
  clubCard: false,
  list: [],
  live: [],
  prices: {},
  category: "All",
  sort: "relevance",
  tab: "",
};

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());
}

function shortDate(iso) {
  const text = String(iso || "");
  if (!text) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00Z`)
    : new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    timeZone: "Pacific/Auckland",
  }).format(date);
}

function loadState() {
  const fresh = () => ({
    ...defaults,
    stores: [],
    list: [],
    live: [],
    prices: {},
  });
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

    const savedStores = Array.isArray(parsed.stores)
      ? [...new Set(parsed.stores.filter((id) => STORE_MAP.has(id)))]
      : [];

    return {
      stores: savedStores,
      pro: Boolean(parsed.pro),
      clubCard: Boolean(parsed.clubCard),
      prices,
      list: Array.isArray(parsed.list)
        ? parsed.list
            .filter((row) => row && PRODUCT_MAP.has(row.id) && Number.isFinite(row.qty) && row.qty > 0)
            .map((row) => ({ id: row.id, qty: Math.min(Math.round(row.qty), 99) }))
        : [],
      category: CATEGORIES.includes(savedCategory) ? savedCategory : "All",
      sort: SORT_MODES.includes(parsed.sort) ? parsed.sort : "relevance",
      tab: TAB_IDS.includes(parsed.tab) ? parsed.tab : "",
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

/* A branch is priced from its banner's island base list. Demo staples are
   keyed by their own id, so resolve the real pack they match at that chain. */
function zonePriceFor(productId, store) {
  if (!store?.zone) return null;
  const prices = ZONE_PRICES[store.zone];
  if (!prices) return null;
  if (prices[productId]) return prices[productId];
  const skuId = DEMO_SKU_IDS.get(productId)?.[store.chain];
  return skuId && prices[skuId] ? prices[skuId] : null;
}

function storePriceEntry(store) {
  if (!store || BASE_STORE_IDS.has(store.storeId)) return null;
  const entry = STORE_PRICE_CACHE.get(store.storeId);
  return entry?.status === "ready" ? entry : null;
}

function normalizeDeal(raw) {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const [threshold, priceCents, clubFlag, limit, description, promoId, multiFlag] = raw;
  if (!Number.isInteger(threshold) || threshold < 1) return null;
  if (!Number.isFinite(priceCents) || priceCents <= 0) return null;
  if (threshold === 1 && !clubFlag) return null;
  return {
    threshold,
    price: priceCents / 100,
    club: Boolean(clubFlag),
    limit: Number.isFinite(Number(limit)) ? Number(limit) : 0,
    description: typeof description === "string" ? description : "",
    promoId:
      typeof promoId === "string" || typeof promoId === "number" ? String(promoId).trim() : "",
    multiProducts: Boolean(multiFlag),
  };
}

function dealFromMap(deals, productId, store) {
  if (!deals || typeof deals !== "object") return null;
  const direct = normalizeDeal(deals[productId]);
  if (direct) return direct;
  const skuId = DEMO_SKU_IDS.get(productId)?.[store.chain];
  return skuId ? normalizeDeal(deals[skuId]) : null;
}

/* Club and multi-buy terms come from the branch's own product pull. A missing
   entry means that branch did not list a deal, not that the island deal applies. */
function storeDealFor(productId, store) {
  if (!store) return null;
  if (BASE_STORE_IDS.has(store.storeId)) {
    return dealFromMap(ZONE_DEALS[store.zone], productId, store);
  }
  const entry = storePriceEntry(store);
  return entry ? dealFromMap(entry.deals, productId, store) : null;
}

/* Price a basket line at its quantity, using the branch's own terms. Multi-buys
   apply in whole groups, capped by any advertised limit, and club prices only
   when the shopper says they have the card. The leftover units stay at the
   shelf price; the result is a real cents total, not a rounded estimate. */
function basketLinePricing(productId, store, qty) {
  const shelfPrice = priceFor(productId, store.id);
  if (shelfPrice == null) return null;
  const count = Math.max(1, Math.min(Math.round(qty), 99));
  const shelfTotal = Math.round(shelfPrice * count * 100) / 100;
  const deal = storeDealFor(productId, store);
  const clubDealAvailable = Boolean(deal?.club);
  let total = shelfTotal;
  let dealGroups = 0;
  let dealUnits = 0;

  if (deal && (!deal.club || state.clubCard)) {
    const eligible = deal.limit > 0 ? Math.min(count, deal.limit) : count;
    if (deal.threshold > 1) {
      dealGroups = eligible >= deal.threshold ? Math.floor(eligible / deal.threshold) : 0;
      dealUnits = dealGroups * deal.threshold;
    } else {
      dealUnits = eligible;
      dealGroups = eligible;
    }
    if (dealUnits > 0) {
      const candidate =
        Math.round((dealGroups * deal.price + (count - dealUnits) * shelfPrice) * 100) / 100;
      if (candidate < shelfTotal) total = candidate;
      else {
        dealGroups = 0;
        dealUnits = 0;
      }
    }
  }

  const dealApplied = total < shelfTotal - 0.004;
  return {
    shelfPrice,
    total,
    qty: count,
    unit: total / count,
    deal,
    dealApplied,
    dealGroups,
    dealUnits,
    dealRemainder: count - dealUnits,
    savings: Math.round((shelfTotal - total) * 100) / 100,
    clubDealAvailable,
  };
}

function dealGroupKey(deal) {
  if (!deal?.multiProducts || !deal.promoId) return "";
  return `${deal.promoId}|${deal.threshold}|${deal.price}|${deal.club ? 1 : 0}|${deal.limit}`;
}

/* Price every line at one store. Mix-and-match promotions share one deal group,
   so three different products can make a "3 for" offer. The group limit is a
   cap on promotional units across all products, and any units beyond it stay
   at their own shelf price. Discounts are allocated by each line's share of
   the promotional shelf value, so the line totals still add up to the group
   total. */
function basketPricingAtStore(store) {
  const lines = state.list.map((row) => {
    const shelfPrice = priceFor(row.id, store.id);
    const count = Math.max(1, Math.min(Math.round(row.qty), 99));
    const deal = shelfPrice == null ? null : storeDealFor(row.id, store);
    return {
      row,
      productId: row.id,
      qty: count,
      shelfPrice,
      shelfTotal: shelfPrice == null ? 0 : Math.round(shelfPrice * count * 100) / 100,
      total: shelfPrice == null ? 0 : Math.round(shelfPrice * count * 100) / 100,
      deal,
      dealApplied: false,
      dealGroups: 0,
      dealUnits: 0,
      dealRemainder: count,
      savings: 0,
      clubDealAvailable: Boolean(deal?.club),
      missing: shelfPrice == null,
      grouped: false,
      promoUnits: 0,
    };
  });

  const groups = new Map();
  for (const line of lines) {
    if (line.missing) continue;
    const key = dealGroupKey(line.deal);
    if (!key) continue;
    if (line.deal.club && !state.clubCard) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }

  for (const group of groups.values()) {
    const deal = group[0].deal;
    const totalQty = group.reduce((sum, line) => sum + line.qty, 0);
    const eligibleQty = deal.limit > 0 ? Math.min(totalQty, deal.limit) : totalQty;
    const dealGroups = Math.floor(eligibleQty / deal.threshold);
    const dealUnits = dealGroups * deal.threshold;
    if (!dealUnits) continue;

    const totalShelf = group.reduce((sum, line) => sum + line.shelfTotal, 0);
    let remainingUnits = dealUnits;
    let promoUnitsShelf = 0;
    for (const line of group) {
      const take = Math.min(remainingUnits, line.qty);
      line.promoUnits = take;
      remainingUnits -= take;
      promoUnitsShelf += take * line.shelfPrice;
    }

    const groupTotal = dealGroups * deal.price + (totalShelf - promoUnitsShelf);
    const discount = Math.round((totalShelf - groupTotal) * 100) / 100;
    if (discount <= 0.004) continue;

    group.forEach((line) => {
      line.grouped = true;
      line.dealUnits = line.promoUnits;
      line.dealRemainder = line.qty - line.promoUnits;
    });
    const receiving = group.filter((line) => line.promoUnits > 0);
    let remainingDiscount = discount;
    receiving.forEach((line, index) => {
      const last = index === receiving.length - 1;
      const weight = line.promoUnits * line.shelfPrice;
      const share = last
        ? remainingDiscount
        : Math.round((discount * weight * 100) / promoUnitsShelf) / 100;
      const lineDiscount = Math.max(0, Math.min(share, remainingDiscount, line.shelfTotal));
      line.savings = Math.round(lineDiscount * 100) / 100;
      line.total = Math.round((line.shelfTotal - line.savings) * 100) / 100;
      line.dealApplied = line.savings > 0.004;
      line.dealUnits = line.promoUnits;
      line.dealGroups = Math.ceil(line.promoUnits / deal.threshold);
      line.dealRemainder = line.qty - line.promoUnits;
      line.grouped = true;
      remainingDiscount = Math.round((remainingDiscount - line.savings) * 100) / 100;
    });
  }

  for (const line of lines) {
    if (line.missing || line.grouped) continue;
    const pricing = basketLinePricing(line.productId, store, line.qty);
    if (!pricing) continue;
    Object.assign(line, pricing, {
      missing: false,
      shelfTotal: Math.round(pricing.shelfPrice * line.qty * 100) / 100,
      grouped: false,
      promoUnits: pricing.dealUnits,
    });
  }

  return lines;
}

/* The assorted promotions that actually priced this basket, with the products
   that shared each offer and the units counted against its limit. */
function assortedGroups(lines) {
  const groups = new Map();
  for (const line of lines) {
    if (line.missing || !line.grouped || !line.deal?.multiProducts) continue;
    const key = dealGroupKey(line.deal);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, deal: line.deal, lines: [] });
    groups.get(key).lines.push(line);
  }

  return [...groups.values()]
    .map((group) => {
      const products = group.lines
        .map((line) => ({
          product: PRODUCT_MAP.get(line.productId),
          qty: line.qty,
          promoUnits: line.promoUnits || 0,
        }))
        .filter((entry) => entry.product);
      const promoUnits = group.lines.reduce((sum, line) => sum + (line.promoUnits || 0), 0);
      const basketUnits = group.lines.reduce((sum, line) => sum + line.qty, 0);
      const savings = group.lines.reduce((sum, line) => sum + (line.savings || 0), 0);
      return {
        key: group.key,
        deal: group.deal,
        label: dealLabel(group.deal),
        products,
        promoUnits,
        basketUnits,
        limit: group.deal.limit,
        savings: Math.round(savings * 100) / 100,
      };
    })
    .filter((group) => group.products.length && group.promoUnits > 0);
}

/* How much of an assorted promotion's shared limit this basket used. The limit
   counts promotional units across every product in the group, not each line. */
function groupLimitText(group) {
  if (!group.limit) return "No shared limit";
  const used = Math.min(group.promoUnits, group.limit);
  const parts = [`${used} of ${group.limit} shared unit${group.limit === 1 ? "" : "s"} used`];
  const extra = group.basketUnits - used;
  if (extra > 0) parts.push(`${extra} unit${extra === 1 ? "" : "s"} at shelf price`);
  return parts.join(" · ");
}

function dealLabel(deal) {
  if (!deal) return "";
  const price = money.format(deal.price);
  if (deal.threshold > 1) {
    return `${deal.club ? "Club member" : "Multi-buy"} ${deal.threshold} for ${price}`;
  }
  return `Club member ${price}`;
}

function dealLimitLabel(deal) {
  return deal && deal.limit > 0 ? `limit ${deal.limit}` : "";
}

function dealSummary(deal) {
  if (!deal) return "";
  const limit = dealLimitLabel(deal);
  return limit ? `${dealLabel(deal)} · ${limit}` : dealLabel(deal);
}

function dealDetail(deal) {
  if (!deal) return "";
  const parts = [dealLabel(deal)];
  if (deal.threshold > 1) parts.push(`${money.format(deal.price / deal.threshold)} each`);
  if (deal.club) parts.push("with club card");
  if (deal.multiProducts) parts.push("mix & match");
  if (deal.description) parts.push(deal.description);
  if (deal.limit && !/limit/i.test(deal.description)) parts.push(`limit ${deal.limit}`);
  return parts.join(" · ");
}

function storePricesReady(store) {
  if (!store) return false;
  if (BASE_STORE_IDS.has(store.storeId)) return true;
  const entry = STORE_PRICE_CACHE.get(store.storeId);
  return entry?.status === "ready" || entry?.status === "error";
}

/* A real branch price wins over the island base price. Only prices that differ
   are stored, so a missing override means the base list is correct. */
function storePriceOverrideFor(productId, store) {
  const entry = storePriceEntry(store);
  if (!entry) return null;
  const prices = entry.prices || {};
  if (prices[productId]) {
    return { price: prices[productId] / 100, at: entry.checkedAt || "" };
  }
  const skuId = DEMO_SKU_IDS.get(productId)?.[store.chain];
  if (skuId && prices[skuId]) {
    return { price: prices[skuId] / 100, at: entry.checkedAt || "" };
  }
  return null;
}

function importedPrice(productId, storeId) {
  const store = STORE_MAP.get(storeId);
  if (!store || !storePricesReady(store)) return null;
  const imp = importFor(storeId);
  const row = imp?.items?.[productId];
  if (row && Number.isFinite(row.price) && row.price > 0) {
    return { price: row.price, at: imp.fetchedAt };
  }
  const override = storePriceOverrideFor(productId, store);
  if (override) return override;
  const price = zonePriceFor(productId, store);
  if (price) {
    return {
      price,
      at: CATALOGUE?.fetchedAt || ZONE_META[store.zone]?.fetchedAt || "",
    };
  }
  return null;
}

/* The real price for a product at a store: your own recorded price wins,
   then the dated import, then nothing (estimate). */
function priceState(productId, storeId) {
  const checked = checkedPrice(productId, storeId);
  if (checked) return { price: checked.price, at: checked.at, kind: "checked" };
  const imported = importedPrice(productId, storeId);
  if (imported) return { price: imported.price, at: imported.at, kind: "imported" };
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
  const iso =
    [
      ...IMPORTS.map((imp) => imp.checkedAt),
      CATALOGUE?.checkedAt,
      ...[...STORE_PRICE_CACHE.values()].map((entry) => entry.checkedAt),
    ]
      .filter(Boolean)
      .sort()
      .at(-1) || "";
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

/* True only when that branch's own product range says it does not sell the
   product. Falls back to the island price list when the branch was not in the
   last coverage pull; the demo's other chains stay estimates. */
function knownUnavailable(productId, storeId) {
  const product = PRODUCT_MAP.get(productId);
  const store = STORE_MAP.get(storeId);
  if (!product || !store) return false;
  if (!storePricesReady(store)) return false;
  // A price you recorded in this store is evidence it had the product, even
  // if the range pull missed it.
  if (checkedPrice(productId, storeId)) return false;
  const skuId = DEMO_SKU_IDS.get(productId)?.[store.chain];
  const catalogueId = product.source === "catalogue" ? productId : skuId;
  if (catalogueId) {
    const stocked = branchStocks(catalogueId, store);
    if (stocked !== null) return !stocked;
  }
  // No branch-level answer: fall back to the banner's island price list.
  if (priceState(productId, storeId)) return false;
  if (product.source === "catalogue") {
    return !Array.isArray(product.catalogueZones) || !product.catalogueZones.includes(store.zone);
  }
  // Demo staples only get a "not stocked" answer when we know which real pack
  // they match at that chain; otherwise the demo keeps its estimate.
  return Boolean(skuId) && !ZONE_PRICES[store.zone]?.[skuId];
}

function priceFor(productId, storeId) {
  const real = priceState(productId, storeId);
  if (real) return real.price;
  const p = PRODUCT_MAP.get(productId);
  const s = STORE_MAP.get(storeId);
  if (!p || !s || !storePricesReady(s) || knownUnavailable(productId, storeId)) return null;
  const jitter = noise(hash(productId + storeId), -0.06, 0.06);
  return roundPrice(p.base * s.factor * (1 + jitter));
}

/* Unit prices are advertised by the price lists as strings such as
   "$9.14/100g". The denominator is the useful part: the shelf price can move,
   but the pack size stays the same. */
const UNIT_REFERENCE = /^\$?\s*([\d.]+)\s*\/\s*(.+?)\s*$/i;
const UNIT_SUFFIX = /^(\d+(?:\.\d+)?)?\s*(g|kg|ml|l|ea|each|m|sheet|sheets|pack|pk)$/i;
const UNIT_KINDS = {
  g: { dimension: "mass", factor: 1, target: 100 },
  kg: { dimension: "mass", factor: 1000, target: 100 },
  ml: { dimension: "volume", factor: 1, target: 100 },
  l: { dimension: "volume", factor: 1000, target: 100 },
  ea: { dimension: "count", factor: 1, target: 1 },
  each: { dimension: "count", factor: 1, target: 1 },
  sheet: { dimension: "count", factor: 1, target: 1 },
  sheets: { dimension: "count", factor: 1, target: 1 },
  pack: { dimension: "count", factor: 1, target: 1 },
  pk: { dimension: "count", factor: 1, target: 1 },
  m: { dimension: "length", factor: 1, target: 1 },
};

function parseUnitReference(raw) {
  const match = String(raw || "").trim().match(UNIT_REFERENCE);
  if (!match) return null;
  const amount = Number(match[1]);
  const suffix = match[2].trim().toLowerCase();
  const suffixMatch = suffix.match(UNIT_SUFFIX);
  if (!(amount > 0) || !suffixMatch) return null;
  const quantity = Number(suffixMatch[1] || 1);
  const kind = UNIT_KINDS[suffixMatch[2].toLowerCase()];
  if (!(quantity > 0) || !kind) return null;
  const baseQuantity = quantity * kind.factor;
  const label = suffix.replace(/(\d)ml$/i, "$1mL").replace(/(\d)l$/i, "$1L");
  return {
    amount,
    label,
    dimension: kind.dimension,
    sortValue: (amount / baseQuantity) * kind.target,
  };
}

function unitFromSize(product, price) {
  if (!Number.isFinite(price)) return null;
  const size = String(product?.size || "").trim();
  if (/^(?:ea|each)$/i.test(size)) {
    return {
      value: price,
      label: "each",
      dimension: "count",
      display: `${money.format(price)}/each`,
      sortValue: price,
    };
  }
  const multi = size.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/i);
  if (multi) {
    const count = Number(multi[1]);
    const amount = Number(multi[2]);
    const unit = multi[3].toLowerCase();
    const total = count * amount * (unit === "kg" || unit === "l" ? 1000 : 1);
    if (count > 0 && total > 0) {
      const value = (price / total) * 100;
      const label = unit === "kg" || unit === "g" ? "100g" : "100ml";
      return {
        value,
        label,
        dimension: unit === "kg" || unit === "g" ? "mass" : "volume",
        display: `${money.format(value)}/${label}`,
        sortValue: value,
      };
    }
  }
  const match = size.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!(amount > 0)) return null;
  if (unit === "kg" || unit === "g") {
    const grams = amount * (unit === "kg" ? 1000 : 1);
    const value = (price / grams) * 100;
    return {
      value,
      label: "100g",
      dimension: "mass",
      display: `${money.format(value)}/100g`,
      sortValue: value,
    };
  }
  if (unit === "l" || unit === "ml") {
    const millilitres = amount * (unit === "l" ? 1000 : 1);
    const value = (price / millilitres) * 100;
    return {
      value,
      label: "100ml",
      dimension: "volume",
      display: `${money.format(value)}/100ml`,
      sortValue: value,
    };
  }
  if (unit === "pack" || unit === "pk" || unit === "each" || unit === "ea") {
    const count = unit === "pack" || unit === "pk" ? amount : 1;
    const value = price / count;
    return {
      value,
      label: "each",
      dimension: "count",
      display: `${money.format(value)}/each`,
      sortValue: value,
    };
  }
  return null;
}

function unitPriceFromReference(reference, price, basePrice) {
  if (!reference || !(basePrice > 0) || !Number.isFinite(price)) return null;
  const ratio = price / basePrice;
  const value = reference.amount * ratio;
  if (!Number.isFinite(value) || value <= 0) return null;
  return {
    value,
    label: reference.label,
    dimension: reference.dimension,
    display: `${money.format(value)}/${reference.label}`,
    sortValue: reference.sortValue * ratio,
  };
}

function unitPriceFor(product, store) {
  if (!product || !store) return null;
  const price = priceFor(product.id, store.id);
  if (price == null) return null;
  const catalogueId =
    product.source === "catalogue"
      ? product.id
      : DEMO_SKU_IDS.get(product.id)?.[store.chain];
  const reference = catalogueId ? parseUnitReference(ZONE_UNITS[store.zone]?.[catalogueId]) : null;
  const basePrice = catalogueId ? ZONE_PRICES[store.zone]?.[catalogueId] : null;
  return unitPriceFromReference(reference, price, basePrice) || unitFromSize(product, price);
}

function baseUnitPriceFor(product) {
  if (!product) return null;
  if (product.source === "catalogue") {
    for (const zone of product.catalogueZones || []) {
      const reference = parseUnitReference(ZONE_UNITS[zone]?.[product.id]);
      const price = ZONE_PRICES[zone]?.[product.id];
      if (reference && price > 0) return unitPriceFromReference(reference, price, price);
    }
  }
  const demoSkus = DEMO_SKU_IDS.get(product.id);
  if (demoSkus) {
    for (const zone of ZONE_KEYS) {
      const chain = zone.startsWith("pns") ? "pns" : "nw";
      const sku = demoSkus[chain];
      const reference = sku ? parseUnitReference(ZONE_UNITS[zone]?.[sku]) : null;
      const price = sku ? ZONE_PRICES[zone]?.[sku] : null;
      if (reference && price > 0) return unitPriceFromReference(reference, price, price);
    }
  }
  return unitFromSize(product, product.base);
}

function unitPriceForProduct(product) {
  const best = bestOffer(product.id);
  return best ? unitPriceFor(product, best.store) : baseUnitPriceFor(product);
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
    return roundPrice(current * (1 + drift + jitter));
  });
  values[values.length - 1] = current;
  return values;
}

/* ---------- GTIN barcodes ---------- */

/* GTIN check digit, used for EAN-8, UPC-A and EAN-13. We only render a
   barcode when the check digit is valid, so a store's internal code (or a
   produce PLU) can never be presented as a scannable product barcode. */
function gtinCheckDigit(base) {
  let sum = 0;
  let weight = 3;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += Number(base[index]) * weight;
    weight = 4 - weight;
  }
  return (10 - (sum % 10)) % 10;
}

/* Normalise a real GTIN to the 8- or 13-digit form the SVG encoders use.
   UPC-A (12 digits) is an EAN-13 with a leading zero; 14-digit GTINs are
   padded and lose their leading zeroes. */
function normalizeGtin(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 14) digits = digits.replace(/^0+/, "");
  if (digits.length === 12) digits = `0${digits}`;
  if (digits.length !== 8 && digits.length !== 13) return "";
  const check = gtinCheckDigit(digits.slice(0, -1));
  return Number(digits.charAt(digits.length - 1)) === check ? digits : "";
}

/* EAN-13 and EAN-8 encoding for the scannable barcode in the product dialog. */
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

function barcodeSvg(raw) {
  const code = normalizeGtin(raw);
  if (!code) return "";
  const ean8 = code.length === 8;
  let bits = "101";
  let guardStart = 45;
  let guardEnd = 50;

  if (ean8) {
    for (let index = 0; index < 4; index += 1) bits += EAN13_L[Number(code[index])];
    bits += "01010";
    for (let index = 4; index < 8; index += 1) bits += EAN13_R[Number(code[index])];
    bits += "101";
    guardStart = 31;
    guardEnd = 36;
  } else {
    const parity = EAN13_PARITY[Number(code[0])];
    for (let index = 0; index < 6; index += 1) {
      const digit = Number(code[index + 1]);
      bits += parity[index] === "L" ? EAN13_L[digit] : EAN13_G[digit];
    }
    bits += "01010";
    for (let index = 7; index < 13; index += 1) {
      bits += EAN13_R[Number(code[index])];
    }
    bits += "101";
  }

  const quiet = 11;
  const module = 95 / bits.length;
  const bars = [...bits]
    .map((bit, index) => {
      if (bit !== "1") return "";
      const guard = index < 3 || (index >= guardStart && index < guardEnd) || index >= bits.length - 3;
      return `<rect x="${(quiet + index * module).toFixed(3)}" y="3" width="${module.toFixed(3)}" height="${guard ? 58 : 52}"/>`;
    })
    .join("");

  const kind = ean8 ? "EAN-8" : "EAN-13";
  return `<svg class="barcode-card__svg" viewBox="0 0 117 72" role="img" aria-label="${kind} barcode ${code}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="117" height="72" fill="#fff"/><g fill="#000">${bars}</g><text x="58.5" y="68" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="7" letter-spacing="1.1">${code}</text></svg>`;
}

function barcodeCard(product) {
  const code = normalizeGtin(product.code);
  const svg = code ? barcodeSvg(code) : "";
  if (!svg) return "";
  const kind = code.length === 8 ? "EAN-8" : "EAN-13";
  return `
    <section class="barcode-card" aria-label="${kind} barcode">
      <div class="barcode-card__head">
        <span class="barcode-card__title">${kind} barcode</span>
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

function bestBasketOffer(productId, qty) {
  const inBasket = state.list.some((row) => row.id === productId);
  const offers = selectedStores()
    .map((store) => {
      let pricing;
      if (inBasket) {
        pricing = basketPricingAtStore(store).find((row) => row.productId === productId);
      } else {
        pricing = basketLinePricing(productId, store, qty);
      }
      return pricing && !pricing.missing ? { store, ...pricing, qty } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.total - b.total);
  return offers.length ? offers[0] : null;
}

let PRODUCT_SEARCH_FIELDS = new WeakMap();

function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\.(?!\d)/g, " ")
    .replace(/(^|\s)\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productSearchFields(product) {
  let fields = PRODUCT_SEARCH_FIELDS.get(product);
  if (fields) return fields;

  const name = normalizeSearchValue(product.name);
  const brand = normalizeSearchValue(product.brand);
  const category = normalizeSearchValue(product.category);
  const subcategory = normalizeSearchValue(product.subcategory);
  const rawSize = String(product.size || "").trim();
  const size = normalizeSearchValue(rawSize);
  const spacedSize = normalizeSearchValue(
    rawSize.replace(/^(\d+(?:\.\d+)?)([a-zA-Z]+)$/, "$1 $2")
  );
  const meta = normalizeSearchValue([category, subcategory, size, spacedSize].filter(Boolean).join(" "));
  const staple = STAPLE_IDS.has(product.id);
  // Curated staples carry their type in their id (milk-2l, cheese-1kg) but do
  // not always have a subcategory, so use those words as search keywords.
  const keywords = staple ? normalizeSearchValue(product.id.replace(/-/g, " ")) : "";
  const code = normalizeGtin(product.code);
  const words = (value) => value.split(" ").filter(Boolean);

  fields = {
    name,
    brand,
    meta,
    code,
    staple,
    nameWords: words(name),
    brandWords: words(brand),
    categoryWords: words(category),
    subcategoryWords: words(subcategory),
    keywordWords: words(keywords),
    metaWords: words(meta),
  };
  PRODUCT_SEARCH_FIELDS.set(product, fields);
  return fields;
}

let SEARCH_VOCABULARY = null;
const SEARCH_SUGGESTION_STOP_WORDS = new Set([
  "and",
  "the",
  "with",
  "for",
  "from",
  "each",
  "pack",
  "packs",
  "style",
  "flavour",
  "flavor",
  "original",
]);

function addSearchWord(counts, word, weight) {
  if (word.length < 3 || /^\d/.test(word) || SEARCH_SUGGESTION_STOP_WORDS.has(word)) return;
  counts.set(word, (counts.get(word) || 0) + weight);
}

/* Built only when a search needs a correction, so ordinary searches do not
   pay the vocabulary cost. Name words weigh more than brand or aisle words. */
function searchVocabulary() {
  if (SEARCH_VOCABULARY) return SEARCH_VOCABULARY;
  const counts = new Map();
  for (const product of PRODUCTS) {
    const fields = productSearchFields(product);
    for (const word of fields.nameWords) addSearchWord(counts, word, 3);
    for (const word of fields.brandWords) addSearchWord(counts, word, 1);
    for (const word of fields.categoryWords) addSearchWord(counts, word, 1);
    for (const word of fields.subcategoryWords) addSearchWord(counts, word, 1);
  }
  SEARCH_VOCABULARY = counts;
  return counts;
}

/* One edit for ordinary words; two for longer words, where a single missed
   letter is less likely to collide with another real word. */
function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

function bestSpelling(term, vocabulary) {
  const maxDistance = term.length === 4 || term.length >= 7 ? 2 : 1;
  const preferFrequency = term.length <= 4;
  let best = null;
  for (const [word, count] of vocabulary) {
    if (Math.abs(word.length - term.length) > maxDistance) continue;
    const distance = editDistance(term, word);
    if (distance < 1 || distance > maxDistance) continue;
    if (
      !best ||
      (preferFrequency
        ? count > best.count || (count === best.count && distance < best.distance)
        : distance < best.distance ||
          (distance === best.distance && count > best.count) ||
          (distance === best.distance && count === best.count && word.length < best.word.length))
    ) {
      best = { word, distance, count };
    }
  }
  return best;
}

function suggestSearchQuery(query) {
  if (query.barcode || !query.terms.length) return "";
  const vocabulary = searchVocabulary();
  const terms = [];
  let changed = false;
  for (const term of query.terms) {
    if (
      term.length < 3 ||
      /^\d/.test(term) ||
      SEARCH_SUGGESTION_STOP_WORDS.has(term) ||
      vocabulary.has(term)
    ) {
      terms.push(term);
      continue;
    }
    const best = bestSpelling(term, vocabulary);
    terms.push(best ? best.word : term);
    if (best) changed = true;
  }
  return changed ? terms.join(" ") : "";
}

function parseProductSearch(value) {
  const raw = String(value || "").trim();
  const normalized = normalizeSearchValue(raw);
  const digits = raw.replace(/\D/g, "");
  const barcode =
    raw && /^[\d\s-]+$/.test(raw) && digits.length >= 8 ? normalizeGtin(digits) : "";
  return {
    raw,
    active: Boolean(raw),
    normalized,
    terms: normalized ? normalized.split(" ") : [],
    barcode,
  };
}

function wordMatchesTerm(word, term) {
  return word === term || word.startsWith(term) || (term.length >= 4 && word.includes(term));
}

function searchTermScore(words, term, exact, prefix, inside) {
  if (words.includes(term)) return exact;
  if (words.some((word) => word.startsWith(term))) return prefix;
  if (term.length >= 4 && words.some((word) => word.includes(term))) return inside;
  return 0;
}

function hasSearchPhrase(haystack, phrase) {
  return Boolean(phrase) && ` ${haystack} `.includes(` ${phrase} `);
}

function productMatchesSearch(fields, query) {
  if (query.barcode) return fields.code.includes(query.barcode);
  if (!query.terms.length) return false;
  return query.terms.every(
    (term) =>
      fields.nameWords.some((word) => wordMatchesTerm(word, term)) ||
      fields.brandWords.some((word) => wordMatchesTerm(word, term)) ||
      fields.keywordWords.some((word) => wordMatchesTerm(word, term)) ||
      fields.categoryWords.includes(term) ||
      fields.metaWords.some((word) => wordMatchesTerm(word, term)) ||
      (fields.code && fields.code.includes(term))
  );
}

/* Returns -1 when a product does not match, otherwise a relevance score. */
function productSearchScore(product, query) {
  const fields = productSearchFields(product);
  if (!query.active) return 0;
  if (query.barcode) {
    if (fields.code === query.barcode) return 1000;
    if (fields.code.startsWith(query.barcode)) return 500;
    if (fields.code.includes(query.barcode)) return 250;
    return -1;
  }
  if (!query.terms.length || !productMatchesSearch(fields, query)) return -1;

  let score = fields.staple ? 500 : 0;
  if (fields.name === query.normalized) score += 700;
  else if (fields.name.startsWith(`${query.normalized} `)) score += 300;
  else if (hasSearchPhrase(fields.name, query.normalized)) score += 120;
  if (fields.brand === query.normalized) score += 200;
  else if (fields.brand.startsWith(`${query.normalized} `)) score += 80;

  let nameHits = 0;
  for (const term of query.terms) {
    const nameScore = searchTermScore(fields.nameWords, term, 80, 45, 15);
    if (nameScore) nameHits += 1;
    score += nameScore;
    score += searchTermScore(fields.brandWords, term, 22, 12, 5);
    score += searchTermScore(fields.keywordWords, term, 600, 200, 50);
    score += searchTermScore(fields.metaWords, term, 8, 5, 2);
    if (fields.categoryWords.includes(term)) score += 150;
    if (fields.subcategoryWords.includes(term)) score += 400;
  }
  if (nameHits === query.terms.length) score += 100;
  if (fields.code && fields.code.includes(query.normalized.replace(/\s+/g, ""))) score += 80;
  return score;
}

function findMatchingProducts(query) {
  const matches = [];
  for (const product of PRODUCTS) {
    if (state.category !== "All" && product.category !== state.category) continue;
    if (!query.active) {
      matches.push({ product, score: 0 });
      continue;
    }
    const score = productSearchScore(product, query);
    if (score >= 0) matches.push({ product, score });
  }
  if (query.active) {
    matches.sort(
      (a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, "en-NZ")
    );
  }
  return matches.map((match) => match.product);
}

function visibleProducts() {
  const query = parseProductSearch(el.search.value || "");
  const products = findMatchingProducts(query);
  let correction = null;
  if (query.active && !query.barcode && !products.length) {
    const suggestion = suggestSearchQuery(query);
    if (suggestion) {
      const correctedProducts = findMatchingProducts(parseProductSearch(suggestion));
      correction = { suggestion, applied: correctedProducts.length > 0 };
      if (correctedProducts.length) return { products: correctedProducts, correction };
    }
  }
  return { products, correction };
}

function listTotals() {
  const stores = selectedStores();
  if (!stores.length || !state.list.length) return null;
  const rows = stores.map((store) => {
    const lines = basketPricingAtStore(store);
    const missing = lines.filter((line) => line.missing).length;
    const total = lines.reduce((sum, line) => sum + (line.total || 0), 0);
    const dealSavings = lines.reduce((sum, line) => sum + (line.savings || 0), 0);
    return {
      store,
      total: Math.round(total * 100) / 100,
      missing,
      available: missing === 0,
      dealSavings: Math.round(dealSavings * 100) / 100,
      groups: assortedGroups(lines),
      clubDealAvailable: lines.some((line) => line.clubDealAvailable),
      clubDealApplied: lines.some((line) => line.dealApplied && line.deal?.club),
    };
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

function storeRegionLabel(store) {
  return store.region === "SI" ? "South Island" : "North Island";
}

function storeLabel(store) {
  return store ? `${store.name} · ${store.branch}` : "";
}

function storeLineLabel(store) {
  const lines = stockedLineCount(store);
  return lines == null ? "lines not checked" : `${lines.toLocaleString("en-NZ")} lines`;
}

function normalizeStoreSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function storeSearchMatches(query) {
  const terms = normalizeStoreSearch(query).split(/\s+/).filter(Boolean);
  const first = terms[0] || "";
  return BRANCH_STORES.filter((store) => {
    const aliases = store.chain === "pns" ? "paknsave pak n save pns" : "new world newworld nw";
    const haystack = normalizeStoreSearch(
      `${store.name} ${store.branch} ${store.address} ${storeRegionLabel(store)} ${aliases}`
    );
    return terms.every((term) => haystack.includes(term));
  }).sort((a, b) => {
    const aBranch = normalizeStoreSearch(a.branch);
    const bBranch = normalizeStoreSearch(b.branch);
    const aStart = aBranch.startsWith(first) ? 0 : 1;
    const bStart = bBranch.startsWith(first) ? 0 : 1;
    return (
      aStart - bStart ||
      aBranch.localeCompare(bBranch, "en-NZ") ||
      a.name.localeCompare(b.name, "en-NZ")
    );
  });
}

function renderStoreResults() {
  const query = (el.storeSearch.value || "").trim();
  if (!query) {
    el.storeResults.hidden = true;
    el.storeResults.innerHTML = "";
    return;
  }

  el.storeResults.hidden = false;
  if (query.length < 2) {
    el.storeResults.innerHTML = `<li class="store-results__note">Type at least two characters.</li>`;
    return;
  }

  const matches = storeSearchMatches(query);
  if (!matches.length) {
    el.storeResults.innerHTML = `<li class="store-results__note">No branches match “${escapeHtml(query)}”. Try a suburb or region.</li>`;
    return;
  }

  const shown = matches.slice(0, 12);
  el.storeResults.innerHTML =
    shown
      .map((store) => {
        const on = state.stores.includes(store.id);
        return `
          <li>
            <button class="store-result${on ? " is-added" : ""}" type="button" data-add-store="${store.id}"${on ? " disabled" : ""}>
              <span class="store-chip__dot" style="--dot:${store.tint}"></span>
              <span class="store-result__body">
                <b>${escapeHtml(store.name)} · ${escapeHtml(store.branch)}</b>
                <small>${escapeHtml(storeRegionLabel(store))} · ${escapeHtml(storeLineLabel(store))}</small>
              </span>
              <span class="store-result__action">${on ? "Added" : "Add"}</span>
            </button>
          </li>`;
      })
      .join("") +
    (matches.length > shown.length
      ? `<li class="store-results__note">Showing ${shown.length} of ${matches.length.toLocaleString("en-NZ")} matches — keep typing to narrow it.</li>`
      : "");
}

function renderTabs() {
  el.tabStoreCount.textContent = String(state.stores.length);
  el.tabStoreCount.hidden = state.stores.length === 0;
  el.tabListCount.textContent = String(state.list.length);
  el.tabListCount.hidden = state.list.length === 0;
}

function setTab(tab, { persist = false } = {}) {
  if (!TAB_IDS.includes(tab)) return;
  for (const button of el.tabButtons) {
    const active = button.dataset.tab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const panel of el.tabPanels) {
    panel.classList.toggle("is-active", panel.dataset.tabPanel === tab);
  }
  if (persist) {
    state.tab = tab;
    saveState();
  }
}

function renderStores() {
  const selected = state.stores.map((id) => STORE_MAP.get(id)).filter(Boolean);
  el.storeList.innerHTML = selected.length
    ? selected
        .map((store) => {
          const priceStatus = BASE_STORE_IDS.has(store.storeId)
            ? "ready"
            : STORE_PRICE_CACHE.get(store.storeId)?.status || "loading";
          const priceNote =
            priceStatus === "loading"
              ? `<small class="store-selected__prices">Loading branch prices…</small>`
              : priceStatus === "error"
                ? `<small class="store-selected__prices is-error">Island price list — branch prices unavailable</small>`
                : "";
          return `
          <li class="store-selected" data-price-status="${priceStatus}">
            <span class="store-chip__dot" style="--dot:${store.tint}"></span>
            <span class="store-chip__body">
              <b>${escapeHtml(store.name)}</b>
              <small>${escapeHtml(store.branch)} · ${escapeHtml(storeRegionLabel(store))} · ${escapeHtml(storeLineLabel(store))}</small>
              ${priceNote}
            </span>
            <button class="store-selected__remove" type="button" data-remove-store="${store.id}" aria-label="Remove ${escapeHtml(store.name)} ${escapeHtml(store.branch)}" title="Remove">×</button>
          </li>`;
        })
        .join("")
    : `<li class="store-empty">No stores selected. Search for a branch above to start.</li>`;

  el.storeCounter.textContent = `${selected.length} / ${storeCap()}`;
  el.storeHint.textContent = selected.length
    ? selected.length === 1
      ? "Add another branch to compare, including another PAK'nSAVE or New World."
      : "Search to add another branch, or remove one below."
    : "Search for a PAK'nSAVE or New World branch to start.";
  el.storeFoot.textContent = state.pro
    ? `Pro demo: up to ${MAX_PRO_STORES} stores.`
    : `Free demo covers ${MAX_FREE_STORES} stores. Turn on Pro for ${MAX_PRO_STORES}.`;
  el.storeFoot.classList.toggle("is-pro", state.pro);
  renderStoreResults();
  renderTabs();
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

function sortProducts(products) {
  if (state.sort === "relevance") return products;
  const hasStores = selectedStores().length > 0;
  const keys = new Map();
  const keyFor = (product) => {
    if (keys.has(product)) return keys.get(product);
    let key = null;
    if (state.sort === "price") {
      if (!hasStores) key = product.base;
      else {
        const best = bestOffer(product.id);
        key = best ? best.price : null;
      }
    } else if (state.sort === "unit") {
      if (hasStores) {
        const best = bestOffer(product.id);
        const unit = best ? unitPriceFor(product, best.store) : null;
        key = unit ? unit.sortValue : null;
      } else {
        const unit = unitPriceForProduct(product);
        key = unit ? unit.sortValue : null;
      }
    }
    keys.set(product, key);
    return key;
  };
  return [...products].sort((a, b) => {
    const aKey = keyFor(a);
    const bKey = keyFor(b);
    if (aKey == null && bKey == null) return a.name.localeCompare(b.name, "en-NZ");
    if (aKey == null) return 1;
    if (bKey == null) return -1;
    return aKey - bKey || a.name.localeCompare(b.name, "en-NZ");
  });
}

function renderProducts() {
  const searchResult = visibleProducts();
  const allProducts = searchResult.products;
  const correction = searchResult.correction;
  const products = sortProducts(allProducts).slice(0, visibleLimit);
  const stores = selectedStores();
  const pricesLoading = stores.some((store) => !storePricesReady(store));

  el.productGrid.innerHTML = products
    .map((product) => {
      const best = bestOffer(product.id);
      const bestKind = best ? priceKind(product.id, best.store.id) : null;
      const bestDeal = best ? storeDealFor(product.id, best.store) : null;
      const unit = best ? unitPriceFor(product, best.store) : null;
      const unavailableStores = stores.filter((store) => knownUnavailable(product.id, store.id));
      const prices = stores.map((store) => priceFor(product.id, store.id)).filter((price) => price != null);
      const range = prices.length > 1 ? ` · ${money.format(Math.min(...prices))}–${money.format(Math.max(...prices))}` : "";
      const priceSummary = best
        ? `, ${money.format(best.price)} at ${storeLabel(best.store)}${unit ? `, ${unit.display}` : ""}`
        : pricesLoading
          ? ", prices loading"
          : stores.length
            ? ", not stocked"
            : ", no stores selected";
      return `
        <li class="product">
          <button class="product__open" type="button" data-product="${product.id}" aria-label="View prices for ${escapeHtml(product.name)}${escapeHtml(priceSummary)}">
            ${product.image ? `<img class="product__thumb" src="${escapeHtml(product.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="56" height="56" />` : ""}
            <span class="product__body">
              <span class="product__name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</span>
              <span class="product__meta">${escapeHtml(product.size)} · ${escapeHtml(product.category)}${product.subcategory ? ` · ${escapeHtml(product.subcategory)}` : ""}${product.source === "grocer" && product.stores ? ` · at ${product.stores} stores` : ""}</span>
              <span class="product__best">
                ${best ? `<b class="product__price">${money.format(best.price)}${bestKind === "checked" ? ' <em class="product__est is-real">checked</em>' : bestKind === "imported" ? ' <em class="product__est is-real">imported</em>' : product.estimated ? ' <em class="product__est">est.</em>' : ""}</b><small>${escapeHtml(storeLabel(best.store))}</small>` : `<b>—</b><small>${pricesLoading ? "loading prices…" : stores.length ? "not stocked" : "no stores selected"}</small>`}
              </span>
              <span class="product__range">${best ? `${prices.length} store${prices.length === 1 ? "" : "s"}${range}` : pricesLoading ? "Loading branch prices…" : stores.length ? "Not stocked at your selected stores" : "Choose a store to price this"}</span>
              ${unit ? `<span class="product__unit">${escapeHtml(unit.display)}</span>` : ""}
              ${bestDeal ? `<span class="product__deal" title="${escapeHtml(dealDetail(bestDeal))}">${escapeHtml(dealSummary(bestDeal))}</span>` : ""}
              ${unavailableStores.length ? `<span class="product__stock">Not at ${unavailableStores.map((store) => escapeHtml(storeLabel(store))).join(" & ")}</span>` : ""}
            </span>
          </button>
          <button class="product__add" type="button" data-add="${product.id}" aria-label="Add ${escapeHtml(product.name)} (${escapeHtml(product.size || "size not listed")}) to list">Add to list</button>
        </li>`;
    })
    .join("");

  const searchTerm = (el.search.value || "").trim();
  const resultTerm = correction?.applied ? correction.suggestion : searchTerm;
  const queryLabel = resultTerm
    ? ` for “${resultTerm.length > 40 ? `${resultTerm.slice(0, 40)}…` : resultTerm}”`
    : "";
  if (el.searchSuggestion) {
    el.searchSuggestion.hidden = !correction;
    if (correction) {
      const label =
        correction.suggestion.length > 40
          ? `${correction.suggestion.slice(0, 40)}…`
          : correction.suggestion;
      el.searchSuggestionLead.textContent = correction.applied
        ? `No exact matches for “${searchTerm.length > 32 ? `${searchTerm.slice(0, 32)}…` : searchTerm}”. Did you mean`
        : "Did you mean";
      el.searchSuggestionButton.textContent = `“${label}”`;
      el.searchSuggestionButton.dataset.query = correction.suggestion;
      el.searchSuggestionButton.setAttribute("aria-label", `Search for ${correction.suggestion}`);
    }
  }
  const grocerActive = grocerStatus !== "idle";
  el.emptyProducts.hidden = allProducts.length > 0 || grocerActive;
  if (!el.emptyProducts.hidden) {
    el.emptyProducts.textContent = searchTerm
      ? `No products match “${searchTerm.length > 60 ? `${searchTerm.slice(0, 60)}…` : searchTerm}”. Try fewer or different words, or a barcode.`
      : "Nothing matches that search. Try “milk”, “cheese”, “coffee”, or a barcode from the demo catalogue.";
  }
  el.resultsLine.textContent = allProducts.length
    ? `${allProducts.length.toLocaleString("en-NZ")} product${allProducts.length === 1 ? "" : "s"}${queryLabel}${state.category !== "All" ? ` in ${state.category}` : ""} · showing ${products.length.toLocaleString("en-NZ")}${stores.length ? ` · priced at ${stores.length} store${stores.length === 1 ? "" : "s"}` : ""}`
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
  const barcodeLike = /^[\d\s-]+$/.test((el.search.value || "").trim()) && query.length >= 8 && query.length <= 14;
  const barcodePending = barcodeLike && (GTINS_STATE === "idle" || GTINS_STATE === "loading");
  const offerLookup = allProducts.length === 0 && barcodeLike;
  el.offLookup.hidden = !offerLookup || barcodePending;
  if (offerLookup && !barcodePending) {
    el.offLookupText.textContent = `Barcode ${query} isn't in the demo catalogue.`;
    el.offLookupButton.disabled = false;
  }
  if (barcodePending && !allProducts.length) {
    el.emptyProducts.textContent = "Checking the demo catalogue for that barcode…";
  }
}

function listItemDetails(row, stores, pricesLoading) {
  const product = PRODUCT_MAP.get(row.id);
  if (!product) return null;
  const best = bestBasketOffer(row.id, row.qty);
  const bestKind = best ? priceKind(row.id, best.store.id) : null;
  const unit = best ? unitPriceFor(product, best.store) : null;
  const pricePending = !best && pricesLoading;
  const missing = stores.length > 0 && !best && !pricesLoading;
  const special = stores.some((store) => storeDealFor(row.id, store));
  const category = product.category || "Other";
  return { row, product, best, bestKind, unit, missing, pricePending, special, category };
}

function listItemSearchText(item) {
  const { product, category } = item;
  return normalizeSearchValue(
    [product.name, product.brand, category, product.size].filter(Boolean).join(" ")
  );
}

function listItemMarkup(item) {
  const { row, product, best, bestKind, unit, missing, pricePending } = item;
  return `
    <li class="list-item" data-row="${row.id}">
      <button class="list-item__body" type="button" data-open-product="${row.id}" title="View prices for ${escapeHtml(product.name)}" aria-label="View prices for ${escapeHtml(product.name)}">
        <b>${escapeHtml(product.name)}</b>
        <small>${escapeHtml(product.size)}${best ? ` · ${bestKind} from <span class="list-item__price">${money.format(best.shelfPrice)}</span> at ${escapeHtml(storeLabel(best.store))}` : pricePending ? " · loading prices…" : missing ? " · not stocked at your stores" : ""}</small>
        ${unit ? `<small class="list-item__unit">${escapeHtml(unit.display)}</small>` : ""}
        ${best?.dealApplied ? `<small class="list-item__deal">${escapeHtml(dealLabel(best.deal))} applied${best.deal.limit ? ` · ${escapeHtml(dealLimitLabel(best.deal))}` : ""} · save ${money.format(best.savings)}</small>` : ""}
      </button>
      <span class="qty">
        <button type="button" data-step="-1" data-id="${row.id}" aria-label="Decrease quantity of ${escapeHtml(product.name)}">−</button>
        <output aria-label="Quantity">${row.qty}</output>
        <button type="button" data-step="1" data-id="${row.id}" aria-label="Increase quantity of ${escapeHtml(product.name)}">+</button>
      </span>
      <button class="list-item__remove" type="button" data-remove="${row.id}" aria-label="Remove ${escapeHtml(product.name)}">×</button>
    </li>`;
}

function resetListFilters({ focus = false } = {}) {
  listFilters.query = "";
  listFilters.category = "all";
  listFilters.status = "all";
  if (el.listFilter) el.listFilter.value = "";
  renderList();
  if (focus && el.listFilter) el.listFilter.focus({ preventScroll: true });
}

function renderList() {
  const stores = selectedStores();
  const pricesLoading = stores.some((store) => !storePricesReady(store));
  if (!state.list.length) {
    listFilters.query = "";
    listFilters.category = "all";
    listFilters.status = "all";
    if (el.listFilter) el.listFilter.value = "";
  }

  const items = state.list.map((row) => listItemDetails(row, stores, pricesLoading)).filter(Boolean);
  const categories = new Map();
  for (const item of items) {
    categories.set(item.category, (categories.get(item.category) || 0) + 1);
  }
  if (listFilters.category !== "all" && !categories.has(listFilters.category)) {
    listFilters.category = "all";
  }
  if (listFilters.status === "missing" && !stores.length) {
    listFilters.status = "all";
  }
  if (!LIST_FILTER_STATUSES.includes(listFilters.status)) listFilters.status = "all";

  const terms = normalizeSearchValue(listFilters.query).split(/\s+/).filter(Boolean);
  const filtered = items.filter((item) => {
    if (listFilters.category !== "all" && item.category !== listFilters.category) {
      return false;
    }
    if (listFilters.status === "special" && !item.special) return false;
    if (listFilters.status === "missing" && !item.missing) return false;
    if (terms.length) {
      const haystack = listItemSearchText(item);
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });
  const filtersActive =
    Boolean(terms.length) || listFilters.category !== "all" || listFilters.status !== "all";
  const counts = {
    all: items.length,
    special: items.filter((item) => item.special).length,
    missing: items.filter((item) => item.missing).length,
  };

  el.listItems.innerHTML = filtered.map(listItemMarkup).join("");
  el.listTools.hidden = items.length === 0;
  el.emptyList.hidden = state.list.length > 0;
  el.clearList.hidden = state.list.length === 0;
  el.receiptButton.hidden = state.list.length === 0;
  el.bulkButton.hidden = state.list.length === 0;

  if (el.listFilter) {
    if (el.listFilter.value !== listFilters.query) el.listFilter.value = listFilters.query;
    el.listFilterReset.hidden = !filtersActive;
  }

  if (el.listFilterStatus) {
    if (!items.length) el.listFilterStatus.textContent = "";
    else if (filtersActive && filtered.length) {
      el.listFilterStatus.textContent = `Showing ${filtered.length} of ${items.length} items. Totals include all ${items.length}.`;
    } else if (filtersActive) {
      el.listFilterStatus.textContent = `No matches. Totals still include all ${items.length} items.`;
    } else {
      el.listFilterStatus.textContent = `${items.length} item${items.length === 1 ? "" : "s"} · filter by name, category or status.`;
    }
  }

  if (el.listFilterEmpty) {
    el.listFilterEmpty.hidden = !filtersActive || filtered.length > 0 || items.length === 0;
  }

  if (el.listCategoryFilter) {
    const options = [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0], "en-NZ"));
    const optionsKey = options.map(([name, count]) => `${name}:${count}`).join("|");
    if (el.listCategoryFilter.dataset.optionsKey !== optionsKey) {
      el.listCategoryFilter.innerHTML =
        `<option value="all">All categories (${items.length})</option>` +
        options
          .map(
            ([name, count]) =>
              `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${count})</option>`
          )
          .join("");
      el.listCategoryFilter.dataset.optionsKey = optionsKey;
    }
    el.listCategoryFilter.value = listFilters.category;
  }

  for (const button of el.listStatusButtons) {
    const status = button.dataset.listStatus;
    if (!LIST_FILTER_STATUSES.includes(status)) continue;
    const countNode = button.querySelector("[data-list-count]");
    if (countNode) countNode.textContent = String(counts[status]);
    const active = listFilters.status === status;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.hidden = status === "missing" && !stores.length;
    button.disabled = status !== "all" && counts[status] === 0 && !active;
  }

  renderTabs();
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
      ? `Only ${escapeHtml(storeLabel(totals.cheapest.store))} has a price for every item on this list.`
      : totals.savings > 0.004
        ? `Save ${money.format(totals.savings)} shopping at ${escapeHtml(storeLabel(totals.cheapest.store))}.`
        : "Prices are level across your stores for this basket.";
  const bestDealSaving = totals.cheapest?.dealSavings || 0;
  const cheapestGroups = totals.cheapest?.groups || [];
  const assortedMarkup = cheapestGroups.length
    ? `
    <div class="totals__groups">
      <p class="totals__groups-head">Assorted multi-buy at ${escapeHtml(storeLabel(totals.cheapest.store))}</p>
      <ul class="totals-groups">
        ${cheapestGroups
          .map(
            (promo) => `
        <li class="totals-group">
          <p class="totals-group__deal"><b>${escapeHtml(promo.label)}</b> <em>saves ${money.format(promo.savings)}</em></p>
          <p class="totals-group__products">${promo.products.map((entry) => `${escapeHtml(entry.product.name)} ×${entry.qty}`).join(", ")}</p>
          <p class="totals-group__limit">${escapeHtml(groupLimitText(promo))}</p>
        </li>`
          )
          .join("")}
      </ul>
    </div>`
    : "";
  const cardNote =
    !state.clubCard && totals.rows.some((row) => row.clubDealAvailable)
      ? "Club card is off; club prices are not included."
      : state.clubCard && totals.rows.some((row) => row.clubDealApplied)
        ? "Club-card prices applied."
        : state.clubCard && totals.rows.some((row) => row.clubDealAvailable)
          ? "Club-card prices apply at the listed quantity."
          : "";
  el.totals.innerHTML = `
    <h3>Basket total <span>${itemCount} item${itemCount === 1 ? "" : "s"}</span></h3>
    <ul class="total-rows">
      ${totals.rows
        .map((row) => {
          const isBest =
            row.available &&
            totals.cheapest &&
            availableRows.length > 1 &&
            samePrice(row.total, totals.cheapest.total);
          return `
        <li class="total-row${isBest ? " is-best" : ""}${row.available ? "" : " is-unavailable"}">
          <span>${escapeHtml(storeLabel(row.store))}${isBest ? ' <em>cheapest</em>' : ""}${row.available && row.dealSavings > 0.004 ? ` <em class="total-row__deal">saves ${money.format(row.dealSavings)}</em>` : ""}${row.available ? "" : ` <em class="total-row__missing">${row.missing} not stocked</em>`}</span>
          <b>${row.available ? money.format(row.total) : "—"}</b>
        </li>`;
        })
        .join("")}
    </ul>
    <p class="totals__save">${summary}${bestDealSaving > 0.004 ? ` Includes ${money.format(bestDealSaving)} of multi-buy/club savings.` : ""}</p>
    ${assortedMarkup}
    ${cardNote ? `<p class="totals__card">${cardNote}</p>` : ""}`;
}

/* ---------- Basket receipt ---------- */

function receiptGroups() {
  return selectedStores()
    .map((store) => {
      const priced = basketPricingAtStore(store);
      const lines = priced
        .map((pricing) => {
          const product = PRODUCT_MAP.get(pricing.productId);
          if (!product) return null;
          const unavailable = pricing.missing;
          const kind = unavailable ? null : priceKind(pricing.productId, store.id);
          const unit = unavailable ? null : unitPriceFor(product, store);
          return {
            product,
            qty: pricing.qty,
            price: pricing.shelfPrice,
            line: unavailable ? 0 : pricing.total,
            unit,
            deal: pricing.deal || null,
            dealApplied: Boolean(pricing.dealApplied),
            savings: pricing.savings || 0,
            clubDealAvailable: Boolean(pricing.clubDealAvailable),
            checked: kind === "checked",
            imported: kind === "imported",
            unavailable,
          };
        })
        .filter(Boolean);
      const missing = lines.filter((line) => line.unavailable).length;
      const total = lines.reduce((sum, line) => sum + line.line, 0);
      const dealSavings = lines.reduce((sum, line) => sum + (line.savings || 0), 0);
      return {
        store,
        lines,
        total: Math.round(total * 100) / 100,
        dealSavings: Math.round(dealSavings * 100) / 100,
        groups: assortedGroups(priced),
        clubDealAvailable: lines.some((line) => line.clubDealAvailable),
        missing,
        available: missing === 0,
      };
    })
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.available ? a.total - b.total : a.missing - b.missing;
    });
}

function receiptDate() {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Pacific/Auckland",
  }).format(new Date());
}

function receiptSummaryText(groups) {
  const itemCount = listQuantity();
  const availableGroups = groups.filter((group) => group.available);
  const best = availableGroups[0] || null;
  const dearest = availableGroups[availableGroups.length - 1] || null;
  const lines = [
    `Trolleybird demo basket — ${receiptDate()}`,
    `${itemCount} item${itemCount === 1 ? "" : "s"} · ${groups.length} store${groups.length === 1 ? "" : "s"} compared`,
    "",
  ];
  groups.forEach((group) => {
    const status = group.available
      ? `${money.format(group.total)}${best && availableGroups.length > 1 && samePrice(group.total, best.total) ? "  ← cheapest" : ""}`
      : `not available — ${group.missing} item${group.missing === 1 ? "" : "s"} not stocked`;
    lines.push(`${group.store.name} (${group.store.branch}) — ${status}`);
    group.lines.forEach((line) => {
      lines.push(
        `  ${line.qty}× ${line.product.name} ${line.product.size}  ${line.unavailable ? "not stocked" : `${money.format(line.line)}${line.unit ? ` (${line.unit.display})` : ""}${line.dealApplied ? ` (${dealSummary(line.deal)})` : ""}${line.checked ? " ✓" : line.imported ? " (imported)" : ""}`}`
      );
    });
    group.groups.forEach((promo) => {
      const products = promo.products
        .map((entry) => `${entry.product.name} ×${entry.qty}`)
        .join(", ");
      lines.push(`  ${promo.label} (assorted): ${products} — ${groupLimitText(promo)}`);
    });
    if (group.available && group.dealSavings > 0.004) {
      lines.push(`  deals save ${money.format(group.dealSavings)} at this store`);
    }
    lines.push("");
  });
  if (groups.some((group) => !group.available)) {
    lines.push("A store missing an item is shown as not available.");
    lines.push("");
  }
  if (groups.some((group) => group.dealSavings > 0.004)) {
    lines.push("Multi-buy and club-card prices are applied where the quantity qualifies, including assorted offers shared across products.");
    lines.push("");
  }
  if (!state.clubCard && groups.some((group) => group.clubDealAvailable)) {
    lines.push("Club card is off; club prices are not included.");
    lines.push("");
  }
  if (best && dearest && best !== dearest && dearest.total - best.total > 0.004) {
    lines.push(`Save ${money.format(dearest.total - best.total)} shopping at ${storeLabel(best.store)}.`);
    lines.push("");
  }
  lines.push("Demo prices from the Trolleybird interactive demo — not live supermarket data.");
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
  const isBestGroup = (group) =>
    Boolean(best) && group.available && availableGroups.length > 1 && samePrice(group.total, best.total);
  const hasChecked = groups.some((group) => group.lines.some((line) => line.checked));
  const hasImported = groups.some((group) => group.lines.some((line) => line.imported));
  const hasDeals = groups.some((group) => group.dealSavings > 0.004);
  const hasClubDeals = groups.some((group) => group.clubDealAvailable);
  const dealNote = hasDeals
    ? " Multi-buy and club-card prices are applied where the quantity qualifies, including assorted offers shared across products."
    : !state.clubCard && hasClubDeals
      ? " Club card is off; club prices are not included."
      : "";

  el.receiptBody.innerHTML = `
    <div class="receipt-paper">
      <div class="receipt-paper__top">
        <p class="receipt-paper__brand">Trolleybird</p>
        <p class="receipt-paper__meta">${receiptDate()} · Interactive demo<br />Demo prices, not live supermarket data</p>
        <span class="receipt-item-count">${itemCount} item${itemCount === 1 ? "" : "s"} · ${groups.length} store${groups.length === 1 ? "" : "s"}</span>
      </div>

      ${
        groups.length
          ? groups
              .map(
                (group) => `
        <section class="receipt-store${isBestGroup(group) ? " is-best" : ""}${group.available ? "" : " is-unavailable"}" aria-label="${escapeHtml(group.store.name)} basket">
          <div class="receipt-store__head">
            <h3 class="receipt-store__name">${escapeHtml(group.store.name)}<span class="receipt-store__branch">${escapeHtml(group.store.branch)}</span></h3>
            <p class="receipt-store__total">
              ${group.available ? money.format(group.total) : "Not available"}
              ${isBestGroup(group) ? '<span class="receipt-store__badge">Cheapest</span>' : ""}
            </p>
          </div>
          <ul class="receipt-lines">
            ${group.lines
              .map(
                (line) => `
              <li class="receipt-line">
                <span class="receipt-line__qty">${line.qty}×</span>
                <span class="receipt-line__name">${escapeHtml(line.product.name)}<small>${escapeHtml(line.product.size)}</small>${line.unit ? `<small class="receipt-line__unit">${escapeHtml(line.unit.display)}</small>` : ""}${line.dealApplied ? `<small class="receipt-line__deal">${escapeHtml(dealSummary(line.deal))}</small>` : ""}</span>
                <span class="receipt-line__amount${line.unavailable ? " is-missing" : ""}">${line.unavailable ? "Not stocked" : money.format(line.line)}${line.checked ? '<span class="receipt-line__checked" title="Price recorded in store">✓</span>' : line.imported ? '<span class="receipt-line__imported" title="Shelf price imported from the store">imp.</span>' : ""}</span>
              </li>`
              )
              .join("")}
          </ul>
          ${
            group.groups.length
              ? `<div class="receipt-groups">
            <p class="receipt-groups__head">Assorted multi-buy</p>
            <ul class="receipt-groups__list">
              ${group.groups
                .map(
                  (promo) => `
                <li class="receipt-group">
                  <p class="receipt-group__deal">${escapeHtml(promo.label)} <em>saves ${money.format(promo.savings)}</em></p>
                  <p class="receipt-group__products">${promo.products.map((entry) => `${escapeHtml(entry.product.name)} ×${entry.qty}`).join(", ")}</p>
                  <p class="receipt-group__limit">${escapeHtml(groupLimitText(promo))}</p>
                </li>`
                )
                .join("")}
            </ul>
          </div>`
              : ""
          }
          <div class="receipt-store__foot">
            <span>${group.available ? "Basket total" : "Missing items"}${group.available && group.dealSavings > 0.004 ? ` <em class="receipt-store__deal">deals save ${money.format(group.dealSavings)}</em>` : ""}</span>
            <b>${group.available ? money.format(group.total) : `${group.missing} not stocked`}</b>
          </div>
        </section>`
              )
              .join("")
          : `<p class="receipt-empty">Select at least one store to price this basket.</p>`
      }

      ${
        savings > 0.004 && best && dearest
          ? `<p class="receipt-save">Cheapest basket: ${escapeHtml(storeLabel(best.store))} at <b class="receipt-save__price">${money.format(best.total)}</b> — ${money.format(savings)} less than ${escapeHtml(storeLabel(dearest.store))}.</p>`
          : ""
      }

      <p class="receipt-note">${
        hasChecked
          ? `✓ price recorded in store${hasImported ? `; imported shelf prices dated ${importDateLabel()}` : ""}. Other prices are estimates from the Trolleybird interactive demo.`
          : hasImported
            ? `Imported shelf prices dated ${importDateLabel()}. Other prices are estimates from the Trolleybird interactive demo.`
            : "Prices are illustrative demo data from the Trolleybird interactive demo."
      }${dealNote}</p>
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
      title: "Trolleybird demo basket",
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
  el.search.placeholder = `Search ${PRODUCTS.length.toLocaleString("en-NZ")} products…`;
  if (el.sort) el.sort.value = state.sort;
  renderCategories();
  renderProducts();
  renderList();
  renderTotals();
  renderImportBanner();
  el.proToggle.checked = state.pro;
  el.clubToggle.checked = state.clubCard;
  document.body.classList.toggle("is-pro", state.pro);
}

/* ---------- Actions ---------- */

async function ensureStorePrices(storeId) {
  const store = STORE_MAP.get(storeId);
  if (!store || BASE_STORE_IDS.has(store.storeId) || STORE_PRICE_CACHE.has(store.storeId)) {
    return;
  }
  STORE_PRICE_CACHE.set(store.storeId, {
    status: "loading",
    prices: {},
    deals: {},
    checkedAt: "",
  });
  try {
    const res = await fetch(`data/store-prices/${encodeURIComponent(store.storeId)}.json`, {
      cache: "no-cache",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    STORE_PRICE_CACHE.set(store.storeId, {
      status: "ready",
      prices: data && typeof data.prices === "object" ? data.prices : {},
      deals: data && typeof data.deals === "object" ? data.deals : {},
      checkedAt: typeof data?.checkedAt === "string" ? data.checkedAt : "",
    });
  } catch (error) {
    STORE_PRICE_CACHE.set(store.storeId, {
      status: "error",
      prices: {},
      deals: {},
      checkedAt: "",
    });
    console.warn(`Branch prices unavailable for ${storeLabel(store)}`, error);
  }
  if (state.stores.includes(storeId)) renderAll();
}

function addStore(storeId) {
  const store = STORE_MAP.get(storeId);
  if (!store || state.stores.includes(storeId)) return;
  if (state.stores.length >= storeCap()) {
    toast(
      state.pro
        ? `Pro demo is limited to ${MAX_PRO_STORES} stores.`
        : `Free demo is limited to ${MAX_FREE_STORES} stores — turn on Pro.`
    );
    return;
  }
  state.stores = [...state.stores, storeId];
  saveState();
  renderAll();
  void ensureCoverage();
  void ensureStorePrices(storeId);
  el.storeSearch.focus({ preventScroll: true });
  toast(`${store.name} · ${store.branch} added.`);
}

function removeStore(storeId) {
  const store = STORE_MAP.get(storeId);
  if (!store || !state.stores.includes(storeId)) return;
  state.stores = state.stores.filter((id) => id !== storeId);
  saveState();
  renderAll();
  el.storeSearch.focus({ preventScroll: true });
  toast(`${store.name} · ${store.branch} removed.`);
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
  const previous = state.list.map((row) => ({ ...row }));
  state.list = [];
  saveState();
  renderList();
  renderTotals();
  el.listHeading.focus({ preventScroll: true });
  toast("Shopping list cleared.", {
    actionLabel: "Undo",
    duration: 6000,
    onAction: () => {
      const restored = previous.map((row) => ({ ...row }));
      for (const row of state.list) {
        if (!restored.some((item) => item.id === row.id)) restored.push({ ...row });
      }
      state.list = restored;
      saveState();
      renderList();
      renderTotals();
      toast("Shopping list restored.");
    },
  });
}

function setCategory(category, { focus = false } = {}) {
  if (!CATEGORIES.includes(category)) return;
  state.category = category;
  visibleLimit = PAGE_SIZE;
  saveState();
  renderCategories();
  renderProducts();
  if (focus) {
    const active = [...el.categories.querySelectorAll("[data-category]")].find(
      (button) => button.dataset.category === category
    );
    active?.focus({ preventScroll: true });
  }
}

function setSort(mode) {
  if (!SORT_MODES.includes(mode)) return;
  state.sort = mode;
  saveState();
  visibleLimit = PAGE_SIZE;
  renderProducts();
}

let toastTimer = 0;
let toastActionHandler = null;
function hideToast() {
  el.toast.classList.remove("is-on");
  el.toastAction.hidden = true;
  toastActionHandler = null;
}
function toast(message, { actionLabel = "", onAction = null, duration = 2400 } = {}) {
  el.toastMessage.textContent = message;
  clearTimeout(toastTimer);
  if (actionLabel && typeof onAction === "function") {
    el.toastAction.textContent = actionLabel;
    el.toastAction.hidden = false;
    toastActionHandler = onAction;
  } else {
    el.toastAction.hidden = true;
    toastActionHandler = null;
  }
  el.toast.classList.add("is-on");
  toastTimer = setTimeout(hideToast, duration);
}

el.toastAction.addEventListener("click", () => {
  const action = toastActionHandler;
  hideToast();
  if (action) action();
});

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
  const store = STORE_MAP.get(storeId);
  state.prices[`${productId}|${storeId}`] = { price, at };
  saveState();
  renderProducts();
  renderList();
  renderTotals();
  openProduct(productId);
  toast(`${money.format(price)} at ${store.name} · ${store.branch} — now used in your totals.`);
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
  toast(`${entries.length} price${entries.length === 1 ? "" : "s"} saved for ${store.name} · ${store.branch}.`);
}

function openProduct(productId) {
  const product = PRODUCT_MAP.get(productId);
  if (!product) return;
  const offers = offersFor(productId);
  const cheapestPrice = offers.length ? offers[0].price : null;
  const hasDeals = offers.some((offer) => storeDealFor(productId, offer.store));
  const months = historyMonths();
  const recorded = recordedPricesFor(productId);
  const unavailable = selectedStores().filter((store) => knownUnavailable(productId, store.id));
  const anyEstimate = offers.some((offer) => !priceIsChecked(productId, offer.store.id));
  const hasImport = offers.some((offer) => priceKind(productId, offer.store.id) === "imported");
  const barcode = barcodeCard(product);
  const barcodeMarkup =
    barcode ||
    (GTINS_STATE === "ready"
      ? `<p class="dialog__barcode-note">No barcode is recorded for this pack.</p>`
      : `<p class="dialog__barcode-note">Checking for a barcode…</p>`);
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
              ? `<p class="dialog__source">Shelf prices from each branch's own price list where it differs from the island base, imported on ${CATALOGUE ? shortDate(CATALOGUE.fetchedAt) : ""} · ${product.stores === 2 ? "listed by both chains" : "listed by one chain"} · stock checked per branch</p>`
              : product.estimated
                ? `<p class="dialog__source">Real product data from <a href="https://world.openfoodfacts.org/product/${product.code}" target="_blank" rel="noopener">Open Food Facts</a></p>`
                : ""
        }
      </div>
      ${product.image ? `<img class="dialog__thumb" src="${escapeHtml(product.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}
      <button class="dialog__close" type="button" data-close-dialog aria-label="Close">×</button>
    </div>

    <div id="dialog-barcode-slot">${barcodeMarkup}</div>

    ${
      anyEstimate
        ? `          <p class="dialog__estimate">${
            hasImport
              ? `PAK'nSAVE and New World prices here are shelf prices from each branch's price list where available, imported on ${importDateLabel()}. Stock coverage is each branch's own product range. Anything else is an estimate from demo pricing.`
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
                .map((offer) => {
                  const kind = priceKind(productId, offer.store.id);
                  const isCheapest = samePrice(offer.price, cheapestPrice);
                  const real = priceState(productId, offer.store.id);
                  const deal = storeDealFor(productId, offer.store);
                  const note =
                    kind === "checked"
                      ? `checked ${shortDate(checkedPrice(productId, offer.store.id).at)}`
                      : kind === "imported" && real
                        ? `imported ${shortDate(real.at)}`
                        : "";
                  const unit = unitPriceFor(product, offer.store);
                  return `
                <tr class="${isCheapest ? "is-best" : ""}">
                  <th scope="row">${escapeHtml(offer.store.name)}<span>${escapeHtml(offer.store.branch)}</span></th>
                  <td class="dialog__price">${money.format(offer.price)}${note ? `<small class="dialog__checked">${note}</small>` : ""}${deal ? `<small class="dialog__deal">${escapeHtml(dealDetail(deal))}</small>` : ""}${unit ? `<small class="dialog__unit">${escapeHtml(unit.display)}</small>` : ""}</td>
                  <td>${isCheapest ? "Cheapest" : `+${money.format(offer.price - cheapestPrice)}`}</td>
                </tr>`;
                })
                .join("")}
            </tbody>
          </table>`
        : `<p class="dialog__empty">${unavailable.length ? `Not stocked at ${unavailable.map((store) => escapeHtml(storeLabel(store))).join(" or ")}.` : "Select at least one store in the sidebar to price this product."}</p>`
    }

    ${
      hasDeals
        ? `<p class="dialog__deal-note">Club prices need a club card; multi-buys apply at the stated quantity. Basket totals apply these terms when they qualify; turn on the Club card switch to include club prices.</p>`
        : ""
    }

    ${
      unavailable.length && offers.length
        ? `<p class="dialog__stock">Not stocked at ${unavailable.map((store) => escapeHtml(storeLabel(store))).join(" or ")} — no price to compare there.</p>`
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
                    ${offers.map((offer) => `<option value="${offer.store.id}">${escapeHtml(storeLabel(offer.store))}</option>`).join("")}
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
                          `<li><span>${escapeHtml(storeLabel(row.store))} · ${money.format(row.price)} <small>checked ${shortDate(row.at)}</small></span><button type="button" data-remove-price="${row.store.id}" aria-label="Remove recorded price for ${escapeHtml(storeLabel(row.store))}">×</button></li>`
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
             <p class="dialog__note">Showing ${escapeHtml(storeLabel(offers[0].store))}. Prices elsewhere move differently — that's the point.</p>`
          : `<p class="dialog__empty">${unavailable.length ? "No price history at your selected stores." : "Pick a store to see its price history."}</p>`
      }
    </section>

    <div class="dialog__actions">
      <button class="btn btn--leaf" type="button" data-add="${product.id}" aria-label="Add ${escapeHtml(product.name)} (${escapeHtml(product.size || "size not listed")}) to list">Add to list</button>
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
  if (!barcode) void ensureGtins();
}

function refreshOpenBarcode() {
  if (!el.dialog.open || !dialogProductId) return;
  const product = PRODUCT_MAP.get(dialogProductId);
  const slot = el.dialogContent.querySelector("#dialog-barcode-slot");
  if (!product || !slot) return;
  const card = barcodeCard(product);
  if (card) {
    slot.innerHTML = card;
    return;
  }
  slot.innerHTML = `<p class="dialog__barcode-note">${
    GTINS_STATE === "error"
      ? "Barcode data couldn't be loaded. Try again in a moment."
      : GTINS_STATE === "ready"
        ? "No barcode is recorded for this pack."
        : "Checking for a barcode…"
  }</p>`;
}

function closeDialog() {
  if (el.dialog.open) el.dialog.close();
  else el.dialog.removeAttribute("open");
}

/* ---------- Events ---------- */

el.storeSearch.addEventListener("input", () => {
  renderStoreResults();
  if (!COVERAGE) void ensureCoverage();
});

el.storeSearch.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const first = el.storeResults.querySelector("[data-add-store]:not([disabled])");
  if (!first) return;
  event.preventDefault();
  addStore(first.dataset.addStore);
});

el.storeResults.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add-store]");
  if (add) addStore(add.dataset.addStore);
});

el.storeList.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove-store]");
  if (remove) removeStore(remove.dataset.removeStore);
});

el.categories.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-category]");
  if (chip) setCategory(chip.dataset.category, { focus: true });
});

if (el.sort) {
  el.sort.addEventListener("change", () => setSort(el.sort.value));
}

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
  const open = event.target.closest("[data-open-product]");
  if (open) {
    openProduct(open.dataset.openProduct);
    return;
  }
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
  const raw = el.search.value || "";
  const digits = normalizeBarcode(raw);
  const barcodeQuery =
    /^[\d\s-]+$/.test(raw.trim()) && digits.length >= 8 && digits.length <= 14;
  // A barcode is unambiguous, so it should find its pack even when a category
  // chip from the previous search is still selected.
  if (barcodeQuery && state.category !== "All") {
    state.category = "All";
    saveState();
    renderCategories();
  }
  visibleLimit = PAGE_SIZE;
  renderProducts();
  scheduleGrocerSearch();
  if (barcodeQuery && GTINS_STATE !== "ready" && GTINS_STATE !== "error") {
    void ensureGtins().then(() => {
      if (normalizeBarcode(el.search.value || "") === digits) renderProducts();
    });
  }
});

el.searchSuggestionButton.addEventListener("click", () => {
  const suggestion = el.searchSuggestionButton.dataset.query;
  if (!suggestion) return;
  el.search.value = suggestion;
  visibleLimit = PAGE_SIZE;
  renderProducts();
  scheduleGrocerSearch();
  el.search.focus();
  el.search.setSelectionRange(suggestion.length, suggestion.length);
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
el.listFilter.addEventListener("input", () => {
  listFilters.query = el.listFilter.value;
  renderList();
});
el.listCategoryFilter.addEventListener("change", () => {
  listFilters.category = el.listCategoryFilter.value || "all";
  renderList();
});
el.listStatusFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-list-status]");
  if (!button || button.disabled) return;
  listFilters.status = button.dataset.listStatus;
  renderList();
});
el.listFilterReset.addEventListener("click", () => resetListFilters({ focus: true }));
el.listFilterEmptyReset.addEventListener("click", () => resetListFilters({ focus: true }));
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

el.clubToggle.addEventListener("change", () => {
  state.clubCard = el.clubToggle.checked;
  saveState();
  renderList();
  renderTotals();
  if (el.receiptDialog.open) renderReceipt();
  toast(
    state.clubCard
      ? "Club-card prices applied to basket totals."
      : "Club-card prices removed from basket totals."
  );
});

for (const tab of el.tabButtons) {
  tab.addEventListener("click", () => setTab(tab.dataset.tab, { persist: true }));
}

/* ---------- Camera scanning ---------- */

function matchBarcode(raw) {
  const target = normalizeGtin(raw);
  if (!target) return null;
  return PRODUCTS.find((product) => normalizeGtin(product.code) === target) || null;
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
  if (GTINS_STATE !== "ready") await ensureGtins();
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
  scanButton.addEventListener("click", async () => {
    if (typeof window.GrocerScan !== "function") {
      toast("The camera scanner isn't available in this browser.");
      return;
    }
    await ensureGtins();
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
  const barcodeish = /^[\d\s-]+$/.test(term) && digits.length >= 8;
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
        ? `${money.format(checked.price)} recorded at ${storeLabel(checked.store)} on ${shortDate(checked.at)} — record another shelf price`
        : "Record the shelf price you saw";
      const entry = open
        ? `<li class="grocer-entry">
            <form class="grocer-entry__form" data-grocer-price-form="${row.id}">
              <label class="grocer-entry__store">
                <span class="sr-only">Store for ${escapeHtml(row.name)}</span>
                <select name="store">
                  ${stores.map((store) => `<option value="${store.id}"${checked && checked.store.id === store.id ? " selected" : ""}>${escapeHtml(storeLabel(store))}</option>`).join("")}
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
          <button class="grocer-item__add" type="button" data-grocer-add="${row.id}" aria-label="Add ${escapeHtml(row.name)} (${escapeHtml(formatGrocerSize(row.size))}) to list">Add</button>
        </li>${entry}`;
    })
    .join("");

  renderProducts();
}

function renderCoverageLine() {
  if (!el.coverageLine || !PRODUCTS.length) return;
  const pricedAt = (productId, chain) => {
    if (ZONE_KEYS.some((zone) => zone.startsWith(`${chain}-`) && ZONE_PRICES[zone][productId])) {
      return true;
    }
    const skuId = DEMO_SKU_IDS.get(productId)?.[chain];
    return Boolean(
      skuId && ZONE_KEYS.some((zone) => zone.startsWith(`${chain}-`) && ZONE_PRICES[zone][skuId])
    );
  };
  let both = 0;
  let one = 0;
  let neither = 0;
  for (const product of PRODUCTS) {
    const stores = (pricedAt(product.id, "pns") ? 1 : 0) + (pricedAt(product.id, "nw") ? 1 : 0);
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
  const checkedAt = priceCheckLabel();
  const branches = Object.keys(COVERAGE_BRANCHES).length;
  const coverageAt = COVERAGE?.fetchedAt ? shortDate(COVERAGE.fetchedAt) : "";
  el.importBanner.textContent =
    `Every PAK'nSAVE and New World branch uses its own branch price list where prices differ ` +
    `from the four island base lists. Stock coverage is that branch's own product range, not a shared island list` +
    `${branches ? ` (${branches.toLocaleString("en-NZ")} branches checked ${coverageAt})` : ""}. ` +
    `Last successful price check: ${checkedAt || "not recorded"}. ` +
    `Import dated ${importDateLabel()}. Everything else is an estimate unless you record it.`;
  el.importBanner.hidden = false;
}

renderImportBanner();
renderCoverageLine();
renderAll();
setTab(state.tab || (state.stores.length ? "catalog" : "stores"));
for (const storeId of state.stores) void ensureStorePrices(storeId);

/* Keep the branded splash up briefly so a fast initial render does not make
   it flash, then fade it away. */
const splashScreen = document.getElementById("splash");
const SPLASH_MIN_MS = 650;
function dismissSplash() {
  if (!splashScreen || splashScreen.dataset.dismissed) return;
  splashScreen.dataset.dismissed = "true";
  const wait = Math.max(0, SPLASH_MIN_MS - performance.now());
  window.setTimeout(() => {
    splashScreen.classList.add("is-hiding");
    splashScreen.setAttribute("aria-hidden", "true");
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      splashScreen.remove();
    };
    splashScreen.addEventListener("transitionend", remove, { once: true });
    window.setTimeout(remove, 700);
  }, wait);
}
dismissSplash();

function whenIdle(callback, timeout = 2500) {
  if ("requestIdleCallback" in window) window.requestIdleCallback(callback, { timeout });
  else window.setTimeout(callback, 1000);
}

function prewarmSearchFields() {
  if (searchPrewarmed) return;
  searchPrewarmed = true;
  for (const product of PRODUCTS) productSearchFields(product);
}
whenIdle(prewarmSearchFields);

function scheduleCoverageLoad() {
  if (COVERAGE || coveragePromise) return;
  whenIdle(() => void ensureCoverage());
}
if (state.stores.length) void ensureCoverage();
else if (document.readyState === "complete") scheduleCoverageLoad();
else window.addEventListener("load", scheduleCoverageLoad, { once: true });

/* ---------- Small utilities ---------- */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
