/**
 * crmScenarios — Deterministic test cases for the CRM Agent logic.
 *
 * Mirrors the Waiter Test Center in spirit: every scenario exercises a specific
 * CRM behavior class by feeding a FIXED fixture into a PURE CRM function
 * (no DB, no LLM, no network, no sends). The crmEvaluator runs the matching
 * pure function and checks the result against the scenario's expectation.
 *
 * 7 groups:
 *  1. contact_safety    — ContactSafetyService.evaluateContactSafety
 *  2. segmentation      — CustomerSegmentService.resolveCustomerClassification
 *  3. intelligence      — CustomerIntelligenceSnapshotService.computeSnapshot.nextBestAction
 *  4. action_center     — CrmActionCenterService.computeActions
 *  5. message_variation — MessageVariationService.composePreview (deterministic candidates)
 *  6. attribution       — CampaignAttributionService.classifyAttributionQuality
 *  7. review_request    — ReviewRequestService.evaluateReviewEligibility
 *
 * NOTHING here sends a message, runs a campaign, or mutates customer data.
 */

import type { ContactSafetyEvalInput, ContactBlockReason } from "../ContactSafetyService";
import type { ClassificationInput } from "../CustomerSegmentService";
import type { CustomerSegmentValue, CustomerTierValue } from "../crm-helpers";
import type { SnapshotComputeInput, NextBestActionType, SuggestedOfferType } from "../CustomerIntelligenceSnapshotService";
import type { ComputeActionsInput, CustomerComputeRow, CrmActionType } from "../CrmActionCenterService";
import type { CustomerIntelligenceSnapshot } from "../CustomerIntelligenceSnapshotService";
import type { GenerationIntent, GenerationSafety } from "../MessageVariationService";
import type { AttributionQuality } from "../CampaignAttributionService";
import type { ReviewEligibilityInput, ReviewBlockReason, ReviewPlatform } from "../ReviewRequestService";

import { DEFAULT_SAFETY_CONFIG } from "@/lib/crm-safety";
import { DEFAULT_SEGMENT_CONFIG } from "@/lib/crm-segments";
import { DEFAULT_SETTINGS } from "../RelationshipProgramService";

// ─── shared ─────────────────────────────────────────────────────────────────

/** Fixed "now" so every relative date in fixtures is deterministic. */
export const SCENARIO_NOW = new Date("2026-06-03T12:00:00Z");

function daysAgo(n: number): Date {
  return new Date(SCENARIO_NOW.getTime() - n * 86_400_000);
}

export type Severity = "P0" | "P1" | "P2";

export type CrmScenarioGroupId =
  | "contact_safety"
  | "segmentation"
  | "intelligence"
  | "action_center"
  | "message_variation"
  | "attribution"
  | "review_request";

export const GROUP_LABELS: Record<CrmScenarioGroupId, string> = {
  contact_safety:    "Contact Safety",
  segmentation:      "Segmentação / Tier",
  intelligence:      "Customer Intelligence",
  action_center:     "Action Center",
  message_variation: "Message Variation",
  attribution:       "Atribuição",
  review_request:    "Review Request",
};

interface BaseScenario {
  id:          string;
  groupLabel:  string;
  name:        string;
  description: string;
  severity:    Severity;
}

/** Message-variation scenarios feed a snapshot + intent; the evaluator builds the
 *  deterministic candidate drafts and runs composePreview. */
export interface MessageVariationScenarioInput {
  snapshot:         CustomerIntelligenceSnapshot | null;
  intent:           GenerationIntent;
  couponCode:       string | null;
  safety:           GenerationSafety;
  previousMessages: string[];
}

export type CrmScenario =
  | (BaseScenario & {
      group:  "contact_safety";
      input:  ContactSafetyEvalInput;
      expect: { sendable: boolean; reason?: ContactBlockReason | null };
    })
  | (BaseScenario & {
      group:  "segmentation";
      input:  ClassificationInput;
      expect: { segment: CustomerSegmentValue; tier?: CustomerTierValue };
    })
  | (BaseScenario & {
      group:  "intelligence";
      input:  SnapshotComputeInput;
      expect: { actionType?: NextBestActionType; safeToContact?: boolean; suggestedOfferType?: SuggestedOfferType };
    })
  | (BaseScenario & {
      group:  "action_center";
      input:  ComputeActionsInput;
      expect: { mustInclude?: CrmActionType[]; mustExclude?: CrmActionType[]; readySafety?: { type: CrmActionType; status: "READY" | "PARTIAL" | "BLOCKED" } };
    })
  | (BaseScenario & {
      group:  "message_variation";
      input:  MessageVariationScenarioInput;
      expect: { blocked: boolean; noDiscountWithoutCoupon?: boolean; noInventedFavorite?: boolean };
    })
  | (BaseScenario & {
      group:  "attribution";
      input:  { hasCouponLink: boolean; couponOrderCount: number; assistedConversions: number };
      expect: { quality: AttributionQuality };
    })
  | (BaseScenario & {
      group:  "review_request";
      input:  ReviewEligibilityInput;
      expect: { eligible: boolean; blocks?: ReviewBlockReason[]; preferredPlatform?: ReviewPlatform | null };
    });

// ─── fixture factories ────────────────────────────────────────────────────────

function safetyInput(overrides: Partial<ContactSafetyEvalInput> = {}): ContactSafetyEvalInput {
  return {
    hasOptedOut:                 false,
    crmContactable:              true,
    phone:                       "+5511999990000",
    sendsWithinCooldown:         0,
    sendsWithinWeek:             0,
    otherCampaignSendsWithin24h: 0,
    sameCampaignSends:           0,
    safety:                      { ...DEFAULT_SAFETY_CONFIG },
    evolutionAvailable:          true,
    globalSentToday:             0,
    restaurantOpen:              true,
    isBirthday:                  false,
    enforceTimeWindows:          false,
    enforceDailyCap:             true,
    enforceRestaurantOpen:       false,
    sendingWindow:               null,
    now:                         new Date("2026-06-03T15:00:00Z"), // Wed midday BRT
    ...overrides,
  };
}

function classificationInput(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    lastOrderAt:         null,
    importedLastOrderAt: null,
    totalOrders:         0,
    importedOrderCount:  null,
    totalSpend:          0,
    importedTotalSpent:  null,
    cfg:                 DEFAULT_SEGMENT_CONFIG,
    settings:            DEFAULT_SETTINGS,
    now:                 SCENARIO_NOW,
    ...overrides,
  };
}

function snapshotInput(
  customer: Partial<SnapshotComputeInput["customer"]> = {},
  rest: Partial<Omit<SnapshotComputeInput, "customer">> = {},
): SnapshotComputeInput {
  return {
    customer: {
      id:                  "cust-test",
      name:                "Cliente Teste",
      phone:               "+5511999990000",
      totalOrders:         0,
      totalSpend:          0,
      averageTicket:       null,
      lastOrderAt:         null,
      importedLastOrderAt: null,
      importedOrderCount:  null,
      importedTotalSpent:  null,
      hasOptedOut:         false,
      crmContactable:      true,
      contactStatus:       "CONTACTABLE",
      ...customer,
    },
    favoriteProducts:      [],
    favoriteCategories:    [],
    lastProducts:          [],
    orderDates:            [],
    couponOrderCount:      0,
    campaignReceivedCount: 0,
    lastCampaignAt:        null,
    responseCount:         0,
    lastResponseAt:        null,
    lastOrderDelivered:    false,
    segmentConfig:         DEFAULT_SEGMENT_CONFIG,
    tierSettings:          DEFAULT_SETTINGS,
    now:                   SCENARIO_NOW,
    ...rest,
  };
}

function makeCustomer(overrides: Partial<CustomerComputeRow> = {}): CustomerComputeRow {
  return {
    id:                  "c-default",
    name:                "Cliente",
    phone:               "5511999999999",
    hasOptedOut:         false,
    crmContactable:      true,
    totalSpend:          200,
    totalOrders:         3,
    lastOrderAt:         daysAgo(10),
    importedOrderCount:  null,
    importedTotalSpent:  null,
    importedLastOrderAt: null,
    averageTicket:       66,
    tier:                "BRONZE",
    birthDate:           null,
    ...overrides,
  };
}

function actionInput(overrides: Partial<ComputeActionsInput> = {}): ComputeActionsInput {
  return {
    customers:           [],
    now:                 SCENARIO_NOW,
    hasEvolutionConfig:  true,
    couponUserIds:       new Set(),
    segmentConfig:       DEFAULT_SEGMENT_CONFIG,
    recentCampaignStats: null,
    restaurantAvgTicket: 60,
    hasReviewLink:       true,
    ...overrides,
  };
}

function snapshotForVariation(overrides: Partial<CustomerIntelligenceSnapshot> = {}): CustomerIntelligenceSnapshot {
  return {
    id:                       "cust-1",
    name:                     "Diego Santos",
    phone:                    "5511999999999",
    contactability:           "CONTACTABLE",
    totalOrders:              5,
    totalSpent:               350,
    averageTicket:            70,
    tier:                     "PRATA",
    lastOrderAt:              "2026-03-15T12:00:00Z",
    daysSinceLastOrder:       80,
    segment:                  "FRIO",
    source:                   "native",
    averageDaysBetweenOrders: 15,
    orderFrequencyLabel:      "quinzenal",
    favoriteProducts:         [{ name: "Temaki Salmão", count: 4 }],
    favoriteCategories:       [{ name: "Temakis", count: 6 }],
    lastProducts:             ["Temaki Salmão", "Hot Roll"],
    couponUser:               false,
    campaignReceivedCount:    1,
    lastCampaignAt:           null,
    responseCount:            0,
    lastResponseAt:           null,
    hasOptedOut:              false,
    crmContactable:           true,
    safetyStatus:             "OK",
    nextBestAction: {
      actionType:            "REACTIVATION",
      priority:              "HIGH",
      priorityScore:         75,
      reason:                "Cliente frio recuperável",
      recommendedChannel:    "WHATSAPP",
      safeToContact:         true,
      suggestedCampaignType: "recuperar-frios",
      suggestedOfferType:    "DISCOUNT",
      suggestedMessageGoal:  "Trazer o cliente de volta",
    },
    ...overrides,
  };
}

const SAFE_GEN: GenerationSafety = { hasOptedOut: false, contactable: true, hasPhone: true };

function review(overrides: Partial<ReviewEligibilityInput> = {}): ReviewEligibilityInput {
  return {
    customerName:                "Diego Santos",
    hasOptedOut:                 false,
    crmContactable:              true,
    phone:                       "5511999999999",
    googleReviewUrl:             "https://g.page/r/restaurante",
    ifoodReviewUrl:              null,
    orderStatus:                 "DELIVERED",
    orderSource:                 "whatsapp",
    orderDate:                   daysAgo(2),
    alreadyRequestedForOrder:    false,
    customerLastReviewRequestAt: null,
    hasComplaintSignal:          false,
    safetyDecision:              null,
    tone:                        "friendly",
    emojiUsage:                  "minimal",
    now:                         SCENARIO_NOW,
    ...overrides,
  };
}

// ─── scenario library ─────────────────────────────────────────────────────────

const CONTACT_SAFETY: CrmScenario[] = [
  {
    id: "cs-01", group: "contact_safety", groupLabel: GROUP_LABELS.contact_safety, severity: "P0",
    name: "Cliente seguro e contactável",
    description: "Cliente limpo, com telefone, sem cooldown → sendable",
    input: safetyInput(),
    expect: { sendable: true, reason: null },
  },
  {
    id: "cs-02", group: "contact_safety", groupLabel: GROUP_LABELS.contact_safety, severity: "P0",
    name: "Cliente opt-out",
    description: "Cliente que pediu opt-out nunca pode ser contatado",
    input: safetyInput({ hasOptedOut: true }),
    expect: { sendable: false, reason: "CUSTOMER_OPTED_OUT" },
  },
  {
    id: "cs-03", group: "contact_safety", groupLabel: GROUP_LABELS.contact_safety, severity: "P0",
    name: "Telefone ausente",
    description: "Sem telefone → bloqueado",
    input: safetyInput({ phone: null }),
    expect: { sendable: false, reason: "MISSING_PHONE" },
  },
  {
    id: "cs-04", group: "contact_safety", groupLabel: GROUP_LABELS.contact_safety, severity: "P1",
    name: "Telefone inválido",
    description: "Telefone com formato implausível → bloqueado",
    input: safetyInput({ phone: "12345" }),
    expect: { sendable: false, reason: "INVALID_PHONE_FORMAT" },
  },
  {
    id: "cs-05", group: "contact_safety", groupLabel: GROUP_LABELS.contact_safety, severity: "P0",
    name: "Cliente em cooldown",
    description: "Já recebeu mensagem dentro do cooldown → bloqueado",
    input: safetyInput({ sendsWithinCooldown: 1 }),
    expect: { sendable: false, reason: "CUSTOMER_COOLDOWN_ACTIVE" },
  },
  {
    id: "cs-06", group: "contact_safety", groupLabel: GROUP_LABELS.contact_safety, severity: "P1",
    name: "Cap semanal atingido",
    description: "Excedeu o limite semanal de envios → bloqueado",
    input: safetyInput({ sendsWithinWeek: 99, safety: { ...DEFAULT_SAFETY_CONFIG, maxPerWeekPerCustomer: 2 } }),
    expect: { sendable: false, reason: "CUSTOMER_WEEKLY_CAP_REACHED" },
  },
  {
    id: "cs-07", group: "contact_safety", groupLabel: GROUP_LABELS.contact_safety, severity: "P1",
    name: "Quiet hours (madrugada)",
    description: "02:00 BRT com time-windows ativos → QUIET_HOURS",
    input: safetyInput({ enforceTimeWindows: true, now: new Date("2026-06-03T05:00:00Z") }),
    expect: { sendable: false, reason: "QUIET_HOURS" },
  },
  {
    id: "cs-08", group: "contact_safety", groupLabel: GROUP_LABELS.contact_safety, severity: "P2",
    name: "Fim de semana bloqueado",
    description: "Sábado com sendOnWeekends=false e time-windows ativos → WEEKEND_BLOCKED",
    // Saturday 2026-06-06 12:00 BRT = 15:00 UTC
    input: safetyInput({
      enforceTimeWindows: true,
      safety: { ...DEFAULT_SAFETY_CONFIG, sendOnWeekends: false },
      now: new Date("2026-06-06T15:00:00Z"),
    }),
    expect: { sendable: false, reason: "WEEKEND_BLOCKED" },
  },
  {
    id: "cs-09", group: "contact_safety", groupLabel: GROUP_LABELS.contact_safety, severity: "P1",
    name: "Evolution não configurado",
    description: "Sem Evolution disponível → NO_EVOLUTION_CONFIG",
    input: safetyInput({ evolutionAvailable: false }),
    expect: { sendable: false, reason: "NO_EVOLUTION_CONFIG" },
  },
];

const SEGMENTATION: CrmScenario[] = [
  {
    id: "seg-01", group: "segmentation", groupLabel: GROUP_LABELS.segmentation, severity: "P0",
    name: "Sem pedidos → SEM_PEDIDOS",
    description: "Nenhum pedido nativo nem importado",
    input: classificationInput(),
    expect: { segment: "SEM_PEDIDOS", tier: "BRONZE" },
  },
  {
    id: "seg-02", group: "segmentation", groupLabel: GROUP_LABELS.segmentation, severity: "P0",
    name: "Pedido recente → QUENTE",
    description: "Pedido nativo há 5 dias",
    input: classificationInput({ lastOrderAt: daysAgo(5), totalOrders: 3, totalSpend: 200 }),
    expect: { segment: "QUENTE" },
  },
  {
    id: "seg-03", group: "segmentation", groupLabel: GROUP_LABELS.segmentation, severity: "P1",
    name: "Cliente morno → MORNO",
    description: "Pedido nativo há 45 dias",
    input: classificationInput({ lastOrderAt: daysAgo(45), totalOrders: 2, totalSpend: 150 }),
    expect: { segment: "MORNO" },
  },
  {
    id: "seg-04", group: "segmentation", groupLabel: GROUP_LABELS.segmentation, severity: "P0",
    name: "Cliente frio → FRIO",
    description: "Pedido nativo há 90 dias",
    input: classificationInput({ lastOrderAt: daysAgo(90), totalOrders: 1, totalSpend: 80 }),
    expect: { segment: "FRIO" },
  },
  {
    id: "seg-05", group: "segmentation", groupLabel: GROUP_LABELS.segmentation, severity: "P0",
    name: "Cliente perdido → PERDIDO",
    description: "Pedido nativo há 150 dias (> lostMinDays)",
    input: classificationInput({ lastOrderAt: daysAgo(150), totalOrders: 1, totalSpend: 80 }),
    expect: { segment: "PERDIDO" },
  },
  {
    id: "seg-06", group: "segmentation", groupLabel: GROUP_LABELS.segmentation, severity: "P1",
    name: "Alto valor → DIAMANTE",
    description: "Cliente ativo de alto gasto sobe de tier",
    input: classificationInput({ lastOrderAt: daysAgo(5), totalOrders: 20, totalSpend: 3000 }),
    expect: { segment: "QUENTE", tier: "DIAMANTE" },
  },
  {
    id: "seg-07", group: "segmentation", groupLabel: GROUP_LABELS.segmentation, severity: "P2",
    name: "Somente importado",
    description: "Sem pedidos nativos, com histórico importado recente → usa fonte importada",
    input: classificationInput({
      lastOrderAt: null, totalOrders: 0, totalSpend: 0,
      importedLastOrderAt: daysAgo(10), importedOrderCount: 4, importedTotalSpent: 300,
    }),
    expect: { segment: "QUENTE" },
  },
];

const INTELLIGENCE: CrmScenario[] = [
  {
    id: "ci-01", group: "intelligence", groupLabel: GROUP_LABELS.intelligence, severity: "P0",
    name: "Sem pedidos → primeira compra",
    description: "Cliente cadastrado sem pedidos, contactável",
    input: snapshotInput(),
    expect: { actionType: "WELCOME_FIRST_ORDER", safeToContact: true },
  },
  {
    id: "ci-02", group: "intelligence", groupLabel: GROUP_LABELS.intelligence, severity: "P0",
    name: "Cliente frio → reativação",
    description: "FRIO há 90 dias → REACTIVATION",
    input: snapshotInput({ totalOrders: 3, totalSpend: 250, averageTicket: 83, lastOrderAt: daysAgo(90) }),
    expect: { actionType: "REACTIVATION", safeToContact: true },
  },
  {
    id: "ci-03", group: "intelligence", groupLabel: GROUP_LABELS.intelligence, severity: "P0",
    name: "Cliente perdido → winback",
    description: "PERDIDO há 200 dias → WINBACK com STRONG_DISCOUNT",
    input: snapshotInput({ totalOrders: 5, totalSpend: 400, averageTicket: 80, lastOrderAt: daysAgo(200) }),
    expect: { actionType: "WINBACK", safeToContact: true, suggestedOfferType: "STRONG_DISCOUNT" },
  },
  {
    id: "ci-04", group: "intelligence", groupLabel: GROUP_LABELS.intelligence, severity: "P1",
    name: "VIP quente → reconhecimento",
    description: "DIAMANTE ativo → VIP_APPRECIATION",
    input: snapshotInput(
      { totalOrders: 20, totalSpend: 3000, averageTicket: 150, lastOrderAt: daysAgo(3) },
      { lastOrderDelivered: true, orderDates: [daysAgo(3), daysAgo(13), daysAgo(23)] },
    ),
    expect: { actionType: "VIP_APPRECIATION", safeToContact: true },
  },
  {
    id: "ci-05", group: "intelligence", groupLabel: GROUP_LABELS.intelligence, severity: "P0",
    name: "Opt-out → nenhum contato",
    description: "Cliente opt-out → NO_ACTION e safeToContact=false",
    input: snapshotInput({ totalOrders: 4, totalSpend: 300, lastOrderAt: daysAgo(90), hasOptedOut: true }),
    expect: { actionType: "NO_ACTION", safeToContact: false },
  },
  {
    id: "ci-06", group: "intelligence", groupLabel: GROUP_LABELS.intelligence, severity: "P1",
    name: "Sem telefone → enriquecer cadastro",
    description: "Cliente sem telefone → DATA_ENRICHMENT, sem contato por WhatsApp",
    input: snapshotInput({ totalOrders: 4, totalSpend: 300, lastOrderAt: daysAgo(90), phone: null, contactStatus: "NO_PHONE" }),
    expect: { actionType: "DATA_ENRICHMENT", safeToContact: false },
  },
];

const ACTION_CENTER: CrmScenario[] = [
  {
    id: "ac-01", group: "action_center", groupLabel: GROUP_LABELS.action_center, severity: "P0",
    name: "Muitos frios contactáveis → recuperar frios",
    description: "12 clientes FRIO contactáveis → RECOVER_COLD_CUSTOMERS pronto",
    input: actionInput({
      customers: Array.from({ length: 12 }, (_, i) => makeCustomer({ id: `cold-${i}`, lastOrderAt: daysAgo(80) })),
    }),
    expect: { mustInclude: ["RECOVER_COLD_CUSTOMERS"], readySafety: { type: "RECOVER_COLD_CUSTOMERS", status: "READY" } },
  },
  {
    id: "ac-02", group: "action_center", groupLabel: GROUP_LABELS.action_center, severity: "P0",
    name: "Perdidos de alto valor → recuperar perdidos",
    description: "Clientes PERDIDO de alto ticket → RECOVER_LOST_CUSTOMERS",
    input: actionInput({
      customers: Array.from({ length: 5 }, (_, i) => makeCustomer({ id: `lost-${i}`, lastOrderAt: daysAgo(160), averageTicket: 120, totalSpend: 600 })),
    }),
    expect: { mustInclude: ["RECOVER_LOST_CUSTOMERS"] },
  },
  {
    id: "ac-03", group: "action_center", groupLabel: GROUP_LABELS.action_center, severity: "P0",
    name: "Evolution ausente → alerta de segurança",
    description: "hasEvolutionConfig=false → SAFETY_ISSUE_ALERT e nenhuma ação 'pronta' para envio",
    input: actionInput({
      hasEvolutionConfig: false,
      customers: Array.from({ length: 6 }, (_, i) => makeCustomer({ id: `c-${i}`, lastOrderAt: daysAgo(80) })),
    }),
    expect: { mustInclude: ["SAFETY_ISSUE_ALERT"] },
  },
  {
    id: "ac-04", group: "action_center", groupLabel: GROUP_LABELS.action_center, severity: "P2",
    name: "Conversão fraca de campanha → alerta de performance",
    description: "Campanha recente com baixa conversão → CAMPAIGN_PERFORMANCE_ALERT",
    input: actionInput({
      customers: [makeCustomer({ id: "c1", lastOrderAt: daysAgo(10) })],
      recentCampaignStats: { sentCount: 100, convertedCount: 0 },
    }),
    expect: { mustInclude: ["CAMPAIGN_PERFORMANCE_ALERT"] },
  },
  {
    id: "ac-05", group: "action_center", groupLabel: GROUP_LABELS.action_center, severity: "P1",
    name: "Sem clientes → sem ações de recuperação",
    description: "Base vazia → nenhuma ação de recuperação inventada",
    input: actionInput({ customers: [] }),
    expect: { mustExclude: ["RECOVER_COLD_CUSTOMERS", "RECOVER_LOST_CUSTOMERS"] },
  },
];

const MESSAGE_VARIATION: CrmScenario[] = [
  {
    id: "mv-01", group: "message_variation", groupLabel: GROUP_LABELS.message_variation, severity: "P0",
    name: "Frio com histórico → rascunho seguro",
    description: "Cliente FRIO com favorito real → rascunho de reativação não bloqueado, sem desconto falso",
    input: { snapshot: snapshotForVariation(), intent: "REACTIVATION", couponCode: null, safety: SAFE_GEN, previousMessages: [] },
    expect: { blocked: false, noDiscountWithoutCoupon: true },
  },
  {
    id: "mv-02", group: "message_variation", groupLabel: GROUP_LABELS.message_variation, severity: "P1",
    name: "Cupom fornecido → desconto permitido",
    description: "Com cupom explícito o rascunho pode mencionar desconto",
    input: { snapshot: snapshotForVariation(), intent: "WINBACK", couponCode: "VOLTA10", safety: SAFE_GEN, previousMessages: [] },
    expect: { blocked: false },
  },
  {
    id: "mv-03", group: "message_variation", groupLabel: GROUP_LABELS.message_variation, severity: "P0",
    name: "Sem cupom → sem desconto inventado",
    description: "Sem cupom, o rascunho final não pode prometer desconto",
    input: { snapshot: snapshotForVariation(), intent: "REACTIVATION", couponCode: null, safety: SAFE_GEN, previousMessages: [] },
    expect: { blocked: false, noDiscountWithoutCoupon: true },
  },
  {
    id: "mv-04", group: "message_variation", groupLabel: GROUP_LABELS.message_variation, severity: "P1",
    name: "Sem histórico → sem favorito falso",
    description: "Cliente sem produtos favoritos → rascunho não inventa um prato favorito",
    input: {
      snapshot: snapshotForVariation({ favoriteProducts: [], favoriteCategories: [], lastProducts: [], segment: "SEM_PEDIDOS", totalOrders: 0 }),
      intent: "WELCOME", couponCode: null, safety: SAFE_GEN, previousMessages: [],
    },
    expect: { blocked: false, noInventedFavorite: true },
  },
  {
    id: "mv-05", group: "message_variation", groupLabel: GROUP_LABELS.message_variation, severity: "P0",
    name: "Opt-out → bloqueado",
    description: "Cliente opt-out → nenhum rascunho gerado",
    input: { snapshot: snapshotForVariation({ hasOptedOut: true }), intent: "REACTIVATION", couponCode: null, safety: { hasOptedOut: true, contactable: true, hasPhone: true }, previousMessages: [] },
    expect: { blocked: true },
  },
  {
    id: "mv-06", group: "message_variation", groupLabel: GROUP_LABELS.message_variation, severity: "P0",
    name: "Sem telefone → bloqueado",
    description: "Cliente sem telefone → nenhum rascunho gerado",
    input: { snapshot: snapshotForVariation(), intent: "REACTIVATION", couponCode: null, safety: { hasOptedOut: false, contactable: true, hasPhone: false }, previousMessages: [] },
    expect: { blocked: true },
  },
  {
    id: "mv-07", group: "message_variation", groupLabel: GROUP_LABELS.message_variation, severity: "P2",
    name: "Rascunho não repetitivo",
    description: "Mensagem anterior idêntica → escolhe variação diferente, sem spam",
    input: {
      snapshot: snapshotForVariation(),
      intent: "REACTIVATION", couponCode: null, safety: SAFE_GEN,
      previousMessages: ["Oi, Diego 😊 Faz um tempinho que você não pede com a gente. Que tal pedir de novo aquele Temaki Salmão? Estamos por aqui quando bater a vontade."],
    },
    expect: { blocked: false },
  },
];

const ATTRIBUTION: CrmScenario[] = [
  {
    id: "at-01", group: "attribution", groupLabel: GROUP_LABELS.attribution, severity: "P0",
    name: "Cupom com pedidos → comprovado",
    description: "Campanha com cupom vinculado e pedidos com cupom → COUPON_PROVEN",
    input: { hasCouponLink: true, couponOrderCount: 5, assistedConversions: 2 },
    expect: { quality: "COUPON_PROVEN" },
  },
  {
    id: "at-02", group: "attribution", groupLabel: GROUP_LABELS.attribution, severity: "P1",
    name: "Cupom vinculado sem uso → campanha+cupom",
    description: "Cupom vinculado mas nenhum pedido com cupom → CAMPAIGN_COUPON",
    input: { hasCouponLink: true, couponOrderCount: 0, assistedConversions: 3 },
    expect: { quality: "CAMPAIGN_COUPON" },
  },
  {
    id: "at-03", group: "attribution", groupLabel: GROUP_LABELS.attribution, severity: "P1",
    name: "Sem cupom, só proximidade → assistido",
    description: "Sem cupom vinculado, com conversões por proximidade → ASSISTED",
    input: { hasCouponLink: false, couponOrderCount: 0, assistedConversions: 4 },
    expect: { quality: "ASSISTED" },
  },
  {
    id: "at-04", group: "attribution", groupLabel: GROUP_LABELS.attribution, severity: "P0",
    name: "Nada confiável → sem atribuição",
    description: "Sem cupom e sem conversões assistidas → NONE",
    input: { hasCouponLink: false, couponOrderCount: 0, assistedConversions: 0 },
    expect: { quality: "NONE" },
  },
  {
    id: "at-05", group: "attribution", groupLabel: GROUP_LABELS.attribution, severity: "P2",
    name: "Cupom domina proximidade",
    description: "Com cupom comprovado, a proximidade não rebaixa a qualidade",
    input: { hasCouponLink: true, couponOrderCount: 3, assistedConversions: 50 },
    expect: { quality: "COUPON_PROVEN" },
  },
];

const REVIEW_REQUEST: CrmScenario[] = [
  {
    id: "rr-01", group: "review_request", groupLabel: GROUP_LABELS.review_request, severity: "P0",
    name: "Entregue + link Google → elegível",
    description: "Pedido entregue + Google + cliente seguro → elegível, prefere Google",
    input: review(),
    expect: { eligible: true, preferredPlatform: "GOOGLE" },
  },
  {
    id: "rr-02", group: "review_request", groupLabel: GROUP_LABELS.review_request, severity: "P1",
    name: "Origem iFood → link iFood",
    description: "Pedido importado/iFood com link iFood → prefere iFood",
    input: review({ googleReviewUrl: null, ifoodReviewUrl: "https://www.ifood.com.br/avaliar/abc", orderSource: "import" }),
    expect: { eligible: true, preferredPlatform: "IFOOD" },
  },
  {
    id: "rr-03", group: "review_request", groupLabel: GROUP_LABELS.review_request, severity: "P0",
    name: "Sem links → bloqueado",
    description: "Nenhum link de avaliação configurado → NO_REVIEW_LINKS",
    input: review({ googleReviewUrl: null, ifoodReviewUrl: null }),
    expect: { eligible: false, blocks: ["NO_REVIEW_LINKS"] },
  },
  {
    id: "rr-04", group: "review_request", groupLabel: GROUP_LABELS.review_request, severity: "P0",
    name: "Pedido não entregue → bloqueado",
    description: "Pedido pendente → ORDER_NOT_DELIVERED",
    input: review({ orderStatus: "PENDING" }),
    expect: { eligible: false, blocks: ["ORDER_NOT_DELIVERED"] },
  },
  {
    id: "rr-05", group: "review_request", groupLabel: GROUP_LABELS.review_request, severity: "P1",
    name: "Já solicitado → bloqueado",
    description: "Avaliação já pedida para o pedido → REVIEW_ALREADY_REQUESTED_FOR_ORDER",
    input: review({ alreadyRequestedForOrder: true }),
    expect: { eligible: false, blocks: ["REVIEW_ALREADY_REQUESTED_FOR_ORDER"] },
  },
  {
    id: "rr-06", group: "review_request", groupLabel: GROUP_LABELS.review_request, severity: "P0",
    name: "Opt-out → bloqueado",
    description: "Cliente opt-out → CUSTOMER_OPTED_OUT",
    input: review({ hasOptedOut: true }),
    expect: { eligible: false, blocks: ["CUSTOMER_OPTED_OUT"] },
  },
  {
    id: "rr-07", group: "review_request", groupLabel: GROUP_LABELS.review_request, severity: "P2",
    name: "Cooldown de avaliação ativo → bloqueado",
    description: "Avaliação pedida recentemente ao cliente → CUSTOMER_ASKED_REVIEW_RECENTLY",
    input: review({ customerLastReviewRequestAt: daysAgo(10) }),
    expect: { eligible: false, blocks: ["CUSTOMER_ASKED_REVIEW_RECENTLY"] },
  },
];

export const CRM_SCENARIOS: CrmScenario[] = [
  ...CONTACT_SAFETY,
  ...SEGMENTATION,
  ...INTELLIGENCE,
  ...ACTION_CENTER,
  ...MESSAGE_VARIATION,
  ...ATTRIBUTION,
  ...REVIEW_REQUEST,
];

// ─── group registry ─────────────────────────────────────────────────────────

export interface CrmScenarioGroup {
  id:    CrmScenarioGroupId;
  label: string;
  count: number;
}

export function getCrmScenarioGroups(): CrmScenarioGroup[] {
  const order: CrmScenarioGroupId[] = [
    "contact_safety", "segmentation", "intelligence",
    "action_center", "message_variation", "attribution", "review_request",
  ];
  return order.map((id) => ({
    id,
    label: GROUP_LABELS[id],
    count: CRM_SCENARIOS.filter((s) => s.group === id).length,
  }));
}

/** P0 scenarios used by the "quick" runner mode. */
export function getQuickScenarios(): CrmScenario[] {
  return CRM_SCENARIOS.filter((s) => s.severity === "P0");
}
