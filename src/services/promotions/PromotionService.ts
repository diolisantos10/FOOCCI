import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, type ServiceResult, type PaginatedResult } from "@/types";
import type {
  CreatePromotionInput,
  UpdatePromotionInput,
  PromotionListQuery,
} from "@/validators/promotions";
import type { PromotionStatus, Promotion } from "@prisma/client";

// ── Serialised shape returned to the client ───────────────────────────────────

export type PromotionRow = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  displayStatus: "DRAFT" | "ACTIVE" | "PAUSED" | "SCHEDULED" | "EXPIRED";
  discountValue: number;
  target: string;
  targetProductIds: string[];
  targetCategoryIds: string[];
  channel: string;
  couponCode: string | null;
  startsAt: string | null;
  endsAt: string | null;
  daysOfWeek: number[];
  timeFrom: string | null;
  timeTo: string | null;
  minOrderValue: number | null;
  minQuantity: number | null;
  maxUses: number | null;
  usedCount: number;
  oneTimePerUser: boolean;
  combinable: boolean;
  bannerImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDecimal(v: number | undefined | null): Decimal | null {
  if (v == null) return null;
  return new Decimal(v);
}

function computeDisplayStatus(
  status: PromotionStatus,
  startsAt: Date | null,
  endsAt: Date | null
): PromotionRow["displayStatus"] {
  const now = new Date();
  if (status === "PAUSED") return "PAUSED";
  if (status === "DRAFT") return "DRAFT";
  // status === ACTIVE
  if (endsAt && endsAt < now) return "EXPIRED";
  if (startsAt && startsAt > now) return "SCHEDULED";
  return "ACTIVE";
}

function serialize(p: Promotion): PromotionRow {
  return {
    id:                p.id,
    name:              p.name,
    description:       p.description ?? null,
    type:              p.type,
    status:            p.status,
    displayStatus:     computeDisplayStatus(p.status, p.startsAt, p.endsAt),
    discountValue:     Number(p.discountValue),
    target:            p.target,
    targetProductIds:  p.targetProductIds ?? [],
    targetCategoryIds: p.targetCategoryIds ?? [],
    channel:           p.channel,
    couponCode:        p.couponCode ?? null,
    startsAt:          p.startsAt ? p.startsAt.toISOString() : null,
    endsAt:            p.endsAt ? p.endsAt.toISOString() : null,
    daysOfWeek:        p.daysOfWeek ?? [],
    timeFrom:          p.timeFrom ?? null,
    timeTo:            p.timeTo ?? null,
    minOrderValue:     p.minOrderValue != null ? Number(p.minOrderValue) : null,
    minQuantity:       p.minQuantity ?? null,
    maxUses:           p.maxUses ?? null,
    usedCount:         p.usedCount,
    oneTimePerUser:    p.oneTimePerUser,
    combinable:        p.combinable,
    bannerImageUrl:    p.bannerImageUrl ?? null,
    createdAt:         p.createdAt.toISOString(),
    updatedAt:         p.updatedAt.toISOString(),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class PromotionService {
  static async list(
    restaurantId: string,
    query: PromotionListQuery
  ): Promise<ServiceResult<PaginatedResult<PromotionRow>>> {
    const { page, limit, search, type } = query;
    const skip = (page - 1) * limit;

    // Build where clause — status filtering is done after fetch (displayStatus is computed)
    const where = {
      restaurantId,
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
              { couponCode: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.promotion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.promotion.count({ where }),
    ]);

    let data = rows.map(serialize);

    // Apply displayStatus filter post-fetch (computed field)
    if (query.status) {
      data = data.filter((p) => p.displayStatus === query.status);
    }

    return serviceOk({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  static async getById(
    restaurantId: string,
    id: string
  ): Promise<ServiceResult<PromotionRow>> {
    const p = await prisma.promotion.findFirst({ where: { id, restaurantId } });
    if (!p) return serviceFail("Promoção não encontrada", 404);
    return serviceOk(serialize(p));
  }

  static async create(
    restaurantId: string,
    input: CreatePromotionInput
  ): Promise<ServiceResult<PromotionRow>> {
    // Coupon type requires a code
    if (input.type === "COUPON" && !input.couponCode?.trim()) {
      return serviceFail("Promoções do tipo Cupom exigem um código.");
    }

    const p = await prisma.promotion.create({
      data: {
        restaurantId,
        name:              input.name,
        description:       input.description ?? null,
        type:              input.type,
        status:            "DRAFT",
        discountValue:     new Decimal(input.discountValue),
        target:            input.target ?? "ORDER",
        targetProductIds:  input.targetProductIds ?? [],
        targetCategoryIds: input.targetCategoryIds ?? [],
        channel:           input.channel ?? "ALL",
        couponCode:        input.couponCode ?? null,
        bannerImageUrl:    input.bannerImageUrl ?? null,
        startsAt:          input.startsAt ? new Date(input.startsAt) : null,
        endsAt:            input.endsAt ? new Date(input.endsAt) : null,
        daysOfWeek:        input.daysOfWeek ?? [],
        timeFrom:          input.timeFrom ?? null,
        timeTo:            input.timeTo ?? null,
        minOrderValue:     toDecimal(input.minOrderValue),
        minQuantity:       input.minQuantity ?? null,
        maxUses:           input.maxUses ?? null,
        oneTimePerUser:    input.oneTimePerUser ?? false,
        combinable:        input.combinable ?? false,
      },
    });

    return serviceOk(serialize(p));
  }

  static async update(
    restaurantId: string,
    id: string,
    input: UpdatePromotionInput
  ): Promise<ServiceResult<PromotionRow>> {
    const existing = await prisma.promotion.findFirst({ where: { id, restaurantId } });
    if (!existing) return serviceFail("Promoção não encontrada", 404);

    if (input.type === "COUPON" && !input.couponCode?.trim() && !existing.couponCode) {
      return serviceFail("Promoções do tipo Cupom exigem um código.");
    }

    const p = await prisma.promotion.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.discountValue !== undefined && { discountValue: new Decimal(input.discountValue) }),
        ...(input.target !== undefined && { target: input.target }),
        ...(input.targetProductIds !== undefined && { targetProductIds: input.targetProductIds }),
        ...(input.targetCategoryIds !== undefined && { targetCategoryIds: input.targetCategoryIds }),
        ...(input.channel !== undefined && { channel: input.channel }),
        ...(input.couponCode !== undefined && { couponCode: input.couponCode }),
        ...(input.bannerImageUrl !== undefined && { bannerImageUrl: input.bannerImageUrl ?? null }),
        ...(input.startsAt !== undefined && { startsAt: input.startsAt ? new Date(input.startsAt) : null }),
        ...(input.endsAt !== undefined && { endsAt: input.endsAt ? new Date(input.endsAt) : null }),
        ...(input.daysOfWeek !== undefined && { daysOfWeek: input.daysOfWeek }),
        ...(input.timeFrom !== undefined && { timeFrom: input.timeFrom }),
        ...(input.timeTo !== undefined && { timeTo: input.timeTo }),
        ...(input.minOrderValue !== undefined && { minOrderValue: toDecimal(input.minOrderValue) }),
        ...(input.minQuantity !== undefined && { minQuantity: input.minQuantity }),
        ...(input.maxUses !== undefined && { maxUses: input.maxUses }),
        ...(input.oneTimePerUser !== undefined && { oneTimePerUser: input.oneTimePerUser }),
        ...(input.combinable !== undefined && { combinable: input.combinable }),
      },
    });

    return serviceOk(serialize(p));
  }

  static async delete(
    restaurantId: string,
    id: string
  ): Promise<ServiceResult<null>> {
    const existing = await prisma.promotion.findFirst({ where: { id, restaurantId } });
    if (!existing) return serviceFail("Promoção não encontrada", 404);
    await prisma.promotion.delete({ where: { id } });
    return serviceOk(null);
  }

  static async duplicate(
    restaurantId: string,
    id: string
  ): Promise<ServiceResult<PromotionRow>> {
    const source = await prisma.promotion.findFirst({ where: { id, restaurantId } });
    if (!source) return serviceFail("Promoção não encontrada", 404);

    const p = await prisma.promotion.create({
      data: {
        restaurantId,
        name:              `${source.name} (cópia)`,
        description:       source.description,
        type:              source.type,
        status:            "DRAFT",
        discountValue:     source.discountValue,
        target:            source.target,
        targetProductIds:  source.targetProductIds,
        targetCategoryIds: source.targetCategoryIds,
        channel:           source.channel,
        couponCode:        source.couponCode ? `${source.couponCode}-2` : null,
        bannerImageUrl:    source.bannerImageUrl,
        startsAt:          source.startsAt,
        endsAt:            source.endsAt,
        daysOfWeek:        source.daysOfWeek,
        timeFrom:          source.timeFrom,
        timeTo:            source.timeTo,
        minOrderValue:     source.minOrderValue,
        minQuantity:       source.minQuantity,
        maxUses:           source.maxUses,
        oneTimePerUser:    source.oneTimePerUser,
        combinable:        source.combinable,
      },
    });

    return serviceOk(serialize(p));
  }
}
