/* Turn a Foodstuffs product's promotion into a compact deal tuple.
 *
 * A tuple is [threshold, rewardValue, clubFlag, limit, description, promoId, multiProducts]:
 *   threshold    how many units must be bought (1 = single item)
 *   rewardValue  total price in cents for that quantity
 *   clubFlag     1 when a club card is required
 *   limit        per-customer limit, or 0 when not stated
 *   description  the promotion's own wording, or ""
 *   promoId      Foodstuffs promotion id, used to pool mix-and-match products
 *   multiProducts 1 when different products can share the promotion
 *
 * Only multi-buys and club-card prices are kept, and only when their
 * per-unit price beats the branch's single-item shelf price. Ordinary
 * NEW_PRICE promotions without a card are already reflected in the shelf
 * price, so they are not duplicated here.
 */

export function dealForProduct(product, priceCents) {
  const shelfPrice = Number(priceCents);
  if (!Number.isFinite(shelfPrice) || shelfPrice <= 0) return null;

  let best = null;
  const promotions = Array.isArray(product?.promotions) ? product.promotions : [];

  for (const promotion of promotions) {
    const threshold = Number(promotion?.threshold);
    const rewardValue = Number(promotion?.rewardValue);
    const club = promotion?.cardDependencyFlag === true;

    if (!Number.isInteger(threshold) || threshold < 1) continue;
    if (!Number.isInteger(rewardValue) || rewardValue <= 0) continue;
    if (threshold === 1 && !club) continue;
    if (rewardValue / threshold >= shelfPrice) continue;

    const candidate = {
      best: promotion?.bestPromotion === true,
      unit: rewardValue / threshold,
      value: [
        threshold,
        rewardValue,
        club ? 1 : 0,
        Number.isInteger(Number(promotion?.limit)) && Number(promotion.limit) > 0
          ? Number(promotion.limit)
          : 0,
        typeof promotion?.description === "string" ? promotion.description.trim() : "",
        typeof promotion?.promoId === "string" || typeof promotion?.promoId === "number"
          ? String(promotion.promoId).trim()
          : "",
        promotion?.multiProducts === true ? 1 : 0,
      ],
    };

    if (
      !best ||
      (candidate.best && !best.best) ||
      (candidate.best === best.best && candidate.unit < best.unit)
    ) {
      best = candidate;
    }
  }

  return best ? best.value : null;
}
