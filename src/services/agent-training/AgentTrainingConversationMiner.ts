/**
 * AgentTrainingConversationMiner
 *
 * Reads recent real Atendimento/WhatsApp conversations and converts them into
 * training scenarios. NEVER mutates original conversation data.
 *
 * Reading + PII masking are delegated to the single canonical reader
 * (scanRealConversations) so every miner sees the same PII-safe, role-tagged
 * shape. This module only does the scenario-shaping on top of that.
 */

import type { TranscriptTurn } from "./types";
import { scanRealConversations } from "./realConversationScan";

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
  // Single canonical reader: already masks PII + enforces minMessages.
  const conversations = await scanRealConversations({
    conversationType: "CUSTOMER",
    sinceHours:       opts.sinceHours ?? 48,
    maxConversations: opts.maxConversations ?? 30,
    minMessages:      2,
    ...(opts.restaurantId ? { restaurantId: opts.restaurantId } : {}),
  });

  const results: MinedScenario[] = [];

  for (const conv of conversations) {
    // classifyScenarioType keys off the raw senderType, which the scanner preserves.
    const messagesForClassify = conv.messages.map((m) => ({
      content:    m.content,
      senderType: m.senderType ?? "UNKNOWN",
    }));

    const scenarioType = classifyScenarioType(messagesForClassify);

    const transcript: TranscriptTurn[] = conv.messages.map((m) => ({
      role:    m.role === "bot" ? "bot" as const : "customer" as const,
      content: m.content,
      ts:      m.sentAt,
    }));

    const lastBot = conv.messages.filter((m) => m.senderType === "AI").at(-1);

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
