/* Demo staple -> real catalogue pack per chain.
 *
 * The curated staple imports name a Foodstuffs catalogue id for PAK'nSAVE and
 * New World. The Woolworths price files are keyed by those same catalogue ids
 * (the GTIN join in scripts/pull-grocer-prices.mjs), so a staple without its
 * own Woolworths mapping reuses its Foodstuffs id for the same physical pack.
 *
 * This lives in its own file because scripts/check-demo-staples.mjs loads the
 * same mapping when it guards the nightly refresh: if the rule here stopped
 * matching a branch price, the check fails instead of the app quietly showing
 * an estimate.
 */
(function () {
  const skuProductId = (sku) =>
    String(sku || "")
      .replace(/(?:pns|nw)$/i, "")
      .replace(/_/g, "-")
      .toUpperCase();

  const ids = new Map();
  for (const imp of [window.GROCER_PAKNSAVE_IMPORT, window.GROCER_NEWWORLD_IMPORT]) {
    const chain = imp?.storeId === "paknsave" ? "pns" : imp?.storeId === "newworld" ? "nw" : null;
    if (!chain) continue;
    for (const [demoId, item] of Object.entries(imp.items || {})) {
      const id = skuProductId(item.sku);
      if (!id) continue;
      if (!ids.has(demoId)) ids.set(demoId, {});
      if (!ids.get(demoId)[chain]) ids.get(demoId)[chain] = id;
    }
  }

  function demoSkuId(demoId, chain) {
    const all = ids.get(demoId);
    if (!all) return null;
    return all[chain] || all.pns || all.nw || null;
  }

  window.DEMO_SKU_IDS = ids;
  window.demoSkuId = demoSkuId;
})();
