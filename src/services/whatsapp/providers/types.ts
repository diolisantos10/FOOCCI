/**
 * Contrato de envio de WhatsApp — UM provedor só: a Meta Cloud API.
 *
 * HISTÓRIA, para ninguém reintroduzir o que saiu: até 04/08/2026 este contrato
 * era "provider-agnostic" e tinha duas implementações (Evolution e Meta). A
 * Evolution era muleta do começo, usada enquanto a homologação da Meta não saía.
 * A homologação saiu, o CEO confirmou que nenhum restaurante depende mais dela,
 * e ela foi eliminada.
 *
 * `WhatsAppProviderId` tem **um valor de propósito**: reintroduzir um segundo
 * canal de envio passa a ser erro de compilação, não decisão de configuração
 * (guardrail 4 — prompt é aviso, código é trava). Um caminho de envio não
 * homologado é exatamente o risco de banimento que a homologação eliminou.
 *
 * ⚠️ Isto é o tipo do CÓDIGO, não o histórico do BANCO: `Message.provider` ainda
 * guarda "EVOLUTION" em linhas antigas, e essas linhas continuam legíveis — elas
 * são `string` no Prisma, não este union.
 */

import type { NormalizedInboundMessage, NormalizedStatus } from "./metaWebhook";

export type WhatsAppProviderId = "META_CLOUD_API";

export interface SendTextInput {
  restaurantId: string;
  to:           string; // raw phone — provider normalizes/validates
  text:         string;
}

export interface SendMediaInput {
  restaurantId: string;
  to:           string;
  mediaType:    "image" | "audio" | "video" | "document";
  mediaUrl:     string;
  caption?:     string;
}

export interface SendTemplateInput {
  restaurantId: string;
  to:           string;
  templateName: string;
  language:     string;       // e.g. "pt_BR"
  bodyParams?:  string[];
}

export interface SendResult {
  ok:                boolean;
  provider:          WhatsAppProviderId;
  status:            "SENT" | "FAILED" | "BLOCKED";
  providerMessageId: string | null;
  /** Masked, human-safe error (never contains tokens). */
  error?:            string | null;
  errorCode?:        string | null;
  retryable?:        boolean;
  /** Set when status=BLOCKED, e.g. "META_TEMPLATE_REQUIRED". */
  blockReason?:      string | null;
}

export interface ConnectionStatus {
  provider:  WhatsAppProviderId;
  connected: boolean;
  detail?:   string | null;
}

export interface WebhookValidationResult {
  valid:   boolean;
  reason?: string;
}

/** Normalized inbound webhook (item shapes shared with metaWebhook). */
export interface NormalizedWebhookResult {
  provider:   WhatsAppProviderId;
  channelIds: string[]; // Meta phone_number_ids
  messages:   NormalizedInboundMessage[];
  statuses:   NormalizedStatus[];
}

export interface WhatsAppProvider {
  readonly id: WhatsAppProviderId;
  sendText(input: SendTextInput): Promise<SendResult>;
  /**
   * Envio por modelo aprovado. **Obrigatório**: na Meta, o template é o caminho
   * OFICIAL para falar fora da janela de 24h — não é um extra opcional.
   */
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
  /** Media send (image/audio/video/document) by URL. */
  sendMedia?(input: SendMediaInput): Promise<SendResult>;
  getConnectionStatus(restaurantId: string): Promise<ConnectionStatus>;
  healthCheck(restaurantId: string): Promise<ConnectionStatus>;
  /**
   * Validate an inbound webhook (signature / verify token). Provider-specific.
   * Async because the app secret may live in the database (admin screen), not only in env.
   */
  validateWebhook?(rawBody: string, headers: Record<string, string | null>): Promise<WebhookValidationResult>;
  /** Normalize an inbound webhook payload into the internal shape. */
  normalizeIncomingWebhook?(payload: unknown): NormalizedWebhookResult;
}
