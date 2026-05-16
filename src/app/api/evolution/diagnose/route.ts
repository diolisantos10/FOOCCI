/**
 * POST /api/evolution/diagnose
 *
 * OWNER-only. Runs a sequence of connectivity and state checks against the
 * configured Evolution instance and returns a sanitized diagnostic report.
 *
 * Never exposes API keys, webhook secrets, or raw tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
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
  label:    string;
  ok:       boolean;
  detail?:  unknown;
  error?:   string;
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

    // ── 1. HTTP reachability (root) ───────────────────────────
    steps.push(await diagStep("server_reachable", async () => {
      const res = await fetch(cfg.baseUrl, { method: "GET" });
      return { httpStatus: res.status };
    }));

    // ── 2. Auth + fetchInstances ──────────────────────────────
    const instancesStep = await diagStep("auth_fetchInstances", () =>
      EvolutionClient.fetchInstances(cfg)
    );
    // Strip sensitive data from instance list before returning
    const instancesRaw = instancesStep.ok
      ? (instancesStep.detail as unknown[]).map((i: unknown) => {
          if (typeof i !== "object" || !i) return i;
          const { instanceName, state, status } = i as Record<string, unknown>;
          return { instanceName, state, status };
        })
      : null;
    steps.push({ ...instancesStep, detail: instancesRaw });

    // ── 3. Connection state ───────────────────────────────────
    const stateStep = await diagStep("connectionState", async () => {
      const s = await EvolutionClient.getInstanceStatus(cfg);
      return { state: s.state, instance: s.instance };
    });
    steps.push(stateStep);

    // ── 4. QR endpoint (raw — mask base64) ───────────────────
    const qrStep = await diagStep("qr_connect", async () => {
      const qr = await EvolutionClient.getQRCode(cfg);
      return {
        hasBase64:     !!qr.base64,
        base64Prefix:  qr.base64 ? qr.base64.slice(0, 30) + "…" : null,
        hasCode:       !!qr.code,
        instanceState: qr.instanceState,
      };
    });
    steps.push(qrStep);

    const state = stateStep.ok
      ? (stateStep.detail as { state?: string })?.state ?? "unknown"
      : "error";

    const qrAvailable = qrStep.ok
      ? !!(qrStep.detail as { hasBase64?: boolean })?.hasBase64
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
