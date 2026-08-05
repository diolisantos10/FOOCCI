import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as routeModule from "./route";

const collectSample = vi.fn();
const runProbes = vi.fn();
const persistRun = vi.fn();
const getPreviousMetrics = vi.fn();

vi.mock("@/services/raiox/collect/RaioXCollector", () => ({ collectSample: (...a: unknown[]) => collectSample(...a) }));
vi.mock("@/services/raiox/RaioXService", () => ({ runProbes: (...a: unknown[]) => runProbes(...a) }));
vi.mock("@/services/raiox/persistence/RaioXStore", () => ({
  persistRun: (...a: unknown[]) => persistRun(...a),
  getPreviousMetrics: (...a: unknown[]) => getPreviousMetrics(...a),
}));

import { POST } from "./route";

const report = {
  runId: "rx_1",
  startedAt: new Date("2026-08-05T06:00:00.000Z"),
  finishedAt: new Date("2026-08-05T06:00:02.500Z"),
  probeIds: ["ia-custo"],
  findings: [{ id: 1 }, { id: 2 }],
  countsByStatus: { PASS: 1, WARNING: 1, FAIL: 0, UNKNOWN: 0 },
  countsBySeverity: { P0: 0, P1: 1, P2: 0, INFO: 1 },
  globalStatus: "WARNING",
  comparedToRunId: "rx_0",
  comparedToAt: new Date("2026-08-04T06:00:00.000Z"),
  unavailableBlocks: [{ block: "print", reason: "tempo esgotado após 20s" }],
};

function req(headers: Record<string, string> = {}) {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as unknown as Parameters<typeof POST>[0];
}

const OLD = process.env.CRON_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  collectSample.mockResolvedValue({ collectedAt: new Date() });
  runProbes.mockReturnValue(report);
  persistRun.mockResolvedValue("rx_persisted");
  getPreviousMetrics.mockResolvedValue({ runId: "rx_0", at: new Date(), metrics: { "ia-custo.chamadas": 10 } });
});
afterEach(() => { process.env.CRON_SECRET = OLD; });

describe("POST /api/cron/raiox/run — quem pode disparar", () => {
  it("sem Authorization: 401 e a coleta nem começa", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(collectSample).not.toHaveBeenCalled();
  });

  it("segredo errado: 401", async () => {
    const res = await POST(req({ authorization: "Bearer errado" }));
    expect(res.status).toBe(401);
    expect(collectSample).not.toHaveBeenCalled();
  });

  it("sem CRON_SECRET configurado: 503, e não roda às cegas", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ authorization: "Bearer qualquer" }));
    expect(res.status).toBe(503);
    expect(collectSample).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/raiox/run — execução", () => {
  it("coleta, avalia, persiste como CRON e devolve o resumo", async () => {
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(collectSample).toHaveBeenCalledTimes(1);
    expect(persistRun.mock.calls[0][1]).toEqual({ source: "CRON", triggeredBy: "cron" });
    expect(body).toMatchObject({ ok: true, runId: "rx_persisted", globalStatus: "WARNING", findingsCount: 2, durationMs: 2500 });
  });

  it("a base de comparação é buscada e repassada ao avaliador", async () => {
    await POST(req({ authorization: "Bearer s3cr3t" }));
    expect(getPreviousMetrics).toHaveBeenCalledTimes(1);
    expect(runProbes.mock.calls[0][1].previous.runId).toBe("rx_0");
  });

  it("o que a coleta NÃO conseguiu ler viaja na resposta — não é omitido", async () => {
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(body.unavailableBlocks).toEqual([{ block: "print", reason: "tempo esgotado após 20s" }]);
  });

  it("perder a base de comparação não cancela a noite: roda sem 'contra ontem'", async () => {
    getPreviousMetrics.mockRejectedValue(new Error("db lento"));
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    expect(res.status).toBe(200);
    expect(runProbes.mock.calls[0][1].previous).toBeNull();
  });

  it("falha ao persistir vira 500 explícito — nunca 200 silencioso", async () => {
    persistRun.mockRejectedValue(new Error("db down"));
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });
});

describe("POST /api/cron/raiox/run — superfície", () => {
  it("não expõe GET", () => {
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
    expect(typeof POST).toBe("function");
  });
});
