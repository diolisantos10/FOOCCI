/**
 * Text-order READINESS diagnostic — read-only, cron-safe.
 *
 * Composes the per-restaurant CONFIG diagnostic (live config + risk) with the
 * hermetic FLOW diagnostic (synthetic state-machine proof) into a single
 * production-readiness checklist:
 *   replyOnlyReady / fullTestReady / restaurantWideReady + blockers / warnings /
 *   requiredNextActions.
 *
 * Never writes, never sends, never creates an order or Pix. runtimeTouched=false.
 */

import { runConfigDiagnostic, type ConfigDiagnosticResult } from "./configDiagnostic";
import {
  runWhatsAppTextOrderDiagnostic,
  type TextOrderDiagnosticResult,
} from "@/services/whatsapp/brain/WhatsAppTextOrderDiagnostic";

export interface ReadinessInput {
  restaurantId?: string;
  restaurantSlug?: string;
  phone?: string;
}

export interface ReadinessResult {
  ok: boolean;
  restaurantId: string | null;
  restaurantName: string | null;
  replyOnlyReady: boolean;
  fullTestReady: boolean;
  restaurantWideReady: boolean;
  blockers: string[];
  warnings: string[];
  requiredNextActions: string[];
  flowDiagnostic: {
    status: "PASS" | "FAIL";
    passed: number;
    total: number;
    p0: number;
    noSend: boolean;
    noWhatsAppSend: boolean;
    noOrder: boolean;
    noPix: boolean;
  };
  config: ConfigDiagnosticResult;
  runtimeTouched: false;
}

function summariseFlow(flow: TextOrderDiagnosticResult): ReadinessResult["flowDiagnostic"] {
  return {
    status: flow.status, passed: flow.passed, total: flow.total, p0: flow.p0,
    noSend: flow.noSend, noWhatsAppSend: flow.noWhatsAppSend, noOrder: flow.noOrder, noPix: flow.noPix,
  };
}

export async function runReadinessDiagnostic(input: ReadinessInput): Promise<ReadinessResult> {
  const [config, flow] = await Promise.all([
    runConfigDiagnostic(input),
    runWhatsAppTextOrderDiagnostic(),
  ]);

  const blockers: string[] = [];
  const warnings: string[] = [];
  const requiredNextActions: string[] = [];

  const flowPass = flow.status === "PASS" && flow.p0 === 0;
  if (!config.ok) blockers.push("restaurante não encontrado");
  if (!flowPass) blockers.push(`diagnóstico de fluxo falhou (status=${flow.status}, p0=${flow.p0})`);
  if (config.riskLevel === "HIGH") {
    blockers.push("riskLevel=HIGH — exposição acidental (corrija o scope antes de qualquer coisa)");
  }

  // REPLY_ONLY readiness: config gate + flow proof + no accidental exposure.
  const replyOnlyReady = config.ok && config.canRunReplyOnly && flowPass && config.riskLevel !== "HIGH";
  if (!replyOnlyReady) {
    requiredNextActions.push(...config.missingForReplyOnly);
  }

  // FULL_TEST readiness: everything REPLY_ONLY needs + FULL_TEST mode.
  const fullTestReady = config.ok && config.canRunFullTest && flowPass && config.riskLevel !== "HIGH";
  if (!fullTestReady && replyOnlyReady) {
    requiredNextActions.push(
      "revisar transcript e comanda dos cenários no simulador (WA Cockpit); aprovado, subir mode para ALLOWLIST_FULL_TEST controlado pelo admin — teste no celular é opcional, não obrigatório",
    );
  }

  // RESTAURANT_WIDE readiness: the highest bar — needs the human approval marker,
  // a clean flow, and no HIGH risk. Human-validated gates (REPLY_ONLY/FULL_TEST on
  // device, Brain Director sign-off) are surfaced as required actions, never auto-passed.
  const restaurantWideReady = config.ok && config.restaurantWideApproved && flowPass && config.riskLevel !== "HIGH";
  if (!config.restaurantWideApproved) {
    warnings.push("RESTAURANT_WIDE sem marcador de aprovação — só liberar após REPLY_ONLY+FULL_TEST validados e change request do Brain Director aprovado");
  }

  return {
    ok: config.ok,
    restaurantId: config.restaurantId,
    restaurantName: config.restaurantName,
    replyOnlyReady,
    fullTestReady,
    restaurantWideReady,
    blockers,
    warnings,
    requiredNextActions: [...new Set(requiredNextActions)],
    flowDiagnostic: summariseFlow(flow),
    config,
    runtimeTouched: false,
  };
}
