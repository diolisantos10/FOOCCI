/**
 * ⭐⭐⭐ A RÉGUA DA CORRENTE D-105 — do cargo Tier 1 até o Portão de IA.
 *
 * Ordem do CEO, 24/09/2026: *"já liga toda a empresa no cofre. A gente vai usar
 * só uma chave. Controle e contenção de gastos."*
 *
 * ── ⛔ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA REPROVAR ─────────────────────
 *
 * Medido em 24/09, com tudo "pronto" no código: o cargo `whatsapp` estava
 * apontado para `claude-opus-5` (Tier 1) e **o cliente do restaurante era
 * atendido por `gpt-4o-mini`**. Nenhuma das duas metades estava errada sozinha:
 * o roteador só listava CLAUDE quando havia `ANTHROPIC_API_KEY` no ambiente
 * DESTE produto, e D-105 manda que essa variável não exista aqui. Duas regras
 * certas produzindo, juntas, o motor pequeno no cliente ao vivo — e passando em
 * qualquer revisão de código, porque cada arquivo lido isolado parecia correto.
 *
 * ⚠️ É o defeito D-003 da casa na forma dele mais cara: **a caixa existia, a
 * seta não**. Por isso as provas abaixo são sobre a CORRENTE — o roteador
 * escolhendo, o dispatcher despachando —, e não sobre cada peça sozinha.
 *
 * ⛔ Nada aqui chama IA nem gasta um centavo: o `fetch` é dublê.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configuredProviders, selectEngine } from "./AIEngineRouter";
import { portaoDeIaConfigurado, callControlRoom, VARIAVEIS_DO_PORTAO } from "./ControlRoomEngineAdapter";
import { callStructuredJson } from "./EngineDispatcher";
import { FalhaDeMotor } from "./FalhaDeMotor";
import type { AIEngineSelection } from "./AIEngineTypes";

/** ⭐ O ambiente que D-105 desenha: portão configurado e NENHUMA chave de laboratório. */
const AMBIENTE_D105 = {
  OPENAI_API_KEY: "sk-openai-teste",
  CONTROL_ROOM_IA_URL: "https://control-room.exemplo/api/ia/chamada",
  CONTROL_ROOM_IA_SEGREDO: "segredo-do-produto-foocci",
  CONTROL_ROOM_IA_CRACHA: "dioli.foocci.atendimento.whatsapp",
} as unknown as NodeJS.ProcessEnv;

const SELECAO_CLAUDE: AIEngineSelection = {
  provider: "CLAUDE",
  model: "claude-opus-5",
  reason: "teste",
  fallbackProvider: "MOCK",
};

describe("D-105 — o cargo Tier 1 chega ao motor certo SEM chave neste produto", () => {
  it("⛔ com o portão configurado e SEM ANTHROPIC_API_KEY, o WhatsApp recebe claude-opus-5", () => {
    const escolha = selectEngine("whatsapp", { env: AMBIENTE_D105 });

    expect(AMBIENTE_D105.ANTHROPIC_API_KEY).toBeUndefined();
    expect(
      escolha.provider,
      "O portão de IA está configurado, logo o laboratório É alcançável. Se esta linha " +
        "falhou com OPENAI, o roteador voltou a exigir a chave do laboratório dentro da " +
        "Foocci — que é exatamente o que D-105 proíbe, e o motivo de o cliente do Sushi " +
        "Cazza ter sido atendido por gpt-4o-mini.",
    ).toBe("CLAUDE");
    expect(escolha.model).toBe("claude-opus-5");
    expect(configuredProviders(AMBIENTE_D105)).toContain("CLAUDE");
  });

  it("⚠️ sem o portão E sem chave, a queda para o motor pequeno é DECLARADA, nunca calada", () => {
    const semNada = selectEngine("whatsapp", {
      env: { OPENAI_API_KEY: "sk-openai-teste" } as unknown as NodeJS.ProcessEnv,
    });
    expect(semNada.provider).toBe("OPENAI");
    expect(semNada.reason).toContain("não configurado");
  });

  it("uma das três variáveis faltando NÃO liga o portão pela metade", () => {
    for (const faltante of VARIAVEIS_DO_PORTAO) {
      const incompleto = { ...AMBIENTE_D105 } as Record<string, string | undefined>;
      delete incompleto[faltante];
      expect(
        portaoDeIaConfigurado(incompleto as unknown as NodeJS.ProcessEnv),
        `sem ${faltante} o portão não está configurado`,
      ).toBe(false);
      expect(configuredProviders(incompleto as unknown as NodeJS.ProcessEnv)).not.toContain("CLAUDE");
    }
  });
});

describe("D-105 — a Foocci não lê mais a chave do laboratório do próprio ambiente", () => {
  it("⛔ o CÓDIGO do caminho do portão não lê ANTHROPIC_API_KEY (comentário pode citar)", () => {
    // ⚠️ Os comentários CITAM a variável de propósito — é assim que quem lê o
    // arquivo amanhã entende o que mudou e por quê. O que não pode voltar é a
    // LEITURA. Por isso a varredura roda sobre o código com os comentários
    // removidos: uma régua que proíbe a palavra proibiria a explicação.
    const semComentarios = (fonte: string): string =>
      fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    for (const arquivo of ["ControlRoomEngineAdapter.ts"]) {
      const codigo = semComentarios(readFileSync(join(__dirname, arquivo), "utf8"));
      expect(
        /ANTHROPIC_API_KEY/.test(codigo),
        `${arquivo} voltou a ler a chave do laboratório do ambiente da Foocci. A chave da ` +
          "companhia é uma só e fica na Control Room (D-105) — ela não viaja.",
      ).toBe(false);
    }
  });

  it("⛔ a chamada ao portão NÃO carrega chave de laboratório em cabeçalho nem em corpo", async () => {
    const anterior = { ...process.env };
    Object.assign(process.env, AMBIENTE_D105);
    delete process.env.ANTHROPIC_API_KEY;

    let visto: { url: string; init: RequestInit } | null = null;
    const fetchFalso = vi.fn(async (url: unknown, init: unknown) => {
      visto = { url: String(url), init: init as RequestInit };
      return new Response(JSON.stringify({ atendido: true, texto: '{"ok":true}' }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchFalso);

    try {
      const texto = await callControlRoom({
        selection: SELECAO_CLAUDE,
        systemPrompt: "você é o atendente",
        userContent: "quero dois temakis",
      });
      expect(texto).toBe('{"ok":true}');
    } finally {
      vi.unstubAllGlobals();
      process.env = anterior as NodeJS.ProcessEnv;
    }

    const enviado = JSON.stringify(visto);
    // ⛔ "sk-ant-" é o prefixo das chaves da Anthropic. Se ele aparecer no que
    // sai deste processo, a chave voltou a viajar.
    expect(/sk-ant-/i.test(enviado)).toBe(false);
    expect(/anthropic_api_key/i.test(enviado)).toBe(false);
    // ⭐ E o crachá de quem pediu VAI junto — é o "controle e contenção" do CEO:
    // gasto sem dono é gasto que ninguém consegue cobrar de ninguém.
    expect(enviado).toContain("dioli.foocci.atendimento.whatsapp");
  });
});

describe("D-105 — a degradação: o cliente nunca fica pendurado", () => {
  beforeEach(() => {
    Object.assign(process.env, AMBIENTE_D105);
  });
  afterEach(() => {
    for (const v of VARIAVEIS_DO_PORTAO) delete process.env[v];
    vi.unstubAllGlobals();
  });

  it("portão mudo vira FalhaDeMotor('timeout') — e NUNCA uma espera sem fim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const e = new Error("The operation was aborted due to timeout");
        e.name = "TimeoutError";
        throw e;
      }),
    );
    await expect(callControlRoom({
      selection: SELECAO_CLAUDE,
      systemPrompt: "s",
      userContent: "u",
    })).rejects.toMatchObject({ name: "FalhaDeMotor", motivo: "timeout" });
  });

  it("portão fora do ar vira FalhaDeMotor('erro_de_rede'), com o motivo nomeado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("fetch failed"); }));
    const erro = await callControlRoom({
      selection: SELECAO_CLAUDE,
      systemPrompt: "s",
      userContent: "u",
    }).catch((e) => e);
    expect(erro).toBeInstanceOf(FalhaDeMotor);
    expect((erro as FalhaDeMotor).motivo).toBe("erro_de_rede");
  });

  it("recusa do portão (teto do dia) vira falha nomeada, e ⛔ sem retentativa em laço", async () => {
    const fetchFalso = vi.fn(async () =>
      new Response(
        JSON.stringify({ atendido: false, codigo: "teto_do_dia", motivo: "teto diário atingido" }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchFalso);
    await expect(callControlRoom({
      selection: SELECAO_CLAUDE,
      systemPrompt: "s",
      userContent: "u",
    })).rejects.toBeInstanceOf(FalhaDeMotor);
    // ⛔ UMA chamada. Retentativa cega contra um portão caído transforma uma
    // indisponibilidade em uma tempestade.
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});

describe("D-105 — a SETA, e não só a caixa: o dispatcher despacha pelo portão", () => {
  afterEach(() => {
    for (const v of VARIAVEIS_DO_PORTAO) delete process.env[v];
    vi.unstubAllGlobals();
  });

  it("⛔ com o portão configurado, CLAUDE sai pela Control Room e NÃO pelo SDK da Anthropic", async () => {
    Object.assign(process.env, AMBIENTE_D105);
    delete process.env.ANTHROPIC_API_KEY;

    const fetchFalso = vi.fn(async () =>
      new Response(JSON.stringify({ atendido: true, texto: '{"pedido":"ok"}' }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchFalso);

    const saida = await callStructuredJson({
      selection: SELECAO_CLAUDE,
      systemPrompt: "atendente",
      userContent: "um uramaki",
    });

    expect(saida).toBe('{"pedido":"ok"}');
    // A prova de que foi pelo PORTÃO: o destino da chamada é a Control Room.
    expect(String(fetchFalso.mock.calls[0]?.[0])).toBe(AMBIENTE_D105.CONTROL_ROOM_IA_URL);
  });
});
