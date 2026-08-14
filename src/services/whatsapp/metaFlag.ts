/**
 * Meta WhatsApp feature flag + app-level config (env).
 *
 * ⚠️ O QUE ESTA FLAG **NÃO** FAZ, desde 04/08/2026: ela não governa mais o ENVIO.
 * Quando existiam dois provedores, `META_WHATSAPP_ENABLED=false` mandava tudo
 * para a Evolution. Com a Evolution eliminada e a Meta como canal único, deixá-la
 * governar o envio significaria "flag desligada = sistema mudo, sem erro e sem
 * log" — um perigo maior que o que ela evitava. `WhatsAppMessagingService` e
 * `activeProvider` não a consultam.
 *
 * O que ela ainda faz: é portão de ONBOARDING/UI nas rotas
 * `integracoes/whatsapp/meta/*` (connect, templates, test, simulate, provider) —
 * desligá-la impede CONFIGURAR algo novo, não impede o restaurante já conectado
 * de responder ao cliente.
 *
 * App-level (one Foocci Meta app, Embedded Signup):
 *   META_WHATSAPP_ENABLED       — "true" to enable the Meta onboarding/UI
 *   META_APP_ID                 — Meta app id (Embedded Signup)
 *   META_APP_SECRET             — app secret (webhook signature + token exchange)
 *   META_CONFIG_ID              — Embedded Signup configuration id
 *   META_WEBHOOK_VERIFY_TOKEN   — app-level webhook verify token (GET challenge)
 *   META_GRAPH_VERSION          — Graph API version (default v21.0)
 */

export function isMetaWhatsAppEnabled(): boolean {
  return process.env.META_WHATSAPP_ENABLED === "true";
}

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

export function metaAppId():             string | undefined { return process.env.META_APP_ID; }
export function metaAppSecret():         string | undefined { return process.env.META_APP_SECRET; }
export function metaConfigId():          string | undefined { return process.env.META_CONFIG_ID; }
export function metaWebhookVerifyToken(): string | undefined { return process.env.META_WEBHOOK_VERIFY_TOKEN; }

/**
 * Embedded Signup configuration id for the COEXISTENCE flow (Business App number →
 * Cloud API, keeping the number on the phone). `META_COEXISTENCE_CONFIG_ID` has to
 * point at a configuration whose feature is "WhatsApp Business App Onboarding".
 *
 * ⚠️ NÃO cai mais no `META_CONFIG_ID` padrão. O fallback parecia conveniente e era
 * perigoso: a configuração comum abre o cadastro PADRÃO, que oferece migrar o número
 * para a Cloud API — a operação que TIRA o número do celular do restaurante. Um
 * fluxo rotulado "o número segue no celular" jamais pode cair nela.
 * Ausente devolve `undefined`, e quem chama tem de recusar (fail-closed).
 */
export function metaCoexistenceConfigId(): string | undefined {
  return process.env.META_COEXISTENCE_CONFIG_ID || undefined;
}

export function metaGraphUrl(path: string): string {
  return `https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, "")}`;
}
