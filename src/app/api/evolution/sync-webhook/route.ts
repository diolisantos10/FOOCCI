/**
 * POST /api/evolution/sync-webhook
 *
 * OWNER-only. Configures the webhook URL on the existing connected Evolution
 * instance without touching the WhatsApp session. After each attempt, reads
 * back the actual config from Evolution to confirm it was applied.
 *
 * success=true ONLY when getWebhook confirms webhookByEvents===false.
 * Probes four body shapes (flat/wrapped × webhookByEvents/byEvents) and stops
 * at the first shape Evolution accepts AND confirms.
 *
 * Never exposes: apiKey, webhookSecret, raw credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import {
  EvolutionClient,
  EvolutionApiError,
  EvolutionConfigSnapshot,
} from "@/lib/evolution/EvolutionClient";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"];

// ─── types ───────────────────────────────────────────────────

interface NormalizedWebhookConfig {
  url:                              string | null;
  webhookByEvents:                  boolean | null; // normalised from webhookByEvents or byEvents
  byEvents:                         boolean | null; // raw "byEvents" field
  events:                           string[];
  enabled:                          boolean | null;
  rawKeys:                          string[];
  webhookByEventsIsExplicitlyFalse: boolean;
}

// ─── helpers ─────────────────────────────────────────────────

async function readNormalizedWebhookConfig(
  snapshot: EvolutionConfigSnapshot
): Promise<NormalizedWebhookConfig> {
  try {
    const raw = await EvolutionClient.getWebhook(snapshot);
    // Evolution v2 wraps in { webhook: {...} }; v1 returns flat
    const wh: Record<string, unknown> =
      raw.webhook && typeof raw.webhook === "object"
        ? (raw.webhook as Record<string, unknown>)
        : raw;

    const url     = (wh.url     as string  | undefined) ?? null;
    const events  = Array.isArray(wh.events) ? (wh.events as string[]) : [];
    const enabled = (wh.enabled as boolean | undefined) ?? null;
    const rawKeys = Object.keys(wh);

    // Normalise: Evolution uses "webhookByEvents" in some versions, "byEvents" in others
    const webhookByEventsRaw = wh.webhookByEvents as boolean | undefined;
    const byEventsRaw        = wh.byEvents        as boolean | undefined;
    const webhookByEvents    = webhookByEventsRaw ?? byEventsRaw ?? null;

    return {
      url,
      webhookByEvents,
      byEvents: byEventsRaw ?? null,
      events,
      enabled,
      rawKeys,
      webhookByEventsIsExplicitlyFalse:
        webhookByEventsRaw === false || byEventsRaw === false,
    };
  } catch {
    return {
      url:                              null,
      webhookByEvents:                  null,
      byEvents:                         null,
      events:                           [],
      enabled:                          null,
      rawKeys:                          [],
      webhookByEventsIsExplicitlyFalse: false,
    };
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

// ─── route ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Restrito ao proprietário.");

    let reqBody: Record<string, unknown> = {};
    try { reqBody = await req.json(); } catch { /* no body — ok */ }

    const clientUrl = reqBody.webhookUrl ? String(reqBody.webhookUrl) : null;
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

    // Append ?token= server-side so Evolution echoes it back on every webhook call.
    // The browser only sends the base webhookUrl — token is never exposed to the client.
    let finalWebhookUrl = webhookUrl;
    if (snapshot.webhookSecret) {
      const tokenUrl = new URL(webhookUrl);
      tokenUrl.searchParams.set("token", snapshot.webhookSecret);
      finalWebhookUrl = tokenUrl.toString();
    }

    // Shared fields for all body shapes
    const sharedFields: Record<string, unknown> = {
      enabled:       true,
      url:           finalWebhookUrl,
      webhookBase64: false,
      events:        WEBHOOK_EVENTS,
    };
    if (snapshot.webhookSecret) sharedFields.secret = snapshot.webhookSecret;

    // Four body shapes: flat/wrapped × webhookByEvents/byEvents field name
    // Evolution versions differ on which field name they honour internally.
    const candidates: Array<{ label: string; body: Record<string, unknown> }> = [
      { label: "flat+webhookByEvents",    body: { ...sharedFields, webhookByEvents: false } },
      { label: "flat+byEvents",           body: { ...sharedFields, byEvents: false } },
      { label: "wrapped+webhookByEvents", body: { webhook: { ...sharedFields, webhookByEvents: false } } },
      { label: "wrapped+byEvents",        body: { webhook: { ...sharedFields, byEvents: false } } },
    ];

    const attemptedPayloads: string[] = [];
    const setResponses: Array<{
      label:  string;
      ok:     boolean;
      keys:   string[];
      error?: string;
    }> = [];

    let finalLiveConfig: NormalizedWebhookConfig | null = null;
    let succeeded = false;

    for (const candidate of candidates) {
      attemptedPayloads.push(candidate.label);

      let setOk   = false;
      let setKeys: string[] = [];
      let setErr: string | undefined;

      try {
        const r = await EvolutionClient.setWebhookRaw(snapshot, candidate.body);
        setOk   = true;
        setKeys = r.responseKeys;
      } catch (err) {
        setErr = err instanceof EvolutionApiError
          ? `HTTP ${err.status}: ${err.message}`
          : (err instanceof Error ? err.message : String(err));
        setErr = setErr.slice(0, 200);
      }

      setResponses.push({ label: candidate.label, ok: setOk, keys: setKeys, error: setErr });

      if (!setOk) continue; // 4xx/5xx — try next shape

      // Read back and verify — success only when explicitly false
      const live = await readNormalizedWebhookConfig(snapshot);
      finalLiveConfig = live;

      if (live.webhookByEventsIsExplicitlyFalse) {
        succeeded = true;
        break;
      }
      // HTTP 200 but not confirmed — try next shape
    }

    // Final readback when all attempts failed (all 4xx)
    if (!finalLiveConfig) {
      finalLiveConfig = await readNormalizedWebhookConfig(snapshot);
    }

    // Instance metadata (best-effort, non-blocking)
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

    const success         = succeeded;
    const firstSetError   = setResponses.find((r) => r.error)?.error ?? null;
    const allAttemptsHttpOk = setResponses.some((r) => r.ok);

    let recommendation: string;
    if (success) {
      recommendation =
        "Webhook configurado e verificado na Evolution (webhookByEvents=false). " +
        "Envie uma mensagem de teste e use 'Testar receiver Foocci' para confirmar.";
    } else if (!allAttemptsHttpOk) {
      recommendation =
        "Falha ao configurar webhook na Evolution. Verifique URL da Evolution e API Key nas Configurações avançadas.";
    } else {
      recommendation =
        "Evolution retornou HTTP 200 mas webhookByEvents não foi confirmado como false na verificação. " +
        "Pode ser um bug da Evolution onde o campo não é persistido imediatamente. " +
        "Clique em 'Verificar webhook na Evolution' após alguns segundos para checar novamente.";
    }

    return NextResponse.json({
      success,
      instanceName:         snapshot.instanceName,
      webhookUrlConfigured: webhookUrl,   // base URL only — no token
      eventsConfigured:     WEBHOOK_EVENTS,
      rawWebhookShapeKeys:  setResponses[0]?.keys ?? [],
      webhookConfig: {
        // Strip ?token= before returning — server-internal URL must not reach the client
        url:             finalLiveConfig.url ? finalLiveConfig.url.split("?")[0] : null,
        webhookByEvents: finalLiveConfig.webhookByEvents,
        events:          finalLiveConfig.events,
        enabled:         finalLiveConfig.enabled,
        urlMatches:      finalLiveConfig.url === finalWebhookUrl,
      },
      // Secret status — never reveals the value
      secretInfo: {
        configuredSecretFromDb: true,                       // we always read from DB
        sentSecret:             !!snapshot.webhookSecret,   // was a non-empty secret sent?
        readBackSecretVisible:  false,                      // Evolution never returns secret in GET
        tokenInUrl:             !!snapshot.webhookSecret,   // ?token= appended to URL sent to Evolution
      },
      instanceInfo,
      error:          success ? null : (firstSetError ?? "webhookByEvents não confirmado como false"),
      recommendation,
      debug: {
        attemptedPayloads,
        setResponses,
        // Strip URL from debug payload — ?token= must not reach the client
        liveConfig: finalLiveConfig ? {
          ...finalLiveConfig,
          url: finalLiveConfig.url ? finalLiveConfig.url.split("?")[0] : null,
        } : null,
      },
    });
  } catch (err) {
    console.error("[POST /api/evolution/sync-webhook]", err);
    return serverError();
  }
}
