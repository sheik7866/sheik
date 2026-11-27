/*
  Regression tests for the three ways saved state used to be lost:

    1. loadState() capped discovered products at 200, so a shopping list row
       whose product sat past that cap was dropped on reload.
    2. loadState() kept only the first 500 recorded shelf prices.
    3. saveState() swallowed storage failures, so the shopper was never told
       that their list and prices had stopped being saved.

  app.js is a classic browser script, so these tests run the real file inside a
  vm with a small DOM and localStorage stub. Nothing is re-implemented here:
  every assertion is made against the shipped functions.
*/

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP_SOURCE = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

const STORAGE_KEY = "grocer-demo-v1";
const OFF_CACHE_KEY = "grocer-off-cache-v1";
const GROCER_CACHE_KEY = "grocer-catalogue-cache-v1";

function makeElement(id = "") {
  const attributes = new Map();
  const classes = new Set();
  return {
    id,
    textContent: "",
    innerHTML: "",
    value: "",
    hidden: false,
    checked: false,
    disabled: false,
    open: false,
    dataset: {},
    style: {},
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
    },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    removeAttribute: (name) => attributes.delete(name),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    appendChild() {},
    focus() {},
    remove() {},
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
}

function makeStorage() {
  const store = new Map();
  const state = { failWrites: false, writes: 0, removed: [] };
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      if (state.failWrites) throw new Error("QuotaExceededError");
      state.writes += 1;
      store.set(key, String(value));
    },
    removeItem: (key) => {
      state.removed.push(key);
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
    _store: store,
    _state: state,
  };
}

function boot(seed, { storage = makeStorage() } = {}) {
  const seedJson = seed ? JSON.stringify(seed) : null;
  if (seedJson) storage._store.set(STORAGE_KEY, seedJson);

  const elements = new Map();
  const elementFor = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };

  const body = makeElement("body");
  const document = {
    readyState: "complete",
    visibilityState: "visible",
    body,
    head: makeElement("head"),
    getElementById: (id) => elementFor(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeElement(tag),
    addEventListener() {},
    removeEventListener() {},
  };

  const warnings = [];
  const sandbox = {
    console: {
      log() {},
      info() {},
      warn: (...args) => warnings.push(args.map(String).join(" ")),
      error: (...args) => warnings.push(args.map(String).join(" ")),
    },
    localStorage: storage,
    document,
    navigator: {},
    location: { href: "http://localhost/app.html", pathname: "/app.html", search: "", hash: "" },
    history: { replaceState() {} },
    performance: { now: () => 0 },
    addEventListener() {},
    removeEventListener() {},
    // Timers are inert: these tests drive the functions directly, so nothing
    // should run after the assertions and keep the runner alive.
    setTimeout: () => 0,
    clearTimeout: () => {},
    atob: (value) => Buffer.from(String(value), "base64").toString("binary"),
    getComputedStyle: () => ({ paddingLeft: "0px", paddingRight: "0px" }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    fetch: () => Promise.reject(new Error("network is disabled in these tests")),
    AbortController,
    URL,
    Intl,
    FormData: class FormData {},
  };
  // app.js reads and writes window.*; pointing window at the global keeps both
  // spellings working without a second object to keep in sync.
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(APP_SOURCE, context, { filename: "app.js" });

  return { context, storage, elements, elementFor, document, seedJson, warnings };
}

function baseState(overrides = {}) {
  return {
    stores: [],
    pro: false,
    clubCard: false,
    list: [],
    picked: [],
    live: [],
    prices: {},
    category: "All",
    sort: "relevance",
    tab: "",
    ...overrides,
  };
}

function liveProduct(index) {
  const serial = String(index).padStart(5, "0");
  return {
    id: `off-94000000${serial}`,
    code: `94000000${serial}`,
    name: `Test product ${index}`,
    size: "1kg",
    brand: "Test brand",
    image: "",
    category: "Pantry",
    base: 4.99,
    source: "off",
    stores: 2,
  };
}

test("boots the real app.js without throwing", () => {
  const { context } = boot(baseState());
  assert.equal(typeof context.loadState, "function");
  assert.equal(typeof context.saveState, "function");
});

test("a shopping list row survives when its product is past the cache cap", () => {
  const live = Array.from({ length: 260 }, (_, index) => liveProduct(index));
  const target = live[259];
  const { context } = boot(baseState({ live, list: [{ id: target.id, qty: 3 }] }));

  // Objects built inside the vm belong to another realm, so compare plain
  // data rather than prototypes.
  const loaded = JSON.parse(JSON.stringify(context.loadState()));

  assert.deepEqual(loaded.list, [{ id: target.id, qty: 3 }]);
  assert.ok(
    loaded.live.some((row) => row.id === target.id),
    "the metadata behind a saved list row must be kept"
  );
  assert.ok(
    loaded.live.length <= 201,
    `unreferenced cache rows must stay capped, got ${loaded.live.length}`
  );
});

test("unreferenced discovered products are still capped", () => {
  const live = Array.from({ length: 260 }, (_, index) => liveProduct(index));
  const { context } = boot(baseState({ live }));

  assert.equal(context.loadState().live.length, 200);
});

test("every recorded price is kept, with the product metadata it needs", () => {
  const live = Array.from({ length: 600 }, (_, index) => liveProduct(index));
  const prices = {};
  for (const row of live) {
    prices[`${row.id}|paknsave`] = { price: 3.5, at: "2026-11-27" };
  }
  const { context } = boot(baseState({ live, prices }));

  const loaded = context.loadState();

  assert.equal(Object.keys(loaded.prices).length, 600);
  assert.equal(loaded.live.length, 600);
  assert.ok(loaded.prices[`${live[599].id}|paknsave`], "the last recorded price must survive");
});

test("a failed save warns assertively and keeps the previously saved state", () => {
  const seed = baseState({ list: [{ id: "milk-2l", qty: 2 }] });
  const { context, storage, elementFor, seedJson } = boot(seed);
  const message = elementFor("toast-message");

  storage._state.failWrites = true;
  assert.equal(context.saveState(), false);

  assert.match(message.textContent, /can't save your changes/i);
  assert.equal(message.getAttribute("role"), "alert");
  assert.equal(message.getAttribute("aria-live"), "assertive");
  assert.equal(
    storage.getItem(STORAGE_KEY),
    seedJson,
    "a failed save must not overwrite what was already stored"
  );
});

test("a failed save frees the disposable lookup caches before giving up", () => {
  const { context, storage } = boot(baseState());
  storage._store.set(OFF_CACHE_KEY, "{}");
  storage._store.set(GROCER_CACHE_KEY, "{}");

  storage._state.failWrites = true;
  context.saveState();

  assert.ok(storage._state.removed.includes(OFF_CACHE_KEY));
  assert.ok(storage._state.removed.includes(GROCER_CACHE_KEY));
  assert.equal(storage.getItem(OFF_CACHE_KEY), null);
  assert.equal(storage.getItem(GROCER_CACHE_KEY), null);
});

test("the warning is not repeated until a save succeeds again", () => {
  const { context, storage, elementFor } = boot(baseState());
  const message = elementFor("toast-message");

  storage._state.failWrites = true;
  context.saveState();
  message.textContent = "";
  context.saveState();
  assert.equal(message.textContent, "", "a continuing failure must not re-announce on every save");

  storage._state.failWrites = false;
  assert.equal(context.saveState(), true, "a save that succeeds must recover");

  storage._state.failWrites = true;
  context.saveState();
  assert.match(message.textContent, /can't save your changes/i);
});

test("a successful save round-trips the list and the recorded prices", () => {
  const seed = baseState({
    list: [{ id: "milk-2l", qty: 2 }],
    prices: { "milk-2l|paknsave": { price: 5.5, at: "2026-11-27" } },
  });
  const { context, storage } = boot(seed);

  assert.equal(context.saveState(), true);

  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.deepEqual(saved.list, [{ id: "milk-2l", qty: 2 }]);
  assert.equal(saved.prices["milk-2l|paknsave"].price, 5.5);
});

test("a legacy state without live or prices still loads", () => {
  const { context } = boot({ stores: [], list: [{ id: "milk-2l", qty: 1 }] });

  // Objects built inside the vm belong to another realm, so compare plain
  // data rather than prototypes.
  const loaded = JSON.parse(JSON.stringify(context.loadState()));

  assert.deepEqual(loaded.list, [{ id: "milk-2l", qty: 1 }]);
  assert.deepEqual(loaded.prices, {});
  assert.deepEqual(loaded.live, []);
});
