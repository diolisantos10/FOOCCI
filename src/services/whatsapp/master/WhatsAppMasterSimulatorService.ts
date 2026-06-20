/**
 * WhatsAppMasterSimulatorService — hermetic umbrella over all WhatsApp testing
 * infrastructure. Runs a full battery covering MENU, RECEPTIONIST guard rules,
 * TEXT_ORDER, PIX, DELIVERY, HANDOFF, and REAL_CASES without touching Evolution,
 * the DB, or any real side effect.
 *
 * Design: wraps `runTextOrderSimulator("REPLY_ONLY")` for flow coverage, then
 * adds pure-function checks for MENU rendering and RECEPTIONIST guard scenarios
 * (`advanceSession` on IDLE session). `MEDIA_MESSAGE_REPLY` contract is verified
 * as a constant-level check.
 *
 * HARD INVARIANTS: runtimeTouched=false, noEvolution=true, noRealOrder=true,
 * noRealPix=true. Runs in < 5 seconds.
 */

import {
  runTextOrderSimulator,
  type SimScenarioResult,
  type SimCheck,
} from "@/services/whatsapp/ordering/WhatsAppTextOrderSimulatorService";
import {
  advanceSession,
} from "@/services/whatsapp/ordering/WhatsAppOrderStateMachine";
import {
  renderMainMenu,
  MEDIA_MESSAGE_REPLY,
  BACK_TO_MENU_FOOTER,
  type ReplyContext,
} from "@/services/ai/WhatsAppReceptionistService";
import type { WaPersistedSession } from "@/services/whatsapp/ordering/types";
import type { MenuOption } from "@/validators/whatsapp-agent";

// ── Types ────────────────────────────────────────────────────────────────────

export type MasterArea =
  | "MENU"
  | "RECEPTIONIST"
  | "TEXT_ORDER"
  | "PIX"
  | "DELIVERY"
  | "HANDOFF"
  | "REAL_CASES";

export type MasterStatus = "PASS" | "WARNING" | "FAIL";

export interface MasterCheck {
  name: string;
  passed: boolean;
  severity: "P0" | "P1" | "P2";
  message: string;
}

export interface MasterScenarioResult {
  scenarioId: string;
  name: string;
  area: MasterArea;
  status: MasterStatus;
  checks: MasterCheck[];
  recommendedFix?: string;
}

export interface MasterAreaSummary {
  area: MasterArea;
  status: MasterStatus;
  p0: number;
  p1: number;
  p2: number;
  scenarioCount: number;
}

export interface MasterSafety {
  noEvolution: boolean;
  noRealOrder: boolean;
  noRealPix: boolean;
  runtimeTouched: false;
}

export interface MasterReport {
  status: MasterStatus;
  p0: number;
  p1: number;
  p2: number;
  total: number;
  passed: number;
  warned: number;
  failed: number;
  scenarios: MasterScenarioResult[];
  summary: MasterAreaSummary[];
  safety: MasterSafety;
  runtimeTouched: false;
  ranAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function chk(
  name: string,
  passed: boolean,
  severity: MasterCheck["severity"],
  failMsg: string,
): MasterCheck {
  return { name, passed, severity, message: passed ? "ok" : failMsg };
}

function statusFrom(checks: MasterCheck[]): MasterStatus {
  if (checks.some((c) => !c.passed && c.severity === "P0")) return "FAIL";
  if (checks.some((c) => !c.passed)) return "WARNING";
  return "PASS";
}

function simCheckToMaster(c: SimCheck): MasterCheck {
  return { name: c.name, passed: c.passed, severity: c.severity, message: c.message };
}

function areaFromScenarioId(id: string): MasterArea {
  if (id.includes("pix")) return "PIX";
  if (id.includes("delivery") || id.includes("pickup")) return "DELIVERY";
  if (id.includes("handoff")) return "HANDOFF";
  if (id.includes("menu-zero")) return "MENU";
  if (id.includes("menu-question") || id.includes("question")) return "RECEPTIONIST";
  if (id.includes("not-found") || id.includes("ambiguous")) return "REAL_CASES";
  return "TEXT_ORDER";
}

function recommendedFix(scenario: MasterScenarioResult): string | undefined {
  if (scenario.status === "PASS") return undefined;
  const failedP0 = scenario.checks.find((c) => !c.passed && c.severity === "P0");
  if (failedP0) return `[P0] ${failedP0.message}`;
  const failedP1 = scenario.checks.find((c) => !c.passed && c.severity === "P1");
  if (failedP1) return `[P1] ${failedP1.message}`;
  const failedP2 = scenario.checks.find((c) => !c.passed && c.severity === "P2");
  if (failedP2) return `[P2] ${failedP2.message}`;
  return undefined;
}

// ── Synthetic objects ─────────────────────────────────────────────────────────

function makeIdleSession(): WaPersistedSession {
  return {
    id: "master-sim",
    restaurantId: "sim",
    customerId: null,
    conversationId: null,
    phone: "+5511999990000",
    status: "ACTIVE",
    stage: "IDLE",
    selectedItems: [],
    unresolvedItems: [],
    missingQuestions: [],
    deliveryType: null,
    address: null,
    deliveryQuote: null,
    paymentMethod: null,
    paymentStatus: null,
    orderDraftId: null,
    orderId: null,
    pixPaymentId: null,
    mode: "DRY_RUN_ONLY",
    source: "master_sim",
    metadata: null,
    lastMessageAt: new Date(),
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const SYNTHETIC_MENU_OPTIONS: MenuOption[] = [
  { id: "opt-1", label: "Já sei o que quero pedir",  flow: "text_order" },
  { id: "opt-2", label: "Ver cardápio",               flow: "menu"       },
  { id: "opt-3", label: "Rodízio presencial",         flow: "rodizio"    },
  { id: "opt-4", label: "Horário de funcionamento",   flow: "custom"     },
  { id: "opt-5", label: "Promoções",                  flow: "promotions" },
  { id: "opt-6", label: "Cazza Club",                 flow: "club"       },
  { id: "opt-7", label: "Falar com atendente",        flow: "handoff"    },
];

function makeReplyCtx(opts?: MenuOption[]): ReplyContext {
  return {
    restaurantName: "Restaurante Sim",
    agentName: "Assistente",
    customerName: null,
    pedidoUrl: null,
    qrMenuUrl: null,
    address: null,
    deliveryEnabled: true,
    welcomeMessage: "Olá! Como posso ajudar?",
    orderPreMessage: "",
    handoffMessage: "Vou chamar um atendente.",
    agentMode: "RECEPTIONIST_ONLY",
    menuOptions: opts ?? SYNTHETIC_MENU_OPTIONS,
    hoursText: null,
    isCurrentlyOpen: true,
    closedMessage: null,
    isPaused: false,
    pauseReason: null,
    menuCatalog: [],
    instagramUrl: null,
    tiktokUrl: null,
  };
}

// ── MENU scenarios (pure-function renderMainMenu) ─────────────────────────────

function runMenuScenarios(): MasterScenarioResult[] {
  const ctx = makeReplyCtx();
  const rendered = renderMainMenu(ctx);

  const sevenOptionsChecks: MasterCheck[] = [
    chk(
      "renderMainMenu lista ≥ 7 opções",
      SYNTHETIC_MENU_OPTIONS.every((o) => rendered.includes(o.label)),
      "P0",
      `Menu não listou todas as opções: ${SYNTHETIC_MENU_OPTIONS.map((o) => o.label).filter((l) => !rendered.includes(l)).join(", ")}`,
    ),
    chk(
      "renderMainMenu não contém link raw",
      !/https?:\/\//i.test(rendered),
      "P0",
      "Menu principal contém URL raw — viola regra de link",
    ),
    chk(
      `renderMainMenu contém rodapé "${BACK_TO_MENU_FOOTER.trim()}"`,
      rendered.includes(BACK_TO_MENU_FOOTER.trim()),
      "P1",
      "Menu não termina com rodapé '0. menu'",
    ),
  ];

  const sevenOptions: MasterScenarioResult = {
    scenarioId: "master-menu-render",
    name: "Menu principal: 7 opções + sem link + rodapé",
    area: "MENU",
    status: statusFrom(sevenOptionsChecks),
    checks: sevenOptionsChecks,
    recommendedFix: undefined,
  };
  sevenOptions.recommendedFix = recommendedFix(sevenOptions);

  // Empty options → welcome message fallback
  const emptyCtx = makeReplyCtx([]);
  const emptyRendered = renderMainMenu(emptyCtx);
  const emptyChecks: MasterCheck[] = [
    chk(
      "menuOptions vazia → welcomeMessage",
      emptyRendered === emptyCtx.welcomeMessage,
      "P1",
      "Com menuOptions vazia, não usou welcomeMessage como fallback",
    ),
  ];
  const emptyFallback: MasterScenarioResult = {
    scenarioId: "master-menu-empty-fallback",
    name: "Menu principal: opções vazias usa welcomeMessage",
    area: "MENU",
    status: statusFrom(emptyChecks),
    checks: emptyChecks,
  };
  emptyFallback.recommendedFix = recommendedFix(emptyFallback);

  return [sevenOptions, emptyFallback];
}

// ── RECEPTIONIST guard scenarios (advanceSession on blank IDLE session) ───────

interface GuardScenario {
  id: string;
  name: string;
  message: string;
  checks: (reply: string) => MasterCheck[];
}

const GUARD_SCENARIOS: GuardScenario[] = [
  {
    id: "master-receptionist-voucher",
    name: "Guard: aceita voucher? → resposta de pagamento, não produto",
    message: "aceita voucher?",
    checks: (reply) => [
      chk(
        "resposta não cita 'Não encontrei' como produto",
        !/n[ãa]o encontrei.*card[aá]pio/i.test(reply),
        "P0",
        `Resposta citou 'Não encontrei no cardápio' para voucher: "${reply.slice(0, 100)}"`,
      ),
      chk(
        "resposta menciona forma de pagamento",
        /pix|cart[aã]o|dinheiro|pagamento|voucher/i.test(reply),
        "P1",
        "Resposta não mencionou forma de pagamento",
      ),
    ],
  },
  {
    id: "master-receptionist-thanks",
    name: "Guard: 'Entendi, muitoooo obrigada' → agradecimento, não produto",
    message: "Entendi, muitoooo obrigada",
    checks: (reply) => [
      chk(
        "resposta não cita 'Não encontrei' como produto",
        !/n[ãa]o encontrei.*card[aá]pio/i.test(reply),
        "P0",
        `Resposta citou 'Não encontrei no cardápio' para agradecimento: "${reply.slice(0, 100)}"`,
      ),
      chk(
        "resposta é social (imagina/qualquer coisa)",
        /imagina|qualquer coisa|estou por aqui/i.test(reply),
        "P1",
        "Resposta não reconheceu o agradecimento",
      ),
    ],
  },
  {
    id: "master-receptionist-praise",
    name: "Guard: elogio → resposta de carinho, não produto",
    message: "Tudo aí é maravilhoso, obrigada",
    checks: (reply) => [
      chk(
        "resposta não cita 'Não encontrei' como produto",
        !/n[ãa]o encontrei.*card[aá]pio/i.test(reply),
        "P0",
        `Resposta citou 'Não encontrei no cardápio' para elogio: "${reply.slice(0, 100)}"`,
      ),
      chk(
        "resposta é social (imagina/carinho/qualquer coisa)",
        /imagina|qualquer\s+coisa|estou\s+por\s+aqui|carinho|obrigad[ao]|lind[ao]|quando\s+quiser/i.test(reply),
        "P1",
        "Resposta não reconheceu o elogio de forma social",
      ),
    ],
  },
  {
    id: "master-receptionist-contextual",
    name: "Guard: mensagem contextual → orientação, não produto",
    message: "kely eu achei o sushi",
    checks: (reply) => [
      chk(
        "resposta não cita 'Não encontrei' como produto",
        !/n[ãa]o encontrei.*card[aá]pio/i.test(reply),
        "P0",
        `Resposta tratou mensagem contextual como produto: "${reply.slice(0, 100)}"`,
      ),
    ],
  },
  {
    id: "master-receptionist-followup",
    name: "Guard: 'cadê meu pedido' → handoff, não produto",
    message: "cadê meu pedido",
    checks: (reply) => [
      chk(
        "resposta não cita 'Não encontrei' como produto",
        !/n[ãa]o encontrei.*card[aá]pio/i.test(reply),
        "P0",
        `Resposta tratou 'cadê' como produto: "${reply.slice(0, 100)}"`,
      ),
      chk(
        "resposta orienta ou faz handoff",
        /atendente|pedido|status|verificar|calma/i.test(reply),
        "P1",
        "Resposta não orientou sobre status do pedido",
      ),
    ],
  },
];

function runReceptionistGuardScenarios(): MasterScenarioResult[] {
  const emptyMenu: Parameters<typeof advanceSession>[2] = [];
  return GUARD_SCENARIOS.map((gs) => {
    const session = makeIdleSession();
    const result = advanceSession(session, gs.message, emptyMenu);
    const checks = gs.checks(result.suggestedReply);
    const scenario: MasterScenarioResult = {
      scenarioId: gs.id,
      name: gs.name,
      area: "RECEPTIONIST",
      status: statusFrom(checks),
      checks,
    };
    scenario.recommendedFix = recommendedFix(scenario);
    return scenario;
  });
}

// ── MEDIA constant check ──────────────────────────────────────────────────────

function runMediaChecks(): MasterScenarioResult[] {
  const checks: MasterCheck[] = [
    chk(
      "MEDIA_MESSAGE_REPLY contém 3 opções numeradas",
      MEDIA_MESSAGE_REPLY.includes("1️⃣") &&
        MEDIA_MESSAGE_REPLY.includes("2️⃣") &&
        MEDIA_MESSAGE_REPLY.includes("7️⃣"),
      "P1",
      "MEDIA_MESSAGE_REPLY não tem as 3 opções esperadas",
    ),
    chk(
      "MEDIA_MESSAGE_REPLY não contém link raw",
      !/https?:\/\//i.test(MEDIA_MESSAGE_REPLY),
      "P0",
      "MEDIA_MESSAGE_REPLY contém URL raw",
    ),
    chk(
      "MEDIA_MESSAGE_REPLY termina com '0. menu'",
      MEDIA_MESSAGE_REPLY.endsWith("0. menu"),
      "P1",
      "MEDIA_MESSAGE_REPLY não termina com '0. menu'",
    ),
  ];

  const scenario: MasterScenarioResult = {
    scenarioId: "master-media-reply",
    name: "Mídia: MEDIA_MESSAGE_REPLY — contrato de constante",
    area: "RECEPTIONIST",
    status: statusFrom(checks),
    checks,
  };
  scenario.recommendedFix = recommendedFix(scenario);
  return [scenario];
}

// ── SimReport → MasterScenario mapping ───────────────────────────────────────

function simScenarioToMaster(sim: SimScenarioResult): MasterScenarioResult {
  const checks = sim.checks.map(simCheckToMaster);
  const area = areaFromScenarioId(sim.scenarioId);
  const status =
    sim.status === "FAIL" ? "FAIL" : sim.status === "WARNING" ? "WARNING" : "PASS";

  const scenario: MasterScenarioResult = {
    scenarioId: sim.scenarioId,
    name: sim.name,
    area,
    status,
    checks,
  };
  scenario.recommendedFix = recommendedFix(scenario);
  return scenario;
}

// ── Area summary ─────────────────────────────────────────────────────────────

const SUMMARY_AREAS: MasterArea[] = [
  "MENU",
  "RECEPTIONIST",
  "TEXT_ORDER",
  "PIX",
  "DELIVERY",
  "HANDOFF",
  "REAL_CASES",
];

function buildAreaSummaries(scenarios: MasterScenarioResult[]): MasterAreaSummary[] {
  return SUMMARY_AREAS.map((area) => {
    const group = scenarios.filter((s) => s.area === area);
    const p0 = group.reduce(
      (n, s) => n + s.checks.filter((c) => !c.passed && c.severity === "P0").length,
      0,
    );
    const p1 = group.reduce(
      (n, s) => n + s.checks.filter((c) => !c.passed && c.severity === "P1").length,
      0,
    );
    const p2 = group.reduce(
      (n, s) => n + s.checks.filter((c) => !c.passed && c.severity === "P2").length,
      0,
    );
    const status =
      p0 > 0 ? "FAIL" : p1 > 0 || p2 > 0 ? "WARNING" : "PASS";
    return { area, status, p0, p1, p2, scenarioCount: group.length };
  });
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runMasterSimulator(): Promise<MasterReport> {
  // 1. Run the full text-order simulator (11 canonical scenarios)
  const simReport = await runTextOrderSimulator("REPLY_ONLY");
  const fromSim = simReport.scenarios.map(simScenarioToMaster);

  // 2. Pure-function MENU checks (renderMainMenu)
  const menuScenarios = runMenuScenarios();

  // 3. RECEPTIONIST guard scenarios (advanceSession on blank IDLE session)
  const receptionistScenarios = runReceptionistGuardScenarios();

  // 4. MEDIA constant checks
  const mediaScenarios = runMediaChecks();

  const all = [...fromSim, ...menuScenarios, ...receptionistScenarios, ...mediaScenarios];

  const passed = all.filter((s) => s.status === "PASS").length;
  const warned = all.filter((s) => s.status === "WARNING").length;
  const failed = all.filter((s) => s.status === "FAIL").length;

  const p0 = all.reduce(
    (n, s) => n + s.checks.filter((c) => !c.passed && c.severity === "P0").length,
    0,
  );
  const p1 = all.reduce(
    (n, s) => n + s.checks.filter((c) => !c.passed && c.severity === "P1").length,
    0,
  );
  const p2 = all.reduce(
    (n, s) => n + s.checks.filter((c) => !c.passed && c.severity === "P2").length,
    0,
  );

  const status: MasterStatus = failed > 0 ? "FAIL" : warned > 0 ? "WARNING" : "PASS";

  const safety: MasterSafety = {
    noEvolution: true,
    noRealOrder: simReport.safety.noRealOrder,
    noRealPix: simReport.safety.noRealPix,
    runtimeTouched: false,
  };

  return {
    status,
    p0,
    p1,
    p2,
    total: all.length,
    passed,
    warned,
    failed,
    scenarios: all,
    summary: buildAreaSummaries(all),
    safety,
    runtimeTouched: false,
    ranAt: new Date().toISOString(),
  };
}
