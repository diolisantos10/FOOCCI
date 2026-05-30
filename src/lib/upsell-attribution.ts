/**
 * Foocci incremental-revenue (upsell) attribution — single source of truth for
 * deciding whether a cart line should persist as OrderItem.isUpsell = true.
 *
 * Conservative rule: a cart line is an upsell ONLY when it was explicitly flagged
 * `isUpsell: true` by the client at add-time (i.e. added from a Foocci suggestion
 * card — the AI/waiter suggestion grid or an in-chat suggestion card). Anything
 * else — normal menu browsing, undefined, null — is NOT an upsell.
 *
 * This is analytics-only and must never influence pricing. The client flag is
 * trusted purely for attribution; the server computes all prices independently.
 */
export function resolveItemUpsell(item: { isUpsell?: boolean | null }): boolean {
  return item.isUpsell === true;
}
