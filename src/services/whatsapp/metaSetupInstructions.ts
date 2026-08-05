/**
 * Meta WhatsApp platform setup — pure constants + copyable internal instructions.
 *
 * No secrets, no I/O. Used by the Meta card (Integrações → WhatsApp → Avançado) to
 * render the setup checklist and the "Copiar instruções para configurar Meta" button,
 * and unit-tested so the env-var names and webhook details never drift.
 *
 * The code reads META_GRAPH_VERSION (NOT META_GRAPH_API_VERSION).
 */

export const META_WEBHOOK_PATH  = "/api/webhooks/meta/whatsapp";
export const META_WEBHOOK_FIELD = "messages";
export const META_DEFAULT_BASE_URL = "https://foocci.com.br";

/** Required for the Meta provider to work. */
export const META_REQUIRED_ENV = [
  "META_WHATSAPP_ENABLED",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_CONFIG_ID",
  "META_WEBHOOK_VERIFY_TOKEN",
  "NEXT_PUBLIC_META_APP_ID",
  "NEXT_PUBLIC_META_CONFIG_ID",
] as const;

/** Optional but recommended. */
export const META_RECOMMENDED_ENV = [
  "META_TEST_PHONE",
  "META_GRAPH_VERSION",
] as const;

/** Read at BUILD time (Next.js inlines NEXT_PUBLIC_*) → a redeploy is required after changing them. */
export const META_BUILD_TIME_ENV = [
  "NEXT_PUBLIC_META_APP_ID",
  "NEXT_PUBLIC_META_CONFIG_ID",
] as const;

export function metaWebhookUrl(baseUrl: string = META_DEFAULT_BASE_URL): string {
  return `${baseUrl.replace(/\/$/, "")}${META_WEBHOOK_PATH}`;
}

/**
 * Plain-text setup checklist for the internal Foocci team. Contains only the env-var
 * NAMES (no values) plus the webhook URL/field and the redeploy note — safe to copy
 * and paste anywhere.
 */
export function buildMetaSetupInstructions(baseUrl: string = META_DEFAULT_BASE_URL): string {
  return [
    "Foocci — Configuração da plataforma Meta WhatsApp (uso interno)",
    "",
    "1) Variáveis de ambiente no Railway (preencha os valores reais no painel — NÃO compartilhe segredos):",
    "META_WHATSAPP_ENABLED=true",
    "META_APP_ID=",
    "META_APP_SECRET=",
    "META_CONFIG_ID=",
    "META_WEBHOOK_VERIFY_TOKEN=",
    "META_TEST_PHONE=",
    "META_GRAPH_VERSION=v21.0",
    "NEXT_PUBLIC_META_APP_ID=",
    "NEXT_PUBLIC_META_CONFIG_ID=",
    "",
    "IMPORTANTE: NEXT_PUBLIC_META_APP_ID e NEXT_PUBLIC_META_CONFIG_ID são lidas no BUILD.",
    "Depois de defini-las, é necessário REDEPLOY para o navegador enxergá-las.",
    "",
    "2) Webhook (no app Meta):",
    `URL: ${metaWebhookUrl(baseUrl)}`,
    "Verify token: o MESMO valor de META_WEBHOOK_VERIFY_TOKEN",
    `Campo (field) a assinar: ${META_WEBHOOK_FIELD}`,
    "",
    "3) Permissões: whatsapp_business_messaging, whatsapp_business_management (+ business_management)",
    "",
    "4) Validar em Integrações → WhatsApp → Avançado: todos os itens ✓ → Conectar (Embedded Signup) →",
    "Testar conexão → Simular recebimento. Enquanto o teste não passar, o restaurante NÃO envia nem recebe",
    "por WhatsApp — não existe mais canal reserva.",
  ].join("\n");
}
