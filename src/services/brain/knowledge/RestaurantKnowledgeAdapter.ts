/**
 * RestaurantKnowledgeAdapter — maps what Foocci ALREADY knows about a restaurant
 * into the generic BusinessKnowledgeSnapshot. Read-only, summary/count level —
 * no customer PII ever enters the snapshot (no names, phones, addresses).
 *
 * v1 covers: identity, payments, delivery/pickup, menu size, library materials,
 * approved evidence count, and the missing-context list (e.g. meal-voucher
 * benefits are NOT a configurable in the schema → agents must never claim them).
 */

import { prisma } from "@/lib/prisma";
import type { BusinessKnowledgeAdapter, BusinessKnowledgeSnapshot } from "./BusinessKnowledgeContract";

export const restaurantKnowledgeAdapter: BusinessKnowledgeAdapter = {
  businessType: "RESTAURANT",

  async getSnapshot(businessId: string): Promise<BusinessKnowledgeSnapshot> {
    const missingContext: string[] = [];
    const safetyNotes: string[] = [
      "Nunca inventar produto, preço, forma de pagamento ou promoção que não esteja cadastrado.",
      "Snapshot é agregado — nunca contém nome/telefone/endereço de cliente.",
    ];

    const [restaurant, menuItemCount, materialCount, approvedEvidenceCount] = await Promise.all([
      prisma.restaurant
        .findUnique({
          where: { id: businessId },
          select: {
            name: true,
            paymentSettings: { select: { acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: true } },
            deliveryConfig: { select: { enabled: true, pickupEnabled: true } },
            brandConfig: { select: { tone: true } },
          },
        })
        .catch(() => null),
      prisma.menuItem.count({ where: { category: { restaurantId: businessId } } }).catch(() => 0),
      prisma.agentLibrarySource.count({ where: { agentSlug: "waiter" } }).catch(() => 0),
      prisma.waiterResultEvidence.count({ where: { restaurantId: businessId, status: "APPROVED" } }).catch(() => 0),
    ]);

    if (!restaurant) {
      return {
        businessId,
        businessType: "RESTAURANT",
        truthSources: {},
        missingContext: ["perfil do restaurante", "formas de pagamento", "cardápio", "delivery/retirada"],
        safetyNotes,
      };
    }

    const payments = restaurant.paymentSettings
      ? {
          pix: restaurant.paymentSettings.acceptPix,
          cartao: restaurant.paymentSettings.acceptCard,
          dinheiro: restaurant.paymentSettings.acceptCash,
          link: restaurant.paymentSettings.acceptLink,
        }
      : undefined;
    if (!payments) missingContext.push("formas de pagamento");
    // The schema has no meal-voucher (Alelo/VR/Sodexo) configuration at all.
    missingContext.push("benefício refeição (Alelo/VR/Sodexo) — não cadastrado");

    const hours = restaurant.deliveryConfig
      ? { delivery: restaurant.deliveryConfig.enabled, retirada: restaurant.deliveryConfig.pickupEnabled }
      : undefined;
    if (!hours) missingContext.push("delivery/retirada");
    missingContext.push("horários de funcionamento detalhados");

    return {
      businessId,
      businessType: "RESTAURANT",
      truthSources: {
        products: [{ menuItems: menuItemCount }],
        payments,
        hours,
        policies: [{ tone: restaurant.brandConfig?.tone ?? "friendly", nome: restaurant.name }],
        materials: [{ librarySources: materialCount }],
        evidence: [{ approved: approvedEvidenceCount }],
      },
      missingContext,
      safetyNotes,
    };
  },
};
