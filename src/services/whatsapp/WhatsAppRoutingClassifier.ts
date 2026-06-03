/**
 * WhatsAppRoutingClassifier — PURE routing decision engine (no DB, no network).
 *
 * Given a simulated WhatsApp/Evolution event, this answers — deterministically
 * and WITHOUT any side effects — exactly how the live pipeline would treat it:
 *
 *   • Is it an internal command (/build, /cmd, /prompt)?
 *   • Would it be sent externally via Evolution?
 *   • Would it be persisted to a Conversation / shown in Atendimento?
 *   • Would it render as a customer chat bubble?
 *   • Which agent (WhatsApp receptionist / Waiter) would be invoked?
 *
 * It mirrors the real guards so the Routing Test Lab can replace manual WhatsApp
 * testing. The source-of-truth behaviors it encodes (verified against the live
 * code):
 *
 *   WebhookParserService    : fromMe=true → external_outbound (HUMAN_EXTERNAL);
 *                             fromMe=false → inbound (CUSTOMER).
 *   WebhookProcessorService : TEXT + isInternalCommandText → suppress BEFORE any
 *                             persist / AI / Evolution send (both inbound and
 *                             fromMe branches). Pre-flight gate, exception-safe.
 *   Operator/manual routes  : isInternalCommandText(content) → 400, never sent.
 *   AtendimentoClient       : a /build-prefixed message renders as the
 *                             "Comando interno ocultado" separator, never a
 *                             customer bubble; excluded from list preview.
 *
 * The classifier imports ONLY the pure detector from BuildCommandRouter. It must
 * never import anything that touches the DB, Evolution, or the network.
 */

import { detectBuildCommand } from "@/services/buildos/BuildCommandRouter";

// ── Public input/output contracts ─────────────────────────────────────────────

export type RoutingEventSource =
  | "WEBHOOK"          // a real Evolution webhook event (inbound or fromMe)
  | "MANUAL_OPERATOR"  // operator typed a reply in Atendimento / send-whatsapp
  | "CARDAPIO"         // a /pedido (cardápio) chat message
  | "SYSTEM";          // a system/handoff event

export interface SimulatedRoutingEvent {
  /** Restaurant slug or id (informational only — no lookup is performed). */
  restaurantRef?: string;
  instanceName?: string;
  remoteJid?: string;
  /** Phone the message is from (customer for inbound, store for fromMe). */
  fromPhone?: string;
  /** The store's connected WhatsApp number, when known (helps explain mirrors). */
  connectedBusinessPhone?: string;
  /** Evolution fromMe flag (only meaningful for source=WEBHOOK). */
  fromMe?: boolean;
  messageText: string;
  messageId?: string;
  timestamp?: string;
  source: RoutingEventSource;
  operatorId?: string;
  /** Build OS master switch (default false → disabled). */
  buildOsEnabled?: boolean;
  /** Whether fromPhone is an allow-listed Build OS operator. */
  authorizedBuildPhone?: boolean;
  /** WhatsApp agent mode for this restaurant. */
  agentMode?: "RECEPTIONIST_ONLY" | "HUMAN_ASSISTED" | "AI_ORDERING_EXPERIMENTAL";
  /** Conversation gating that affects whether the AI would respond. */
  aiEnabled?: boolean;
  conversationStatus?: "OPEN" | "BOT" | "HUMAN" | "RESOLVED" | "AI_ATENDENDO" | "HUMANO_ASSUMIU";
  contextType?: "CRM_CAMPAIGN" | "CRM_AUTOMATION" | "CART_RECOVERY" | "ORDER_SUPPORT" | "HUMAN_SUPPORT" | null;
  /** True when simulating an old, already-persisted leaked /build row. */
  isHistoricalRecord?: boolean;
}

export type Actor =
  | "CUSTOMER"
  | "HUMAN_EXTERNAL"
  | "OPERATOR"
  | "IA"
  | "SYSTEM"
  | "INTERNAL_COMMAND";

export type RoutingSource =
  | "WHATSAPP"
  | "CARDAPIO"
  | "INTERNAL_COMMAND"
  | "SYSTEM"
  | "MANUAL";

export type Direction = "INBOUND" | "OUTBOUND" | "INTERNAL";

export type Visibility =
  | "CUSTOMER_VISIBLE"
  | "ADMIN_VISIBLE"
  | "INTERNAL_ONLY"
  | "HIDDEN";

export type CommandType = "BUILD" | "CMD" | "PROMPT" | "NONE";

export interface RoutingDecision {
  isInternalCommand: boolean;
  commandType: CommandType;
  actor: Actor;
  source: RoutingSource;
  direction: Direction;
  visibility: Visibility;
  shouldPersistConversationMessage: boolean;
  shouldShowInAtendimento: boolean;
  shouldRenderAsCustomerBubble: boolean;
  shouldCallWhatsAppAgent: boolean;
  shouldCallWaiter: boolean;
  shouldCallEvolutionSend: boolean;
  blockReason: string | null;
  safetyNotes: string[];
  expectedLabel: string;
  explanation: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function commandTypeFromPrefix(prefix: string | undefined): CommandType {
  switch (prefix) {
    case "/build": return "BUILD";
    case "/cmd": return "CMD";
    case "/prompt": return "PROMPT";
    default: return "NONE";
  }
}

const ACTIVE_AI_STATUSES = new Set(["OPEN", "BOT", "AI_ATENDENDO"]);

// ── Classifier ────────────────────────────────────────────────────────────────

export function classifyRoutingEvent(event: SimulatedRoutingEvent): RoutingDecision {
  const detected = detectBuildCommand(event.messageText ?? "");
  const isInternalCommand = detected !== null;
  const commandType = commandTypeFromPrefix(detected?.prefix);
  const safetyNotes: string[] = [];

  // The hard invariant, shared by every branch: an internal command never goes
  // out via Evolution, never reaches the WhatsApp agent, never reaches Waiter,
  // and never renders as a customer bubble.
  const baseInternalCommandDecision = (
    partial: Pick<RoutingDecision, "actor" | "direction" | "visibility" | "shouldPersistConversationMessage" | "shouldShowInAtendimento" | "blockReason" | "expectedLabel" | "explanation">,
  ): RoutingDecision => ({
    isInternalCommand: true,
    commandType,
    source: "INTERNAL_COMMAND",
    shouldRenderAsCustomerBubble: false,
    shouldCallWhatsAppAgent: false,
    shouldCallWaiter: false,
    shouldCallEvolutionSend: false,
    safetyNotes,
    ...partial,
  });

  // ── SYSTEM events ──────────────────────────────────────────────────────────
  if (event.source === "SYSTEM") {
    return {
      isInternalCommand,
      commandType,
      actor: "SYSTEM",
      source: "SYSTEM",
      direction: "INTERNAL",
      visibility: "ADMIN_VISIBLE",
      shouldPersistConversationMessage: true,
      shouldShowInAtendimento: true,
      shouldRenderAsCustomerBubble: false,
      shouldCallWhatsAppAgent: false,
      shouldCallWaiter: false,
      shouldCallEvolutionSend: false,
      blockReason: null,
      safetyNotes,
      expectedLabel: "Evento do sistema",
      explanation:
        "System/handoff event. Rendered as a centered separator (SystemEventNote), never a chat bubble, never sent externally.",
    };
  }

  // ── MANUAL / OPERATOR send ───────────────────────────────────────────────────
  if (event.source === "MANUAL_OPERATOR") {
    if (isInternalCommand) {
      safetyNotes.push("Operator manual send of an internal command is rejected with a 400 admin error.");
      return baseInternalCommandDecision({
        actor: "INTERNAL_COMMAND",
        direction: "OUTBOUND",
        visibility: "HIDDEN",
        shouldPersistConversationMessage: false,
        shouldShowInAtendimento: false,
        blockReason: "Comandos internos (/build, /cmd, /prompt) não podem ser enviados por esta interface.",
        expectedLabel: "Bloqueado (comando interno)",
        explanation:
          "Operator tried to send an internal command. Both manual routes (/api/customers/[id]/send-whatsapp and /api/chat/conversations/[id]/messages) call isInternalCommandText() and return 400 — no persist, no Evolution send.",
      });
    }
    return {
      isInternalCommand: false,
      commandType: "NONE",
      actor: "OPERATOR",
      source: "MANUAL",
      direction: "OUTBOUND",
      visibility: "CUSTOMER_VISIBLE",
      shouldPersistConversationMessage: true,
      shouldShowInAtendimento: true,
      shouldRenderAsCustomerBubble: false,
      shouldCallWhatsAppAgent: false,
      shouldCallWaiter: false,
      shouldCallEvolutionSend: true, // operator reply IS delivered to the customer
      blockReason: null,
      safetyNotes,
      expectedLabel: "Operador",
      explanation:
        "Operator manual reply. Persisted as HUMAN/OUTBOUND, shown in Atendimento, and delivered to the customer via Evolution.",
    };
  }

  // ── CARDÁPIO (/pedido) ───────────────────────────────────────────────────────
  if (event.source === "CARDAPIO") {
    // Cardápio never calls Evolution. Internal commands typed in the cardápio chat
    // are not a real vector (the cardápio AI handles them as text), but we still
    // classify them as internal to keep the UI hide-rule consistent.
    if (isInternalCommand) {
      safetyNotes.push("Cardápio chat never reaches Evolution; an internal-command-looking message is still hidden in Atendimento.");
      return baseInternalCommandDecision({
        actor: "INTERNAL_COMMAND",
        direction: "INBOUND",
        visibility: "HIDDEN",
        shouldPersistConversationMessage: false,
        shouldShowInAtendimento: false,
        blockReason: null,
        expectedLabel: "Comando interno ocultado",
        explanation:
          "An internal-command prefix in the cardápio chat. Cardápio has no Evolution send path; treated as internal and hidden.",
      });
    }
    return {
      isInternalCommand: false,
      commandType: "NONE",
      actor: "CUSTOMER",
      source: "CARDAPIO",
      direction: "INBOUND",
      visibility: "CUSTOMER_VISIBLE",
      shouldPersistConversationMessage: true,
      shouldShowInAtendimento: true,
      shouldRenderAsCustomerBubble: true,
      shouldCallWhatsAppAgent: false,
      shouldCallWaiter: false,
      shouldCallEvolutionSend: false,
      blockReason: null,
      safetyNotes,
      expectedLabel: "Cliente · Cardápio",
      explanation:
        "Cardápio (/pedido) customer message. Persisted as CUSTOMER_CARDAPIO, shown as a customer bubble. Cardápio never sends via Evolution.",
    };
  }

  // ── WEBHOOK ──────────────────────────────────────────────────────────────────
  // Historical leaked record: an already-persisted /build row from before the fix.
  if (event.isHistoricalRecord && isInternalCommand) {
    safetyNotes.push("Historical leaked record — preserved in DB, but hidden/relabelled in the UI. Never re-sent.");
    return baseInternalCommandDecision({
      actor: "INTERNAL_COMMAND",
      direction: event.fromMe ? "OUTBOUND" : "INBOUND",
      visibility: "HIDDEN",
      shouldPersistConversationMessage: true, // already persisted historically
      shouldShowInAtendimento: false,         // excluded from list preview
      blockReason: null,
      expectedLabel: "Comando interno ocultado",
      explanation:
        "A pre-fix leaked /build message. AtendimentoClient renders it as the 'Comando interno ocultado' separator and excludes it from the conversation preview. Not deleted.",
    });
  }

  const fromMe = event.fromMe === true;

  // fromMe internal command → suppressed in the external_outbound branch.
  if (fromMe && isInternalCommand) {
    safetyNotes.push("fromMe internal command suppressed by the pre-flight gate before the external-outbound branch persists anything.");
    if (event.connectedBusinessPhone && event.fromPhone &&
        normalizeDigits(event.connectedBusinessPhone) === normalizeDigits(event.fromPhone)) {
      safetyNotes.push("from == connected business number → this is the classic outbound-mirror that looks like a self-echo.");
    }
    return baseInternalCommandDecision({
      actor: "INTERNAL_COMMAND",
      direction: "OUTBOUND",
      visibility: "HIDDEN",
      shouldPersistConversationMessage: false,
      shouldShowInAtendimento: false,
      blockReason: null,
      expectedLabel: "Comando interno ocultado (fromMe)",
      explanation:
        "Evolution reported a fromMe message (sent from the business line) whose text is an internal command. WebhookProcessorService suppresses it before persistence. No Evolution send, no agent, no customer bubble. This is the 'mirror' that previously looked like an echo.",
    });
  }

  // fromMe normal → external staff outbound (WhatsApp Web / mobile).
  if (fromMe) {
    return {
      isInternalCommand: false,
      commandType: "NONE",
      actor: "HUMAN_EXTERNAL",
      source: "WHATSAPP",
      direction: "OUTBOUND",
      visibility: "CUSTOMER_VISIBLE",
      shouldPersistConversationMessage: true, // only if an active conversation exists
      shouldShowInAtendimento: true,
      shouldRenderAsCustomerBubble: false,
      shouldCallWhatsAppAgent: false,
      shouldCallWaiter: false,
      shouldCallEvolutionSend: false, // Foocci does NOT re-send a fromMe message
      blockReason: null,
      safetyNotes,
      expectedLabel: "WhatsApp externo",
      explanation:
        "A message the business sent from WhatsApp Web/mobile (fromMe). Stored as HUMAN_EXTERNAL/OUTBOUND if an active conversation exists; deduped by externalMessageId. Foocci never re-sends it.",
    };
  }

  // fromMe=false inbound internal command → suppressed before normal flow.
  if (isInternalCommand) {
    safetyNotes.push("Inbound internal command suppressed before customer/conversation/message creation, AI, and Evolution send.");
    if (event.buildOsEnabled && !event.authorizedBuildPhone) {
      safetyNotes.push("Build OS enabled but sender not authorized → intercepted silently (no record, no reply).");
    }
    return baseInternalCommandDecision({
      actor: "INTERNAL_COMMAND",
      direction: "INBOUND",
      visibility: "HIDDEN",
      shouldPersistConversationMessage: false,
      shouldShowInAtendimento: false,
      blockReason: null,
      expectedLabel: "Comando interno ocultado",
      explanation:
        "Inbound /build|/cmd|/prompt from a customer. The pre-flight isInternalCommandText() gate in WebhookProcessorService suppresses it (exception-safe) before any persist, AI routing, or Evolution send.",
    });
  }

  // fromMe=false inbound normal customer message.
  const aiEnabled = event.aiEnabled !== false; // default on
  const isCrmOrigin = event.contextType === "CRM_CAMPAIGN" || event.contextType === "CRM_AUTOMATION";
  const isCartRecovery = event.contextType === "CART_RECOVERY";
  const statusAllowsAi = event.conversationStatus
    ? ACTIVE_AI_STATUSES.has(event.conversationStatus)
    : true;
  const wouldRespond = aiEnabled && !isCrmOrigin && !isCartRecovery && statusAllowsAi;
  const isWaiterMode = event.agentMode === "AI_ORDERING_EXPERIMENTAL";

  if (!wouldRespond) {
    if (!aiEnabled) safetyNotes.push("aiEnabled=false → conversation is human-handled; no agent runs.");
    if (isCrmOrigin) safetyNotes.push("CRM-origin conversation → AI never auto-responds; goes to human first.");
    if (isCartRecovery) safetyNotes.push("Cart-recovery conversation → escalates to human, AI does not intercept.");
    if (!statusAllowsAi) safetyNotes.push(`status=${event.conversationStatus} → outside the AI-active set.`);
  }

  return {
    isInternalCommand: false,
    commandType: "NONE",
    actor: "CUSTOMER",
    source: "WHATSAPP",
    direction: "INBOUND",
    visibility: "CUSTOMER_VISIBLE",
    shouldPersistConversationMessage: true,
    shouldShowInAtendimento: true,
    shouldRenderAsCustomerBubble: true,
    shouldCallWhatsAppAgent: wouldRespond && !isWaiterMode,
    shouldCallWaiter: wouldRespond && isWaiterMode,
    shouldCallEvolutionSend: false, // the inbound message itself is never echoed; any AI reply is a separate generated message
    blockReason: null,
    safetyNotes,
    expectedLabel: "Cliente · WhatsApp",
    explanation: wouldRespond
      ? `Normal inbound customer message. Persisted as CUSTOMER, shown as a customer bubble, routed to ${isWaiterMode ? "AIOrderService (Waiter)" : "WhatsAppReceptionistService"}.`
      : "Normal inbound customer message. Persisted and shown as a customer bubble, but no agent runs given the current conversation gating.",
  };
}

function normalizeDigits(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}
