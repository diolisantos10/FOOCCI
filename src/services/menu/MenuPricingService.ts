/**
 * MenuPricingService — single source of truth for resolving a product's price
 * for a given sales channel (P0-B).
 *
 * Channels can have different prices (delivery vs salão/QR vs iFood) because
 * each channel has different margins/commissions. A channel price of `null`
 * means "use the base price" — so existing products with no channel prices
 * keep working unchanged (backwards compatible).
 *
 * The resolver is PURE (no I/O) so it is trivially unit-testable and can be
 * reused everywhere instead of duplicating the fallback logic.
 */

export type PricingChannel = "DELIVERY" | "DINE_IN" | "IFOOD" | "DEFAULT";

export type PriceSource =
  | "CHANNEL_DELIVERY"
  | "CHANNEL_DINE_IN"
  | "CHANNEL_IFOOD"
  | "BASE_FALLBACK";

// Accepts plain numbers/strings as well as Prisma Decimal (which coerces via
// Number()/toString()), so the resolver works on raw DB rows without mapping.
export type DecimalLike = number | string | { toString(): string };

/** Anything with a base price + optional per-channel overrides. */
export interface ChannelPriceable {
  price:          DecimalLike;
  priceDelivery?: DecimalLike | null;
  priceDineIn?:   DecimalLike | null;
  priceIfood?:    DecimalLike | null;
}

export interface ResolvedChannelPrice {
  basePriceUsed:   number;
  channelPriceUsed: number | null; // the channel-specific value when present
  finalUnitPrice:  number;
  priceSource:     PriceSource;
}

function toNum(v: DecimalLike | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve the effective unit price of a product/variant for a channel.
 * Falls back to the base `price` whenever the channel-specific value is null.
 *
 * NOTE: This resolves the *menu* price only. Promotions/coupons and option/
 * add-on surcharges are applied on top of this by the caller (e.g. the
 * finalize route), preserving existing promotion behavior.
 */
export function resolveChannelPrice(
  item:    ChannelPriceable,
  channel: PricingChannel,
): ResolvedChannelPrice {
  const base = toNum(item.price) ?? 0;

  let channelValue: number | null = null;
  let source: PriceSource = "BASE_FALLBACK";

  switch (channel) {
    case "DELIVERY":
      channelValue = toNum(item.priceDelivery);
      if (channelValue !== null) source = "CHANNEL_DELIVERY";
      break;
    case "DINE_IN":
      channelValue = toNum(item.priceDineIn);
      if (channelValue !== null) source = "CHANNEL_DINE_IN";
      break;
    case "IFOOD":
      channelValue = toNum(item.priceIfood);
      if (channelValue !== null) source = "CHANNEL_IFOOD";
      break;
    case "DEFAULT":
    default:
      channelValue = null; // always base
      break;
  }

  const finalUnitPrice = channelValue ?? base;

  return {
    basePriceUsed:    base,
    channelPriceUsed: channelValue,
    finalUnitPrice,
    priceSource:      source,
  };
}

/** Convenience: just the effective number for a channel (base fallback). */
export function channelPrice(item: ChannelPriceable, channel: PricingChannel): number {
  return resolveChannelPrice(item, channel).finalUnitPrice;
}

export const MenuPricingService = {
  resolveChannelPrice,
  channelPrice,
};
