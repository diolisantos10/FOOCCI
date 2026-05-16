/**
 * POST /api/evolution/diagnose
 *
 * OWNER-only. Comprehensive connectivity and QR endpoint discovery.
 * Tests 8 known QR endpoints, inspects response shape, never exposes credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { qrDiagnosticMeta, isCountOnlyResponse } from "@/lib/evolution/extractQr";
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

/** Probe one endpoint safely — returns sanitized metadata, never exposes QR image. */
async function probeEndpoint(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
): Promise<{
  method: string;
  path: string;
  httpStatus: number;
  availableKeys: string[];
  shape: Record<string, string[]>;
  isCountOnly: boolean;
  qrExtracted: boolean;
  pairingExtracted: boolean;
  textCodeExtracted: boolean;
  foundIn: string | null;
  reason: string | null;
  error?: string;
}> {
  const base = {
    method, path, httpStatus: 0,
    availableKeys: [] as string[], shape: {} as Record<string, string[]>,
    isCountOnly: false, qrExtracted: false, pairingExtracted: false,
    textCodeExtracted: false, foundIn: null as string | null, reason: null as string | null,
  };
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: apiKey },
    });
    base.httpStatus = res.status;
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      const meta = qrDiagnosticMeta(body);
      base.availableKeys    = meta.availableKeys;
      base.isCountOnly      = isCountOnlyResponse(body);
      base.qrExtracted      = meta.qrExtracted;
      base.pairingExtracted = meta.pairingCodeExtracted;
      base.textCodeExtracted = meta.textCodeExtracted;
      base.foundIn          = meta.foundIn;
      base.reason           = meta.reason;

      // Build shape: nested key names only
      if (typeof body === "object" && body !== null) {
        for (const k of meta.availableKeys) {
          const v = (body as Record<string, unknown>)[k];
          if (typeof v === "object" && v !== null && !Array.isArray(v)) {
            base.shape[k] = Object.keys(v as Record<string, unknown>);
          }
        }
      }
    }
    return base;
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
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

    // ── 1. Server version / health ────────────────────────────────────────────
    steps.push(await diagStep("server_version", async () => {
      const res = await fetch(cfg.baseUrl, { method: "GET" });
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      // Never expose apikey from response, only keep non-sensitive fields
      const { apikey: _a, key: _k, token: _t, ...safe } = body;
      void _a; void _k; void _t;
      return { httpStatus: res.status, fields: Object.keys(safe) };
    }));

    // ── 2. Auth + instance list ───────────────────────────────────────────────
    const instancesStep = await diagStep("auth_fetchInstances", async () => {
      const list = await EvolutionClient.fetchInstances(cfg);
      return Array.isArray(list)
        ? list.map((i: unknown) => {
            if (typeof i !== "object" || !i) return i;
            const r = i as Record<string, unknown>;
            const inst = typeof r.instance === "object" ? r.instance as Record<string, unknown> : null;
            return {
              instanceName:     inst?.instanceName ?? r.instanceName,
              status:           inst?.status       ?? r.status,
              connectionStatus: inst?.connectionStatus ?? r.connectionStatus,
              integration:      inst?.integration  ?? r.integration,
            };
          })
        : list;
    });
    steps.push(instancesStep);

    // ── 3. Connection state ───────────────────────────────────────────────────
    const stateStep = await diagStep("connectionState", async () => {
      const s = await EvolutionClient.getInstanceStatus(cfg);
      return { state: s.state, instance: s.instance };
    });
    steps.push(stateStep);

    const state = stateStep.ok
      ? (stateStep.detail as { state?: string })?.state ?? "unknown"
      : "error";

    // ── 4. Comprehensive QR endpoint discovery ────────────────────────────────
    const QR_ENDPOINTS: Array<{ method: string; path: string }> = [
      { method: "GET",  path: `/instance/connect/${cfg.instanceName}` },
      { method: "GET",  path: `/instance/qrcode/${cfg.instanceName}` },
      { method: "GET",  path: `/qrcode/base64/${cfg.instanceName}` },
      { method: "GET",  path: `/instance/qrcode/base64/${cfg.instanceName}` },
      { method: "GET",  path: `/instance/qr/${cfg.instanceName}` },
      { method: "GET",  path: `/instance/qr-code/${cfg.instanceName}` },
      { method: "POST", path: `/instance/connect/${cfg.instanceName}` },
      { method: "POST", path: `/instance/qrcode/${cfg.instanceName}` },
    ];

    const endpointResults = await Promise.all(
      QR_ENDPOINTS.map(({ method, path }) => probeEndpoint(cfg.baseUrl, cfg.apiKey, method, path))
    );

    const qrEndpointStep: DiagStep = {
      label: "qr_endpoint_discovery",
      ok: true,
      detail: endpointResults,
    };
    steps.push(qrEndpointStep);

    // ── 5. Count-only analysis ────────────────────────────────────────────────
    const countOnlyStep = await diagStep("count_only_analysis", async () => {
      const connectRes = endpointResults.find(
        (e) => e.method === "GET" && e.path.includes("/instance/connect")
      );
      const anyQRFound = endpointResults.some((e) => e.qrExtracted || e.pairingExtracted);
      const allCountOnly = endpointResults
        .filter((e) => e.httpStatus === 200)
        .every((e) => e.isCountOnly);
      return {
        connectIsCountOnly: connectRes?.isCountOnly ?? false,
        anyEndpointReturnedQR: anyQRFound,
        allSuccessfulEndpointsCountOnly: allCountOnly,
        successfulEndpoints: endpointResults
          .filter((e) => e.httpStatus === 200)
          .map((e) => ({ method: e.method, path: e.path, isCountOnly: e.isCountOnly, qrFound: e.qrExtracted })),
      };
    });
    steps.push(countOnlyStep);

    const qrAvailable = endpointResults.some((e) => e.qrExtracted || e.pairingExtracted);
    const allCountOnly200 = endpointResults
      .filter((e) => e.httpStatus === 200)
      .every((e) => e.isCountOnly);

    const recommendation = qrAvailable
      ? "QR encontrado em pelo menos um endpoint — verifique qr_endpoint_discovery para detalhes."
      : allCountOnly200
        ? "Todos os endpoints retornaram apenas { count }. Causas prováveis: (1) Evolution não alcança servidores WhatsApp — verifique rede/Railway; (2) Instância não iniciou QR generation — aguarde 30s e tente hard-reset novamente; (3) A versão da Evolution requer configuração adicional."
        : "Nenhum endpoint retornou QR. Alguns retornaram erros HTTP — verifique URL base e API key.";

    return NextResponse.json({
      success:               true,
      qrFlowVersion:         "MULTI_ENDPOINT_V3",
      hardResetUsesCreateQr: true,
      diagnoseTestsCreateQr: false,
      instanceName:          cfg.instanceName,
      baseUrlMasked,
      instanceState:         state,
      qrAvailable,
      allCountOnly200,
      recommendation,
      steps,
    });
  } catch (err) {
    console.error("[POST /api/evolution/diagnose]", err);
    return serverError();
  }
}
