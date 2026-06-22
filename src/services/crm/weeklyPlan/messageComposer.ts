/**
 * messageComposer — Fase 2: generate the campaign message TEMPLATE from the CRM
 * Agent's constitution (CrmAgentProfile), instead of a fixed recipe string.
 *
 * The weekly-plan campaigns target a SEGMENT, so the message keeps placeholders
 * ({nome}, {link_cardapio}, …) that personalizeMessage fills per recipient. This
 * composer asks the LLM for an on-brand template, then SCREENS it (spam gate,
 * no invented discount, required placeholders, no unknown placeholders). On any
 * failure — disabled, no key, blocked output, or error — it returns the
 * deterministic recipe message. So it can only ever improve on the fallback,
 * never weaken safety.
 *
 * Off by default. Enable with CRM_AI_MESSAGES_ENABLED=true (and OPENAI_API_KEY).
 * Output is still approval-gated in co-pilot mode, and screened in autopilot.
 */

import { openai } from "@/lib/openai";
import { buildCrmProfileDirective } from "@/services/crm/CrmAgentProfile";
import { detectSpamLanguage, impliesDiscount } from "@/services/crm/MessageVariationService";
import type { CrmActionType } from "@/services/crm/CrmActionCenterService";

const INTENT_BRIEF: Partial<Record<CrmActionType, string>> = {
  RECOVER_COLD_CUSTOMERS:
    "Reengajar um cliente que não pede há cerca de 2–4 meses (frio). Tom gentil, sem pressão, convidativo.",
  RECOVER_LOST_CUSTOMERS:
    "Recuperar um cliente perdido (4+ meses sem pedir). Tom caloroso e sincero — 'sentimos sua falta', um win-back de verdade.",
  WARM_CUSTOMERS:
    "Reativar um cliente morno (1–2 meses sem pedir). Lembrança leve e apetitosa, pode mencionar novidade.",
  VIP_APPRECIATION:
    "Agradecer um cliente VIP ativo. Reconhecimento genuíno e exclusivo, SEM empurrar promoção.",
  BIRTHDAY_CAMPAIGN: "Parabenizar pelo aniversário. Curto, caloroso e festivo, sem exagero.",
  REVIEW_REQUEST:
    "Pedir avaliação de quem pediu nos últimos dias. Gentil, rápido e agradecido.",
};

/** Optional placeholders the personalizer also understands (beyond the required ones). */
const OPTIONAL_PLACEHOLDERS = ["{restaurante}", "{ultimo_pedido}", "{nivel}", "{dias_sem_pedir}"];

export interface ComposeTemplateArgs {
  actionType: CrmActionType;
  restaurantName: string;
  fallbackMessage: string;
  /** Placeholders that MUST appear (e.g. ["{nome}", "{link_cardapio}"]). */
  requiredPlaceholders: string[];
  /** When false, any discount/offer wording is rejected (no coupon configured). */
  allowDiscount: boolean;
}

export interface ComposeTemplateResult {
  message: string;
  generatedBy: "llm" | "fallback";
  note?: string;
}

export function isAiMessagesEnabled(): boolean {
  return (
    process.env.CRM_AI_MESSAGES_ENABLED === "true" &&
    !!process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY !== "not-configured"
  );
}

/**
 * Screens a generated template. Returns a rejection reason, or null if it passes.
 * Pure — exported for unit testing.
 */
export function screenGeneratedTemplate(msg: string, args: ComposeTemplateArgs): string | null {
  const text = (msg ?? "").trim();
  if (text.length < 20) return "empty-or-too-short";
  if (text.length > 600) return "too-long";

  for (const p of args.requiredPlaceholders) {
    if (!text.includes(p)) return `missing-placeholder:${p}`;
  }

  const spam = detectSpamLanguage(text);
  if (spam.length > 0) return `spam:${spam[0]}`;

  if (!args.allowDiscount && impliesDiscount(text)) return "implies-discount";

  // Reject any placeholder outside the known-safe set (the personalizer would
  // leave an unknown {token} verbatim in the customer's message).
  const allowed = new Set([...args.requiredPlaceholders, "{nome}", ...OPTIONAL_PLACEHOLDERS]);
  const used = text.match(/\{[a-z_]+\}/gi) ?? [];
  for (const u of used) {
    if (!allowed.has(u)) return `unknown-placeholder:${u}`;
  }
  return null;
}

/**
 * Generate an on-brand campaign template, or fall back to the recipe message.
 * Never throws.
 */
export async function composeCampaignTemplate(args: ComposeTemplateArgs): Promise<ComposeTemplateResult> {
  if (!isAiMessagesEnabled()) {
    return { message: args.fallbackMessage, generatedBy: "fallback", note: "ai-disabled" };
  }
  const brief = INTENT_BRIEF[args.actionType];
  if (!brief) return { message: args.fallbackMessage, generatedBy: "fallback", note: "no-brief" };

  try {
    const system = [
      buildCrmProfileDirective(),
      "",
      "━━━ TAREFA ━━━",
      "Escreva UM modelo de mensagem de WhatsApp para uma campanha de CRM (será enviado a vários clientes do segmento).",
      "REGRAS DO MODELO:",
      `• Use os placeholders, sem inventar outros: ${args.requiredPlaceholders.join(", ")}.`,
      "• {nome} é obrigatório, na abertura.",
      args.allowDiscount
        ? "• Só mencione cupom/oferta se for explicitamente fornecido (não foi) — então NÃO mencione."
        : "• NUNCA mencione desconto, cupom, oferta, brinde, % ou frete grátis (não há oferta configurada).",
      "• 1 a 3 parágrafos curtos. Máximo 2 emojis. Sem CAIXA ALTA, sem urgência, sem spam.",
      `• Restaurante: ${args.restaurantName}.`,
      'Responda em JSON: { "message": "..." }',
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Contexto da campanha: ${brief}` },
      ],
      max_tokens: 300,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { message?: unknown };
    const candidate = typeof parsed.message === "string" ? parsed.message.trim() : "";

    const rejection = screenGeneratedTemplate(candidate, args);
    if (rejection) {
      return { message: args.fallbackMessage, generatedBy: "fallback", note: rejection };
    }
    return { message: candidate, generatedBy: "llm" };
  } catch (err) {
    console.error("[composeCampaignTemplate] LLM failed, using deterministic fallback:", err);
    return { message: args.fallbackMessage, generatedBy: "fallback", note: "llm-error" };
  }
}

/** Pick the required placeholders for a draft from its fallback message. */
export function requiredPlaceholdersFor(fallbackMessage: string): string[] {
  const link = fallbackMessage.includes("{link_avaliacao_google}")
    ? "{link_avaliacao_google}"
    : "{link_cardapio}";
  return ["{nome}", link];
}
