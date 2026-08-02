/**
 * Live health of the Foocci app inside Meta — read-only.
 *
 * Uses an APP ACCESS TOKEN (`{appId}|{appSecret}`) to query the Graph API for the app's
 * own settings. This is what turns "I think the credentials are right" into evidence:
 * a wrong secret fails here immediately, with Meta's own error text.
 *
 * It also surfaces the app-level fields that gate App Review — privacy policy URL, terms
 * of service URL, app domains. Those live in the Meta dashboard, not in our database, and
 * getting one wrong is a rejection reason that is invisible until review fails.
 *
 * Nothing here writes to Meta, and no secret is ever included in the returned object.
 */

import { MetaAppCredentialsService } from "./MetaAppCredentialsService";

export interface MetaAppHealth {
  ok: boolean;
  /** Meta's own error message when the credentials are rejected. */
  error?: string;
  appId?:   string;
  appName?: string;
  category?: string;
  link?:     string;
  privacyPolicyUrl?:  string;
  termsOfServiceUrl?: string;
  appDomains?: string[];
  /** Problems we can detect without a human reading the dashboard. */
  warnings: string[];
}

const DEFAULT_GRAPH_VERSION = "v21.0";

interface GraphAppResponse {
  id?:    string;
  name?:  string;
  category?: string;
  link?:  string;
  privacy_policy_url?:   string;
  terms_of_service_url?: string;
  app_domains?: string[];
  error?: { message?: string; type?: string; code?: number };
}

/**
 * Flags the app-level settings that reject an App Review. Kept as data, not prose, so
 * the screen can render each one with its own fix.
 */
function collectWarnings(app: GraphAppResponse): string[] {
  const warnings: string[] = [];

  const terms = app.terms_of_service_url?.trim();
  if (!terms) {
    warnings.push("URL dos Termos de Serviço está vazia — é motivo de reprovação em App Review.");
  } else if (/facebook\.com|meta\.com/i.test(terms)) {
    warnings.push(
      `URL dos Termos de Serviço aponta para ${terms} — precisa apontar para a página da própria Foocci ` +
        "(https://foocci.com.br/termos), senão a revisão do app é reprovada."
    );
  }

  const privacy = app.privacy_policy_url?.trim();
  if (!privacy) {
    warnings.push("URL da Política de Privacidade está vazia — obrigatória para App Review.");
  } else if (/facebook\.com|meta\.com/i.test(privacy)) {
    warnings.push(`URL da Política de Privacidade aponta para ${privacy} — precisa ser a página da Foocci.`);
  }

  if (!app.app_domains || app.app_domains.length === 0) {
    warnings.push("Nenhum domínio declarado em 'Domínios do aplicativo' — pode recusar o fluxo de login pela Meta.");
  }

  return warnings;
}

/**
 * Turns a Graph error into something the person holding the credentials can act on.
 * Meta's raw text is preserved at the end — it is the evidence — but the sentence that
 * comes first says which of the two fields to fix.
 */
function explainGraphError(err: { message?: string; type?: string; code?: number }): string {
  const raw = err.message ?? "erro desconhecido";
  const detail = ` (Meta disse: "${raw}"${err.code ? `, código ${err.code}` : ""})`;

  // 190 on an app access token means appId and appSecret don't belong together — the
  // pair is wrong, not the permissions.
  if (err.code === 190 || /access token signature|malformed access token/i.test(raw)) {
    return (
      "A Chave Secreta não confere com o ID do Aplicativo. Quase sempre é a chave: " +
      'abra Meta → Configurações do app → Básico, clique em "Mostrar" ao lado da Chave ' +
      "Secreta, copie o valor inteiro e cole de novo — sem espaço no começo ou no fim." +
      detail
    );
  }

  if (err.code === 4 || err.code === 17 || /rate limit/i.test(raw)) {
    return "A Meta está limitando as consultas no momento. Espere alguns minutos e teste de novo." + detail;
  }

  if (err.code === 803 || /does not exist|cannot be loaded/i.test(raw)) {
    return "O ID do Aplicativo não foi encontrado na Meta. Confira se copiou o número certo." + detail;
  }

  return "A Meta recusou as credenciais." + detail;
}

export const MetaAppHealthService = {
  /**
   * Verifies the stored credentials against Meta and reads the app's own settings.
   * Records the outcome so the admin screen shows dated, real state instead of a badge.
   */
  async check(): Promise<MetaAppHealth> {
    const creds = await MetaAppCredentialsService.getResolved();

    if (!creds.appId || !creds.appSecret) {
      const missing = [!creds.appId && "ID do Aplicativo", !creds.appSecret && "Chave Secreta"]
        .filter(Boolean)
        .join(" e ");
      const error = `Faltam credenciais: ${missing}.`;
      await MetaAppCredentialsService.recordTest(false, error).catch(() => {});
      return { ok: false, error, warnings: [] };
    }

    const version = creds.graphVersion || DEFAULT_GRAPH_VERSION;
    const appToken = `${creds.appId}|${creds.appSecret}`;
    const fields = "id,name,category,link,privacy_policy_url,terms_of_service_url,app_domains";
    const url = `https://graph.facebook.com/${version}/${creds.appId}?fields=${fields}&access_token=${encodeURIComponent(appToken)}`;

    let app: GraphAppResponse;
    try {
      const res = await fetch(url);
      app = (await res.json()) as GraphAppResponse;
    } catch (err) {
      const error = `Não consegui falar com a Graph API: ${err instanceof Error ? err.message : String(err)}`;
      await MetaAppCredentialsService.recordTest(false, error).catch(() => {});
      return { ok: false, error, warnings: [] };
    }

    if (app.error) {
      // Meta's own message is kept — an alert without the concrete case is noise — but
      // it is prefixed with what to actually do. "código 190" tells the person holding
      // the credentials nothing about which of the two fields to fix.
      const error = explainGraphError(app.error);
      await MetaAppCredentialsService.recordTest(false, error).catch(() => {});
      return { ok: false, error, warnings: [] };
    }

    const warnings = collectWarnings(app);
    await MetaAppCredentialsService.recordTest(true).catch(() => {});

    return {
      ok: true,
      appId:   app.id,
      appName: app.name,
      category: app.category,
      link:     app.link,
      privacyPolicyUrl:  app.privacy_policy_url,
      termsOfServiceUrl: app.terms_of_service_url,
      appDomains: app.app_domains,
      warnings,
    };
  },
};
