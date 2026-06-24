/**
 * Google integration display metadata — single source of truth for the card.
 */

export const GOOGLE_INTEGRATION_CARD = {
  provider: "google",
  name: "Google",
  description: "Conecte o Google Meu Negócio e o Analytics (GA4) com um clique. Avaliações e métricas do site na sua central.",
  configureHref: "/integracoes/google",
} as const;

export const GOOGLE_OAUTH_PATH = "/api/integrations/google/oauth";
