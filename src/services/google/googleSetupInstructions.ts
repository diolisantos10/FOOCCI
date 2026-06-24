/**
 * googleSetupInstructions — internal Foocci-team checklist for wiring the Google
 * Cloud OAuth client. Names of env vars and URLs only — NEVER secret values.
 * Shown in the "Avançado" section of the Google integration page.
 */

import { getPublicBaseUrl, CANONICAL_PUBLIC_BASE_URL } from "@/lib/public-base-url";

export const GOOGLE_REQUIRED_ENV = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "ENCRYPTION_KEY",
  "FOOCCI_BASE_URL",
];

export const GOOGLE_REVIEW_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/analytics.readonly",
];

export function googleDataRedirectUri(baseUrl?: string): string {
  const base = getPublicBaseUrl(baseUrl).url ?? CANONICAL_PUBLIC_BASE_URL;
  return `${base}/api/integrations/google/oauth/callback`;
}

export function googleLoginRedirectUri(): string {
  const base = (process.env.NEXTAUTH_URL ?? CANONICAL_PUBLIC_BASE_URL).replace(/\/$/, "");
  return `${base}/api/auth/callback/google`;
}

export function buildGoogleSetupInstructions(baseUrl?: string): string {
  return [
    "FOOCCI · Configuração do Google (equipe Foocci)",
    "",
    "1. Google Cloud Console → APIs e serviços → Tela de consentimento OAuth (External).",
    "2. Ative as APIs: Business Profile API, Analytics Data API, Analytics Admin API.",
    "3. Crie credenciais OAuth 2.0 (tipo: Aplicativo da Web).",
    "4. URIs de redirecionamento autorizados:",
    `   • ${googleDataRedirectUri(baseUrl)}   (integração de dados)`,
    `   • ${googleLoginRedirectUri()}   (Login com Google)`,
    "5. Escopos solicitados:",
    ...GOOGLE_REVIEW_SCOPES.map((s) => `   • ${s}`),
    "6. Variáveis de ambiente no Railway:",
    ...GOOGLE_REQUIRED_ENV.map((e) => `   • ${e}`),
    "",
    "Obs.: avaliações do Meu Negócio usam a API v4 (legada) e exigem aprovação do",
    "projeto pela Google. Conexão, locais e GA4 funcionam sem essa aprovação.",
  ].join("\n");
}
