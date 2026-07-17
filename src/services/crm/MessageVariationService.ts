/**
 * MessageVariationService
 *
 * Generates SAFE, personalized WhatsApp message DRAFTS for CRM campaigns/actions
 * using real customer intelligence and the CRM Agent Profile.
 *
 * ── DRAFT-ONLY (CRM W6) ──────────────────────────────────────────────────────
 *   • NEVER sends a WhatsApp message.
 *   • NEVER creates a Campaign or CampaignExecution.
 *   • NEVER enables autonomous CRM Agent sending.
 *   • Every result carries `requiresApproval: true`.
 *
 * ── Anti-invention guarantees ────────────────────────────────────────────────
 *   • Offers/coupons appear ONLY when explicitly provided by the caller.
 *   • Customer facts come ONLY from the Customer Intelligence Snapshot.
 *   • Unknown facts are surfaced as `missingFacts`, never fabricated.
 *
 * Design:
 *   - `composePreview()` is a PURE function — applies safety gate, spam filter,
 *     anti-repetition, fact extraction. Fully unit-testable, no DB / no LLM.
 *   - `buildDeterministicVariants()` is a PURE deterministic generator (fallback
 *     and test fixture) producing human, on-brand drafts.
 *   - `MessageVariationService.generatePreview()` orchestrates: load snapshot,
 *     brand tone, previous messages → generate (LLM if available, else
 *     deterministic) → compose → return.
 *
 * Phase: CRM W6.
 */

import { prisma } from "@/lib/prisma";
import { selectEngineRouted } from "@/services/brain/engines/AIEngineRouter";
import { callStructuredJson } from "@/services/brain/engines/OpenAIEngineAdapter";
import {
  CustomerIntelligenceSnapshotService,
  buildCustomerIntelligenceContext,
  type CustomerIntelligenceSnapshot,
} from "@/services/crm/CustomerIntelligenceSnapshotService";
import { buildCrmProfileDirective } from "@/services/crm/CrmAgentProfile";
import { getExperienceBrief } from "@/services/brain/experience/ExperienceBriefService";

// ─── Public types ──────────────────────────────────────────────────────────────

export type GenerationIntent =
  | "REACTIVATION"
  | "WINBACK"
  | "VIP_APPRECIATION"
  | "REVIEW_REQUEST"
  | "WELCOME"
  | "BIRTHDAY"
  | "LOYALTY"
  | "GENERIC";

export interface ToneSettings {
  tone: string;       // friendly | professional | casual | warm
  emojiUsage: string; // none | minimal | moderate | expressive
}

export const DEFAULT_TONE: ToneSettings = { tone: "friendly", emojiUsage: "moderate" };

export interface MessageVariationInput {
  restaurantId: string;
  actionType?: string;
  campaignObjective?: string;
  customerId?: string;
  couponCode?: string | null;
  tone?: string | null;
  maxVariants?: number;
  now?: Date;
}

export interface MessageVariationResult {
  /** The recommended draft, or null when blocked by safety. */
  draftMessage: string | null;
  /** Additional draft variations (excludes draftMessage). */
  alternatives: string[];
  /** Non-blocking safety observations for the owner. */
  safetyNotes: string[];
  /** Real snapshot/coupon facts actually used in the draft. */
  usedFacts: string[];
  /** Known-unknown facts that would strengthen the message if available. */
  missingFacts: string[];
  /** When non-empty, the message is NOT send-ready. */
  blockedReasons: string[];
  /** Always true — a human must approve before any send. */
  requiresApproval: true;
  /** Provenance of the generated text. */
  generatedBy: "llm" | "deterministic" | "none";
  /** Resolved generation intent. */
  intent: GenerationIntent;
}

// ─── Safety snapshot (subset needed for the gate) ────────────────────────────────

export interface GenerationSafety {
  hasOptedOut: boolean;
  contactable: boolean;
  hasPhone: boolean;
}

// ─── Forbidden / spam language (Part 7) ──────────────────────────────────────────

/**
 * Phrases that make a CRM message spammy, creepy, or LGPD-uncomfortable.
 * Matched case-insensitively against the normalized message body.
 */
const FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /detectamos/i,                       label: "linguagem de vigilância ('detectamos')" },
  { pattern: /monitoramos|rastreamos|analisamos seu perfil/i, label: "linguagem de vigilância" },
  { pattern: /seu (comportamento|perfil de consumo)/i, label: "linguagem invasiva (LGPD)" },
  { pattern: /perfil de consumo|inatividade no seu/i, label: "jargão técnico/invasivo" },
  { pattern: /imperd[ií]vel/i,                     label: "linguagem de spam ('imperdível')" },
  { pattern: /clique agora|compre agora|peça agora mesmo/i, label: "pressão de spam ('clique/compre agora')" },
  { pattern: /[úu]ltima chance|n[ãa]o perca|urgente|agora ou nunca/i, label: "urgência exagerada" },
  { pattern: /promo[çc][ãa]o (rel[âa]mpago|imperd)/i, label: "linguagem de spam" },
];

/** Words that imply a discount/offer — only allowed when a coupon is provided. */
const DISCOUNT_IMPLYING = /desconto|cupom|cup[oõ]ns|promo[çc][ãa]o|gr[áa]tis|brinde|oferta|frete gr[áa]tis|%/i;

/**
 * Returns the labels of any forbidden patterns found in the text.
 * Pure.
 */
export function detectSpamLanguage(text: string): string[] {
  const found: string[] = [];
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text) && !found.includes(label)) found.push(label);
  }
  return found;
}

/** Whether the text implies a discount/offer. Pure. */
export function impliesDiscount(text: string): boolean {
  return DISCOUNT_IMPLYING.test(text);
}

// ─── Similarity (anti-repetition) ────────────────────────────────────────────────

function normalizeForCompare(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jaccard token similarity in [0,1]. Pure. */
export function textSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeForCompare(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeForCompare(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

const REPETITION_THRESHOLD = 0.8;

/** True if `candidate` is too similar to any previous message. Pure. */
export function isRepetitive(candidate: string, previous: string[]): boolean {
  return previous.some(
    (p) =>
      normalizeForCompare(p) === normalizeForCompare(candidate) ||
      textSimilarity(candidate, p) >= REPETITION_THRESHOLD,
  );
}

// ─── Fact extraction ─────────────────────────────────────────────────────────────

export interface FactSet {
  usedFacts: string[];
  missingFacts: string[];
}

/**
 * Derives which REAL facts a chosen draft references, and which strengthening
 * facts are unknown. Never invents — every used fact must be substring-present.
 * Pure.
 */
export function extractFacts(
  draft: string,
  snapshot: CustomerIntelligenceSnapshot | null,
  couponCode: string | null,
): FactSet {
  const usedFacts: string[] = [];
  const missingFacts: string[] = [];
  const lower = draft.toLowerCase();

  if (snapshot) {
    const firstName = (snapshot.name ?? "").split(" ")[0] ?? "";
    if (firstName && lower.includes(firstName.toLowerCase())) {
      usedFacts.push(`nome: ${firstName}`);
    }

    // Favorite products
    if (snapshot.favoriteProducts.length > 0) {
      for (const p of snapshot.favoriteProducts) {
        if (p.name && lower.includes(p.name.toLowerCase())) {
          usedFacts.push(`produto favorito: ${p.name}`);
        }
      }
    } else {
      missingFacts.push("produto favorito desconhecido");
    }

    // Favorite categories
    if (snapshot.favoriteCategories.length > 0) {
      for (const c of snapshot.favoriteCategories) {
        if (c.name && lower.includes(c.name.toLowerCase())) {
          usedFacts.push(`categoria favorita: ${c.name}`);
        }
      }
    }

    if (snapshot.totalOrders === 0) {
      missingFacts.push("sem histórico de pedidos");
    }
    if (snapshot.daysSinceLastOrder === null && snapshot.totalOrders > 0) {
      missingFacts.push("data do último pedido desconhecida");
    }
  } else {
    missingFacts.push("sem snapshot de inteligência do cliente");
  }

  if (couponCode && draft.includes(couponCode)) {
    usedFacts.push(`cupom: ${couponCode}`);
  }

  return { usedFacts, missingFacts };
}

// ─── Intent resolution ───────────────────────────────────────────────────────────

const INTENT_MAP: Record<string, GenerationIntent> = {
  // CrmActionCenter action types
  RECOVER_COLD_CUSTOMERS: "REACTIVATION",
  RECOVER_LOST_CUSTOMERS: "WINBACK",
  WARM_CUSTOMERS: "REACTIVATION",
  VIP_APPRECIATION: "VIP_APPRECIATION",
  HIGH_VALUE_CUSTOMER_ATTENTION: "VIP_APPRECIATION",
  REVIEW_REQUEST: "REVIEW_REQUEST",
  BIRTHDAY_CAMPAIGN: "BIRTHDAY",
  COUPON_OPPORTUNITY: "LOYALTY",
  NO_ORDER_FIRST_PURCHASE: "WELCOME",
  // NextBestAction types
  WELCOME_FIRST_ORDER: "WELCOME",
  PREMIUM_OFFER: "VIP_APPRECIATION",
  GENTLE_REMINDER: "REACTIVATION",
  REACTIVATION: "REACTIVATION",
  WINBACK: "WINBACK",
  LOYALTY_THANK_YOU: "LOYALTY",
  // Legacy MessageIntent
  VIP_INACTIVE: "VIP_APPRECIATION",
  NEW_CUSTOMER: "WELCOME",
  POST_ORDER: "REVIEW_REQUEST",
  BIRTHDAY: "BIRTHDAY",
};

export function resolveIntent(actionType?: string, campaignObjective?: string): GenerationIntent {
  if (actionType && INTENT_MAP[actionType]) return INTENT_MAP[actionType];
  if (campaignObjective && INTENT_MAP[campaignObjective]) return INTENT_MAP[campaignObjective];
  return "GENERIC";
}

// ─── Deterministic generator (pure, fallback + test fixture) ─────────────────────

function firstNameOf(snapshot: CustomerIntelligenceSnapshot | null): string {
  const n = (snapshot?.name ?? "").split(" ")[0]?.trim();
  return n && n.length > 0 ? n : "tudo bem";
}

function emoji(tone: ToneSettings, e: string): string {
  return tone.emojiUsage === "none" ? "" : ` ${e}`;
}

function favoriteClause(snapshot: CustomerIntelligenceSnapshot | null): string | null {
  if (!snapshot) return null;
  if (snapshot.favoriteProducts.length > 0) return snapshot.favoriteProducts[0]!.name;
  if (snapshot.favoriteCategories.length > 0) return snapshot.favoriteCategories[0]!.name;
  return null;
}

function couponClause(couponCode: string | null): string {
  return couponCode ? ` Use o cupom ${couponCode} no seu próximo pedido.` : "";
}

/**
 * Produces human, on-brand draft variations WITHOUT any invented facts.
 * Pure and deterministic. Used as the safe fallback and as a test fixture.
 */
export function buildDeterministicVariants(args: {
  intent: GenerationIntent;
  snapshot: CustomerIntelligenceSnapshot | null;
  couponCode: string | null;
  tone: ToneSettings;
  restaurantName: string;
  maxVariants: number;
}): string[] {
  const { intent, snapshot, couponCode, tone, maxVariants } = args;
  const name = firstNameOf(snapshot);
  const fav = favoriteClause(snapshot);
  const coupon = couponClause(couponCode);
  const e = (x: string) => emoji(tone, x);

  const favLine = fav ? ` Que tal pedir de novo aquele ${fav}?` : "";

  const variantsByIntent: Record<GenerationIntent, string[]> = {
    REACTIVATION: [
      `Oi, ${name}${e("😊")} Faz um tempinho que você não pede com a gente.${favLine} Estamos por aqui quando bater a vontade.${coupon}`,
      `Olá, ${name}! Senti sua falta por aqui.${favLine} Quando quiser pedir, é só chamar.${coupon}`,
    ],
    WINBACK: [
      `Oi, ${name}${e("👋")} Já faz um bom tempo que a gente não se fala.${favLine} A gente adoraria te receber de volta.${coupon}`,
      `Olá, ${name}! A gente lembra de você por aqui.${favLine} Seria ótimo te ter de volta quando quiser.${coupon}`,
    ],
    VIP_APPRECIATION: [
      `Oi, ${name}${e("💛")} Só passando pra dizer que é um prazer ter você com a gente.${favLine}${coupon}`,
      `Olá, ${name}! Obrigado por ser um cliente tão especial.${favLine} Conte com a gente sempre.${coupon}`,
    ],
    REVIEW_REQUEST: [
      `Oi, ${name}${e("😊")} Espero que seu último pedido tenha sido ótimo! Se puder, deixa uma avaliação pra gente — significa muito.`,
      `Olá, ${name}! Como foi a experiência no seu último pedido? Sua opinião ajuda muito a gente a melhorar.`,
    ],
    WELCOME: [
      `Oi, ${name}${e("😊")} Que bom ter você por aqui! Quando quiser experimentar a gente, é só chamar.${coupon}`,
      `Olá, ${name}! Seja muito bem-vindo(a). Estamos à disposição pra quando você quiser pedir.${coupon}`,
    ],
    BIRTHDAY: [
      `Feliz aniversário, ${name}${e("🎉")} Que seu dia seja incrível! A gente queria fazer parte da sua comemoração.${coupon}`,
      `Parabéns, ${name}${e("🎂")} Um dia especial merece algo gostoso. Estamos por aqui pra celebrar com você.${coupon}`,
    ],
    LOYALTY: [
      `Oi, ${name}${e("😊")} Obrigado por pedir com a gente sempre!${favLine}${coupon}`,
      `Olá, ${name}! É muito bom ter você por aqui.${favLine} Conte com a gente quando quiser.${coupon}`,
    ],
    GENERIC: [
      `Oi, ${name}${e("😊")} Passando pra dizer que estamos por aqui quando você quiser pedir.${coupon}`,
      `Olá, ${name}! Qualquer coisa, é só chamar. A gente adora te atender.${coupon}`,
    ],
  };

  return variantsByIntent[intent].slice(0, Math.max(1, maxVariants));
}

// ─── Pure composition (safety gate + filtering + facts) ──────────────────────────

/**
 * Applies the safety gate, spam filter, anti-repetition and fact extraction to a
 * set of candidate drafts. Pure — no DB, no LLM. Always requiresApproval.
 */
export function composePreview(args: {
  snapshot: CustomerIntelligenceSnapshot | null;
  intent: GenerationIntent;
  couponCode: string | null;
  safety: GenerationSafety;
  candidates: string[];
  generatedBy: "llm" | "deterministic";
  previousMessages: string[];
  maxVariants: number;
}): MessageVariationResult {
  const {
    snapshot, intent, couponCode, safety, candidates, generatedBy, previousMessages, maxVariants,
  } = args;

  const safetyNotes: string[] = [];
  const blockedReasons: string[] = [];

  // ── Hard safety gate ──────────────────────────────────────────────────────
  if (safety.hasOptedOut) blockedReasons.push("Cliente optou por não receber mensagens (opt-out).");
  if (!safety.hasPhone)   blockedReasons.push("Cliente sem telefone — não é possível enviar.");
  if (!safety.contactable) blockedReasons.push("Cliente marcado como não contactável.");

  if (blockedReasons.length > 0) {
    return {
      draftMessage: null,
      alternatives: [],
      safetyNotes: ["Rascunho não gerado: a segurança bloqueia o envio para este cliente."],
      usedFacts: [],
      missingFacts: [],
      blockedReasons,
      requiresApproval: true,
      generatedBy: "none",
      intent,
    };
  }

  // ── Candidate filtering ───────────────────────────────────────────────────
  const accepted: string[] = [];
  for (const raw of candidates) {
    const text = raw.trim();
    if (!text) continue;

    const spam = detectSpamLanguage(text);
    if (spam.length > 0) {
      safetyNotes.push(`Variação descartada por linguagem inadequada: ${spam.join("; ")}`);
      continue;
    }

    // Discount implied without a real coupon → reject (anti-invention).
    if (!couponCode && impliesDiscount(text)) {
      safetyNotes.push("Variação descartada: insinuava desconto/oferta sem cupom informado.");
      continue;
    }

    // Anti-repetition vs previously sent messages.
    if (isRepetitive(text, previousMessages)) {
      safetyNotes.push("Variação descartada por ser muito parecida com mensagem anterior.");
      continue;
    }

    // Anti-repetition vs already-accepted variations.
    if (accepted.some((a) => textSimilarity(a, text) >= REPETITION_THRESHOLD)) continue;

    accepted.push(text);
  }

  if (accepted.length === 0) {
    return {
      draftMessage: null,
      alternatives: [],
      safetyNotes: safetyNotes.length > 0 ? safetyNotes : ["Nenhuma variação segura pôde ser gerada."],
      usedFacts: [],
      missingFacts: [],
      blockedReasons: ["Não foi possível gerar um rascunho seguro. Tente novamente."],
      requiresApproval: true,
      generatedBy: "none",
      intent,
    };
  }

  const limited = accepted.slice(0, Math.max(1, maxVariants));
  const draftMessage = limited[0]!;
  const alternatives = limited.slice(1);

  const { usedFacts, missingFacts } = extractFacts(draftMessage, snapshot, couponCode);

  // Non-blocking notes
  if (snapshot && snapshot.safetyStatus && snapshot.safetyStatus !== "OK") {
    safetyNotes.push(`Status de segurança do cliente: ${snapshot.safetyStatus}.`);
  }
  if (!couponCode) {
    safetyNotes.push("Nenhum cupom informado — a mensagem não promete desconto.");
  }

  return {
    draftMessage,
    alternatives,
    safetyNotes,
    usedFacts,
    missingFacts,
    blockedReasons: [],
    requiresApproval: true,
    generatedBy,
    intent,
  };
}

// ─── LLM prompt builders ─────────────────────────────────────────────────────────

function buildSystemPrompt(tone: ToneSettings, couponCode: string | null, experienceBrief?: string): string {
  return [
    buildCrmProfileDirective(),
    experienceBrief ? `\n${experienceBrief}` : "",
    "",
    "━━━ TAREFA ━━━",
    "Gere variações curtas de mensagem de WhatsApp para relacionamento (NÃO é envio — é rascunho para aprovação humana).",
    `Tom desejado: ${tone.tone}. Uso de emoji: ${tone.emojiUsage}.`,
    "REGRAS INVIOLÁVEIS:",
    "• Use APENAS os fatos fornecidos no contexto do cliente. NUNCA invente histórico, preferências ou pedidos.",
    couponCode
      ? `• Há um cupom real: inclua exatamente \"${couponCode}\".`
      : "• NÃO há cupom. NÃO mencione desconto, cupom, oferta, brinde ou frete grátis.",
    "• Mensagem curta, humana, calorosa. Sem jargão técnico, sem pressão, sem urgência falsa.",
    "• Proibido: 'detectamos', 'seu comportamento', 'perfil de consumo', 'imperdível', 'clique agora', 'última chance'.",
    "• Não afirme item favorito/histórico que não esteja no contexto.",
    "",
    "Responda APENAS em JSON: { \"variants\": [\"...\", \"...\"] }",
  ].join("\n");
}

function buildUserPrompt(
  intent: GenerationIntent,
  snapshot: CustomerIntelligenceSnapshot | null,
  couponCode: string | null,
  previousMessages: string[],
  maxVariants: number,
): string {
  const lines: string[] = [];
  lines.push(`Objetivo da mensagem: ${intent}`);
  lines.push("");
  lines.push("Contexto do cliente:");
  lines.push(snapshot ? buildCustomerIntelligenceContext(snapshot) : "Cliente sem histórico conhecido. Use mensagem genérica, humana e acolhedora.");
  if (couponCode) {
    lines.push("");
    lines.push(`Cupom real a incluir: ${couponCode}`);
  }
  if (previousMessages.length > 0) {
    lines.push("");
    lines.push("Mensagens já enviadas antes (NÃO repita o texto nem a mesma abertura):");
    previousMessages.slice(0, 3).forEach((m, i) => lines.push(`${i + 1}. ${m}`));
  }
  lines.push("");
  lines.push(`Gere ${Math.max(1, maxVariants)} variação(ões) distintas.`);
  return lines.join("\n");
}

// ─── Service class ───────────────────────────────────────────────────────────────

export class MessageVariationService {
  /**
   * Generate draft message variations for a customer/action. DRAFT-ONLY.
   * Never sends. Never creates campaigns. Tenant-scoped via snapshot lookup.
   */
  static async generatePreview(input: MessageVariationInput): Promise<MessageVariationResult> {
    const maxVariants = Math.min(Math.max(1, input.maxVariants ?? 3), 5);
    const intent = resolveIntent(input.actionType, input.campaignObjective);
    const couponCode = input.couponCode?.trim() || null;

    // ── Load snapshot (tenant-scoped) + brand tone + restaurant name in parallel
    const [snapshot, brandConfig, restaurant] = await Promise.all([
      input.customerId
        ? CustomerIntelligenceSnapshotService.getSnapshot(input.restaurantId, input.customerId, {
            now: input.now,
          }).catch(() => null)
        : Promise.resolve(null),
      prisma.restaurantBrandConfig.findUnique({
        where: { restaurantId: input.restaurantId },
        select: { tone: true, emojiUsage: true },
      }),
      prisma.restaurant.findUnique({
        where: { id: input.restaurantId },
        select: { name: true },
      }),
    ]);

    const tone: ToneSettings = {
      tone: input.tone?.trim() || brandConfig?.tone || DEFAULT_TONE.tone,
      emojiUsage: brandConfig?.emojiUsage || DEFAULT_TONE.emojiUsage,
    };
    const restaurantName = restaurant?.name ?? "nosso restaurante";

    const safety: GenerationSafety = snapshot
      ? {
          hasOptedOut: snapshot.hasOptedOut,
          contactable: snapshot.crmContactable,
          hasPhone: !!snapshot.phone && snapshot.phone.trim() !== "",
        }
      : { hasOptedOut: false, contactable: true, hasPhone: true };

    // ── Early exit on hard block — never call the LLM for a blocked customer.
    if (safety.hasOptedOut || !safety.hasPhone || !safety.contactable) {
      return composePreview({
        snapshot,
        intent,
        couponCode,
        safety,
        candidates: [],
        generatedBy: "deterministic",
        previousMessages: [],
        maxVariants,
      });
    }

    // ── Previous sent messages for anti-repetition (tenant-scoped).
    let previousMessages: string[] = [];
    if (input.customerId) {
      const prev = await prisma.campaignExecution.findMany({
        where: {
          restaurantId: input.restaurantId,
          customerId: input.customerId,
          messageText: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { messageText: true },
      });
      previousMessages = prev.map((p) => p.messageText!).filter(Boolean);
    }

    // ── Generate candidates: LLM first, deterministic fallback.
    let candidates: string[] = [];
    let generatedBy: "llm" | "deterministic" = "deterministic";

    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "not-configured") {
      try {
        const selection = await selectEngineRouted("crm", { taskProfile: "GENERATE" });
        // Consumo do Cofre: o que os clientes deste restaurante mais gostam —
        // contexto pra personalizar o rascunho (aprovação humana continua obrigatória).
        const experienceBrief = await getExperienceBrief(input.restaurantId).catch(() => "");
        const raw = await callStructuredJson({
          selection,
          systemPrompt: buildSystemPrompt(tone, couponCode, experienceBrief),
          userContent: buildUserPrompt(intent, snapshot, couponCode, previousMessages, maxVariants),
          temperature: 0.7,
          maxTokens: 500,
        });
        const parsed = JSON.parse(raw) as { variants?: unknown };
        if (Array.isArray(parsed.variants)) {
          candidates = parsed.variants.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
          if (candidates.length > 0) generatedBy = "llm";
        }
      } catch (err) {
        console.error("[MessageVariationService] LLM generation failed, using deterministic fallback:", err);
      }
    }

    if (candidates.length === 0) {
      candidates = buildDeterministicVariants({
        intent, snapshot, couponCode, tone, restaurantName, maxVariants,
      });
      generatedBy = "deterministic";
    }

    // ── Compose: safety gate (already passed) + spam/repetition/fact filtering.
    let result = composePreview({
      snapshot, intent, couponCode, safety, candidates, generatedBy, previousMessages, maxVariants,
    });

    // If the LLM output was entirely filtered out, retry once with deterministic.
    if (result.draftMessage === null && generatedBy === "llm") {
      const fallback = buildDeterministicVariants({
        intent, snapshot, couponCode, tone, restaurantName, maxVariants,
      });
      result = composePreview({
        snapshot, intent, couponCode, safety,
        candidates: fallback, generatedBy: "deterministic", previousMessages, maxVariants,
      });
    }

    return result;
  }
}
