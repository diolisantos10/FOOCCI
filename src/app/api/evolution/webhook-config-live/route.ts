/**
 * GET /api/evolution/webhook-config-live
 *
 * OWNER-only. Reads the current webhook configuration directly from the
 * Evolution API (GET /webhook/find/{instanceName}) and returns a sanitized
 * diagnostic report.
 *
 * No changes are made to Evolution. This is a read-only probe.
 *
 * Never exposes: apiKey, webhookSecret value.
 * Does indicate: whether a secret field is present in Evolution's config.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";
import { getExpectedEvolutionWebhookUrl } from "@/lib/public-url";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Restrito ao proprietário.");

    const snapshotResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId, true);
    if (!snapshotResult.ok) {
      return NextResponse.json(
        { success: false, error: "Integração Evolution não configurada." },
        { status: 404 }
      );
    }

    const snapshot = snapshotResult.data;

    // Canonical expected webhook URL — SINGLE source of truth (never the Railway
    // proxy host). This guarantees the card, the comparison, and sync all agree.
    // If a webhookSecret exists, ?token= is appended server-side — never shown to client.
    const baseUrl = getExpectedEvolutionWebhookUrl();
    let expectedUrl = baseUrl;
    if (snapshot.webhookSecret) {
      const eu = new URL(baseUrl);
      eu.searchParams.set("token", snapshot.webhookSecret);
      expectedUrl = eu.toString();
    }

    // Read webhook config from Evolution — read-only, no changes
    let raw: Record<string, unknown> = {};
    let fetchError: string | null = null;
    try {
      raw = await EvolutionClient.getWebhook(snapshot);
    } catch (err) {
      fetchError = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    }

    // Normalise: Evolution v2 may return { webhook: {...} } or flat object
    const wh: Record<string, unknown> =
      (raw.webhook && typeof raw.webhook === "object")
        ? (raw.webhook as Record<string, unknown>)
        : raw;

    const url     = (wh.url     as string  | undefined) ?? null;
    const enabled = (wh.enabled as boolean | undefined) ?? null;
    const events  = Array.isArray(wh.events) ? (wh.events as string[]) : [];
    // Only reveal presence of secret, never its value
    const secretPresent = "secret" in wh && wh.secret !== null && wh.secret !== undefined && wh.secret !== "";

    // Normalise: Evolution uses "webhookByEvents" in some builds, "byEvents" in others
    const webhookByEventsRaw = wh.webhookByEvents as boolean | undefined;
    const byEventsRaw        = wh.byEvents        as boolean | undefined;
    const webhookByEvents    = webhookByEventsRaw ?? byEventsRaw ?? null;

    // Diagnostic checks
    // urlMatches compares Evolution's stored URL against the full tokenized expected URL
    const urlMatches        = !!url && url.trim() === expectedUrl;
    // urlBaseMatches ignores the ?token= query param — useful to detect partial config
    const urlBase           = url ? url.split("?")[0] : null;
    const urlBaseMatches    = !!urlBase && urlBase.trim() === baseUrl;
    const tokenInUrl        = !!url && url.includes("?token=");
    const authMode          = tokenInUrl ? "query_token" : secretPresent ? "header_secret" : "unknown";
    const byEventsIsFalse   = webhookByEventsRaw === false || byEventsRaw === false;
    const hasMessagesUpsert = events.some((e) => e === "MESSAGES_UPSERT");
    const isEnabled         = enabled === true;

    const issues: string[] = [];
    if (fetchError)         issues.push(`Erro ao consultar Evolution: ${fetchError}`);
    if (!isEnabled)         issues.push("enabled=false — webhook está desativado");
    // URL check: flag only when the path itself is wrong.
    // If the path is correct and a token/secret is present, auth is valid — not a diverge.
    if (!urlBaseMatches) {
      issues.push(`URL diverge. Evolution tem: "${urlBase ?? "vazia"}" — esperada: "${baseUrl}"`);
    } else if (!tokenInUrl && !secretPresent) {
      issues.push("Webhook sem autenticação: token não está na URL e nenhum secret foi detectado. Sincronize o webhook.");
    }
    if (!byEventsIsFalse)   issues.push(`webhookByEvents=${String(webhookByEvents)} — deve ser false para endpoint único`);
    if (!hasMessagesUpsert) issues.push("MESSAGES_UPSERT não está na lista de eventos");

    const isHealthy = issues.length === 0;

    let recommendation: string;
    if (fetchError) {
      recommendation = "Não foi possível consultar a Evolution. Verifique se a URL e API Key estão corretas nas Configurações avançadas.";
    } else if (isHealthy) {
      recommendation = tokenInUrl
        ? "Webhook configurado corretamente com autenticação por token na URL. Se mensagens ainda não chegam, verifique logs da Evolution no Railway."
        : "Webhook configurado corretamente na Evolution. Se mensagens ainda não chegam, o problema é conectividade Evolution → foocci.com.br (verifique logs da Evolution no Railway).";
    } else {
      recommendation = `Problemas encontrados: ${issues.join("; ")}. Clique em "Sincronizar webhook" para corrigir automaticamente.`;
    }

    return NextResponse.json({
      success:         true,
      instanceName:    snapshot.instanceName,
      expectedUrl:     baseUrl,   // strip query params — never expose token
      // Sanitised webhook fields (no secret value)
      enabled,
      url:             urlBase,   // strip query params from Evolution's URL before returning
      webhookByEvents,
      events,
      secretPresent,
      rawKeys: Object.keys(wh),
      // Diagnostic verdicts
      urlMatches,
      urlBaseMatches,
      tokenInUrl,
      authMode,
      byEventsIsFalse,
      hasMessagesUpsert,
      isEnabled,
      isHealthy,
      issues,
      recommendation,
    });
  } catch (err) {
    console.error("[GET /api/evolution/webhook-config-live]", err);
    return serverError();
  }
}
