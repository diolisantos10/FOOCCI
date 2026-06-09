/**
 * AgentTrainingConversationMiner
 *
 * Reads historical Atendimento/WhatsApp conversations and converts them into
 * training scenarios. NEVER mutates original conversation data.
 * Masks PII before storing scenarios.
 */

import { prisma } from "@/lib/prisma";
import type { TranscriptTurn } from "./types";

// ── PII masking ───────────────────────────────────────────────────────────────

// Matches Brazilian phone formats: +5511999990000, 11999990000, 999990000
const PHONE_RE   = /(\+?55\s*)?(\(?\d{2}\)?\s*)?9\d{4}[\s-]?\d{4}/g;
const CPF_RE     = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g;
// Bare address patterns: "Rua X, 123", "Av. Y nº 45", "Avenida Z, 10"
const ADDRESS_RE = /\b(?:rua|av(?:enida)?|r\.|estrada|alameda|travessa|praça)\s+[^\n,]{3,40}(?:,\s*\d+)?/gi;

export function maskSensitiveData(text: string): string {
  return text
    .replace(PHONE_RE,   "[TELEFONE]")
    .replace(CPF_RE,     "[CPF]")
    .replace(ADDRESS_RE, "[ENDEREÇO]");
}

// ── Scenario type classification ──────────────────────────────────────────────

type ScenarioType =
  | "SUCCESSFUL_ORDER"
  | "FAILED_ORDER"
  | "GREETING_MENU"
  | "PRODUCT_AMBIGUITY"
  | "MISSING_ITEM"
  | "ADDRESS_FREIGHT"
  | "PAYMENT_PIX"
  | "CUSTOMER_CHANGED_ITEM"
  | "CUSTOMER_CANCELLED_ITEM"
  | "CUSTOMER_ASKED_HUMAN"
  | "BOT_REPEATED_ITSELF"
  | "BOT_SENT_LINK"
  | "BOT_IGNORED_MESSAGE"
  | "GENERAL";

function classifyScenarioType(messages: { content: string; senderType: string }[]): ScenarioType {
  const allText = messages.map((m) => m.content.toLowerCase()).join(" ");
  const hasOrder    = /pedido|confirmar|finaliz/.test(allText);
  const hasPayment  = /pix|pagamento|transferência/.test(allText);
  const hasAddress  = /endere[çc]|rua|av\.|bairro|cep/.test(allText);
  const hasHuman    = /atendente|humano|falar com|transferir/.test(allText);
  const hasCancel   = /cancel|desisto|deixa pra lá/.test(allText);
  const hasChange   = /troc|mud|remov|tira/.test(allText);
  const hasAmbig    = /qual|opç|opcao|versão/.test(allText);
  const hasLink     = /https?:\/\//.test(allText);
  const botMessages = messages.filter((m) => m.senderType === "AI").map((m) => m.content);
  const botRepeat   = botMessages.length > 2 && new Set(botMessages).size < botMessages.length * 0.6;

  if (hasHuman)            return "CUSTOMER_ASKED_HUMAN";
  if (hasCancel)           return "CUSTOMER_CANCELLED_ITEM";
  if (hasChange)           return "CUSTOMER_CHANGED_ITEM";
  if (hasAmbig && hasOrder) return "PRODUCT_AMBIGUITY";
  if (hasPayment)          return "PAYMENT_PIX";
  if (hasAddress)          return "ADDRESS_FREIGHT";
  if (botRepeat)           return "BOT_REPEATED_ITSELF";
  if (hasLink && !hasOrder) return "BOT_SENT_LINK";
  if (hasOrder)            return "SUCCESSFUL_ORDER";
  return "GREETING_MENU";
}

// ── Main miner ────────────────────────────────────────────────────────────────

interface MineOptions {
  restaurantId?:   string;
  sinceHours?:     number;   // look back N hours (default: 48)
  maxConversations?: number; // cap (default: 30)
}

interface MinedScenario {
  sourceConversationId: string;
  title:                string;
  customerPersona:      string;
  goal:                 string;
  transcriptJson:       TranscriptTurn[];
  expectedOutcomeJson:  Record<string, unknown>;
  source:               "REAL_CONVERSATION";
  restaurantId:         string | null;
}

export async function mineRealConversations(opts: MineOptions = {}): Promise<MinedScenario[]> {
  const since        = new Date(Date.now() - (opts.sinceHours ?? 48) * 3_600_000);
  const maxConvs     = opts.maxConversations ?? 30;

  const where: Record<string, unknown> = {
    conversationType: "CUSTOMER",
    lastMessageAt:    { gte: since },
  };
  if (opts.restaurantId) where.restaurantId = opts.restaurantId;

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy:  { lastMessageAt: "desc" },
    take:     maxConvs,
    include:  {
      messages: {
        orderBy: { sentAt: "asc" },
        select:  { content: true, senderType: true, sentAt: true, direction: true },
      },
    },
  });

  const results: MinedScenario[] = [];

  for (const conv of conversations) {
    if (conv.messages.length < 2) continue;

    const maskedMessages = conv.messages.map((m) => ({
      ...m,
      senderType: m.senderType ?? "UNKNOWN",
      content: maskSensitiveData(m.content ?? ""),
    }));

    const scenarioType = classifyScenarioType(maskedMessages);

    const transcript: TranscriptTurn[] = maskedMessages.map((m) => ({
      role:    (m.senderType === "AI" || m.senderType === "HUMAN") ? "bot" as const : "customer" as const,
      content: m.content,
      ts:      (m.sentAt ?? new Date()).toISOString(),
    }));

    const lastBot = maskedMessages.filter((m) => m.senderType === "AI").at(-1);

    results.push({
      sourceConversationId: conv.id,
      title:                `[Real] ${scenarioType.replace(/_/g, " ")} — conv ${conv.id.slice(0, 8)}`,
      customerPersona:      "REAL_CUSTOMER",
      goal:                 scenarioType,
      transcriptJson:       transcript,
      expectedOutcomeJson:  {
        scenarioType,
        expectedBotEndState: lastBot?.content?.slice(0, 100) ?? "unknown",
      },
      source:               "REAL_CONVERSATION",
      restaurantId:         conv.restaurantId ?? null,
    });
  }

  return results;
}
