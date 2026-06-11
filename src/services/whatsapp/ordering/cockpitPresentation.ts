/**
 * Cockpit presentation — pure helpers that turn the simulator report into
 * operator-facing language (no jargon as the primary text) and the visual
 * checklist. No DB, no runtime, no side effects: this is presentation logic,
 * kept out of the React page so it can be unit-tested.
 */

import type { SimReport, SimScenarioResult } from "./WhatsAppTextOrderSimulatorService";

/** Human (operator) translation for each simulated action code. */
const ACTION_LABELS: Record<string, string> = {
  WOULD_CREATE_ORDER: "Criaria pedido somente após confirmação final — seguro no simulador, nenhum pedido real foi criado.",
  WOULD_GENERATE_PIX: "Geraria Pix no fluxo real (pelo backend do Fute), mas aqui não gerou Pix de verdade.",
  QUOTE_DELIVERY: "Calculou a taxa de entrega para montar o total — leitura apenas, nada cobrado.",
  CREATE_ORDER: "Criaria pedido somente após confirmação final — seguro no simulador, nenhum pedido real foi criado.",
  GENERATE_PIX: "Geraria Pix no fluxo real (pelo backend do Fute), mas aqui não gerou Pix de verdade.",
  HANDOFF: "Encaminhou a conversa para um atendente humano.",
};

export function translateAction(action: string): string {
  return ACTION_LABELS[action] ?? `Ação registrada: ${action} (sem efeito real na simulação).`;
}

/** Next step shown to the operator — the simulator replaces the manual phone test. */
export const SIMULATOR_NEXT_ACTION =
  "Próximo passo: revisar o transcript e a comanda dos cenários abaixo. " +
  "Se estiver aprovado, rodar FULL_TEST controlado pelo admin antes de qualquer cliente real. " +
  "O teste no celular é opcional, não obrigatório.";

/** The three operator decisions (UI state for now — no real action executed). */
export const OPERATOR_DECISIONS = [
  "Aprovado para FULL_TEST controlado",
  "Precisa ajuste de mensagem",
  "Bloqueado",
] as const;
export type OperatorDecision = (typeof OPERATOR_DECISIONS)[number];

export interface CockpitChecklistItem {
  label: string;
  /** true = proven by the report; false = failed; null = needs config not provided. */
  passed: boolean | null;
  detail: string;
}

const byId = (r: SimReport, id: string): SimScenarioResult | undefined =>
  r.scenarios.find(s => s.scenarioId === id);

const checkPassed = (s: SimScenarioResult | undefined, namePart: string): boolean =>
  !!s?.checks.some(c => c.name.includes(namePart) && c.passed);

/**
 * Derives the operator checklist from the simulator report (+ live config when
 * available). Every line is backed by a concrete scenario check — nothing is
 * asserted that the report didn't actually prove.
 */
export function buildCockpitChecklist(
  report: SimReport,
  config?: { scope: string; riskLevel: string },
): CockpitChecklistItem[] {
  const footerChecks = report.scenarios.flatMap(s => s.checks.filter(c => c.name.includes("0. menu")));
  const allFooter = footerChecks.length > 0 && footerChecks.every(c => c.passed);

  const notFound = byId(report, "sim-not-found");
  const cash = byId(report, "sim-cash-delivery");
  const pix = byId(report, "sim-pix-pickup");
  const handoff = byId(report, "sim-handoff");
  const dangerous = byId(report, "sim-config-dangerous");

  const noRealOrderEverywhere = report.scenarios.every(s => s.safety.noRealOrder);
  const orderOnlyAfterConfirm =
    noRealOrderEverywhere &&
    !!cash?.actions.includes("WOULD_CREATE_ORDER") &&
    checkPassed(cash, "não cria pedido real");

  return [
    {
      label: "Todas as mensagens ativas têm 0. menu",
      passed: allFooter,
      detail: allFooter ? "rodapé conferido nos cenários de fluxo" : "alguma resposta ativa sem rodapé",
    },
    {
      label: "Nenhum produto inventado",
      passed: checkPassed(notFound, "não inventa produto"),
      detail: "produto inexistente (lasanha) não entrou na comanda",
    },
    {
      label: "Pagamento veio do Fute (PaymentSettings)",
      passed: !!cash && cash.status !== "FAIL" && cash.summary.paymentMethod === "CASH",
      detail: "opções numeradas injetadas do PaymentSettings; dinheiro perguntou troco",
    },
    {
      label: "Pix só após confirmação",
      passed: checkPassed(pix, "Pix só após o resumo") && (pix?.safety.noRealPix ?? false),
      detail: "WOULD_GENERATE_PIX só no fim do fluxo; nenhum Pix real",
    },
    {
      label: "Pedido só após confirmação",
      passed: orderOnlyAfterConfirm,
      detail: "WOULD_CREATE_ORDER só no fim do fluxo; nenhum pedido real",
    },
    {
      label: "Handoff para atendente disponível",
      passed: handoff?.status === "PASS",
      detail: "pedir atendente encaminha sem criar nada",
    },
    {
      label: "Cliente fora da allowlist não entra",
      passed: config ? config.scope === "PHONE_ALLOWLIST" : null,
      detail: config
        ? `scope atual: ${config.scope}`
        : "carregue o Config & Readiness para confirmar o scope",
    },
    {
      label: "RESTAURANT_WIDE bloqueado",
      passed: config
        ? checkPassed(dangerous, "riskLevel=HIGH") && config.scope !== "RESTAURANT_WIDE"
        : checkPassed(dangerous, "riskLevel=HIGH") ? true : false,
      detail: "exposição sem aprovação é detectada como HIGH e bloqueada",
    },
  ];
}
