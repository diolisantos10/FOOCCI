/**
 * Provider-agnostic WhatsApp messaging contract.
 *
 * Foocci services call WhatsAppMessagingService (provider-agnostic); each provider
 * (Evolution, Meta Cloud API) implements this interface. Evolution stays the
 * default; Meta is added in parallel.
 */

export type WhatsAppProviderId = "EVOLUTION" | "META_CLOUD_API";

export interface SendTextInput {
  restaurantId: string;
  to:           string; // raw phone — provider normalizes/validates
  text:         string;
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

export interface WhatsAppProvider {
  readonly id: WhatsAppProviderId;
  sendText(input: SendTextInput): Promise<SendResult>;
  /** Template send — required for Meta outside the 24h window; optional for Evolution. */
  sendTemplate?(input: SendTemplateInput): Promise<SendResult>;
  getConnectionStatus(restaurantId: string): Promise<ConnectionStatus>;
  healthCheck(restaurantId: string): Promise<ConnectionStatus>;
}
