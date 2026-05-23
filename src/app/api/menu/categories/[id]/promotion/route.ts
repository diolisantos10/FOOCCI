import { NextRequest } from "next/server";
import { z } from "zod";
import { PromotionChannel } from "@prisma/client";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

// ── GET — read current promotion for this category ───────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const category = await prisma.menuCategory.findFirst({
      where: { id: params.id, restaurantId: ctx.restaurantId },
      select: { id: true, name: true },
    });
    if (!category) return notFound("Categoria não encontrada");

    const promo = await prisma.promotion.findFirst({
      where: {
        restaurantId: ctx.restaurantId,
        target: "CATEGORY",
        targetCategoryIds: { has: params.id },
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      select: {
        id: true, type: true, discountValue: true, channel: true,
        status: true, startsAt: true, endsAt: true, name: true,
      },
    });

    if (!promo) return ok({ promotion: null });

    const discountValue = Number(promo.discountValue);
    const channelUi = promo.channel === "ALL" ? "BOTH" : promo.channel === "QR_MENU" ? "DINE_IN" : "DELIVERY";

    return ok({
      promotion: {
        id:            promo.id,
        status:        promo.status,
        discountType:  "PERCENTAGE" as const, // category promos are PERCENTAGE only (MVP)
        discountValue,
        channel:       channelUi,
        startsAt:      promo.startsAt?.toISOString() ?? null,
        endsAt:        promo.endsAt?.toISOString()   ?? null,
      },
    });
  } catch (err) {
    console.error("[GET /api/menu/categories/[id]/promotion]", err);
    return serverError();
  }
}

// ── PUT — upsert category promotion (PERCENTAGE only) ────────────────────────

const putSchema = z.object({
  discountPercent: z.number().gt(0).lt(100),
  channel: z.enum(["DELIVERY", "DINE_IN", "BOTH"]),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt:   z.string().datetime().nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const category = await prisma.menuCategory.findFirst({
      where: { id: params.id, restaurantId: ctx.restaurantId },
      select: { id: true, name: true },
    });
    if (!category) return notFound("Categoria não encontrada");

    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) return badRequest("Dados inválidos", parsed.error.flatten());

    const { discountPercent, channel, startsAt, endsAt } = parsed.data;

    const dbChannel: PromotionChannel =
      channel === "BOTH" ? PromotionChannel.ALL
      : channel === "DINE_IN" ? PromotionChannel.QR_MENU
      : PromotionChannel.DELIVERY;

    const existing = await prisma.promotion.findFirst({
      where: {
        restaurantId: ctx.restaurantId,
        target: "CATEGORY",
        targetCategoryIds: { has: params.id },
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      select: { id: true },
    });

    const data = {
      status:             "ACTIVE" as const,
      type:               "PERCENTAGE" as const,
      discountValue:      discountPercent,
      channel:            dbChannel,
      startsAt:           startsAt ? new Date(startsAt) : null,
      endsAt:             endsAt   ? new Date(endsAt)   : null,
      target:             "CATEGORY" as const,
      targetCategoryIds:  [params.id],
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
          restaurantId:      ctx.restaurantId,
          name:              `Promoção categoria: ${category.name}`,
          ...data,
        },
        select: { id: true, status: true },
      });
    }

    return ok({ promotionId: promo.id, status: promo.status });
  } catch (err) {
    console.error("[PUT /api/menu/categories/[id]/promotion]", err);
    return serverError();
  }
}

// ── DELETE — pause category promotion ────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const existing = await prisma.promotion.findFirst({
      where: {
        restaurantId: ctx.restaurantId,
        target: "CATEGORY",
        targetCategoryIds: { has: params.id },
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      select: { id: true },
    });

    if (!existing) return notFound("Nenhuma promoção encontrada para esta categoria");

    await prisma.promotion.update({
      where: { id: existing.id },
      data:  { status: "PAUSED" },
    });

    return ok({ paused: true });
  } catch (err) {
    console.error("[DELETE /api/menu/categories/[id]/promotion]", err);
    return serverError();
  }
}
