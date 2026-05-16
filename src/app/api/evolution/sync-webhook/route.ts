/**
 * POST /api/evolution/sync-webhook
 *
 * OWNER-only. Configures the webhook URL on the existing connected Evolution
 * instance without touching the WhatsApp session. After setting, reads back
 * the actual config from Evolution to confirm what was applied.
 *
 * Key: webhookByEvents=false → Evolution sends ALL events to a single URL.
 * webhookByEvents=true would send to {url}/{EVENT_NAME} (404 in Next.js).
 *
 * Never exposes: apiKey, webhookSecret, raw credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"];

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Restrito ao proprietário.");

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body — ok */ }

    const clientUrl = body.webhookUrl ? String(body.webhookUrl) : null;
    const host  = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const proto = (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() ?? "https";
    const origin = clientUrl
      ? clientUrl.replace(/\/api\/webhooks\/evolution$/, "")
      : `${proto}://${host}`;
    const webhookUrl = `${origin}/api/webhooks/evolution`;

    const snapshotResult = await EvolutionConfigService.getSnapshot(
      ctx.restaurantId,
      true // includeWebhookSecret — needed to configure Evolution
    );
    if (!snapshotResult.ok) {
      return NextResponse.json(
        { success: false, error: "Integração Evolution não configurada para este restaurante." },
        { status: 404 }
      );
    }

    const snapshot = snapshotResult.data;

    // Set webhook — webhookByEvents=false sends ALL events to the single URL
    let rawSetResult: unknown = null;
    let setError: string | null = null;
    try {
      rawSetResult = await EvolutionClient.setWebhook(
        snapshot,
        webhookUrl,
        WEBHOOK_EVENTS,
        snapshot.webhookSecret
      );
    } catch (err) {
      setError = err instanceof EvolutionApiError
        ? `Evolution HTTP ${err.status}: ${err.message}`
        : (err instanceof Error ? err.message : String(err));
      setError = setError.slice(0, 300);
    }

    // Read back the actual webhook config to confirm what Evolution has stored
    let webhookConfig: {
      url:            string | null;
      webhookByEvents: boolean | null;
      events:         string[];
      enabled:        boolean | null;
      urlMatches:     boolean;
    } | null = null;

    try {
      const raw = await EvolutionClient.getWebhook(snapshot);
      // Evolution v2 returns { webhook: { ... } } or the flat object directly
      const wh = (raw.webhook && typeof raw.webhook === "object")
        ? raw.webhook as Record<string, unknown>
        : raw;
      const configuredUrl = (wh.url as string | undefined) ?? null;
      webhookConfig = {
        url:             configuredUrl,
        webhookByEvents: (wh.webhookByEvents as boolean | undefined) ?? null,
        events:          Array.isArray(wh.events) ? (wh.events as string[]) : [],
        enabled:         (wh.enabled as boolean | undefined) ?? null,
        urlMatches:      configuredUrl === webhookUrl,
      };
    } catch {
      // best-effort
    }

    // Fetch instance metadata for ownerJid and connection status
    let instanceInfo: {
      connectionStatus: string | null;
      profileName:      string | null;
      ownerJidMasked:   string | null;
    } | null = null;

    try {
      const instances = await EvolutionClient.fetchInstances(snapshot);
      const match = (instances as unknown[]).find((inst) => {
        if (!inst || typeof inst !== "object") return false;
        const i = inst as Record<string, unknown>;
        const inner = (i.instance && typeof i.instance === "object")
          ? (i.instance as Record<string, unknown>)
          : i;
        return (
          inner.instanceName === snapshot.instanceName ||
          i.instanceName     === snapshot.instanceName
        );
      });
      if (match) {
        const m     = match as Record<string, unknown>;
        const inner = (m.instance && typeof m.instance === "object")
          ? (m.instance as Record<string, unknown>)
          : m;
        const rawJid =
          (inner.ownerJid ?? inner.owner ?? m.ownerJid ?? m.owner) as string | undefined;
        instanceInfo = {
          connectionStatus: String(
            inner.connectionStatus ?? m.connectionStatus ?? inner.state ?? m.state ?? ""
          ) || null,
          profileName:    String(inner.profileName ?? m.profileName ?? "") || null,
          ownerJidMasked: rawJid ? maskJid(rawJid) : null,
        };
      }
    } catch {
      // best-effort
    }

    const rawWebhookShapeKeys =
      rawSetResult && typeof rawSetResult === "object"
        ? Object.keys(rawSetResult as Record<string, unknown>)
        : [];

    const success = !setError;
    let recommendation: string;
    if (!success) {
      recommendation =
        "Falha ao configurar webhook na Evolution. Verifique URL da Evolution e API Key nas Configurações avançadas.";
    } else if (webhookConfig && !webhookConfig.urlMatches) {
      recommendation =
        `Webhook configurado mas URL diverge. Configurada: ${webhookConfig.url ?? "?"} — esperada: ${webhookUrl}`;
    } else {
      recommendation =
        "Webhook configurado (webhookByEvents=false). Envie uma mensagem de teste e use 'Testar receiver Foocci' para confirmar.";
    }

    return NextResponse.json({
      success,
      instanceName:         snapshot.instanceName,
      webhookUrlConfigured: webhookUrl,
      eventsConfigured:     WEBHOOK_EVENTS,
      rawWebhookShapeKeys,
      webhookConfig,
      instanceInfo,
      error:                setError,
      recommendation,
    });
  } catch (err) {
    console.error("[POST /api/evolution/sync-webhook]", err);
    return serverError();
  }
}

function maskJid(jid: string): string {
  const [number, domain] = jid.split("@");
  if (!number) return jid;
  const visible = number.slice(0, 4);
  const suffix  = number.length > 8 ? number.slice(-4) : "";
  const masked  = `${visible}${"*".repeat(Math.max(0, number.length - (visible.length + suffix.length)))}${suffix}`;
  return domain ? `${masked}@${domain}` : masked;
}
