import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";

process.env.ENCRYPTION_KEY = "a".repeat(64);

const linhas = new Map<string, Record<string, unknown>>();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    produtoNoCofre: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => linhas.get(where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { linhas.set(data.id as string, { ...data }); return data; }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const l = { ...(linhas.get(where.id) ?? {}), ...data }; linhas.set(where.id, l); return l;
      }),
    },
  },
}));

import { obterOuCriarSegredo, solicitarPareamento, hashDoSegredo, __esquecerSegredoEmCache } from "./pareamento";
import { executarTextoNoCofre, abrirChamadoNaManutencao, FalhaDoCofre } from "./portaDoCofre";

const resposta = (status: number, corpo: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => corpo }) as unknown as Response;

describe("pareamento — o Foocci gera e guarda o próprio segredo", () => {
  beforeEach(() => { linhas.clear(); __esquecerSegredoEmCache(); delete process.env.CONTROL_ROOM_CENTRO_CUSTO_ID; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("gera 32 bytes em hex, guarda CIFRADO e devolve sempre o mesmo", async () => {
    const s = await obterOuCriarSegredo();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
    const linha = linhas.get("foocci")!;
    expect(String(linha.segredoCifrado)).not.toContain(s);
    expect(linha.hash).toBe(createHash("sha256").update(s).digest("hex"));
    __esquecerSegredoEmCache();
    expect(await obterOuCriarSegredo()).toBe(s); // relido e decifrado do banco
  });

  it("o pedido de pareamento leva SÓ o hash — o segredo nunca sai", async () => {
    const segredo = await obterOuCriarSegredo();
    const fetchMock = vi.fn(async () => resposta(202, { ok: true, status: "pendente" }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await solicitarPareamento();

    expect(r).toEqual({ ok: true, status: "pendente", http: 202 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/ai\/pareamento\/solicitar$/);
    const corpo = JSON.parse(String(init.body));
    expect(corpo).toEqual({ produto: "foocci", hash: hashDoSegredo(segredo), origem: "boot do serviço, produção" });
    expect(String(init.body)).not.toContain(segredo);
    expect(JSON.stringify(init.headers)).not.toContain(segredo);
    expect(linhas.get("foocci")!.status).toBe("pendente");
  });

  it("Control Room fora do ar não derruba nada: volta o motivo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const r = await solicitarPareamento();
    expect(r.ok).toBe(false);
  });
});

describe("porta do cofre — IA e chamados com o segredo pareado", () => {
  beforeEach(() => { linhas.clear(); __esquecerSegredoEmCache(); process.env.CONTROL_ROOM_CENTRO_CUSTO_ID = "11111111-1111-1111-1111-111111111111"; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("texto pela porta oficial, com X-Service-Token e sem laboratório direto", async () => {
    const segredo = await obterOuCriarSegredo();
    const fetchMock = vi.fn(async () => resposta(200, { ok: true, resultado: { sucesso: true, conteudo: " Temos sim! " } }));
    vi.stubGlobal("fetch", fetchMock);

    const t = await executarTextoNoCofre({ papel: "dioli.foocci.atendimento.garcom", mensagens: [{ role: "user", content: "tem temaki?" }] });

    expect(t).toBe("Temos sim!");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/ai\/gateway\/execute$/);
    expect(url).not.toMatch(/openai|anthropic|googleapis/);
    expect((init.headers as Record<string, string>)["x-service-token"]).toBe(segredo);
    const corpo = JSON.parse(String(init.body));
    expect(corpo.escopo).toEqual({ holdingId: "dioli", productId: "foocci" });
    expect(corpo.modalidade).toBe("text");
    expect(corpo.mensagens).toEqual([{ role: "user", content: "tem temaki?" }]);
  });

  it("pareamento ainda não aprovado (401) vira falha nomeada, não chave própria", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(401, { erro: "X-Service-Token inválido" })));
    await expect(executarTextoNoCofre({ papel: "x", mensagens: [{ role: "user", content: "oi" }] }))
      .rejects.toMatchObject({ motivo: "nao_pareado" });
  });

  it("sem o centro de custo do Foocci, nem tenta (falha nomeada)", async () => {
    delete process.env.CONTROL_ROOM_CENTRO_CUSTO_ID;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const e = await executarTextoNoCofre({ papel: "x", mensagens: [{ role: "user", content: "oi" }] }).catch((x) => x);
    expect(e).toBeInstanceOf(FalhaDoCofre);
    expect(e.motivo).toBe("nao_configurado");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("chamado na Manutenção: 201 → aberto; recusa → motivo, nunca lança", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(201, { ok: true, chamadoId: "ch_1" })));
    expect(await abrirChamadoNaManutencao({ descricao: "Instagram mudo", gravidade: "critico" }))
      .toEqual({ aberto: true, chamadoId: "ch_1" });
    vi.stubGlobal("fetch", vi.fn(async () => resposta(401, { erro: "token desconhecido" })));
    const r = await abrirChamadoNaManutencao({ descricao: "x", gravidade: "normal" });
    expect(r.aberto).toBe(false);
  });
});
