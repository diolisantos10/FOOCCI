/**
 * buildAIContext — central AI context assembler for Foocci.
 *
 * Gathers restaurant, menu, promotions, customer, delivery, payment,
 * and AI config into a single AIContext object.
 *
 * Usage:
 *   const ctx = await buildAIContext(restaurantId, { customerId, cart, orderStage });
 *
 * Consumers:
 *   - src/lib/agent/builder.ts        (QR ordering prompt layer)
 *   - src/services/ai/PromptBuilderService.ts  (WhatsApp prompt layer)
 *   - CRM engines, recommendation engines
 *
 * Performance: DB queries run in two parallel batches.
 *   Batch 1: restaurant + brandConfig + menu + promotions + delivery + payment + customer
 *   Batch 2: bestseller aggregation (depends on restaurantId from Batch 1)
 *
 * Security: no secrets returned — configBlob decryption stays in IntegrationService.
 */

import { prisma } from "@/lib/prisma";
import { BrandConfigService } from "@/services/ai/BrandConfigService";
import type {
  AIContext,
  MenuCategoryContext,
  MenuItemContext,
  PromotionContext,
  CustomerContext,
  CustomerOrderContext,
  DeliveryContext,
  PaymentContext,
  CartItemContext,
} from "./types";

// ── Public option surface ─────────────────────────────────────────────────────

export interface AIContextOptions {
  /**
   * Resolved customer ID — takes precedence over customerPhone.
   * Pass this when the customer is already authenticated.
   */
  customerId?: string;
  /**
   * E.164 phone number — used to look up the customer when customerId
   * is not yet known (e.g. QR ordering entry with ?phone= param).
   */
  customerPhone?: string;
  /**
   * Current cart state passed in from the client.
   * Not stored in DB at context-build time.
   */
  cart?: Array<{
    itemId?:   string; // optional — not always available on the client side
    name:      string;
    quantity:  number;
    unitPrice: number;
    notes?:    string | null;
  }>;
  /**
   * Current ordering stage from the client state machine.
   * e.g. "BROWSE" | "PAYMENT" | "DONE"
   */
  orderStage?: string | null;
  /** Delivery method selected by the customer: "delivery" | "pickup" */
  deliveryMethod?: string | null;
  /**
   * Filter menu items by channel visibility.
   * Omit to include all active+available items regardless of channel.
   */
  channel?: "delivery" | "dine_in";
}

// ── Tag derivation ────────────────────────────────────────────────────────────
//
// Derives dietary/flavor tags from item name + description text.
// No DB column needed — pure string matching.

const TAG_MAP: Array<[tag: string, keywords: string[]]> = [
  ["vegetariano",  ["vegetariano", "sem carne", "plant-based", "vegetal"]],
  ["vegano",       ["vegano", "vegan", "plant based"]],
  ["sem glúten",   ["sem glúten", "gluten free", "gluten-free", "s/glúten"]],
  ["sem lactose",  ["sem lactose", "lactose free", "s/lactose"]],
  ["picante",      ["picante", "apimentado", "ardido", "pimenta malagueta"]],
  ["fresco",       ["fresco", "natural", "orgânico"]],
];

function deriveTags(name: string, description: string | null): string[] {
  const haystack = `${name} ${description ?? ""}`.toLowerCase();
  return TAG_MAP
    .filter(([, keywords]) => keywords.some((kw) => haystack.includes(kw)))
    .map(([tag]) => tag);
}

// ── Main builder ──────────────────────────────────────────────────────────────

export async function buildAIContext(
  restaurantId: string,
  options: AIContextOptions = {}
): Promise<AIContext> {
  const {
    customerId,
    customerPhone,
    cart      = [],
    orderStage     = null,
    deliveryMethod = null,
    channel,
  } = options;

  // ── Menu item channel filter ───────────────────────────────────────────────
  const itemWhere = {
    isActive:    true,
    isAvailable: true,
    ...(channel === "delivery" && { showInDelivery: true }),
    ...(channel === "dine_in"  && { showInDineIn:   true }),
  };

  // ── Customer lookup (mutually exclusive branches) ─────────────────────────
  // Both branches use identical include shapes so TypeScript unifies them.
  const customerInclude = {
    preferences: true,
    orders: {
      orderBy: { createdAt: "desc" as const },
      take:    5,
      include: {
        items: {
          select: { name: true, quantity: true, price: true },
        },
      },
    },
    segmentMembers: {
      include: {
        segment: { select: { name: true } },
      },
    },
  } as const;

  const customerPromise =
    customerId
      ? prisma.customer.findUnique({
          where:   { id: customerId },
          include: customerInclude,
        })
      : customerPhone
      ? prisma.customer.findUnique({
          where:   { phone_restaurantId: { phone: customerPhone, restaurantId } },
          include: customerInclude,
        })
      : Promise.resolve(null);

  // ── Parallel batch 1: all primary data ────────────────────────────────────
  const [
    restaurant,
    brandConfig,
    categories,
    promotions,
    deliveryConfig,
    paymentSettings,
    customerRaw,
  ] = await Promise.all([
    prisma.restaurant.findUnique({
      where:  { id: restaurantId },
      select: {
        id:          true,
        name:        true,
        slug:        true,
        description: true,
        timezone:    true,
        plan:        true,
      },
    }),
    BrandConfigService.getOrDefault(restaurantId),
    prisma.menuCategory.findMany({
      where:    { restaurantId, isActive: true, isAvailable: true },
      orderBy:  { sortOrder: "asc" },
      include:  {
        items: {
          where:   itemWhere,
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    prisma.promotion.findMany({
      where: { restaurantId, status: "ACTIVE" },
    }),
    prisma.deliveryConfig.findUnique({ where: { restaurantId } }),
    prisma.paymentSettings.findUnique({ where: { restaurantId } }),
    customerPromise,
  ]);

  if (!restaurant) {
    throw new Error(`buildAIContext: restaurant "${restaurantId}" not found`);
  }

  // ── Batch 2: bestseller aggregation ───────────────────────────────────────
  // Top 5 items by quantity sold in the last 30 days (non-cancelled orders).
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const topItems = await prisma.orderItem.groupBy({
    by:    ["menuItemId"],
    where: {
      order: {
        restaurantId,
        createdAt: { gte: thirtyDaysAgo },
        status:    { not: "CANCELLED" },
      },
    },
    _sum:     { quantity: true },
    orderBy:  { _sum: { quantity: "desc" } },
    take:     5,
  });

  const bestsellerIds = new Set(topItems.map((r) => r.menuItemId));

  // ── Menu context ──────────────────────────────────────────────────────────
  const menu: MenuCategoryContext[] = categories.map((cat) => ({
    id:             cat.id,
    name:           cat.name,
    description:    cat.description,
    isAvailable:    cat.isAvailable,
    showInDelivery: cat.showInDelivery,
    showInDineIn:   cat.showInDineIn,
    items:          cat.items.map((item): MenuItemContext => ({
      id:           item.id,
      name:         item.name,
      description:  item.description,
      price:        Number(item.price),
      imageUrl:     item.imageUrl,
      isAvailable:  item.isAvailable,
      isBestseller: bestsellerIds.has(item.id),
      tags:         deriveTags(item.name, item.description),
    })),
  }));

  // ── Promotions context ────────────────────────────────────────────────────
  const promotionsCtx: PromotionContext[] = promotions.map((p) => ({
    id:                p.id,
    name:              p.name,
    description:       p.description,
    type:              p.type,
    discountValue:     Number(p.discountValue),
    target:            p.target,
    targetProductIds:  p.targetProductIds,
    targetCategoryIds: p.targetCategoryIds,
    couponCode:        p.couponCode,
    minOrderValue:     p.minOrderValue != null ? Number(p.minOrderValue) : null,
    channel:           p.channel,
    endsAt:            p.endsAt?.toISOString() ?? null,
  }));

  // ── Customer context ──────────────────────────────────────────────────────
  let customer: CustomerContext | null = null;

  if (customerRaw) {
    const daysSinceLastOrder = customerRaw.lastOrderAt
      ? Math.floor((Date.now() - customerRaw.lastOrderAt.getTime()) / 86_400_000)
      : null;

    const recentOrders: CustomerOrderContext[] = customerRaw.orders.map((o) => ({
      id:        o.id,
      total:     Number(o.total),
      type:      o.type,
      status:    o.status,
      createdAt: o.createdAt.toISOString(),
      items:     o.items.map((i) => ({
        name:     i.name,
        quantity: i.quantity,
        price:    Number(i.price),
      })),
    }));

    customer = {
      id:                 customerRaw.id,
      name:               customerRaw.name,
      phone:              customerRaw.phone,
      email:              customerRaw.email,
      totalOrders:        customerRaw.totalOrders,
      totalSpend:         Number(customerRaw.totalSpend),
      lastOrderAt:        customerRaw.lastOrderAt?.toISOString() ?? null,
      daysSinceLastOrder,
      isRecurring:        customerRaw.totalOrders > 1,
      preferences:        customerRaw.preferences
        ? {
            dietary:      customerRaw.preferences.dietary,
            allergies:    customerRaw.preferences.allergies,
            favoriteDish: customerRaw.preferences.favoriteDish,
            notes:        customerRaw.preferences.notes,
          }
        : null,
      recentOrders,
      segments: customerRaw.segmentMembers.map((m) => m.segment.name),
    };
  }

  // ── Delivery context ──────────────────────────────────────────────────────
  const delivery: DeliveryContext | null = deliveryConfig
    ? {
        enabled:           deliveryConfig.enabled,
        pickupEnabled:     deliveryConfig.pickupEnabled,
        fee:               deliveryConfig.fee != null ? Number(deliveryConfig.fee) : null,
        estimatedMinutes:  deliveryConfig.estimatedMinutes,
        minOrderValue:     deliveryConfig.minOrderValue != null ? Number(deliveryConfig.minOrderValue) : null,
        freeDeliveryAbove: deliveryConfig.freeDeliveryAbove != null ? Number(deliveryConfig.freeDeliveryAbove) : null,
        areaDescription:   deliveryConfig.areaDescription,
      }
    : null;

  // ── Payment context ───────────────────────────────────────────────────────
  const payment: PaymentContext | null = paymentSettings
    ? {
        acceptPix:  paymentSettings.acceptPix,
        acceptCash: paymentSettings.acceptCash,
        acceptCard: paymentSettings.acceptCard,
        acceptLink: paymentSettings.acceptLink,
      }
    : null;

  // ── Cart context ──────────────────────────────────────────────────────────
  const cartItems: CartItemContext[] = cart.map((item) => ({
    itemId:    item.itemId ?? "",
    name:      item.name,
    quantity:  item.quantity,
    unitPrice: item.unitPrice,
    notes:     item.notes ?? null,
  }));
  const cartTotal = cartItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  // ── Assemble ──────────────────────────────────────────────────────────────
  return {
    restaurant: {
      id:          restaurant.id,
      name:        restaurant.name,
      slug:        restaurant.slug,
      description: restaurant.description,
      timezone:    restaurant.timezone,
      plan:        restaurant.plan,
    },
    aiConfig: {
      tone:                 brandConfig.tone,
      formality:            brandConfig.formality,
      emojiUsage:           brandConfig.emojiUsage,
      communicationStyle:   brandConfig.communicationStyle,
      personalityPreset:    brandConfig.personalityPreset,
      greetingTemplate:     brandConfig.greetingTemplate,
      systemPromptOverride: brandConfig.systemPromptOverride,
      upsellStyle:          brandConfig.upsellStyle,
      upsellIntensity:      brandConfig.upsellIntensity,
      salesFocus:           brandConfig.salesFocus,
      salesPriority:        brandConfig.salesPriority,
      aiModel:              brandConfig.aiModel,
      maxHistoryMessages:   brandConfig.maxHistoryMessages,
      brandPrimaryColor:    brandConfig.brandPrimaryColor,
      brandSecondaryColor:  brandConfig.brandSecondaryColor,
    },
    menu,
    promotions: promotionsCtx,
    customer,
    operational: {
      delivery,
      payment,
      cart:           cartItems,
      cartTotal,
      orderStage:     orderStage ?? null,
      deliveryMethod: deliveryMethod ?? null,
    },
    builtAt: new Date().toISOString(),
  };
}
