/**
 * RestaurantDefaultsService
 *
 * Creates default configuration rows for a newly registered restaurant.
 * Idempotent: safe to run multiple times — only creates missing rows,
 * never overwrites existing settings.
 */

import { prisma } from "@/lib/prisma";

export interface DefaultsReport {
  restaurantId: string;
  created: string[];
  skipped: string[];
}

export class RestaurantDefaultsService {
  /**
   * Ensure all singleton configs exist for a restaurant.
   * Returns a report of what was created vs. already present.
   */
  static async createRestaurantDefaults(restaurantId: string): Promise<DefaultsReport> {
    const created: string[] = [];
    const skipped: string[] = [];

    // ── Singleton configs (parallel) ──────────────────────────────────────────
    const [hasBrand, hasWhatsApp, hasDelivery, hasPayment, hasPolicies, hasCRM] =
      await Promise.all([
        prisma.restaurantBrandConfig.findUnique({ where: { restaurantId }, select: { id: true } }),
        prisma.whatsAppAgentConfig.findUnique({ where: { restaurantId }, select: { id: true } }),
        prisma.deliveryConfig.findUnique({ where: { restaurantId }, select: { id: true } }),
        prisma.paymentSettings.findUnique({ where: { restaurantId }, select: { id: true } }),
        prisma.storePolicies.findUnique({ where: { restaurantId }, select: { id: true } }),
        prisma.restaurantCRMProfile.findUnique({ where: { restaurantId }, select: { id: true } }),
      ]);

    const creates: Promise<unknown>[] = [];

    if (!hasBrand) {
      creates.push(prisma.restaurantBrandConfig.create({ data: { restaurantId } }));
      created.push("RestaurantBrandConfig");
    } else {
      skipped.push("RestaurantBrandConfig");
    }

    if (!hasWhatsApp) {
      creates.push(prisma.whatsAppAgentConfig.create({ data: { restaurantId } }));
      created.push("WhatsAppAgentConfig");
    } else {
      skipped.push("WhatsAppAgentConfig");
    }

    if (!hasDelivery) {
      creates.push(prisma.deliveryConfig.create({ data: { restaurantId } }));
      created.push("DeliveryConfig");
    } else {
      skipped.push("DeliveryConfig");
    }

    if (!hasPayment) {
      creates.push(prisma.paymentSettings.create({ data: { restaurantId } }));
      created.push("PaymentSettings");
    } else {
      skipped.push("PaymentSettings");
    }

    if (!hasPolicies) {
      creates.push(prisma.storePolicies.create({ data: { restaurantId } }));
      created.push("StorePolicies");
    } else {
      skipped.push("StorePolicies");
    }

    if (!hasCRM) {
      creates.push(
        prisma.restaurantCRMProfile.create({
          data: {
            restaurantId,
            toneProfile: "FRIENDLY",
            styleWeights: {},
            profileVersion: 0,
          },
        })
      );
      created.push("RestaurantCRMProfile");
    } else {
      skipped.push("RestaurantCRMProfile");
    }

    await Promise.all(creates);

    // ── BusinessHours: 7 rows (Sun–Sat), skip existing days ─────────────────
    const existingDays = await prisma.businessHours.findMany({
      where: { restaurantId },
      select: { dayOfWeek: true },
    });
    const existingDaySet = new Set(existingDays.map((r) => r.dayOfWeek));
    const missingDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !existingDaySet.has(d));

    if (missingDays.length > 0) {
      await prisma.businessHours.createMany({
        data: missingDays.map((dayOfWeek) => ({
          restaurantId,
          dayOfWeek,
          isOpen: dayOfWeek !== 0, // Sunday closed by default
          openTime: "09:00",
          closeTime: "22:00",
        })),
        skipDuplicates: true,
      });
      created.push(`BusinessHours(${missingDays.length} days)`);
    } else {
      skipped.push("BusinessHours");
    }

    // ── CRMAutomation: one row per trigger type ───────────────────────────────
    const existingTriggers = await prisma.cRMAutomation.findMany({
      where: { restaurantId },
      select: { trigger: true },
    });
    const existingTriggerSet = new Set(existingTriggers.map((r) => r.trigger));
    const allTriggers = ["REACTIVATION", "BIRTHDAY", "POST_ORDER"] as const;
    const missingTriggers = allTriggers.filter((t) => !existingTriggerSet.has(t));

    if (missingTriggers.length > 0) {
      await prisma.cRMAutomation.createMany({
        data: missingTriggers.map((trigger) => ({
          restaurantId,
          trigger,
          isEnabled: false,
          messageTemplate: "",
          triggerAfterDays: 30,
        })),
        skipDuplicates: true,
      });
      created.push(`CRMAutomation(${missingTriggers.length} triggers)`);
    } else {
      skipped.push("CRMAutomation");
    }

    console.log(
      `[RestaurantDefaults] restaurantId=${restaurantId} ` +
        `created=[${created.join(", ") || "none"}] skipped=[${skipped.join(", ") || "none"}]`
    );

    return { restaurantId, created, skipped };
  }
}
