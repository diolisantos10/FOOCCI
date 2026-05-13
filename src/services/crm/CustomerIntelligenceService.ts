/**
 * CustomerIntelligenceService
 *
 * Evaluates customer data completeness, contactability, and enrichment
 * priority. Generates deterministic enrichment opportunities and manages
 * CustomerDataSignal records (inferred vs confirmed data signals).
 *
 * Pure computation functions are exported for use in page.tsx (server side).
 * DB-facing methods are static on the class.
 *
 * Signal rules:
 *   - Inferred signals must not auto-overwrite confirmed Customer fields.
 *   - Confirmed signals (status=CONFIRMED) are the source of truth for that field.
 *   - Never invent customer data.
 */

import { prisma } from "@/lib/prisma";
import { isGuestIdentifier } from "@/lib/guest";

// ─── Exported types ───────────────────────────────────────────────────────────

export type ContactabilityStatus =
  | "CONTACTABLE"
  | "NON_CONTACTABLE"
  | "OPT_OUT"
  | "NEEDS_REVIEW";

export type EnrichmentPriority = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type SignalType =
  | "PREFERENCE"
  | "POSSIBLE_FAVORITE_PRODUCT"
  | "MISSING_FIELD"
  | "ADDRESS_CLUE"
  | "BIRTHDAY_REQUESTED"
  | "NAME_CLUE";

export type SignalSource =
  | "IMPORT"
  | "ORDER_HISTORY"
  | "WHATSAPP_CONVERSATION"
  | "HUMAN_NOTE"
  | "CRM_CAMPAIGN"
  | "ANALYTICS";

export type SignalStatus = "INFERRED" | "CONFIRMED" | "REJECTED" | "NEEDS_REVIEW";

export interface CustomerDataSignalRecord {
  id:          string;
  type:        SignalType;
  field:       string | null;
  value:       string | null;
  confidence:  number | null;
  source:      SignalSource;
  status:      SignalStatus;
  notes:       string | null;
  createdAt:   string;
  reviewedAt:  string | null;
}

export interface EnrichmentOpportunity {
  id:          string;
  title:       string;
  description: string;
  channel:     "WHATSAPP" | "INTERNAL" | "MANUAL";
  priority:    EnrichmentPriority;
}

export interface CustomerIntelligenceReport {
  completenessScore:            number;          // 0–100
  contactabilityStatus:         ContactabilityStatus;
  enrichmentPriority:           EnrichmentPriority;
  missingFields:                string[];
  weakFields:                   string[];
  recommendedNextDataToCollect: string | null;
  enrichmentOpportunities:      EnrichmentOpportunity[];
  campaignEligible:             boolean;
  signals:                      CustomerDataSignalRecord[];
}

// ─── Customer shape required for intelligence evaluation ─────────────────────

export interface CustomerSnapshot {
  id:                  string;
  restaurantId:        string;
  name:                string;
  phone:               string | null;
  email:               string | null;
  document:            string | null;
  birthDate:           Date | null;
  notes:               string | null;
  totalOrders:         number;
  totalSpend:          number;
  lastOrderAt:         Date | null;
  sourceSystem:        string | null;
  crmContactable:      boolean;
  contactStatus:       string | null;
  hasOptedOut:         boolean;
  dataEnrichmentStatus: string | null;
  hasAddresses:        boolean;
  hasPreferences:      boolean;
  importedOrderCount:  number | null;
  importedTotalSpent:  number | null;
}

// ─── Scoring weights (sum = 100) ──────────────────────────────────────────────

const W = {
  phone:          20,
  name:           15,
  email:          10,
  document:       10,
  birthDate:       8,
  address:        12,
  preferences:     8,
  ordersPresent:   7,
  notes:           5,
  sourceSystem:    5,
};

// ─── Pure computation ─────────────────────────────────────────────────────────

export function computeIntelligence(
  snap: CustomerSnapshot,
  signals: CustomerDataSignalRecord[] = [],
): CustomerIntelligenceReport {
  const missingFields: string[] = [];
  const weakFields:    string[] = [];
  let score = 0;

  // Phone
  const hasValidPhone = !!snap.phone && !isGuestIdentifier(snap.phone);
  if (hasValidPhone) {
    score += W.phone;
  } else {
    missingFields.push("phone");
  }

  // Name
  const cleanName = snap.name?.trim();
  if (cleanName && cleanName.length > 1) {
    score += W.name;
    if (cleanName.split(" ").length === 1) {
      weakFields.push("name"); // only first name
    }
  } else {
    missingFields.push("name");
  }

  // Email
  if (snap.email?.trim()) {
    score += W.email;
  } else {
    missingFields.push("email");
  }

  // Document (CPF/CNPJ)
  if (snap.document?.trim()) {
    score += W.document;
  } else {
    missingFields.push("document");
  }

  // Birth date
  if (snap.birthDate) {
    score += W.birthDate;
  } else {
    missingFields.push("birthDate");
  }

  // Address
  if (snap.hasAddresses) {
    score += W.address;
  } else {
    missingFields.push("address");
  }

  // Preferences
  if (snap.hasPreferences) {
    score += W.preferences;
  } else {
    missingFields.push("preferences");
  }

  // Orders present (native or imported)
  const effectiveOrders = snap.totalOrders > 0 || (snap.importedOrderCount ?? 0) > 0;
  if (effectiveOrders) {
    score += W.ordersPresent;
  }

  // Notes
  if (snap.notes?.trim()) {
    score += W.notes;
  }

  // Source system tracked
  if (snap.sourceSystem) {
    score += W.sourceSystem;
  }

  score = Math.min(100, Math.round(score));

  // ── Contactability ───────────────────────────────────────────────────────────

  let contactabilityStatus: ContactabilityStatus;
  if (snap.hasOptedOut) {
    contactabilityStatus = "OPT_OUT";
  } else if (!snap.crmContactable || !hasValidPhone) {
    contactabilityStatus = "NON_CONTACTABLE";
  } else if (snap.contactStatus === "NEEDS_REVIEW") {
    contactabilityStatus = "NEEDS_REVIEW";
  } else {
    contactabilityStatus = "CONTACTABLE";
  }

  const campaignEligible =
    contactabilityStatus === "CONTACTABLE" && hasValidPhone && !snap.hasOptedOut;

  // ── Enrichment priority ───────────────────────────────────────────────────────

  let enrichmentPriority: EnrichmentPriority;
  if (!hasValidPhone) {
    enrichmentPriority = "HIGH";
  } else if (score < 40) {
    enrichmentPriority = "HIGH";
  } else if (score < 65) {
    enrichmentPriority = "MEDIUM";
  } else if (score < 85) {
    enrichmentPriority = "LOW";
  } else {
    enrichmentPriority = "NONE";
  }

  // ── Recommended next field ────────────────────────────────────────────────────

  const priorityOrder = ["phone", "name", "email", "document", "birthDate", "address", "preferences"];
  const nextField = priorityOrder.find((f) => missingFields.includes(f)) ?? null;

  const fieldLabels: Record<string, string> = {
    phone:       "telefone",
    name:        "nome completo",
    email:       "e-mail",
    document:    "CPF ou CNPJ",
    birthDate:   "data de aniversário",
    address:     "endereço",
    preferences: "preferências alimentares",
  };

  const recommendedNextDataToCollect = nextField ? (fieldLabels[nextField] ?? nextField) : null;

  // ── Enrichment opportunities ──────────────────────────────────────────────────

  const opportunities: EnrichmentOpportunity[] = [];

  if (!hasValidPhone) {
    opportunities.push({
      id:          "missing-phone",
      title:       "Buscar telefone",
      description: "Cliente sem telefone — não pode ser contatado via WhatsApp. Enriquecer cadastro manualmente ou via outra fonte.",
      channel:     "MANUAL",
      priority:    "HIGH",
    });
  }

  if (cleanName && cleanName.split(" ").length === 1) {
    opportunities.push({
      id:          "partial-name",
      title:       "Confirmar nome completo",
      description: "Apenas o primeiro nome está cadastrado. Confirmar sobrenome em próxima interação.",
      channel:     hasValidPhone ? "WHATSAPP" : "INTERNAL",
      priority:    "LOW",
    });
  } else if (!cleanName || cleanName.length <= 1) {
    opportunities.push({
      id:          "missing-name",
      title:       "Confirmar nome",
      description: "Cliente identificado apenas pelo telefone. Perguntar o nome naturalmente na próxima conversa.",
      channel:     hasValidPhone ? "WHATSAPP" : "INTERNAL",
      priority:    "MEDIUM",
    });
  }

  if (!snap.birthDate) {
    opportunities.push({
      id:          "missing-birthday",
      title:       "Coletar data de aniversário",
      description: "Falta aniversário — pode ser coletado em ação VIP ou de relacionamento futura.",
      channel:     hasValidPhone ? "WHATSAPP" : "INTERNAL",
      priority:    "LOW",
    });
  }

  if (!snap.hasAddresses && effectiveOrders) {
    opportunities.push({
      id:          "missing-address",
      title:       "Coletar endereço de entrega",
      description: "Cliente com histórico de pedidos mas sem endereço cadastrado. Coletar no próximo pedido delivery.",
      channel:     hasValidPhone ? "WHATSAPP" : "INTERNAL",
      priority:    "MEDIUM",
    });
  }

  if (!snap.email?.trim()) {
    opportunities.push({
      id:          "missing-email",
      title:       "Coletar e-mail",
      description: "E-mail não cadastrado. Útil para ações futuras fora do WhatsApp.",
      channel:     hasValidPhone ? "WHATSAPP" : "INTERNAL",
      priority:    "LOW",
    });
  }

  if ((snap.importedOrderCount ?? 0) > 0 && snap.totalOrders === 0) {
    opportunities.push({
      id:          "imported-summary-only",
      title:       "Histórico importado sem itens detalhados",
      description: "Pedidos foram importados como resumo financeiro, sem itens por cliente. Acompanhar pedidos nativos para enriquecer histórico.",
      channel:     "INTERNAL",
      priority:    "LOW",
    });
  }

  return {
    completenessScore:            score,
    contactabilityStatus,
    enrichmentPriority,
    missingFields,
    weakFields,
    recommendedNextDataToCollect,
    enrichmentOpportunities:      opportunities,
    campaignEligible,
    signals,
  };
}

// ─── Infer product preference signals from order history ─────────────────────

export async function inferSignalsFromOrders(
  restaurantId: string,
  customerId:   string,
): Promise<void> {
  // Top ordered items in last 90 days
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const topItems = await prisma.orderItem.groupBy({
    by:    ["name"],
    where: {
      order: {
        customerId,
        restaurantId,
        createdAt: { gte: since },
        status:    { not: "CANCELLED" },
      },
    },
    _sum:    { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take:    3,
  });

  if (topItems.length === 0) return;

  // Upsert signals — skip items that already have a CONFIRMED signal
  for (const item of topItems) {
    const qty = item._sum.quantity ?? 0;
    if (qty < 2) continue; // need at least 2 orders to infer preference

    const existing = await prisma.customerDataSignal.findFirst({
      where: {
        customerId,
        restaurantId,
        type:   "POSSIBLE_FAVORITE_PRODUCT",
        field:  "preferences.favoriteDish",
        value:  item.name,
        status: { in: ["CONFIRMED", "REJECTED"] },
      },
    });

    if (existing) continue; // already reviewed — don't re-create

    // Check if an INFERRED signal already exists for this item
    const alreadyInferred = await prisma.customerDataSignal.findFirst({
      where: {
        customerId,
        restaurantId,
        type:  "POSSIBLE_FAVORITE_PRODUCT",
        field: "preferences.favoriteDish",
        value: item.name,
      },
    });

    if (alreadyInferred) {
      // Update confidence based on new quantity
      await prisma.customerDataSignal.update({
        where: { id: alreadyInferred.id },
        data:  { confidence: Math.min(1, qty / 10) },
      });
    } else {
      await prisma.customerDataSignal.create({
        data: {
          restaurantId,
          customerId,
          type:       "POSSIBLE_FAVORITE_PRODUCT",
          field:      "preferences.favoriteDish",
          value:      item.name,
          confidence: Math.min(1, qty / 10),
          source:     "ORDER_HISTORY",
          status:     "INFERRED",
          notes:      `Pedido ${qty}x nos últimos 90 dias`,
        },
      });
    }
  }
}

// ─── Service class (DB operations) ───────────────────────────────────────────

export class CustomerIntelligenceService {
  static async getSignals(
    customerId:   string,
    restaurantId: string,
  ): Promise<CustomerDataSignalRecord[]> {
    const rows = await prisma.customerDataSignal.findMany({
      where:   { customerId, restaurantId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return rows.map((r) => ({
      id:         r.id,
      type:       r.type as SignalType,
      field:      r.field,
      value:      r.value,
      confidence: r.confidence,
      source:     r.source as SignalSource,
      status:     r.status as SignalStatus,
      notes:      r.notes,
      createdAt:  r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    }));
  }

  static async createSignal(
    restaurantId: string,
    customerId:   string,
    input: {
      type:       SignalType;
      field?:     string;
      value?:     string;
      confidence?: number;
      source:     SignalSource;
      status?:    SignalStatus;
      notes?:     string;
    },
  ): Promise<CustomerDataSignalRecord> {
    const row = await prisma.customerDataSignal.create({
      data: {
        restaurantId,
        customerId,
        type:       input.type,
        field:      input.field ?? null,
        value:      input.value ?? null,
        confidence: input.confidence ?? null,
        source:     input.source,
        status:     input.status ?? "INFERRED",
        notes:      input.notes ?? null,
      },
    });

    return {
      id:         row.id,
      type:       row.type as SignalType,
      field:      row.field,
      value:      row.value,
      confidence: row.confidence,
      source:     row.source as SignalSource,
      status:     row.status as SignalStatus,
      notes:      row.notes,
      createdAt:  row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    };
  }

  static async updateSignalStatus(
    id:           string,
    restaurantId: string,
    status:       SignalStatus,
  ): Promise<void> {
    await prisma.customerDataSignal.updateMany({
      where: { id, restaurantId },
      data:  {
        status,
        reviewedAt: new Date(),
      },
    });
  }

  static async persistCompletenessScore(
    customerId:   string,
    score:        number,
    enrichmentStatus: string,
  ): Promise<void> {
    await prisma.customer.update({
      where: { id: customerId },
      data:  {
        dataCompletenessScore: score,
        dataEnrichmentStatus:  enrichmentStatus,
        lastEnrichmentAt:      new Date(),
      },
    });
  }

  static async getFullReport(
    restaurantId: string,
    customerId:   string,
    snap:         CustomerSnapshot,
  ): Promise<CustomerIntelligenceReport> {
    // Generate inferred signals from order history (idempotent)
    await inferSignalsFromOrders(restaurantId, customerId);

    const signals = await this.getSignals(customerId, restaurantId);
    const report  = computeIntelligence(snap, signals);

    // Persist the computed score asynchronously (fire-and-forget in caller)
    const enrichmentStatus =
      report.completenessScore >= 85 ? "COMPLETE"
      : report.completenessScore >= 50 ? "PARTIAL"
      : "NEEDS_ENRICHMENT";

    // Persist in background — don't block page render
    void this.persistCompletenessScore(customerId, report.completenessScore, enrichmentStatus);

    return report;
  }
}
