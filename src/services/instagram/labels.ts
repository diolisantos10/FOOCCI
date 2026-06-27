/**
 * Lojista-facing labels for the Meta/Instagram integration UI — kept out of the
 * React component so they can be unit-tested. Store-owner language, no dev jargon.
 */

import type { InstagramMode, InstagramScope } from "./types";

export const INSTAGRAM_MODE_LABEL: Record<InstagramMode, string> = {
  DISABLED: "Desativado",
  RECEIVE_ONLY: "Receber mensagens na Central",
  REPLY_ONLY: "Responder manualmente pela Central",
  FULL: "IA automática (em breve)",
};

export const INSTAGRAM_SCOPE_LABEL: Record<InstagramScope, string> = {
  TEST_ACCOUNT_ONLY: "Conta de teste",
  RESTAURANT_WIDE: "Restaurante inteiro",
};

/** The card metadata shown in the Integrations Center. */
export const INSTAGRAM_INTEGRATION_CARD = {
  provider: "instagram",
  name: "Instagram",
  description: "Receba e responda mensagens do Instagram Direct e comentários nas publicações pela Central de Atendimento.",
  configureHref: "/integracoes/instagram",
} as const;

/** Where Instagram Direct shows up for the operator. */
export const INSTAGRAM_CENTRAL_HREF = "/atendimento";
export const INSTAGRAM_WEBHOOK_PATH = "/api/webhooks/instagram";
