/**
 * Provas do seed automático de deploy. As duas que a tarefa exige, e que são
 * exatamente as duas que custam caro se estiverem erradas:
 *
 *   1. **A falha do seed NÃO derruba o boot.** Em nenhum caminho — banco fora,
 *      recusa conhecida, erro estranho — esta função lança. O site sobe sem a
 *      padaria em vez de não subir.
 *   2. **A geração de fotos NUNCA regera o que já tem imagem.** O disparo
 *      automático é sempre `regerar: false`, por escrito. Este é o caminho que
 *      roda sem ninguém olhando: ele não pode gastar duas vezes.
 *
 * O `FoocciBakeryService` é substituído aqui de propósito — o que está sendo
 * testado é a ORQUESTRAÇÃO de deploy. O comportamento do serviço em si (não
 * duplicar, não refazer foto existente) tem prova própria em
 * `FoocciBakeryService.test.ts`, contra um banco de mentira.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const seedBakery = vi.fn();
const startBakeryImageJob = vi.fn();
const hasOpenAiKey = vi.fn();
const getBakeryOverview = vi.fn();

vi.mock("./FoocciBakeryService", async (importOriginal) => {
  // O erro é o REAL: a tradução "NADA_A_FAZER é caminho feliz" é justamente uma
  // das coisas em teste. Mocká-lo testaria o mock.
  const real = await importOriginal<typeof import("./FoocciBakeryService")>();
  return {
    ...real,
    seedBakery: (...a: unknown[]) => seedBakery(...a),
    startBakeryImageJob: (...a: unknown[]) => startBakeryImageJob(...a),
    hasOpenAiKey: () => hasOpenAiKey(),
    getBakeryOverview: () => getBakeryOverview(),
  };
});

import { BakeryOperationError } from "./FoocciBakeryService";
import { runBakerySelfSeed } from "./bakerySelfSeed";

const SEED_OK = {
  restaurantCreated: true,
  categoriesCreated: 7,
  categoriesUpdated: 0,
  itemsCreated: 40,
  itemsUpdated: 0,
  itemsWithoutImage: 40,
};

const TRABALHO = { id: "job-1", total: 40, custoEstimadoUsd: 1.6 };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FOOCCI_BAKERY_SELF_SEED;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  seedBakery.mockResolvedValue(SEED_OK);
  startBakeryImageJob.mockResolvedValue(TRABALHO);
  hasOpenAiKey.mockReturnValue(true);
  getBakeryOverview.mockResolvedValue({ semFoto: 40 });
});

// ─── 1. O boot não cai ────────────────────────────────────────────────────────

describe("a falha do seed não derruba o boot", () => {
  it("banco fora: devolve FALHOU com o motivo em vez de lançar", async () => {
    seedBakery.mockRejectedValue(
      new BakeryOperationError("SEM_BANCO", "DATABASE_URL vazia.", { detalhe: "interno" }),
    );

    const r = await runBakerySelfSeed();

    expect(r.seed.estado).toBe("FALHOU");
    expect(r.seed.mensagem).toContain("SEM_BANCO");
    // Sem cardápio não há o que fotografar — e nada foi cobrado.
    expect(r.fotos.estado).toBe("NAO_TENTADA");
    expect(startBakeryImageJob).not.toHaveBeenCalled();
  });

  it("erro inesperado e feio (nem Error é): ainda assim não lança", async () => {
    seedBakery.mockRejectedValue("o banco explodiu de um jeito novo");

    const r = await runBakerySelfSeed();

    expect(r.seed.estado).toBe("FALHOU");
    expect(r.seed.mensagem).toContain("explodiu");
  });

  it("falha na hora de disparar as fotos não contamina o cardápio já semeado", async () => {
    startBakeryImageJob.mockRejectedValue(new Error("a OpenAI recusou a chave"));

    const r = await runBakerySelfSeed();

    expect(r.seed.estado).toBe("OK");
    expect(r.fotos.estado).toBe("FALHOU");
    expect(r.fotos.mensagem).toContain("recusou a chave");
  });

  it("a evidência da falha vai para o registro, não para o resultado silencioso", async () => {
    const erro = new BakeryOperationError("BANCO_RECUSOU", "O banco recusou.", { sql: "..." });
    seedBakery.mockRejectedValue(erro);

    await runBakerySelfSeed();

    // Guardrail 6: quem lê o log do deploy vê o caso concreto.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("o cardápio NÃO foi semeado"),
      expect.objectContaining({ evidencia: { sql: "..." } }),
    );
  });
});

// ─── 2. As fotos não são refeitas ─────────────────────────────────────────────

describe("as fotos nunca são regeradas pelo caminho automático", () => {
  it("dispara sempre com regerar: false — quem já tem foto não é tocado", async () => {
    await runBakerySelfSeed();

    expect(startBakeryImageJob).toHaveBeenCalledTimes(1);
    expect(startBakeryImageJob).toHaveBeenCalledWith(
      expect.objectContaining({ confirmar: true, regerar: false }),
    );
  });

  it("com tudo já fotografado, o deploy seguinte não gasta nada", async () => {
    // A partir do segundo deploy este é o caminho NORMAL — e não é falha.
    startBakeryImageJob.mockRejectedValue(
      new BakeryOperationError("NADA_A_FAZER", "Todos os itens do cardápio já têm foto."),
    );

    const r = await runBakerySelfSeed();

    expect(r.seed.estado).toBe("OK");
    expect(r.fotos.estado).toBe("NADA_A_FAZER");
    expect(r.fotos.aGerar).toBe(0);
    expect(r.fotos.custoEstimadoUsd).toBe(0);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("sem OPENAI_API_KEY: registra e segue, sem lançar e sem estado de erro", async () => {
    hasOpenAiKey.mockReturnValue(false);

    const r = await runBakerySelfSeed();

    expect(r.seed.estado).toBe("OK");
    expect(r.fotos.estado).toBe("SEM_CHAVE");
    expect(startBakeryImageJob).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("sem OPENAI_API_KEY"),
      expect.objectContaining({ itensSemFoto: 40 }),
    );
  });

  it("o disparo devolve o controle na hora: quantas foram geradas é registrado no fim", async () => {
    const r = await runBakerySelfSeed();

    expect(r.fotos.estado).toBe("INICIADA");
    expect(r.fotos.aGerar).toBe(40);
    expect(r.fotos.jobId).toBe("job-1");

    // O aviso de encerramento existe e é o que registra o total sem ninguém
    // olhando a tela do admin.
    const opcoes = startBakeryImageJob.mock.calls[0]![0] as { onSettled: (j: unknown) => void };
    expect(typeof opcoes.onSettled).toBe("function");

    opcoes.onSettled({
      id: "job-1",
      status: "CONCLUIDO",
      geradas: 40,
      puladas: 0,
      falhas: [],
      custoEstimadoUsd: 1.6,
      erroFatal: null,
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("geração de fotos encerrada"),
      expect.objectContaining({ geradas: 40, puladas: 0 }),
    );
  });
});

// ─── 3. A chave de desligar ───────────────────────────────────────────────────

describe("chave de desligamento", () => {
  it("FOOCCI_BAKERY_SELF_SEED=off para tudo sem tocar em nada", async () => {
    process.env.FOOCCI_BAKERY_SELF_SEED = "off";

    const r = await runBakerySelfSeed();

    expect(r.seed.estado).toBe("DESLIGADO");
    expect(seedBakery).not.toHaveBeenCalled();
    expect(startBakeryImageJob).not.toHaveBeenCalled();
  });

  it("variável ausente = LIGADO — ausência de informação não é informação", async () => {
    const r = await runBakerySelfSeed();
    expect(r.seed.estado).toBe("OK");
  });
});

// ─── 4. A fiação com o deploy ─────────────────────────────────────────────────

describe("scripts/start-production.sh chama o passo", () => {
  const sh = readFileSync(join(process.cwd(), "scripts/start-production.sh"), "utf8");

  it("dispara a rota de self-seed com o segredo de admin", () => {
    expect(sh).toContain("/api/admin/demo-bakery/self-seed");
    expect(sh).toContain("x-admin-secret: ${ADMIN_SECRET}");
  });

  it("roda em segundo plano e não pode segurar nem quebrar o `next start`", () => {
    // O subshell termina com `) &`: o boot não espera por ele. E o `|| echo 000`
    // impede que uma falha do curl vire status de saída de erro.
    expect(sh).toMatch(/self-seed[\s\S]*?\)\s*&/);
    expect(sh).toMatch(/self-seed[\s\S]*?\|\| echo "000"/);
    expect(sh.indexOf("demo-bakery/self-seed")).toBeLessThan(sh.indexOf("npx next start"));
  });

  it("sem ADMIN_SECRET, apenas registra e segue", () => {
    expect(sh).toContain("[bakery-sync] ADMIN_SECRET not set");
  });
});
