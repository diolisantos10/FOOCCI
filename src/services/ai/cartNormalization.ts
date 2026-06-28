/**
 * Cart-line id normalization for the waiter brain.
 *
 * Variant / customized / upsell cart lines carry a SUFFIXED id so distinct lines
 * don't merge in the UI:
 *   `${productId}_${variantId}`   (variant chosen)
 *   `${productId}_c<uid>`         (notes / options / extras)
 *   `${productId}__upsell`        (added from an upsell card)
 *
 * The waiter brain (WaiterBrainV2) matches cart items against the catalog by the
 * plain PRODUCT id. So each line must be normalized to its `baseItemId` (the plain
 * product id the client always sends alongside the suffixed `id`), falling back to
 * `id` for plain lines. Without this, a customized/variant item falls out of cart
 * analysis → `hasFood` reads false → the checkout upsell (refrigerante → sobremesa
 * → extras) is skipped entirely.
 */
export function cartLineBaseIds(
  cart: Array<{ id?: string; baseItemId?: string }>,
): string[] {
  return cart
    .map((c) => c.baseItemId ?? c.id)
    .filter((id): id is string => !!id);
}
