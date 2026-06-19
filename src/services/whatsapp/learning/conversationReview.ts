/**
 * WhatsApp Conversation Review — PURE classification of a real WhatsApp
 * conversation into a business-language outcome + a list of detected issues
 * (each a candidate "learning"). No DB, no Evolution, no order/Pix, no GPT.
 *
 * It reuses the SAME deterministic detectors the live receptionist uses
 * (detectIntent, classifyReplyText, looksLikeLooseAddress, isExplicitOrderMessage)
 * so the review can never silently disagree with production behavior.
 *
 * PII is masked via maskPII before any text leaves this module in a summary or
 * an issue excerpt.
 */

import {
  detectIntent,
  classifyReplyText,
  looksLikeLooseAddress,
  isExplicitOrderMessage,
} from "@/services/ai/WhatsAppReceptionistService";
import { maskPII } from "./pii";

/** Business-language outcome for ONE conversation. */
export type ConversationOutcome =
  | "VENDA_CONCLUIDA"
  | "ATENDENTE_ASSUMIU"
  | "CLIENTE_ABANDONOU"
  | "ERRO_DE_RESPOSTA"
  | "ERRO_DE_PRODUTO"
  | "ERRO_DE_ENDERECO"
  | "ERRO_DE_PAGAMENTO"
  | "LOOP"
  | "PERGUNTA_NAO_RESPONDIDA"
  | "OPORTUNIDADE_DE_VENDA_PERDIDA"
  | "OK_SEM_ACAO";

/** Issue kinds that produce a learning (subset of the outcomes). */
export type IssueKind =
  | "ERRO_DE_RESPOSTA"
  | "ERRO_DE_PRODUTO"
  | "ERRO_DE_ENDERECO"
  | "ERRO_DE_PAGAMENTO"
  | "LOOP"
  | "PERGUNTA_NAO_RESPONDIDA"
  | "OPORTUNIDADE_DE_VENDA_PERDIDA";

export interface ReviewMessage {
  direction: "INBOUND" | "OUTBOUND";
  senderType: string | null; // CUSTOMER | AI | HUMAN | SYSTEM
  content: string;
  type: string;              // TEXT | IMAGE | ...
  sentAt: Date;
}

export interface ConversationSignals {
  conversationId: string;
  status: string;            // ConversationStatus
  hasOrder: boolean;         // an order was created from this conversation
  hasPix: boolean;           // a Pix charge was generated
  handoff: boolean;          // conversation went to a human
  messages: ReviewMessage[]; // chronological (oldest first)
}

export interface DetectedIssue {
  kind: IssueKind;
  /** Masked customer message that triggered the issue. */
  customerMessage: string;
  /** Masked agent reply that was wrong / missing. */
  agentReply: string;
  /** detectIntent label of the customer message. */
  customerIntent: string;
}

export interface ConversationReview {
  conversationId: string;
  outcome: ConversationOutcome;
  outcomeReason: string;
  issues: DetectedIssue[];
  /** Masked, business-language one-liner for the "Conversas de hoje" tab. */
  summary: string;
}

// Severity rank so the headline outcome picks the most important issue.
const ISSUE_RANK: Record<IssueKind, number> = {
  ERRO_DE_PAGAMENTO:             6,
  ERRO_DE_ENDERECO:              5,
  ERRO_DE_RESPOSTA:              4,
  ERRO_DE_PRODUTO:               3,
  LOOP:                          3,
  PERGUNTA_NAO_RESPONDIDA:       2,
  OPORTUNIDADE_DE_VENDA_PERDIDA: 1,
};

/** Normalizes a reply for loop detection (lowercase, collapse whitespace, drop footer). */
function loopKey(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/\n0\.\s*menu\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the customer message is a question the agent should have answered. */
function looksLikeQuestion(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return /\?$/.test(t) || /^(tem|voc[eê]s tem|qual|quais|quanto|como|onde|aceita|posso|d[aá] para|tem como)\b/i.test(t);
}

/**
 * Scans customer→agent message pairs and returns every detected behavior issue.
 * A "pair" is an INBOUND customer TEXT message followed by the next OUTBOUND AI
 * reply (the reply the customer actually saw for that message).
 */
export function detectIssues(messages: ReviewMessage[]): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const aiReplies: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    if (m.direction !== "INBOUND" || (m.senderType && m.senderType !== "CUSTOMER")) continue;
    if (m.type !== "TEXT") continue;

    // Find the next AI reply after this customer message.
    const reply = messages
      .slice(i + 1)
      .find((x) => x.direction === "OUTBOUND" && x.senderType === "AI" && x.type === "TEXT");
    if (!reply) {
      // Unanswered question at the tail is handled by the outcome layer; mid-thread
      // unanswered questions are captured there too. Skip here.
      continue;
    }

    const intent    = detectIntent(m.content);
    const replyType = classifyReplyText(reply.content);
    const cust      = maskPII(m.content);
    const ans       = maskPII(reply.content);

    // Payment question answered with a raw cardápio link → ERRO_DE_PAGAMENTO.
    if (intent === "PAYMENT_INFO" && replyType === "LINK_CARDAPIO") {
      issues.push({ kind: "ERRO_DE_PAGAMENTO", customerMessage: cust, agentReply: ans, customerIntent: intent });
      continue;
    }
    // Loose address answered with the restaurant's own location → ERRO_DE_ENDERECO.
    if (looksLikeLooseAddress(m.content) && replyType === "LOCATION") {
      issues.push({ kind: "ERRO_DE_ENDERECO", customerMessage: cust, agentReply: ans, customerIntent: intent });
      continue;
    }
    // Explicit order answered with a raw link as the primary body → ERRO_DE_RESPOSTA.
    if (isExplicitOrderMessage(m.content) && replyType === "LINK_CARDAPIO") {
      issues.push({ kind: "ERRO_DE_RESPOSTA", customerMessage: cust, agentReply: ans, customerIntent: intent });
      continue;
    }
    // A product / catalog question that got escalated to a human instead of a safe
    // answer → ERRO_DE_PRODUTO (the agent should know its own menu).
    if ((intent === "MENU_REQUEST" || intent === "UNKNOWN") && looksLikeQuestion(m.content) && replyType === "HANDOFF") {
      issues.push({ kind: "ERRO_DE_PRODUTO", customerMessage: cust, agentReply: ans, customerIntent: intent });
      continue;
    }
  }

  // Loop detection: 2+ near-identical consecutive AI replies.
  for (const m of messages) {
    if (m.direction === "OUTBOUND" && m.senderType === "AI" && m.type === "TEXT") aiReplies.push(m.content);
  }
  for (let i = 1; i < aiReplies.length; i++) {
    const cur = aiReplies[i];
    const prev = aiReplies[i - 1];
    if (cur && prev && loopKey(cur) && loopKey(cur) === loopKey(prev)) {
      issues.push({
        kind: "LOOP",
        customerMessage: "(cliente confuso — IA repetiu a mesma resposta)",
        agentReply: maskPII(cur),
        customerIntent: "UNKNOWN",
      });
      break; // one LOOP issue per conversation is enough
    }
  }

  return issues;
}

/** Last customer message with no AI reply after it (an unanswered tail question). */
function tailUnansweredQuestion(messages: ReviewMessage[]): ReviewMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.direction === "OUTBOUND" && m.senderType === "AI") return null; // agent had the last word
    if (m.direction === "INBOUND" && (!m.senderType || m.senderType === "CUSTOMER") && m.type === "TEXT") {
      return looksLikeQuestion(m.content) ? m : null;
    }
  }
  return null;
}

/** True when the customer expressed order intent anywhere in the thread. */
function showedOrderIntent(messages: ReviewMessage[]): boolean {
  return messages.some(
    (m) =>
      m.direction === "INBOUND" &&
      (!m.senderType || m.senderType === "CUSTOMER") &&
      m.type === "TEXT" &&
      (isExplicitOrderMessage(m.content) || detectIntent(m.content) === "ORDER"),
  );
}

/**
 * Reviews ONE conversation → headline outcome + every detected issue + a masked
 * business summary. Pure: deterministic, no I/O.
 *
 * Headline precedence: a completed sale is the headline even if there was
 * friction, but the friction still appears in `issues` so it can become a
 * learning. When there is no sale, the most severe issue becomes the headline.
 */
export function reviewConversation(signals: ConversationSignals): ConversationReview {
  const issues = detectIssues(signals.messages);
  const customerMsgCount = signals.messages.filter(
    (m) => m.direction === "INBOUND" && (!m.senderType || m.senderType === "CUSTOMER"),
  ).length;

  let outcome: ConversationOutcome;
  let reason: string;

  if (signals.hasOrder) {
    outcome = "VENDA_CONCLUIDA";
    reason = signals.hasPix ? "Pedido criado e Pix gerado." : "Pedido criado a partir da conversa.";
  } else if (signals.handoff) {
    outcome = "ATENDENTE_ASSUMIU";
    reason = "Conversa encaminhada para um atendente humano.";
  } else if (issues.length > 0) {
    const sorted = [...issues].sort((a, b) => ISSUE_RANK[b.kind] - ISSUE_RANK[a.kind]);
    outcome = sorted[0]!.kind;
    reason = "Problema de resposta detectado na conversa.";
  } else if (tailUnansweredQuestion(signals.messages)) {
    outcome = "PERGUNTA_NAO_RESPONDIDA";
    reason = "Cliente fez uma pergunta que ficou sem resposta.";
  } else if (showedOrderIntent(signals.messages)) {
    outcome = "OPORTUNIDADE_DE_VENDA_PERDIDA";
    reason = "Cliente demonstrou intenção de pedido mas não fechou.";
  } else if (customerMsgCount > 0) {
    outcome = "CLIENTE_ABANDONOU";
    reason = "Cliente iniciou conversa e não seguiu.";
  } else {
    outcome = "OK_SEM_ACAO";
    reason = "Sem ação necessária.";
  }

  // A tail unanswered question is always worth a learning even when the headline
  // is something else (e.g. abandonment).
  if (
    !issues.some((i) => i.kind === "PERGUNTA_NAO_RESPONDIDA") &&
    outcome !== "VENDA_CONCLUIDA"
  ) {
    const q = tailUnansweredQuestion(signals.messages);
    if (q) {
      issues.push({
        kind: "PERGUNTA_NAO_RESPONDIDA",
        customerMessage: maskPII(q.content),
        agentReply: "(sem resposta da IA)",
        customerIntent: detectIntent(q.content),
      });
    }
  }

  return {
    conversationId: signals.conversationId,
    outcome,
    outcomeReason: reason,
    issues,
    summary: buildSummary(outcome, customerMsgCount),
  };
}

/** Masked, business-language one-liner (no PII, no raw message content). */
function buildSummary(outcome: ConversationOutcome, customerMsgCount: number): string {
  const turns = `${customerMsgCount} mensagem${customerMsgCount === 1 ? "" : "s"} do cliente`;
  const head: Record<ConversationOutcome, string> = {
    VENDA_CONCLUIDA:               "Venda concluída",
    ATENDENTE_ASSUMIU:             "Atendente humano assumiu",
    CLIENTE_ABANDONOU:             "Cliente abandonou a conversa",
    ERRO_DE_RESPOSTA:              "Resposta inadequada da IA",
    ERRO_DE_PRODUTO:               "Dúvida de produto mal resolvida",
    ERRO_DE_ENDERECO:              "Endereço tratado incorretamente",
    ERRO_DE_PAGAMENTO:             "Pergunta de pagamento mal respondida",
    LOOP:                          "IA entrou em loop",
    PERGUNTA_NAO_RESPONDIDA:       "Pergunta do cliente sem resposta",
    OPORTUNIDADE_DE_VENDA_PERDIDA: "Oportunidade de venda perdida",
    OK_SEM_ACAO:                   "Conversa normal, sem ação",
  };
  return `${head[outcome]} · ${turns}`;
}
