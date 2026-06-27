/**
 * Instagram Direct platform setup — pure constants + copyable internal instructions.
 *
 * No secrets, no I/O. Used by the Instagram card (Integrações → Instagram → Avançado)
 * for the readiness checklist and the "Copiar instruções de setup Instagram" button,
 * and unit-tested so the env-var names, webhook field and review scopes never drift.
 *
 * Phase 1 = manual support only (no AI, no real send from here).
 */

import { INSTAGRAM_WEBHOOK_PATH } from "./labels";

export const INSTAGRAM_WEBHOOK_FIELD = "messages";
export const INSTAGRAM_COMMENT_WEBHOOK_FIELD = "comments";
/** Webhook fields to subscribe — DMs and post comments both land in the Central. */
export const INSTAGRAM_WEBHOOK_FIELDS = [INSTAGRAM_WEBHOOK_FIELD, INSTAGRAM_COMMENT_WEBHOOK_FIELD] as const;
export const INSTAGRAM_DEFAULT_BASE_URL = "https://foocci.com.br";

/** Permissions the OAuth flow requests; the messaging/comment ones require Meta App Review. */
export const INSTAGRAM_REVIEW_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "instagram_manage_messages",
  "instagram_manage_comments",
  "pages_messaging",
] as const;

/** Required for Instagram Direct to work. */
export const INSTAGRAM_REQUIRED_ENV = [
  "META_APP_ID",                 // or FACEBOOK_APP_ID
  "META_APP_SECRET",             // or FACEBOOK_APP_SECRET
  "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
  "FOOCCI_BASE_URL",             // or APP_URL
  "ENCRYPTION_KEY",
] as const;

/** Recommended (signature is only enforced when INSTAGRAM_APP_SECRET is set). */
export const INSTAGRAM_RECOMMENDED_ENV = ["INSTAGRAM_APP_SECRET"] as const;

export function instagramWebhookUrl(baseUrl: string = INSTAGRAM_DEFAULT_BASE_URL): string {
  return `${baseUrl.replace(/\/$/, "")}${INSTAGRAM_WEBHOOK_PATH}`;
}

/**
 * Plain-text setup checklist for the internal Foocci team — env-var NAMES only (no
 * values), the webhook URL/field, the App Review/Tester reminder and a safe step-by-step.
 */
export function buildInstagramSetupInstructions(baseUrl: string = INSTAGRAM_DEFAULT_BASE_URL): string {
  return [
    "Foocci — Configuração do Instagram Direct (uso interno)",
    "",
    "1) Variáveis de ambiente no Railway (preencha os valores no painel — NÃO compartilhe segredos):",
    "META_APP_ID=                 (ou FACEBOOK_APP_ID)",
    "META_APP_SECRET=             (ou FACEBOOK_APP_SECRET)",
    "INSTAGRAM_WEBHOOK_VERIFY_TOKEN=",
    "INSTAGRAM_APP_SECRET=        (recomendado — exige assinatura no webhook)",
    "FOOCCI_BASE_URL=https://foocci.com.br   (ou APP_URL)",
    "ENCRYPTION_KEY=              (já configurada — criptografa o token)",
    "",
    "2) Webhook (no app Meta → produto Instagram):",
    `URL: ${instagramWebhookUrl(baseUrl)}`,
    "Verify token: o MESMO valor de INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
    `Campos/eventos a assinar: ${INSTAGRAM_WEBHOOK_FIELDS.join(" + ")}`,
    "(messages = DMs do Direct; comments = comentários nas publicações)",
    "",
    `3) Permissões (App Review): ${INSTAGRAM_REVIEW_SCOPES.join(", ")}`,
    "ATENÇÃO: instagram_manage_messages, instagram_manage_comments e pages_messaging exigem App Review.",
    "Antes da aprovação, só contas Admin/Desenvolvedor/Testadora recebem e respondem — use uma conta TESTER para o teste.",
    "",
    "4) Teste seguro:",
    "1. Integrações → Instagram → Conectar com Facebook → escolher Página → Conectado",
    "2. Rodar diagnóstico (não envia nenhuma mensagem)",
    "3. Enviar um DM de uma conta TESTER para o Instagram conectado",
    "4. Comentar em uma publicação com a conta TESTER",
    "5. Conferir em Atendimento (selos Instagram DM e Instagram comentário)",
    "6. Responder manualmente pela Central (modo Responder manualmente) — o comentário recebe uma resposta PÚBLICA no post",
  ].join("\n");
}
