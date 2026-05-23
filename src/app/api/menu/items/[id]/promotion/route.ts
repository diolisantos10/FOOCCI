import { NextRequest } from "next/server";
import { z } from "zod";
import { PromotionChannel } from "@prisma/client";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

// ── GET — read current promotion for this item ──────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const item = await prisma.menuItem.findFirst({
      where: { id: params.id, category: { restaurantId: ctx.restaurantId } },
      select: { id: true, name: true, price: true },
    });
    if (!item) return notFound("Item não encontrado");

    const promo = await prisma.promotion.findFirst({
      where: {
        restaurantId: ctx.restaurantId,
        target: "PRODUCT",
        targetProductIds: { has: params.id },
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      select: {
        id: true, type: true, discountValue: true, channel: true,
        status: true, startsAt: true, endsAt: true, name: true,
      },
    });

    if (!promo) return ok({ promotion: null });

    const originalPrice = Number(item.price);
    const discountValue = Number(promo.discountValue);

    let promotionalPrice: number;
    if (promo.type === "PERCENTAGE") {
      promotionalPrice = Math.round(Math.max(0, originalPrice - (originalPrice * discountValue) / 100) * 100) / 100;
    } else {
      promotionalPrice = Math.round(Math.max(0, originalPrice - discountValue) * 100) / 100;
    }

    const channelUi = promo.channel === "ALL" ? "BOTH" : promo.channel === "QR_MENU" ? "DINE_IN" : "DELIVERY";

    return ok({
      promotion: {
        id:               promo.id,
        status:           promo.status,
        discountType:     promo.type === "PERCENTAGE" ? "PERCENTAGE" : "PRICE",
        discountValue:    discountValue,
        originalPrice,
        promotionalPrice,
        channel:          channelUi,
        startsAt:         promo.startsAt?.toISOString() ?? null,
        endsAt:           promo.endsAt?.toISOString()   ?? null,
      },
    });
  } catch (err) {
    console.error("[GET /api/menu/items/[id]/promotion]", err);
    return serverError();
  }
}

// ── PUT — upsert promotion for this item ────────────────────────────────────

const putSchema = z.object({
  discountType: z.enum(["PERCENTAGE", "PRICE"]),
  // For PERCENTAGE: the percent value (1–99). For PRICE: the promotional price.
  value: z.number().positive(),
  channel: z.enum(["DELIVERY", "DINE_IN", "BOTH"]),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt:   z.string().datetime().nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const item = await prisma.menuItem.findFirst({
      where: { id: params.id, category: { restaurantId: ctx.restaurantId } },
      select: { id: true, name: true, price: true },
    });
    if (!item) return notFound("Item não encontrado");

    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) return badRequest("Dados inválidos", parsed.error.flatten());

    const { discountType, value, channel, startsAt, endsAt } = parsed.data;

    const originalPrice = Number(item.price);

    let promoType: "PERCENTAGE" | "FIXED";
    let discountValue: number;

    if (discountType === "PERCENTAGE") {
      if (value >= 100) return badRequest("Percentual deve ser menor que 100%");
      promoType    = "PERCENTAGE";
      discountValue = value;
    } else {
      // PRICE: value is the promotional price
      if (value >= originalPrice) return badRequest("Preço promocional deve ser menor que o preço original");
      promoType    = "FIXED";
      discountValue = Math.round((originalPrice - value) * 100) / 100;
    }

    const dbChannel: PromotionChannel = channel === "BOTH" ? PromotionChannel.ALL : channel === "DINE_IN" ? PromotionChannel.QR_MENU : PromotionChannel.DELIVERY;

    // Find existing promotion for this item
    const existing = await prisma.promotion.findFirst({
      where: {
        restaurantId: ctx.restaurantId,
        target: "PRODUCT",
        targetProductIds: { has: params.id },
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      select: { id: true },
    });

    const data = {
      status:           "ACTIVE" as const,
      type:             promoType,
      discountValue,
      channel:          dbChannel,
      startsAt:         startsAt ? new Date(startsAt) : null,
      endsAt:           endsAt   ? new Date(endsAt)   : null,
      target:           "PRODUCT" as const,
      targetProductIds: [params.id],
    };

    let promo;
    if (existing) {
      promo = await prisma.promotion.update({
        where: { id: existing.id },
        data,
        select: { id: true, status: true },
      });
    } else {
      promo = await prisma.promotion.create({
        data: {
          restaurantId:     ctx.restaurantId,
          name:             `Promoção: ${item.name}`,
          ...data,
        },
        select: { id: true, status: true },
      });
    }

    return ok({ promotionId: promo.id, status: promo.status });
  } catch (err) {
    console.error("[PUT /api/menu/items/[id]/promotion]", err);
    return serverError();
  }
}

// ── DELETE — pause promotion for this item ──────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const existing = await prisma.promotion.findFirst({
      where: {
        restaurantId: ctx.restaurantId,
        target: "PRODUCT",
        targetProductIds: { has: params.id },
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      select: { id: true },
    });

    if (!existing) return notFound("Nenhuma promoção encontrada para este item");

    await prisma.promotion.update({
      where: { id: existing.id },
      data:  { status: "PAUSED" },
    });

    return ok({ paused: true });
  } catch (err) {
    console.error("[DELETE /api/menu/items/[id]/promotion]", err);
    return serverError();
  }
}
