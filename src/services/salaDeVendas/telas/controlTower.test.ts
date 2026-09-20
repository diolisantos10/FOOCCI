/**
 * AS MEDIÇÕES DA CONTROL TOWER (peça 02).
 *
 * A pergunta destes testes não é "a soma está certa?" — é **"quando não há
 * fonte, o que sai?"**. Esta é tela de número, e o CEO decide dinheiro olhando
 * para ela: um zero onde deveria haver "não medido" é o defeito mais caro que
 * este repositório produz, e é ele que os testes abaixo caçam.
 *
 * Tudo roda contra `bancoDeProva`, que FILTRA de verdade pelo `where`. Um dublê
 * de resposta fixa faria a consulta errada passar — régua verde sobre o
 * componente errado, que é o engano que esta casa já nomeou.
 */

import { describe, it, expect } from "vitest";
import { bancoDeProva } from "../bancoDeProva";
import {
  ESPERA_QUE_ACENDE_MIN,
  duasConversoes,
  quentesSemDono,
  rankingDeVendedores,
  saudeDaFila,
  serieDeVolume,
  slaMedioDeResposta,
} from "./controlTower";

const AGORA = new Date("2026-09-19T12:00:00Z");
const DE = new Date("2026-09-12T00:00:00Z");
const ATE = new Date("2026-09-19T12:00:00Z");
const P = { de: DE, ate: ATE };

const MIN = 60_000;
const HORA = 3_600_000;

/** `as never` é o casting que os testes desta pasta já usam para o banco de prova. */
const db = (d: Parameters<typeof bancoDeProva>[0]) => bancoDeProva(d) as never;

function lead(id: string, extra: Record<string, unknown> = {}) {
  return { id, stage: "NOVO", atendidoPor: "NINGUEM", temperatura: null, createdAt: AGORA, scoreAt: null, atendenteUserId: null, ...extra };
}

describe("série do volume: a hora vazia é zero medido, e não some", () => {
  it("24 baldes sempre, mesmo com um lead só", async () => {
    const s = await serieDeVolume(
      db({ siteLead: [lead("a", { createdAt: new Date("2026-09-19T09:30:00Z") })] }),
      { agora: AGORA },
    );

    expect(s.pontos).toHaveLength(24);
    expect(s.pontos.reduce((t, p) => t + p.recebidos, 0)).toBe(1);
    // As 23 horas sem lead existem, valendo zero. Um gráfico que pulasse a hora
    // vazia desenharia um platô que não aconteceu.
    expect(s.pontos.filter((p) => p.recebidos === 0)).toHaveLength(23);
  });

  it("as duas séries não se contêm: o lead entra numa hora e é pontuado em outra", async () => {
    const s = await serieDeVolume(
      db({
        siteLead: [
          lead("a", {
            createdAt: new Date("2026-09-19T03:10:00Z"),
            scoreAt: new Date("2026-09-19T08:10:00Z"),
          }),
        ],
      }),
      { agora: AGORA },
    );

    const recebeu = s.pontos.find((p) => p.recebidos > 0)!;
    const pontuou = s.pontos.find((p) => p.qualificados > 0)!;
    expect(recebeu.instante).not.toBe(pontuou.instante);
    // E a tela recebe por escrito que "qualificado" é "a IA olhou".
    expect(s.comoSeMede.qualificados).toContain("scoreAt");
  });

  it("lead fora da janela não entra em balde nenhum", async () => {
    const s = await serieDeVolume(
      db({ siteLead: [lead("velho", { createdAt: new Date(AGORA.getTime() - 40 * HORA) })] }),
      { agora: AGORA },
    );
    expect(s.pontos.reduce((t, p) => t + p.recebidos, 0)).toBe(0);
  });
});

describe("saúde da fila: quem espera demais NÃO é uma fatia da rosca", () => {
  it("o total é só a soma das duas fatias que se excluem", async () => {
    const s = await saudeDaFila(
      db({
        siteLead: [
          lead("1", { atendidoPor: "IA" }),
          lead("2", { atendidoPor: "IA" }),
          lead("3", { atendidoPor: "AGUARDANDO_HUMANO" }),
        ],
        leadHandoff: [
          // Aberto há 30 min: acende.
          { id: "h1", leadId: "3", para: "HUMANO", aceitoEm: null, createdAt: new Date(AGORA.getTime() - 30 * MIN) },
          // Aberto há 2 min: ainda não.
          { id: "h2", leadId: "3", para: "HUMANO", aceitoEm: null, createdAt: new Date(AGORA.getTime() - 2 * MIN) },
          // Velho, mas já aceito: sai da conta.
          { id: "h3", leadId: "3", para: "HUMANO", aceitoEm: AGORA, createdAt: new Date(AGORA.getTime() - 90 * MIN) },
        ],
      }),
      AGORA,
    );

    expect(s.emAtendimento).toBe(2);
    expect(s.aguardandoVendedor).toBe(1);
    // ⚠️ 3, e não 4: somar `esperandoDemais` inventaria uma fila maior que a fila.
    expect(s.total).toBe(3);
    expect(s.esperandoDemais).toBe(1);
    expect(s.limiarMin).toBe(ESPERA_QUE_ACENDE_MIN);
  });
});

describe("leads quentes sem dono: o número vem com o seu denominador cego", () => {
  it("conta quente e prioridade máxima sem dono, e declara quem ninguém pontuou", async () => {
    const q = await quentesSemDono(
      db({
        siteLead: [
          lead("q1", { temperatura: "QUENTE" }),
          lead("q2", { temperatura: "PRIORIDADE_MAXIMA" }),
          // Quente, mas com dono: não conta.
          lead("q3", { temperatura: "QUENTE", atendidoPor: "HUMANO" }),
          // Quente e já fechado: fora dos estados ativos.
          lead("q4", { temperatura: "QUENTE", stage: "GANHO" }),
          lead("s1"),
          lead("s2"),
        ],
      }),
    );

    expect(q.quantos).toBe(2);
    // Sem este número, "2 quentes sem dono" se lê como "só há 2".
    // São 2: `s1` e `s2`. O lead GANHO sem temperatura não conta — o
    // denominador cego é da fila ATIVA, que é sobre quem ainda há o que fazer.
    expect(q.semScore).toBe(2);
  });
});

describe("as duas conversões: a trilha é o HISTÓRICO, não quem segura o lead agora", () => {
  it("lead sem nenhum handoff corre na trilha da IA; com handoff, na de gente", async () => {
    const leads = [
      // Seis na trilha da IA, dois ganhos.
      ...Array.from({ length: 6 }, (_, i) =>
        lead(`ia${i}`, { createdAt: new Date("2026-09-15T10:00:00Z"), stage: i < 2 ? "GANHO" : "NOVO" }),
      ),
      // Cinco na trilha de gente, um ganho.
      ...Array.from({ length: 5 }, (_, i) =>
        lead(`hu${i}`, { createdAt: new Date("2026-09-15T10:00:00Z"), stage: i < 1 ? "GANHO" : "NOVO" }),
      ),
    ];

    const c = await duasConversoes(
      db({
        siteLead: leads,
        leadHandoff: Array.from({ length: 5 }, (_, i) => ({
          id: `h${i}`,
          leadId: `hu${i}`,
          para: "HUMANO",
          aceitoEm: null,
          createdAt: new Date("2026-09-15T11:00:00Z"),
        })),
      }),
      P,
    );

    expect(c.ia.medido && c.ia.base).toBe(6);
    expect(c.agente.medido && c.agente.base).toBe(5);
    expect(c.ia.medido && Math.round(c.ia.valor * 100)).toBe(33);
    expect(c.agente.medido && Math.round(c.agente.valor * 100)).toBe(20);
  });

  it("⛔ amostra pequena NÃO vira porcentagem — 2 de 3 não é '67%'", async () => {
    const c = await duasConversoes(
      db({
        siteLead: [
          lead("a", { createdAt: new Date("2026-09-15T10:00:00Z"), stage: "GANHO" }),
          lead("b", { createdAt: new Date("2026-09-15T10:00:00Z"), stage: "GANHO" }),
          lead("c", { createdAt: new Date("2026-09-15T10:00:00Z") }),
        ],
        leadHandoff: [],
      }),
      P,
    );
    expect(c.ia.medido).toBe(false);
    expect(c.ia.medido === false && c.ia.motivo).toBe("amostraPequena");
  });

  it("sem lead nenhum na trilha, a recusa é 'semDados' — e nunca 0%", async () => {
    const c = await duasConversoes(db({ siteLead: [], leadHandoff: [] }), P);
    expect(c.ia.medido).toBe(false);
    expect(c.ia.medido === false && c.ia.motivo).toBe("semDados");
  });
});

describe("ranking de vendedores: SLA sai das respostas humanas, nunca de estimativa", () => {
  it("ordena por vendas, nomeia quem saiu e mede entrada→resposta por autor", async () => {
    const t0 = new Date("2026-09-15T10:00:00Z");
    const r = await rankingDeVendedores(
      db({
        siteLead: [
          lead("1", { createdAt: new Date("2026-09-15T10:00:00Z"), atendenteUserId: "u1", stage: "GANHO" }),
          lead("2", { createdAt: new Date("2026-09-15T10:00:00Z"), atendenteUserId: "u1" }),
          lead("3", { createdAt: new Date("2026-09-15T10:00:00Z"), atendenteUserId: "u2" }),
          // Atendente que não está mais no cadastro: a linha FICA.
          lead("4", { createdAt: new Date("2026-09-15T10:00:00Z"), atendenteUserId: "fantasma", stage: "GANHO" }),
        ],
        internalUser: [
          { id: "u1", nome: "Ana" },
          { id: "u2", nome: "Bruno" },
        ],
        leadMensagem: [
          { id: "m1", leadId: "1", direcao: "ENTRADA", createdAt: t0, autorUserId: null },
          { id: "m2", leadId: "1", direcao: "SAIDA", createdAt: new Date(t0.getTime() + 8 * MIN), autorUserId: "u1" },
          { id: "m3", leadId: "2", direcao: "ENTRADA", createdAt: t0, autorUserId: null },
          { id: "m4", leadId: "2", direcao: "SAIDA", createdAt: new Date(t0.getTime() + 22 * MIN), autorUserId: "u1" },
        ],
      }),
      P,
    );

    expect(r.linhas.map((l) => l.nome)).toEqual(["Ana", "(pessoa fora do cadastro)", "Bruno"]);
    expect(r.linhas[0]!.atendimentos).toBe(2);
    expect(r.linhas[0]!.vendas).toBe(1);

    expect(r.slaPorPessoa).toEqual({ medido: true, valor: { prazoMinutos: 30, pessoasComAmostra: 1 } });
    expect(r.linhas[0]!.sla).toEqual({ medido: true, valor: { minutos: 15, base: 2, dentroDoPrazo: 2 } });
    expect(r.linhas.find((l) => l.userId === "u2")!.sla.medido).toBe(false);
  });

  it("sem par entrada→saída humana continua não medido, nunca zero", async () => {
    const r = await rankingDeVendedores(
      db({
        siteLead: [lead("1", { createdAt: new Date("2026-09-15T10:00:00Z"), atendenteUserId: "u1" })],
        internalUser: [{ id: "u1", nome: "Ana" }],
      }),
      P,
    );
    expect(r.slaPorPessoa.medido).toBe(false);
    expect(r.linhas[0]!.sla.medido).toBe(false);
  });
});

describe("SLA médio: o tempo DA CASA responder, e não o do lead responder", () => {
  it("cronometra da primeira entrada até a primeira saída depois dela", async () => {
    const t0 = new Date("2026-09-15T10:00:00Z");
    const m = await slaMedioDeResposta(
      db({
        leadMensagem: [
          { id: "1", leadId: "a", direcao: "ENTRADA", createdAt: t0 },
          { id: "2", leadId: "a", direcao: "SAIDA", createdAt: new Date(t0.getTime() + 10 * MIN) },
          // Segunda resposta não conta: a média é da PRIMEIRA.
          { id: "3", leadId: "a", direcao: "SAIDA", createdAt: new Date(t0.getTime() + 90 * MIN) },
          { id: "4", leadId: "b", direcao: "ENTRADA", createdAt: t0 },
          { id: "5", leadId: "b", direcao: "SAIDA", createdAt: new Date(t0.getTime() + 20 * MIN) },
        ],
      }),
      P,
    );

    expect(m.medido).toBe(true);
    expect(m.medido && m.valor.minutos).toBe(15);
    expect(m.medido && m.valor.base).toBe(2);
  });

  it("⚠️ quem escreveu e nunca foi respondido fica FORA da média e DENTRO do relatório", async () => {
    const t0 = new Date("2026-09-15T10:00:00Z");
    const m = await slaMedioDeResposta(
      db({
        leadMensagem: [
          { id: "1", leadId: "a", direcao: "ENTRADA", createdAt: t0 },
          { id: "2", leadId: "a", direcao: "SAIDA", createdAt: new Date(t0.getTime() + 10 * MIN) },
          { id: "3", leadId: "mudo", direcao: "ENTRADA", createdAt: t0 },
        ],
      }),
      P,
    );

    // Se o mudo entrasse na média, o número seria inútil; se sumisse, a média
    // melhoraria justamente quando a casa para de responder.
    expect(m.medido && m.valor.minutos).toBe(10);
    expect(m.medido && m.valor.semResposta).toBe(1);
  });

  it("uma saída ANTES da primeira entrada não conta como resposta", async () => {
    const t0 = new Date("2026-09-15T10:00:00Z");
    const m = await slaMedioDeResposta(
      db({
        leadMensagem: [
          // A casa abordou primeiro; o lead só respondeu depois. Não há SLA aqui.
          { id: "1", leadId: "a", direcao: "SAIDA", createdAt: t0 },
          { id: "2", leadId: "a", direcao: "ENTRADA", createdAt: new Date(t0.getTime() + 30 * MIN) },
        ],
      }),
      P,
    );
    expect(m.medido).toBe(false);
    expect(m.medido === false && m.motivo).toContain("nenhum foi respondido");
  });

  it("⛔ sem mensagem nenhuma, a recusa é escrita — e nunca '0m'", async () => {
    const m = await slaMedioDeResposta(db({ leadMensagem: [] }), P);
    expect(m.medido).toBe(false);
    expect(m.medido === false && m.motivo).toContain("não há o que cronometrar");
  });
});
