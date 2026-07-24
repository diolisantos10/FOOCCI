/**
 * SupportBrainDiagnostic — checagem sintética e hermética de que o PISO DE
 * SEGURANÇA do Agente de Suporte está de pé. Mesmo molde de CrmBrainDiagnostic.
 *
 * As propriedades P0 que este diagnóstico prova (funções puras da escada):
 *  • Em SOMBRA (Fase 0), NENHUMA ação executa em produção — nem as do catálogo.
 *  • Uma ação FORA do catálogo nunca é reconhecida (o agente não inventa ação).
 *  • Sem ação candidata → escala para humano.
 *  • Toda ação do catálogo é reversível e idempotente (pré-requisito de existir).
 *
 * Puro: sem DB, sem LLM, não executa nada.
 */

import {
  planRemediation,
  findAction,
  REMEDIATION_CATALOG,
} from "@/services/support/SupportRemediationLadder";

interface GuardCase {
  name: string;
  run: () => boolean; // true = propriedade de segurança sustentada
}

const CASES: GuardCase[] = [
  {
    name: "SOMBRA não executa nenhuma ação do catálogo",
    run: () => REMEDIATION_CATALOG.every((a) => planRemediation(a.key, "SHADOW_ONLY").canExecuteNow === false),
  },
  {
    name: "SOMBRA sempre escala (freio de mão)",
    run: () => REMEDIATION_CATALOG.every((a) => planRemediation(a.key, "SHADOW_ONLY").escalate === true),
  },
  {
    name: "ação fora do catálogo não é reconhecida",
    run: () => findAction("rm_-rf_prod") === null && findAction("DROP TABLE orders") === null,
  },
  {
    name: "ação fora do catálogo escala, nunca executa",
    run: () => {
      const p = planRemediation("delete_all_orders", "RESTAURANT_WIDE");
      return p.action === null && p.canExecuteNow === false && p.escalate === true;
    },
  },
  {
    name: "sem ação candidata → escala",
    run: () => {
      const p = planRemediation(null, "RESTAURANT_WIDE");
      return p.canExecuteNow === false && p.escalate === true;
    },
  },
  {
    name: "toda ação do catálogo é reversível e idempotente",
    run: () => REMEDIATION_CATALOG.every((a) => a.reversible === true && a.idempotent === true && a.maxAttempts >= 1),
  },
  {
    name: "Fase 0: nenhuma ação do catálogo está habilitada",
    run: () => REMEDIATION_CATALOG.every((a) => a.enabled === false),
  },
];

export interface SupportDiagnosticCase {
  name: string;
  pass: boolean;
}

export interface SupportDiagnosticResult {
  ok: boolean;
  status: "PASS" | "FAIL";
  total: number;
  passed: number;
  p0: number;
  cases: SupportDiagnosticCase[];
  noSend: true;
  runtimeTouched: false;
}

export function runSupportBrainDiagnostic(): SupportDiagnosticResult {
  const cases: SupportDiagnosticCase[] = [];
  let passed = 0;
  for (const c of CASES) {
    let pass = false;
    try { pass = c.run(); } catch { pass = false; }
    if (pass) passed += 1;
    cases.push({ name: c.name, pass });
  }
  const allPass = passed === CASES.length;
  return {
    ok: allPass,
    status: allPass ? "PASS" : "FAIL",
    total: CASES.length,
    passed,
    p0: allPass ? 0 : 1,
    cases,
    noSend: true,
    runtimeTouched: false,
  };
}
