/**
 * Portão do tick de partida do agendador interno de campanhas.
 *
 * O defeito que este arquivo trava: `start()` só chamava `setInterval`, e
 * `setInterval` só dispara ao FIM do primeiro período. Cada deploy custava
 * 10 minutos de CRM mudo — em 06/08 foram 6 merges, ~1 hora de janela morta.
 *
 * As duas metades:
 *  • METADE 1 (prova) — depois de `start()`, um tick acontece MUITO antes dos
 *    10 minutos do intervalo, e ele chama o runner de verdade.
 *  • METADE 2 (sabotagem) — sem o tick de partida, nada roda até o minuto 10.
 *    O teste abaixo falha se alguém remover o `setTimeout` de boot, porque a
 *    asserção é feita ANTES de o intervalo poder ter disparado.
 *
 * Nada é enviado: o runner é mockado. O tick de boot não abre exceção nenhuma —
 * chama o MESMO `runDueCampaigns`, com janela, teto diário, cooldown, dedupe e
 * intervalo mínimo entre ciclos intactos.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const runDueCampaigns = vi.fn(async () => ({
  dryRun: false, campaignsProcessed: 0, totalEligible: 0,
  totalSent: 0, totalFailed: 0, totalSkipped: 0, results: [],
}));
const recoverStuckSendingCampaigns = vi.fn(async () => ({
  recovered: 0, dryRun: false, campaignIds: [] as string[],
}));

vi.mock("@/services/crm/ScheduledCampaignRunnerService", () => ({
  ScheduledCampaignRunnerService: {
    get runDueCampaigns() { return runDueCampaigns; },
    get recoverStuckSendingCampaigns() { return recoverStuckSendingCampaigns; },
  },
}));

import { ScheduledCampaignScheduler } from "@/services/crm/ScheduledCampaignScheduler";

describe("ScheduledCampaignScheduler — tick de partida (deploy não custa 10 min de silêncio)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runDueCampaigns.mockClear();
    recoverStuckSendingCampaigns.mockClear();
    ScheduledCampaignScheduler.stop();
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    ScheduledCampaignScheduler.stop();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  // ── METADE 1 — a prova ──────────────────────────────────────────────────────

  it("o atraso de partida é MUITO menor que o intervalo — senão não adianta existir", () => {
    expect(ScheduledCampaignScheduler.bootTickDelayMs).toBeGreaterThan(0);
    expect(ScheduledCampaignScheduler.bootTickDelayMs).toBeLessThanOrEqual(60_000);
  });

  it("start() agenda o tick de partida, e ele roda o runner antes do 1º intervalo", async () => {
    ScheduledCampaignScheduler.start();
    expect(ScheduledCampaignScheduler.isActive()).toBe(true);
    expect(ScheduledCampaignScheduler.isBootTickPending()).toBe(true);

    // Nada roda no instante do boot — a folga existe pro processo subir.
    expect(runDueCampaigns).not.toHaveBeenCalled();

    // SABOTAGEM: sem o setTimeout de boot, nada teria rodado aqui — este avanço
    // é ordens de grandeza menor que os 10 min do setInterval.
    await vi.advanceTimersByTimeAsync(ScheduledCampaignScheduler.bootTickDelayMs);

    expect(runDueCampaigns).toHaveBeenCalledTimes(1);
    expect(recoverStuckSendingCampaigns).toHaveBeenCalledTimes(1);
    expect(ScheduledCampaignScheduler.isBootTickPending()).toBe(false);
  });

  it("o tick de partida usa o MESMO runner, sem dryRun e sem nenhuma exceção de segurança", async () => {
    ScheduledCampaignScheduler.start();
    await vi.advanceTimersByTimeAsync(ScheduledCampaignScheduler.bootTickDelayMs);

    // Nenhum argumento que afrouxe proteção: só dryRun:false + o limite do lote.
    const args = runDueCampaigns.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(args).toEqual({ dryRun: false, limit: expect.any(Number) });
    expect(Object.keys(args)).toEqual(["dryRun", "limit"]);
  });

  it("o intervalo de 10 min continua vivo depois do tick de partida", async () => {
    ScheduledCampaignScheduler.start();
    await vi.advanceTimersByTimeAsync(ScheduledCampaignScheduler.bootTickDelayMs);
    expect(runDueCampaigns).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(runDueCampaigns).toHaveBeenCalledTimes(2);
  });

  // ── METADE 2 — o contrário: onde ele NÃO pode rodar ─────────────────────────

  it("fora de produção não agenda tick nenhum — nem o de partida", async () => {
    vi.stubEnv("NODE_ENV", "development");
    ScheduledCampaignScheduler.start();

    expect(ScheduledCampaignScheduler.isActive()).toBe(false);
    expect(ScheduledCampaignScheduler.isBootTickPending()).toBe(false);

    await vi.advanceTimersByTimeAsync(11 * 60_000);
    expect(runDueCampaigns).not.toHaveBeenCalled();
  });

  it("stop() cancela o tick de partida pendente — nada roda depois de parar", async () => {
    ScheduledCampaignScheduler.start();
    expect(ScheduledCampaignScheduler.isBootTickPending()).toBe(true);

    ScheduledCampaignScheduler.stop();
    expect(ScheduledCampaignScheduler.isBootTickPending()).toBe(false);

    await vi.advanceTimersByTimeAsync(11 * 60_000);
    expect(runDueCampaigns).not.toHaveBeenCalled();
  });

  it("start() repetido é idempotente — não empilha um 2º tick de partida", async () => {
    ScheduledCampaignScheduler.start();
    ScheduledCampaignScheduler.start();
    ScheduledCampaignScheduler.start();

    await vi.advanceTimersByTimeAsync(ScheduledCampaignScheduler.bootTickDelayMs);
    expect(runDueCampaigns).toHaveBeenCalledTimes(1);
  });
});
