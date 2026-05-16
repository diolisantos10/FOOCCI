/**
 * GET /api/evolution/message-event-diagnostics
 *
 * OWNER-only. Reads live state from Evolution (no writes) and returns a
 * single diagnostic verdict explaining why real MESSAGES_UPSERT events may
 * not be arriving, given that the webhook URL, enabled flag, and receiver
 * are all confirmed working.
 *
 * Never exposes: apiKey, webhookSecret, message content.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

export type EventDiagnosticsVerdict =
  | "ok_waiting"            // everything looks correct — just waiting for a real message
  | "no_messages_upsert"    // MESSAGES_UPSERT missing from evolution webhook events list
  | "webhook_ok_not_emitting"  // config correct but no real events ever received
  | "instance_not_connected";  // instance state is not "open"

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Restrito ao proprietário.");

    const snapshotResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId);
    if (!snapshotResult.ok) {
      return NextResponse.json(
        { success: false, error: "Integração Evolution não configurada." },
        { status: 404 }
      );
    }

    const snapshot = snapshotResult.data;

    // Derive expected URL
    const host  = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const proto = (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() ?? "https";
    const expectedUrl = `${proto}://${host}/api/webhooks/evolution`;

    // ── 1. Instance list ─────────────────────────────────────
    let connectionStatus: string | null = null;
    let ownerJidMasked:   string | null = null;
    let integration:      string | null = null;
    let rawInstanceKeys:  string[] = [];

    try {
      const instances = await EvolutionClient.fetchInstances(snapshot);
      const match = (instances as unknown[]).find((inst) => {
        if (!inst || typeof inst !== "object") return false;
        const i = inst as Record<string, unknown>;
        const inner = i.instance && typeof i.instance === "object"
          ? (i.instance as Record<string, unknown>)
          : i;
        return (
          inner.instanceName === snapshot.instanceName ||
          i.instanceName     === snapshot.instanceName
        );
      });

      if (match) {
        const m     = match as Record<string, unknown>;
        const inner = m.instance && typeof m.instance === "object"
          ? (m.instance as Record<string, unknown>)
          : m;

        rawInstanceKeys = Object.keys(inner);

        connectionStatus = String(
          inner.connectionStatus ?? m.connectionStatus ?? inner.state ?? m.state ?? ""
        ) || null;

        integration = String(inner.integration ?? m.integration ?? "") || null;

        const rawJid = (inner.ownerJid ?? inner.owner ?? m.ownerJid ?? m.owner) as string | undefined;
        if (rawJid) ownerJidMasked = maskJid(rawJid);
      }
    } catch {
      // best-effort
    }

    // ── 2. Webhook config ─────────────────────────────────────
    let webhookUrl:      string | null    = null;
    let webhookEnabled:  boolean | null   = null;
    let webhookByEvents: boolean | null   = null;
    let webhookEvents:   string[]         = [];
    let rawWebhookKeys:  string[]         = [];

    try {
      const raw = await EvolutionClient.getWebhook(snapshot);
      const wh: Record<string, unknown> =
        raw.webhook && typeof raw.webhook === "object"
          ? (raw.webhook as Record<string, unknown>)
          : raw;

      rawWebhookKeys  = Object.keys(wh);
      webhookUrl      = (wh.url     as string  | undefined) ?? null;
      webhookEnabled  = (wh.enabled as boolean | undefined) ?? null;
      webhookEvents   = Array.isArray(wh.events) ? (wh.events as string[]) : [];

      // Normalise both field name variants
      const wbe    = wh.webhookByEvents as boolean | undefined;
      const be     = wh.byEvents        as boolean | undefined;
      webhookByEvents = wbe ?? be ?? null;
    } catch {
      // best-effort
    }

    // ── 3. Instance settings ──────────────────────────────────
    let rejectCall:      boolean | null = null;
    let groupsIgnore:    boolean | null = null;
    let readMessages:    boolean | null = null;
    let readStatus:      boolean | null = null;
    let syncFullHistory: boolean | null = null;
    let alwaysOnline:    boolean | null = null;
    let rawSettingsKeys: string[] = [];

    try {
      const raw = await EvolutionClient.getInstanceSettings(snapshot);
      // Evolution v2 may wrap: { setting: {...} } or flat
      const s: Record<string, unknown> =
        raw.setting && typeof raw.setting === "object"
          ? (raw.setting as Record<string, unknown>)
          : raw;

      rawSettingsKeys  = Object.keys(s);
      rejectCall       = (s.rejectCall       as boolean | undefined) ?? null;
      groupsIgnore     = (s.groupsIgnore     as boolean | undefined) ?? null;
      readMessages     = (s.readMessages     as boolean | undefined) ?? null;
      readStatus       = (s.readStatus       as boolean | undefined) ?? null;
      syncFullHistory  = (s.syncFullHistory  as boolean | undefined) ?? null;
      alwaysOnline     = (s.alwaysOnline     as boolean | undefined) ?? null;
    } catch {
      // settings endpoint not available in this Evolution version
    }

    // ── 4. Verdict ────────────────────────────────────────────
    const isConnected       = connectionStatus === "open";
    const hasMessagesUpsert = webhookEvents.some((e) => e === "MESSAGES_UPSERT");
    const hasMessagesUpdate = webhookEvents.some((e) => e === "MESSAGES_UPDATE");
    const urlMatches        = !!webhookUrl && webhookUrl.trim() === expectedUrl;
    const byEventsIsFalse   = webhookByEvents === false;
    const isEnabled         = webhookEnabled  === true;

    let verdict: EventDiagnosticsVerdict;
    let verdictMessage: string;

    if (!isConnected) {
      verdict        = "instance_not_connected";
      verdictMessage = `Instância "${snapshot.instanceName}" não está conectada (estado: ${connectionStatus ?? "desconhecido"}). Reconecte o WhatsApp antes de diagnosticar eventos.`;
    } else if (!hasMessagesUpsert) {
      verdict        = "no_messages_upsert";
      verdictMessage = "MESSAGES_UPSERT não está na lista de eventos do webhook Evolution. Clique em 'Sincronizar webhook' para corrigir.";
    } else if (!isEnabled || !byEventsIsFalse || !urlMatches) {
      verdict        = "webhook_ok_not_emitting";
      const issues: string[] = [];
      if (!isEnabled)       issues.push("webhook desativado (enabled=false)");
      if (!byEventsIsFalse) issues.push(`webhookByEvents=${String(webhookByEvents)} — deve ser false`);
      if (!urlMatches)      issues.push(`URL diverge (Evolution: "${webhookUrl ?? "vazia"}" — esperada: "${expectedUrl}")`);
      verdictMessage = `Webhook com problema: ${issues.join("; ")}. Clique em 'Sincronizar webhook'.`;
    } else {
      verdict        = "ok_waiting";
      verdictMessage = "Foocci OK. Evolution configurada corretamente. Aguardando evento real de mensagem. Envie uma mensagem pelo WhatsApp para o número conectado e verifique os logs do Railway.";
    }

    return NextResponse.json({
      success:      true,
      instanceName: snapshot.instanceName,
      connectionStatus,
      ownerJidMasked,
      integration,
      webhook: {
        url:               webhookUrl,
        enabled:           webhookEnabled,
        webhookByEvents,
        events:            webhookEvents,
        hasMessagesUpsert,
        hasMessagesUpdate,
        urlMatches,
      },
      settings: {
        rejectCall,
        groupsIgnore,
        readMessages,
        readStatus,
        syncFullHistory,
        alwaysOnline,
      },
      rawInstanceKeys,
      rawWebhookKeys,
      rawSettingsKeys,
      verdict,
      verdictMessage,
    });
  } catch (err) {
    console.error("[GET /api/evolution/message-event-diagnostics]", err);
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
