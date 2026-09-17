/**
 * A CONTAGEM POR ESTADO FECHA COM O TOTAL ANALISADO.
 *
 * ── POR QUE ESTA SOMA É A PROVA QUE IMPORTA ─────────────────────────────────
 *
 * As filas do plano se sobrepõem de propósito (quem tem proposta parada também
 * precisa de follow-up). `porEstado` é a outra leitura: cada contato conta UMA
 * vez, no estado dele. Se a soma dos catorze baldes não bater com
 * `contatosAnalisados`, ou algum contato caiu em dois baldes, ou algum sumiu —
 * e as duas formas de errar produzem um painel que parece certo.
 *
 * `limiteAtingido` tem o mesmo peso: sem ele, uma leitura truncada devolve um
 * piso vestido de total, e ninguém na tela consegue distinguir.
 */

import { describe, it, expect } from "vitest";
import { montarPlanoDoDia, contagemZeradaPorEstado } from "./planoDoDia";

const AGORA = new Date("2026-09-17T12:00:00.000Z");
const DIA = 86_400_000;
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * DIA);

type Linha = Record<string, unknown>;

function lead(p: Linha = {}): Linha {
  return {
    id: "lead-x",
    nome: "Restaurante",
    stage: "EM_QUALIFICACAO",
    temperatura: null,
    score: null,
    optOutAt: null,
    lastContactedAt: null,
    primeiraRespostaEm: null,
    ultimaMensagemEm: null,
    ultimaMensagemDeQuem: null,
    propostas: [],
    compromissos: [],
    oportunidades: [],
    ...p,
  };
}

const bancoFalso = (leads: Linha[]) =>
  ({ siteLead: { findMany: async () => leads }, cliente: { findMany: async () => [] } }) as never;

const soma = (r: Record<string, number>) => Object.values(r).reduce((s, n) => s + n, 0);

describe("porEstado — cada contato conta uma vez, e a soma fecha", () => {
  const base = [
    lead({ id: "calou", optOutAt: diasAtras(1) }),
    lead({ id: "ganhou", stage: "GANHO" }),
    lead({ id: "perdeu", stage: "PERDIDO" }),
    lead({ id: "sumiu", primeiraRespostaEm: diasAtras(40), ultimaMensagemEm: diasAtras(20), ultimaMensagemDeQuem: "ENTRADA" }),
    lead({
      id: "proposta",
      stage: "PROPOSTA_ENVIADA",
      propostas: [{ situacao: "ENVIADA", valorMensalCent: 50_000, enviadaEm: diasAtras(10), respondidaEm: null, updatedAt: diasAtras(10) }],
    }),
  ];

  it("a soma dos catorze baldes é o total de contatos analisados", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(base), { agora: AGORA });
    expect(plano.contatosAnalisados).toBe(base.length);
    expect(soma(plano.porEstado)).toBe(plano.contatosAnalisados);
  });

  it("os catorze baldes existem sempre, mesmo com a base vazia", async () => {
    const plano = await montarPlanoDoDia(bancoFalso([]), { agora: AGORA });
    expect(Object.keys(plano.porEstado).sort()).toEqual(Object.keys(contagemZeradaPorEstado()).sort());
    expect(soma(plano.porEstado)).toBe(0);
  });

  it("os não medidos aparecem no balde NAO_MEDIDO, e não repartidos entre os outros", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(base), { agora: AGORA });
    expect(plano.porEstado.NAO_MEDIDO).toBe(plano.naoMedidos);
  });

  it("cada contato caiu no balde certo", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(base), { agora: AGORA });
    expect(plano.porEstado.PEDIU_SILENCIO).toBe(1);
    expect(plano.porEstado.VIROU_CLIENTE).toBe(1);
    expect(plano.porEstado.VENDA_PERDIDA).toBe(1);
    expect(plano.porEstado.PROPOSTA_PARADA).toBe(1);
  });

  it("limiteAtingido é falso quando a base cabe, e verdadeiro quando ela estoura", async () => {
    expect((await montarPlanoDoDia(bancoFalso(base), { agora: AGORA })).limiteAtingido).toBe(false);
    expect((await montarPlanoDoDia(bancoFalso(base), { agora: AGORA, limite: 5 })).limiteAtingido).toBe(true);
  });
});
