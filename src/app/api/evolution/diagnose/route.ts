/**
 * POST /api/evolution/diagnose
 *
 * OWNER-only. Runs connectivity and state checks against the configured
 * Evolution instance. Returns a sanitized diagnostic report.
 *
 * Never exposes API keys, webhook secrets, or full base64 QR images.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { qrDiagnosticMeta } from "@/lib/evolution/extractQr";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return url.slice(0, 30) + "…";
  }
}

interface DiagStep {
  label:   string;
  ok:      boolean;
  detail?: unknown;
  error?:  string;
}

async function diagStep(label: string, fn: () => Promise<unknown>): Promise<DiagStep> {
  try {
    const detail = await fn();
    return { label, ok: true, detail };
  } catch (err) {
    const error = err instanceof EvolutionApiError
      ? `HTTP ${err.status} — ${JSON.stringify(err.body)}`
      : err instanceof Error ? err.message : String(err);
    return { label, ok: false, error };
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Diagnóstico restrito ao proprietário.");

    const snapResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId);
    if (!snapResult.ok) {
      return NextResponse.json(
        { success: false, error: "Evolution config não encontrado." },
        { status: 400 }
      );
    }

    const cfg           = snapResult.data;
    const baseUrlMasked = maskUrl(cfg.baseUrl);
    const steps: DiagStep[] = [];

    // ── 1. HTTP reachability ──────────────────────────────────
    steps.push(await diagStep("server_reachable", async () => {
      const res = await fetch(cfg.baseUrl, { method: "GET" });
      return { httpStatus: res.status };
    }));

    // ── 2. Auth + instance list ───────────────────────────────
    const instancesStep = await diagStep("auth_fetchInstances", async () => {
      const list = await EvolutionClient.fetchInstances(cfg);
      return Array.isArray(list)
        ? list.map((i: unknown) => {
            if (typeof i !== "object" || !i) return i;
            const { instanceName, state, status } = i as Record<string, unknown>;
            return { instanceName, state, status };
          })
        : list;
    });
    steps.push(instancesStep);

    // ── 3. Connection state ───────────────────────────────────
    const stateStep = await diagStep("connectionState", async () => {
      const s = await EvolutionClient.getInstanceStatus(cfg);
      return { state: s.state, instance: s.instance };
    });
    steps.push(stateStep);

    const state = stateStep.ok
      ? (stateStep.detail as { state?: string })?.state ?? "unknown"
      : "error";

    // ── 4. QR connect — raw key inspection ───────────────────
    const qrStep = await diagStep("qr_connect_endpoint", async () => {
      // Use raw request to capture the actual response shape
      const raw = await EvolutionClient.getQRCode(cfg);
      return {
        instanceState:        raw.instanceState,
        qrExtracted:          !!raw.base64,
        pairingCodeExtracted: !!raw.pairingCode,
        textCodeExtracted:    !!raw.code,
        base64Prefix:         raw.base64 ? raw.base64.slice(0, 40) + "…" : null,
        foundIn:              raw.foundIn,
      };
    });
    steps.push(qrStep);

    // ── 5. Raw QR response shape (for debugging) ──────────────
    // Call the connect endpoint again and inspect raw keys
    const rawInspectStep = await diagStep("qr_response_shape", async () => {
      const rawRes = await fetch(
        `${cfg.baseUrl.replace(/\/$/, "")}/instance/connect/${cfg.instanceName}`,
        { method: "GET", headers: { "Content-Type": "application/json", apikey: cfg.apiKey } }
      );
      const rawBody = await rawRes.json().catch(() => ({}));
      const meta = qrDiagnosticMeta(rawBody);
      return {
        httpStatus:            rawRes.status,
        availableKeys:         meta.availableKeys,
        keyMeta:               meta.keyMeta,
        qrExtracted:           meta.qrExtracted,
        pairingCodeExtracted:  meta.pairingCodeExtracted,
        textCodeExtracted:     meta.textCodeExtracted,
        foundIn:               meta.foundIn,
        reason:                meta.reason,
      };
    });
    steps.push(rawInspectStep);

    // ── 6. Alternative QR endpoint variants ──────────────────────
    const variantStep = await diagStep("qr_endpoint_variants", async () => {
      const variants = [
        { path: `/instance/qrcode/${cfg.instanceName}`,  method: "GET"  },
        { path: `/qrcode/base64/${cfg.instanceName}`,    method: "GET"  },
        { path: `/instance/connect/${cfg.instanceName}`, method: "POST" },
      ];
      const results = await Promise.allSettled(
        variants.map(async ({ path, method }) => {
          const res = await fetch(
            `${cfg.baseUrl.replace(/\/$/, "")}${path}`,
            { method, headers: { "Content-Type": "application/json", apikey: cfg.apiKey } }
          );
          const body = await res.json().catch(() => ({}));
          const meta = qrDiagnosticMeta(body);
          return { path, method, httpStatus: res.status, availableKeys: meta.availableKeys, qrExtracted: meta.qrExtracted, reason: meta.reason };
        })
      );
      return results.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { ...variants[i], error: String((r as PromiseRejectedResult).reason) }
      );
    });
    steps.push(variantStep);

    const qrAvailable = qrStep.ok
      ? !!(qrStep.detail as { qrExtracted?: boolean })?.qrExtracted
      : variantStep.ok
        ? (variantStep.detail as Array<{ qrExtracted?: boolean }>).some((v) => v.qrExtracted)
        : false;

    return NextResponse.json({
      success:       true,
      instanceName:  cfg.instanceName,
      baseUrlMasked,
      instanceState: state,
      qrAvailable,
      steps,
    });
  } catch (err) {
    console.error("[POST /api/evolution/diagnose]", err);
    return serverError();
  }
}
