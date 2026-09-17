/**
 * O COPILOTO — o motor de IA vai DUBLADO.
 *
 * Nenhum teste desta bateria gasta uma chamada de API. `MotorDoCopiloto` existe
 * justamente para isso: o serviço recebe `selecionar` e `chamar` por parâmetro e
 * usa os de produção só quando ninguém passa nada.
 *
 * Um teste que chamasse a OpenAI de verdade seria lento, caro e — o pior —
 * **não determinístico**: ele reprovaria por o modelo ter escrito outra frase, e
 * aí alguém aprenderia a rodar de novo até passar. Portão que reprova por sorte
 * não barra nada.
 */

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  lerComOCopiloto,
  limparLeitura,
  montarTranscricao,
  montarContexto,
  INSTRUCAO,
  INTENCOES,
  OBJECOES,
  TURNOS_LIDOS,
  EXPLICACAO_DA_FALHA,
  type TurnoLido,
} from "./copiloto";
import type { AIEngineSelection } from "@/services/brain/engines/AIEngineTypes";
import type { StructuredCallInput } from "@/services/brain/engines/EngineAdapter";

const MOTOR_OPENAI: AIEngineSelection = {
  provider: "OPENAI",
  model: "gpt-4o-mini",
  reason: "teste",
  fallbackProvider: "MOCK",
};

const MOTOR_MOCK: AIEngineSelection = {
  provider: "MOCK",
  model: "mock",
  reason: "nenhum provider configurado",
};

const CONVERSA: TurnoLido[] = [
  { deQuem: "cliente", texto: "Oi, vi o anúncio de vocês. Como funciona?" },
  { deQuem: "foocci", texto: "Oi! A Foocci organiza o pedido e a gestão do seu restaurante." },
  { deQuem: "cliente", texto: "Eu já uso outro sistema e achei meio caro isso aí" },
];

const RESPOSTA_BOA = JSON.stringify({
  resumo: "Dono de restaurante veio de anúncio, já usa outro sistema e achou caro.",
  intencao: "COMPARANDO_CONCORRENTE",
  confianca: 72,
  objecoes: [
    { codigo: "JA_TEM_SISTEMA", detalhe: "Eu já uso outro sistema" },
    { codigo: "PRECO", detalhe: "achei meio caro isso aí" },
  ],
  proximaAcao: "Perguntar qual sistema ele usa hoje e o que mais incomoda nele.",
  sugestoes: [
    { angulo: "entender o hoje", texto: "Qual sistema você usa hoje?" },
    { angulo: "abrir a dor", texto: "O que mais te irrita no sistema de agora?" },
  ],
});

function motorQueDevolve(texto: string) {
  return {
    selecionar: vi.fn(async () => MOTOR_OPENAI),
    // Tipado com a entrada real para o teste conseguir INSPECIONAR o que foi
    // mandado ao modelo — é o que prova a temperatura e o teto de tokens.
    chamar: vi.fn(async (_entrada: StructuredCallInput & { selection: AIEngineSelection }) => texto),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("o copiloto lê a conversa", () => {
  it("devolve resumo, intenção com confiança, objeções e sugestões", async () => {
    const motor = motorQueDevolve(RESPOSTA_BOA);
    const r = await lerComOCopiloto(CONVERSA, {}, motor);

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.leitura.resumo).toContain("anúncio");
    expect(r.leitura.intencao).toBe("COMPARANDO_CONCORRENTE");
    expect(r.leitura.rotuloDaIntencao).toBe("comparando com outro sistema");
    expect(r.leitura.confianca).toBe(72);
    expect(r.leitura.objecoes.map((o) => o.codigo)).toEqual(["JA_TEM_SISTEMA", "PRECO"]);
    expect(r.leitura.sugestoes).toHaveLength(2);
    expect(r.leitura.turnosLidos).toBe(3);
    expect(r.leitura.motor).toBe("OPENAI/gpt-4o-mini");
  });

  it("a objeção carrega a FRASE do cliente que a sustenta", async () => {
    const motor = motorQueDevolve(RESPOSTA_BOA);
    const r = await lerComOCopiloto(CONVERSA, {}, motor);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Sem a frase, "objeção de preço" é impressão do modelo — e impressão vira
    // relatório errado sobre o que nos derruba.
    expect(r.leitura.objecoes[1]?.detalhe).toBe("achei meio caro isso aí");
  });

  it("objeção fora do vocabulário vira OUTRA sem perder a frase", () => {
    const leitura = limparLeitura(
      JSON.stringify({
        resumo: "resumo",
        intencao: "QUER_PRECO",
        confianca: 50,
        objecoes: [{ codigo: "MEU_CACHORRO_MORREU", detalhe: "não é hora agora" }],
        sugestoes: [],
      }),
      { turnosLidos: 2, motor: "OPENAI/x" },
    );

    expect(leitura?.objecoes[0]?.codigo).toBe("OUTRA");
    // A frase original é justamente a objeção NOVA — é a que interessa descobrir.
    expect(leitura?.objecoes[0]?.detalhe).toBe("não é hora agora");
  });

  it("intenção fora da lista fechada vira OUTRA", () => {
    const leitura = limparLeitura(
      JSON.stringify({ resumo: "r", intencao: "QUER_UM_ABRACO", confianca: 10, sugestoes: [] }),
      { turnosLidos: 1, motor: "m" },
    );
    expect(leitura?.intencao).toBe("OUTRA");
  });

  it("confiança fora da faixa é presa na faixa, não zerada", () => {
    const alto = limparLeitura(
      JSON.stringify({ resumo: "r", intencao: "OUTRA", confianca: 180, sugestoes: [] }),
      { turnosLidos: 1, motor: "m" },
    );
    const baixo = limparLeitura(
      JSON.stringify({ resumo: "r", intencao: "OUTRA", confianca: -5, sugestoes: [] }),
      { turnosLidos: 1, motor: "m" },
    );
    expect(alto?.confianca).toBe(100);
    expect(baixo?.confianca).toBe(0);
  });

  it("lista de objeções vazia é resposta legítima", async () => {
    const motor = motorQueDevolve(
      JSON.stringify({
        resumo: "Só perguntou o horário.",
        intencao: "QUER_CONHECER",
        confianca: 40,
        objecoes: [],
        sugestoes: [{ angulo: "responder", texto: "Abrimos das 9h às 18h." }],
      }),
    );
    const r = await lerComOCopiloto(CONVERSA, {}, motor);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.leitura.objecoes).toEqual([]);
  });

  it("no máximo 3 sugestões chegam à tela", () => {
    const leitura = limparLeitura(
      JSON.stringify({
        resumo: "r",
        intencao: "OUTRA",
        confianca: 10,
        sugestoes: [1, 2, 3, 4, 5].map((n) => ({ angulo: `a${n}`, texto: `t${n}` })),
      }),
      { turnosLidos: 1, motor: "m" },
    );
    expect(leitura?.sugestoes).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o copiloto falha com motivo, e nunca lança", () => {
  it("sem provider configurado devolve semMotor — não uma leitura vazia", async () => {
    const r = await lerComOCopiloto(
      CONVERSA,
      {},
      { selecionar: async () => MOTOR_MOCK, chamar: vi.fn() },
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.causa).toBe("semMotor");
    // A tela precisa dizer que falta CHAVE, e não que a conversa não tem sinal.
    expect(EXPLICACAO_DA_FALHA.semMotor).toContain("sem motor de IA");
  });

  it("sem provider configurado o motor NEM É CHAMADO", async () => {
    const chamar = vi.fn();
    await lerComOCopiloto(CONVERSA, {}, { selecionar: async () => MOTOR_MOCK, chamar });
    expect(chamar).not.toHaveBeenCalled();
  });

  it("conversa vazia não vira chamada de IA", async () => {
    const chamar = vi.fn();
    const r = await lerComOCopiloto([], {}, { selecionar: async () => MOTOR_OPENAI, chamar });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.causa).toBe("semConversa");
    expect(chamar).not.toHaveBeenCalled();
  });

  it("motor que lança vira motorFalhou, não exceção", async () => {
    const r = await lerComOCopiloto(
      CONVERSA,
      {},
      {
        selecionar: async () => MOTOR_OPENAI,
        chamar: async () => {
          throw new Error("401 sem chave");
        },
      },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.causa).toBe("motorFalhou");
      expect(r.detalhe).toBe("401 sem chave");
    }
  });

  it("motor lento estoura o teto e a tela não trava", async () => {
    const r = await lerComOCopiloto(
      CONVERSA,
      {},
      {
        selecionar: async () => MOTOR_OPENAI,
        chamar: () => new Promise<string>((resolver) => setTimeout(() => resolver("{}"), 500)),
        limiteMs: 20,
      },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.causa).toBe("demorouDemais");
  });

  it("JSON quebrado vira respostaIlegivel", async () => {
    const r = await lerComOCopiloto(CONVERSA, {}, motorQueDevolve("{isto não é json"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.causa).toBe("respostaIlegivel");
  });

  it("resposta sem resumo é recusada — painel com sugestão e sem resumo é a IA falando antes de entender", () => {
    const leitura = limparLeitura(
      JSON.stringify({ intencao: "QUER_PRECO", confianca: 90, sugestoes: [{ texto: "oi" }] }),
      { turnosLidos: 3, motor: "m" },
    );
    expect(leitura).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o que vai ao modelo", () => {
  it("a transcrição corta pelos últimos turnos, não pelos primeiros", () => {
    const muitos: TurnoLido[] = Array.from({ length: TURNOS_LIDOS + 5 }, (_, i) => ({
      deQuem: i % 2 === 0 ? ("cliente" as const) : ("foocci" as const),
      texto: `turno ${i}`,
    }));

    const t = montarTranscricao(muitos);
    expect(t).not.toContain("turno 0");
    expect(t).toContain(`turno ${TURNOS_LIDOS + 4}`);
    expect(t.split("\n")).toHaveLength(TURNOS_LIDOS);
  });

  it("turno em branco não vira linha", () => {
    expect(montarTranscricao([{ deQuem: "cliente", texto: "   " }])).toBe("");
  });

  it("⛔ campo ausente NÃO vira 'não informado' no contexto", () => {
    const contexto = montarContexto({ nomeDoLead: "Ana", cidade: null, score: null });
    expect(contexto).toContain("Nome: Ana");
    expect(contexto).not.toContain("Cidade");
    expect(contexto).not.toContain("Lead score");
    expect(contexto).not.toMatch(/não informado/i);
  });

  it("ficha inteiramente vazia se anuncia como vazia", () => {
    expect(montarContexto({})).toContain("nenhum dado de ficha registrado");
  });

  it("a instrução proíbe citar preço e inventar promessa", () => {
    expect(INSTRUCAO).toMatch(/NUNCA cite preço/);
    expect(INSTRUCAO).toMatch(/Nunca prometa/);
    // O formato precisa listar o vocabulário fechado, ou o modelo inventa nome.
    for (const i of INTENCOES) expect(INSTRUCAO).toContain(i);
    for (const o of OBJECOES) expect(INSTRUCAO).toContain(o);
  });

  it("a chamada usa JSON e temperatura baixa", async () => {
    const motor = motorQueDevolve(RESPOSTA_BOA);
    await lerComOCopiloto(CONVERSA, { nomeDoLead: "Ana" }, motor);

    const entrada = motor.chamar.mock.calls[0]![0];
    expect(entrada.responseFormat).toBe("json");
    expect(entrada.temperature).toBeLessThanOrEqual(0.5);
    // Teto existe: sem ele, uma conversa longa vira conta aberta.
    expect(entrada.maxTokens).toBeGreaterThan(0);
    expect(entrada.userContent).toContain("Nome: Ana");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O CONTRATO DA TELA — lido do fonte, porque é ele que garante a regra
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = path.resolve(__dirname, "../../..");
const ler = (relativo: string) => fs.readFileSync(path.join(RAIZ, relativo), "utf8");

/**
 * O fonte SEM comentários.
 *
 * ⚠️ Necessário, e a razão é instrutiva: estes arquivos EXPLICAM, em comentário,
 * que não enviam mensagem — e citam pelo nome as funções que não usam
 * (`registrarSaida`, `entregarMensagem`). Uma busca por texto cru acharia a
 * explicação e reprovaria justamente o arquivo que está certo.
 *
 * O que o teste precisa medir é CÓDIGO. Prosa sobre o que não se faz é prosa.
 */
const lerCodigo = (relativo: string) =>
  ler(relativo)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("⛔ 'Usar sugestão' NÃO ENVIA", () => {
  const PAINEL = "src/app/comercial/(area)/conversas/PainelDoCopiloto.tsx";
  const DADOS = "src/app/comercial/(area)/conversas/_copiloto.ts";
  const ROTA = "src/app/api/admin/sala-de-vendas/copiloto/route.ts";

  it("o painel do copiloto não importa nada que envie mensagem", () => {
    const codigo = lerCodigo(PAINEL);
    expect(ler(PAINEL)).toContain("Usar sugestão");
    // `escrever` é a função de `_dados.ts` que grava e manda entregar.
    expect(codigo).not.toMatch(/\bescrever\b/);
    expect(codigo).not.toContain("ROTA_CONVERSA");
    expect(codigo).not.toContain("sala-de-vendas/conversa");
  });

  it("a ponta de dados do copiloto só fala com a rota do copiloto", () => {
    const codigo = lerCodigo(DADOS);
    expect(codigo).toContain('ROTA_COPILOTO = "/api/admin/sala-de-vendas/copiloto"');
    expect(codigo).not.toContain("sala-de-vendas/conversa");
  });

  it("a rota do copiloto não sabe enviar nem entregar", () => {
    const codigo = lerCodigo(ROTA);
    expect(codigo).not.toContain("registrarSaida");
    expect(codigo).not.toContain("entregarMensagem");
    expect(codigo).not.toContain("leadMensagem.create");
  });

  it("o botão só chama `aoUsarSugestao`, que escreve no rascunho", () => {
    const fonte = ler(PAINEL);
    expect(fonte).toContain("onClick={() => aoUsarSugestao(s.texto)}");
  });

  it("na tela, `aoUsarSugestao` só mexe no texto e no painel visível", () => {
    const tela = ler("src/app/comercial/(area)/conversas/AtendimentoClient.tsx");
    const trecho = tela.slice(tela.indexOf("aoUsarSugestao={(t)"));
    const corpo = trecho.slice(0, trecho.indexOf("}}") + 2);
    expect(corpo).toContain("setTexto(t)");
    expect(corpo).not.toContain("mandar");
    expect(corpo).not.toContain("escrever(");
  });

  it("a tela diz ao vendedor, por escrito, que nada sai sozinho", () => {
    expect(ler(PAINEL)).toMatch(/Nada sai daqui sem\s+você ler e apertar enviar/);
  });
});
