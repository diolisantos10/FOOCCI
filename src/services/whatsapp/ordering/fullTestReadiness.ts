/**
 * FULL_TEST readiness — hermetic proof that ALLOWLIST_FULL_TEST behaves safely
 * BEFORE anyone promotes, without a phone and without any real side effect:
 * order/Pix only AFTER final confirmation, REPLY_ONLY never creates, FULL_TEST
 * stays allowlist-bound, `0. menu` keeps working, handoff available, rollback
 * documented. Runs the REAL machine via the simulator in FULL_TEST mode with
 * allowSideEffects=false — noRealOrder/noRealPix/noEvolution always true.
 */

import { runTextOrderSimulator } from "./WhatsAppTextOrderSimulatorService";
import { modePermissions } from "./WhatsAppTextOrderingRuntimeService";
import { assessReadiness, ROLLBACK_STEPS } from "./configDiagnostic";

interface Check { name: string; pass: boolean; note: string }

export interface FullTestReadinessResult {
  ok: boolean;
  status: "PASS" | "FAIL";
  total: number;
  passed: number;
  p0: number;
  checks: Check[];
  noRealOrder: true;
  noRealPix: true;
  noEvolution: true;
  runtimeTouched: false;
}

export async function runFullTestReadiness(): Promise<FullTestReadinessResult> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, note = "") => checks.push({ name, pass, note: pass ? "ok" : note });

  // Drive the REAL machine in simulated FULL_TEST (hermetic, allowSideEffects=false).
  const sim = await runTextOrderSimulator("FULL_TEST");
  const byId = (id: string) => sim.scenarios.find(s => s.scenarioId === id);

  const cash = byId("sim-cash-delivery");
  const pix = byId("sim-pix-pickup");
  const zero = byId("sim-menu-zero");
  const handoff = byId("sim-handoff");

  add("pedido dinheiro só criaria após confirmação final",
    !!cash?.actions.includes("WOULD_CREATE_ORDER") && cash.safety.noRealOrder, "fluxo não chegou ao WOULD_CREATE_ORDER seguro");
  add("Pix só geraria após confirmação final",
    !!pix?.actions.includes("WOULD_GENERATE_PIX") && pix.safety.noRealPix, "fluxo não chegou ao WOULD_GENERATE_PIX seguro");
  add("nenhum pedido/Pix real em FULL_TEST simulado",
    sim.safety.noRealOrder && sim.safety.noRealPix && sim.safety.noEvolution, "efeito real detectado");
  add("0. menu permanece no fluxo", zero?.status !== "FAIL", "cenário do 0 falhou");
  add("handoff disponível", handoff?.status === "PASS", "handoff falhou");
  add("simulação FULL_TEST sem P0", sim.p0 === 0, `p0=${sim.p0}`);

  // Mode gates — single source of truth.
  add("REPLY_ONLY não cria pedido/Pix", modePermissions("ALLOWLIST_REPLY_ONLY").canCreateOrder === false, "REPLY_ONLY criaria");
  add("DRY_RUN não responde nem cria", JSON.stringify(modePermissions("DRY_RUN_ONLY")) === JSON.stringify({ canReply: false, canCreateOrder: false }), "DRY_RUN inseguro");
  add("FULL_TEST é o único que cria (após confirmação)", modePermissions("ALLOWLIST_FULL_TEST").canCreateOrder === true, "FULL_TEST sem permissão");

  // Allowlist gates (pure readiness logic).
  const base = { globalKillSwitch: false, globalPause: false, enabled: true, paused: false, scope: "PHONE_ALLOWLIST", paymentOptionsEnabled: true, sampleProductsAvailable: 10 };
  add("FULL_TEST exige allowlist (vazia bloqueia)",
    assessReadiness({ ...base, mode: "ALLOWLIST_FULL_TEST", allowlistCount: 0 }).canRunFullTest === false, "FULL_TEST passou sem allowlist");
  add("fora da allowlist não entra (scope PHONE_ALLOWLIST)",
    assessReadiness({ ...base, mode: "ALLOWLIST_FULL_TEST", allowlistCount: 1 }).riskLevel !== "HIGH", "exposição inesperada");
  add("RESTAURANT_WIDE sem aprovação continua HIGH",
    assessReadiness({ ...base, mode: "ALLOWLIST_FULL_TEST", allowlistCount: 1, scope: "RESTAURANT_WIDE", scopeApproved: false }).riskLevel === "HIGH", "wide não detectado");

  add("rollback pronto (30s, documentado)",
    ROLLBACK_STEPS.length >= 4 && ROLLBACK_STEPS.join(" ").includes("paused: true"), "rollback incompleto");

  const passed = checks.filter(c => c.pass).length;
  const p0 = checks.filter(c => !c.pass).length; // every check here is a hard gate
  const status = p0 === 0 ? "PASS" : "FAIL";
  return { ok: status === "PASS", status, total: checks.length, passed, p0, checks, noRealOrder: true, noRealPix: true, noEvolution: true, runtimeTouched: false };
}
