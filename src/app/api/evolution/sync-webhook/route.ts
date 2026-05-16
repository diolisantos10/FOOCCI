/**
 * POST /api/evolution/sync-webhook
 *
 * OWNER-only. Configures the webhook URL on the existing connected Evolution
 * instance without touching the WhatsApp session. Called when Evolution is
 * connected but not delivering webhooks to Foocci.
 *
 * Never exposes: apiKey, webhookSecret, raw credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

const WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
];

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Restrito ao proprietário.");

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body — ok */ }

    // Derive webhook URL: client sends window.location.origin as webhookUrl,
    // fallback to request headers for server-side derivation.
    const clientUrl = body.webhookUrl ? String(body.webhookUrl) : null;
    const host  = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const proto = (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() ?? "https";
    const origin = clientUrl
      ? clientUrl.replace(/\/api\/webhooks\/evolution$/, "")
      : `${proto}://${host}`;
    const webhookUrl = `${origin}/api/webhooks/evolution`;

    const snapshotResult = await EvolutionConfigService.getSnapshot(
      ctx.restaurantId,
      true // includeWebhookSecret — needed to tell Evolution what secret to send
    );
    if (!snapshotResult.ok) {
      return NextResponse.json(
        { success: false, error: "Integração Evolution não configurada para este restaurante." },
        { status: 404 }
      );
    }

    const snapshot = snapshotResult.data;

    // Configure webhook on the live instance — does NOT reset QR / session
    let rawResult: unknown = null;
    let setError: string | null = null;
    try {
      rawResult = await EvolutionClient.setWebhook(
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

    // Fetch instance metadata — best-effort, never blocks response
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
      // instance lookup is best-effort
    }

    const rawWebhookShapeKeys =
      rawResult && typeof rawResult === "object"
        ? Object.keys(rawResult as Record<string, unknown>)
        : [];

    return NextResponse.json({
      success:              !setError,
      instanceName:         snapshot.instanceName,
      webhookUrlConfigured: webhookUrl,
      eventsConfigured:     WEBHOOK_EVENTS,
      rawWebhookShapeKeys,
      instanceInfo,
      error:                setError,
      recommendation: setError
        ? "Falha ao configurar webhook na Evolution. Verifique se a URL da Evolution e a API Key estão corretas nas Configurações avançadas."
        : "Webhook configurado com sucesso. Envie uma mensagem de teste pelo WhatsApp e verifique o log de eventos em 30 segundos.",
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
