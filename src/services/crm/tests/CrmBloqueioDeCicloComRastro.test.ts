/**
 * DOIS DEFEITOS QUE ANDAVAM JUNTOS: um recurso derrubando o outro, em silêncio.
 *
 * ── O ACOPLAMENTO ──────────────────────────────────────────────────────────────
 * O portão de cadência (`minMinutesBetweenCycles`) perguntava ao banco pela última
 * `campaign_execution` do restaurante SEM FILTRO NENHUM. O carrinho abandonado
 * grava execução desde 05/08/2026 e o agendador dele tica a cada 60 s. Resultado:
 * cada carrinho recuperado reiniciava o relógio das campanhas recorrentes. Num
 * restaurante com movimento isso as segurava indefinidamente.
 *
 * A isenção já existia — `BUDGET_EXEMPT_TEMPLATE_IDS` — e estava aplicada no teto
 * diário. Foi esquecida aqui. Uma regra com dois usos e uma cópia só.
 *
 * ── O SILÊNCIO ─────────────────────────────────────────────────────────────────
 * Bloqueio de ciclo inteiro (canal caído, cadência, disjuntor) não gera
 * `campaign_execution`: não há destinatário, porque nada foi tentado. O motivo
 * existia só como string em memória e um console.log que morria no deploy. O
 * lojista via zero sem causa — e zero sem causa parece "mercado fraco" quando é
 * sistema parado. Agora fica em `campaigns.lastBlockedAt` + `lastBlockReason`.
 *
 * COMO ESTE ARQUIVO RESISTE A SABOTAGEM: o `findFirst` falso AVALIA o predicado
 * Prisma de verdade (o `OR` com `templateId: null` / `notIn`). Se alguém tirar o
 * filtro do runner, o falso volta a enxergar o carrinho e a primeira metade
 * reprova. Se alguém tirar o portão inteiro, a segunda metade reprova.
 *
 * Nada é enviado: canal, audiência e banco são todos espiões.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** Os mesmos ids isentos de `BUDGET_EXEMPT_TEMPLATE_IDS` — o falso não os importa
 *  de propósito: se a lista real mudar, o teste tem de ser lido por um humano. */
const EXEMPTAS = ["aniversariantes", "carrinho-abandonado"];

/** Linha de execução como o banco a veria: quando, e de que campanha veio. */
interface LinhaExec { createdAt: Date; templateId: string | null }

let execucoes: LinhaExec[] = [];

/**
 * Avalia o `where.campaign` que o runner mandou, com a semântica real do Prisma.
 * Sem filtro (o defeito) → tudo conta, inclusive o carrinho.
 */
function passaNoFiltro(templateId: string | null, filtro: unknown): boolean {
  if (!filtro || typeof filtro !== "object") return true;
  const ors = (filtro as { OR?: unknown }).OR;
  if (!Array.isArray(ors)) return true;
  return ors.some((cond) => {
    const t = (cond as { templateId?: unknown }).templateId;
    if (t === null) return templateId === null;
    const notIn = (t as { notIn?: unknown } | undefined)?.notIn;
    if (Array.isArray(notIn)) return templateId !== null && !notIn.includes(templateId);
    return false;
  });
}

const db = vi.hoisted(() => ({
  campaign:              { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  campaignExecution:     { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  restaurantCRMProfile:  { findUnique: vi.fn() },
  tierSettings:          { findMany: vi.fn() },
}));
const canal = vi.hoisted(() => ({ getConnectionStatus: vi.fn(), sendText: vi.fn(), sendTemplate: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => ({ WhatsAppMessagingService: canal }));
// Parcial: só `getSegmentConfig` sai do banco. O resto do módulo é o real —
// mockar o arquivo inteiro esconderia constantes que outros serviços importam.
vi.mock("@/lib/crm-segments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crm-segments")>()),
  getSegmentConfig: vi.fn(async () => ({ hotMaxDays: 30, warmMaxDays: 60, lostMinDays: 90 })),
}));
vi.mock("@/services/crm/CrmAudienceService", () => ({
  CrmAudienceService: { getAudiencePreview: vi.fn(async () => ({ eligibleCount: 100 })) },
}));

// crm-safety NÃO é mockado de propósito: o teste tem de exercitar a constante
// real (BUDGET_COUNTED_CAMPAIGN_FILTER) e o modo seguro real. Mockar aqui seria
// testar o próprio mock.
import { ScheduledCampaignRunnerService } from "../ScheduledCampaignRunnerService";

const AGORA = new Date("2026-08-13T15:00:00Z");
const haMinutos = (m: number) => new Date(AGORA.getTime() - m * 60_000);

/** Campanha recorrente comum — não isenta, não é programa de relacionamento. */
const CAMPANHA = {
  id: "cmp1", name: "Recuperar clientes frios", status: "ACTIVE", restaurantId: "r1",
  templateId: "recuperar-frios", targetSegment: "recuperar-frios", totalSent: 0,
  scheduleConfig: {
    mode: "RECURRING", weekdays: [0, 1, 2, 3, 4, 5, 6],
    timeWindow: { start: "00:00", end: "23:59" }, dailyLimit: 20,
    endCondition: "AUDIENCE_EXHAUSTED", timezone: "America/Sao_Paulo",
  },
};

beforeEach(() => {
  // restaurar ANTES de limpar: `clearAllMocks` zera as chamadas mas MANTÉM a
  // implementação falsa. Sem isto o spy de `_runOrchestratedCycle` de um teste
  // vaza para o seguinte e os testes de rastro passam a medir o vizinho.
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  execucoes = [];

  vi.spyOn(ScheduledCampaignRunnerService, "isCampaignDueNow").mockReturnValue(true);

  db.campaign.findMany.mockResolvedValue([CAMPANHA]);
  db.campaign.update.mockResolvedValue({});
  db.campaign.updateMany.mockResolvedValue({ count: 1 });
  db.tierSettings.findMany.mockResolvedValue([]);
  db.campaignExecution.count.mockResolvedValue(0);
  db.campaignExecution.findMany.mockResolvedValue([]);
  // Sem perfil salvo → modo seguro real: orçamento ligado, 9 min, para se cair.
  db.restaurantCRMProfile.findUnique.mockResolvedValue(null);
  canal.getConnectionStatus.mockResolvedValue({ connected: true });

  db.campaignExecution.findFirst.mockImplementation(async (args: { where?: { campaign?: unknown } } = {}) => {
    const visiveis = execucoes
      .filter((e) => passaNoFiltro(e.templateId, args.where?.campaign))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return visiveis[0] ?? null;
  });
});

afterEach(() => { vi.useRealTimers(); });

// ── METADE 1 — a isenção passou a valer aqui também ────────────────────────────

describe("cadência de ciclos: quem reinicia o relógio e quem não reinicia", () => {
  it("carrinho abandonado de 1 min atrás NÃO trava o ciclo recorrente", async () => {
    execucoes = [{ createdAt: haMinutos(1), templateId: "carrinho-abandonado" }];
    const orquestrar = vi
      .spyOn(ScheduledCampaignRunnerService as never, "_runOrchestratedCycle")
      .mockResolvedValue([] as never);

    await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    expect(orquestrar).toHaveBeenCalledTimes(1);
  });

  it("aniversariante de 1 min atrás também NÃO trava — a isenção é a mesma lista", async () => {
    execucoes = [{ createdAt: haMinutos(1), templateId: "aniversariantes" }];
    const orquestrar = vi
      .spyOn(ScheduledCampaignRunnerService as never, "_runOrchestratedCycle")
      .mockResolvedValue([] as never);

    await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    expect(orquestrar).toHaveBeenCalledTimes(1);
  });

  // ── A OUTRA METADE: o portão continua sendo um portão ────────────────────────

  it("envio de CRM de 1 min atrás TRAVA o ciclo — a proteção não foi removida", async () => {
    execucoes = [{ createdAt: haMinutos(1), templateId: "recuperar-frios" }];
    const orquestrar = vi
      .spyOn(ScheduledCampaignRunnerService as never, "_runOrchestratedCycle")
      .mockResolvedValue([] as never);

    const r = await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    expect(orquestrar).not.toHaveBeenCalled();
    expect(r.results[0]?.reason).toContain("intervalo mínimo");
    expect(r.totalSent).toBe(0);
  });

  it("campanha avulsa (templateId null) TRAVA — só as isentas escapam", async () => {
    execucoes = [{ createdAt: haMinutos(1), templateId: null }];
    const orquestrar = vi
      .spyOn(ScheduledCampaignRunnerService as never, "_runOrchestratedCycle")
      .mockResolvedValue([] as never);

    await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    expect(orquestrar).not.toHaveBeenCalled();
  });

  it("envio de CRM de 10 min atrás libera — o portão é de 9 min, não é passe livre", async () => {
    execucoes = [{ createdAt: haMinutos(10), templateId: "recuperar-frios" }];
    const orquestrar = vi
      .spyOn(ScheduledCampaignRunnerService as never, "_runOrchestratedCycle")
      .mockResolvedValue([] as never);

    await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    expect(orquestrar).toHaveBeenCalledTimes(1);
  });

  it("carrinho recente + CRM recente juntos: o CRM manda, e trava", async () => {
    // O carrinho é o mais NOVO. Se o filtro não existisse, ele seria o escolhido —
    // e por acaso o resultado seria o mesmo. Aqui o que importa é que o CRM de 2 min
    // continua sendo enxergado depois de o carrinho ser descartado.
    execucoes = [
      { createdAt: haMinutos(1), templateId: "carrinho-abandonado" },
      { createdAt: haMinutos(2), templateId: "recuperar-frios" },
    ];
    const orquestrar = vi
      .spyOn(ScheduledCampaignRunnerService as never, "_runOrchestratedCycle")
      .mockResolvedValue([] as never);

    await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    expect(orquestrar).not.toHaveBeenCalled();
  });
});

// ── METADE 2 — o bloqueio deixa rastro ─────────────────────────────────────────

describe("bloqueio de ciclo deixa rastro na campanha", () => {
  it("cadência bloqueou → grava motivo legível e a data do bloqueio", async () => {
    execucoes = [{ createdAt: haMinutos(1), templateId: "recuperar-frios" }];
    vi.spyOn(ScheduledCampaignRunnerService as never, "_runOrchestratedCycle").mockResolvedValue([] as never);

    await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    expect(db.campaign.updateMany).toHaveBeenCalledTimes(1);
    const chamada = db.campaign.updateMany.mock.calls[0]![0] as {
      where: { id: { in: string[] } };
      data:  { lastBlockedAt: Date; lastBlockReason: string };
    };
    expect(chamada.where.id.in).toEqual(["cmp1"]);
    expect(chamada.data.lastBlockReason).toContain("intervalo mínimo");
    // Data CALCULADA no momento do bloqueio — nunca digitada, nunca constante.
    expect(chamada.data.lastBlockedAt).toBeInstanceOf(Date);
    expect(chamada.data.lastBlockedAt.getTime()).toBe(AGORA.getTime());
  });

  it("canal caído para o ciclo inteiro E grava 'WhatsApp desconectado' — não o código", async () => {
    canal.getConnectionStatus.mockResolvedValue({ connected: false });

    const r = await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    const gravacoes = db.campaign.updateMany.mock.calls
      .map((c) => (c[0] as { data: { lastBlockReason?: string | null } }).data)
      .filter((d) => typeof d.lastBlockReason === "string");
    expect(gravacoes).toHaveLength(1);

    const motivo = gravacoes[0]!.lastBlockReason!;
    expect(motivo).toBe("WhatsApp desconectado");
    // Guardrail 6: o alerta carrega a evidência. Código de máquina não é evidência.
    expect(motivo).not.toContain("INSTANCE_DISCONNECTED");
    expect(motivo).not.toMatch(/^[A-Z_]+$/);

    expect(r.totalSent).toBe(0);
  });

  it("ciclo que passa nos portões LIMPA o rastro — alerta velho não fica na tela", async () => {
    execucoes = [{ createdAt: haMinutos(30), templateId: "recuperar-frios" }];
    canal.getConnectionStatus.mockResolvedValue({ connected: true });

    await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1" });

    const limpezas = db.campaign.updateMany.mock.calls
      .map((c) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> })
      .filter((c) => c.data.lastBlockReason === null);
    expect(limpezas).toHaveLength(1);

    // NULO é "sem bloqueio agora". Nunca 0, nunca string vazia: "não medido" e
    // "medido zero" são coisas diferentes e não podem colidir num mesmo campo.
    expect(limpezas[0]!.data.lastBlockedAt).toBeNull();
    expect(limpezas[0]!.data.lastBlockReason).toBeNull();
    expect(limpezas[0]!.data.lastBlockReason).not.toBe("");
    expect(limpezas[0]!.data.lastBlockedAt).not.toBe(0);
    // Só escreve quando há o que limpar.
    expect(limpezas[0]!.where).toMatchObject({ lastBlockedAt: { not: null } });
  });

  it("dry run PREVÊ e não deixa marca — simulação não escreve no banco", async () => {
    execucoes = [{ createdAt: haMinutos(1), templateId: "recuperar-frios" }];
    vi.spyOn(ScheduledCampaignRunnerService as never, "_runOrchestratedCycle").mockResolvedValue([] as never);

    await ScheduledCampaignRunnerService.runDueCampaigns({ restaurantId: "r1", dryRun: true });

    expect(db.campaign.updateMany).not.toHaveBeenCalled();
  });
});
