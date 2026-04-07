import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { TopBar } from "@/components/layout/TopBar";
import { PromotionsClient } from "./PromotionsClient";
import type { PromotionRow } from "@/services/promotions/PromotionService";
import type { Promotion } from "@prisma/client";

export const metadata = { title: "Promoções" };
export const dynamic = "force-dynamic";

export default async function PromotionsPage() {
  let restaurantId: string | null = null;
  try { restaurantId = getTenantId(); } catch { /* not authenticated */ }

  let initialPromotions: PromotionRow[] = [];

  if (restaurantId) {
    const rows = await prisma.promotion.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const now = new Date();

    initialPromotions = rows.map((p: Promotion) => {
      let displayStatus: PromotionRow["displayStatus"] = "DRAFT";
      if (p.status === "PAUSED") {
        displayStatus = "PAUSED";
      } else if (p.status === "DRAFT") {
        displayStatus = "DRAFT";
      } else {
        if (p.endsAt && p.endsAt < now) {
          displayStatus = "EXPIRED";
        } else if (p.startsAt && p.startsAt > now) {
          displayStatus = "SCHEDULED";
        } else {
          displayStatus = "ACTIVE";
        }
      }

      return {
        id:                p.id,
        name:              p.name,
        description:       p.description ?? null,
        type:              p.type,
        status:            p.status,
        displayStatus,
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
        createdAt:         p.createdAt.toISOString(),
        updatedAt:         p.updatedAt.toISOString(),
      };
    });
  }

  return (
    <>
      <TopBar title="Promoções" />
      <PromotionsClient initialPromotions={initialPromotions} />
    </>
  );
}
