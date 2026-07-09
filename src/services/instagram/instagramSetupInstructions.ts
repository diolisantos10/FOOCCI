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

/** Required for the DIRECT "Entrar com Instagram" login (Instagram Business Login — no Facebook). */
export const INSTAGRAM_LOGIN_REQUIRED_ENV = [
  "INSTAGRAM_APP_ID",      // Instagram app id from "Instagram → API setup with Instagram login"
  "INSTAGRAM_APP_SECRET",  // Instagram app secret from the same page (falls back to META_APP_SECRET)
  "FOOCCI_BASE_URL",       // or APP_URL
  "ENCRYPTION_KEY",
] as const;

/** OAuth redirect the direct login uses — register it in the app's Instagram-login settings. */
export const INSTAGRAM_LOGIN_REDIRECT_PATH = "/api/integrations/instagram/login/callback";

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
    "",
    "5) MODO DE TESTE antes da aprovação do App Review (funciona hoje, sem esperar a Meta):",
    "Enquanto o app está em desenvolvimento, o Instagram só conversa com contas que têm papel no app.",
    "A. No painel da Meta: app → Funções do app → Funções → Adicionar pessoas → tipo 'Testador do Instagram'",
    "   → adicionar o @ do Instagram do RESTAURANTE e também o @ pessoal de quem vai testar.",
    "B. Em CADA Instagram convidado: Configurações → Site e apps → Convites de testador → Aceitar.",
    "C. No Foocci: Integrações → Instagram → Conectar com Facebook (login que administra a Página do restaurante).",
    "D. Testar: DM + comentário a partir da conta pessoal testadora → deve aparecer na Central.",
    "Quando o App Review for aprovado e o app publicado, passa a valer para TODOS os clientes automaticamente.",
    "",
    "6) LOGIN DIRETO com Instagram (sem Facebook) — 'Entrar com Instagram':",
    "Para clientes que NÃO têm Facebook/Página. Usa 'Instagram API with Instagram Login'.",
    "A. No painel da Meta: produto Instagram → 'API setup with Instagram login'.",
    "B. Variáveis no Railway:",
    "   INSTAGRAM_APP_ID=        (o 'Instagram app ID' dessa página — DIFERENTE do App ID do Facebook)",
    "   INSTAGRAM_APP_SECRET=    (o 'Instagram app secret' dessa página; se vazio, usa META_APP_SECRET)",
    "C. Em 'Business login settings' → OAuth redirect URIs, adicionar:",
    `   ${INSTAGRAM_DEFAULT_BASE_URL}${INSTAGRAM_LOGIN_REDIRECT_PATH}`,
    "D. Requisito do cliente: conta Instagram Profissional (Comercial ou Criador) — grátis, sem Facebook.",
    "E. Permissões (App Review): instagram_business_basic, instagram_business_manage_messages, instagram_business_manage_comments.",
    "   Antes da aprovação, funciona só para contas com papel de Testador (mesmo esquema do item 5).",
  ].join("\n");
}
