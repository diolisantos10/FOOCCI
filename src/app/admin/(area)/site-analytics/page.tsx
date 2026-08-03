/**
 * Admin → Analytics do site comercial da Foocci.
 *
 * Distinto do Google por restaurante (`/integracoes/google`), que mostra ao lojista o
 * GA4 dele. Isto aqui é a medição de foocci.com.br.
 */

import { SiteAnalyticsClient } from "./SiteAnalyticsClient";

export const dynamic = "force-dynamic";

export default function AdminSiteAnalyticsPage() {
  return <SiteAnalyticsClient />;
}
