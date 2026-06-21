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

/** A variant's optional pricing — `price` may be null, meaning "inherit the product". */
export interface VariantPriceable {
  price?:         DecimalLike | null;
  priceDelivery?: DecimalLike | null;
  priceDineIn?:   DecimalLike | null;
  priceIfood?:    DecimalLike | null;
}

export type VariantPriceSource = "VARIANT_CHANNEL" | "VARIANT_BASE" | "INHERITED_PRODUCT";

export interface ResolvedVariantPrice {
  finalUnitPrice: number;
  source:         VariantPriceSource;
}

/** The variant's own channel override for a channel (null = none). */
function variantChannelOverride(v: VariantPriceable, channel: PricingChannel): number | null {
  switch (channel) {
    case "DELIVERY": return toNum(v.priceDelivery);
    case "DINE_IN":  return toNum(v.priceDineIn);
    case "IFOOD":    return toNum(v.priceIfood);
    default:         return null; // DEFAULT → variant base only
  }
}

/**
 * Resolve a variant's effective unit price for a channel (TASK 3 — single source of
 * truth). Precedence:
 *   1. the variant's channel-specific override (priceDelivery/DineIn/Ifood)
 *   2. the variant's base `price` (explicit override of the product)
 *   3. INHERIT the parent product's price for the channel (channel → base)
 *
 * So a blank variant price falls through to the product's channel price (e.g. a
 * "Coca-Cola" variant with no price uses the product's Delivery R$8 / Salão R$7),
 * while a filled variant price (e.g. "Coca 2L" R$14) overrides it everywhere.
 */
export function resolveVariantPriceDetailed(
  product: ChannelPriceable,
  variant: VariantPriceable,
  channel: PricingChannel,
): ResolvedVariantPrice {
  const vChannel = variantChannelOverride(variant, channel);
  if (vChannel !== null) return { finalUnitPrice: vChannel, source: "VARIANT_CHANNEL" };

  const vBase = toNum(variant.price);
  if (vBase !== null) return { finalUnitPrice: vBase, source: "VARIANT_BASE" };

  // Inherit the product's channel/base price.
  return { finalUnitPrice: resolveChannelPrice(product, channel).finalUnitPrice, source: "INHERITED_PRODUCT" };
}

/** Convenience: the effective variant unit price number for a channel. */
export function resolveVariantPrice(
  product: ChannelPriceable,
  variant: VariantPriceable,
  channel: PricingChannel,
): number {
  return resolveVariantPriceDetailed(product, variant, channel).finalUnitPrice;
}

export const MenuPricingService = {
  resolveChannelPrice,
  channelPrice,
  resolveVariantPrice,
  resolveVariantPriceDetailed,
};
