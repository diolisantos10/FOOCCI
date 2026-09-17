/**
 * A CENTRAL DE ATENDIMENTO, medida contra um banco que FILTRA de verdade.
 *
 * ── A PERGUNTA OBRIGATÓRIA ──────────────────────────────────────────────────
 *
 * *O teste alcança o código que responde ao usuário?* Alcança: cada número é
 * montado com linhas de verdade no `bancoDeProva`, que responde `count`,
 * `findMany` e `groupBy` aplicando o `where` que o serviço mandou. Um dublê que
 * devolvesse 42 para qualquer consulta faria estes testes passarem com a
 * consulta errada — a régua verde sobre o componente errado.
 *
 * E a tela é medida no HTML gerado, não em props: `renderToStaticMarkup` do
 * componente real, com a Central saída do serviço real. Se a tela passar a
 * mostrar uma constante no lugar do dado, o número do serviço muda e o HTML não
 * — e o teste reprova.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrismaClient } from "@prisma/client";

import { bancoDeProva } from "./bancoDeProva";
import {
  montarCentralDeAtendimento,
  esperaDe,
  TETO_DA_ESPERA,
} from "./centralDeAtendimento";
import {
  CentralDeAtendimentoView,
  CentralComErro,
  duracaoHumana,
  frasesDaEspera,
} from "@/app/comercial/(area)/atendimento/CentralDeAtendimentoView";

const AGORA = new Date("2026-09-17T12:00:00.000Z");

function banco(dados: Parameters<typeof bancoDeProva>[0]) {
  return bancoDeProva(dados) as unknown as PrismaClient;
}

function lead(id: string, campos: Record<string, unknown> = {}) {
  return {
    id,
    nome: `Lead ${id}`,
    whatsapp: "5511987654321",
    restaurante: `Restaurante ${id}`,
    cidade: "São Paulo",
    stage: "PRIMEIRO_CONTATO",
    atendidoPor: "NINGUEM",
    atendenteUserId: null,
    prioritario: false,
    optOutAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    slaVenceEm: null,
    primeiraRespostaEm: null,
    proximaAcaoEm: new Date("2026-12-01T00:00:00.000Z"),
    lastInteractionAt: null,
    ultimaMensagemEm: null,
    empresaId: null,
    ...campos,
  };
}

describe("⭐ esperaDe — a única conta do arquivo, e o zero que ela recusa", () => {
  it("sem última mensagem: NÃO devolve zero, devolve 'não medido'", () => {
    expect(esperaDe(null, AGORA)).toEqual({ medido: false, motivo: "semMensagem" });
  });

  it("com última mensagem: minutos de verdade", () => {
    const e = esperaDe(new Date("2026-09-17T09:30:00.000Z"), AGORA);
    expect(e).toEqual({ medido: true, minutos: 150 });
  });

  it("mensagem no futuro (relógio torto) vira 0, nunca negativo", () => {
    const e = esperaDe(new Date("2026-09-17T13:00:00.000Z"), AGORA);
    expect(e.medido && e.minutos).toBe(0);
  });
});

describe("⭐⭐ montarCentralDeAtendimento — os números saem do banco", () => {
  it("conta quem é IA, quem é humano, quem aguarda e quem não tem dono", async () => {
    const db = banco({
      siteLead: [
        lead("a", { atendidoPor: "IA" }),
        lead("b", { atendidoPor: "IA" }),
        lead("c", { atendidoPor: "HUMANO", atendenteUserId: "u1" }),
        lead("d", { atendidoPor: "AGUARDANDO_HUMANO" }),
        lead("e", { atendidoPor: "NINGUEM" }),
        // GANHO sai da conta de conversa viva — é venda feita, não fila.
        lead("f", { atendidoPor: "IA", stage: "GANHO" }),
      ],
    });

    const c = await montarCentralDeAtendimento(db, AGORA);

    expect(c.quemAtende).toEqual({ ia: 2, humano: 1, aguardandoHumano: 1, ninguem: 1 });
  });

  it("⛔ a lista de espera vem ORDENADA do mais antigo, e o teto é respeitado", async () => {
    const db = banco({
      siteLead: [
        lead("novo", {
          atendidoPor: "AGUARDANDO_HUMANO",
          ultimaMensagemEm: new Date("2026-09-17T11:50:00.000Z"),
        }),
        lead("antigo", {
          atendidoPor: "AGUARDANDO_HUMANO",
          ultimaMensagemEm: new Date("2026-09-17T08:00:00.000Z"),
        }),
        lead("meio", {
          atendidoPor: "AGUARDANDO_HUMANO",
          ultimaMensagemEm: new Date("2026-09-17T10:00:00.000Z"),
        }),
      ],
    });

    const c = await montarCentralDeAtendimento(db, AGORA);

    expect(c.esperandoHaMaisTempo.map((l) => l.leadId)).toEqual(["antigo", "meio", "novo"]);
    expect(c.esperandoHaMaisTempo[0]!.espera).toEqual({ medido: true, minutos: 240 });
  });

  it("lead esperando SEM mensagem registrada: 'não medido', nunca 0 min", async () => {
    const db = banco({
      siteLead: [lead("mudo", { atendidoPor: "AGUARDANDO_HUMANO", ultimaMensagemEm: null })],
    });

    const c = await montarCentralDeAtendimento(db, AGORA);

    expect(c.esperandoHaMaisTempo[0]!.espera).toEqual({ medido: false, motivo: "semMensagem" });
  });

  it("o teto corta a lista (e nunca passa de 50)", async () => {
    const muitos = Array.from({ length: 30 }, (_, i) =>
      lead(`l${i}`, {
        atendidoPor: "AGUARDANDO_HUMANO",
        ultimaMensagemEm: new Date(AGORA.getTime() - i * 60_000),
      }),
    );
    const db = banco({ siteLead: muitos });

    expect((await montarCentralDeAtendimento(db, AGORA)).esperandoHaMaisTempo).toHaveLength(
      TETO_DA_ESPERA,
    );
    expect((await montarCentralDeAtendimento(db, AGORA, { teto: 5 })).esperandoHaMaisTempo).toHaveLength(5);
    expect(
      (await montarCentralDeAtendimento(db, AGORA, { teto: 900 })).esperandoHaMaisTempo.length,
    ).toBeLessThanOrEqual(30);
  });

  it("base vazia: as filas vêm zeradas e a espera vem NÃO MEDIDA", async () => {
    const c = await montarCentralDeAtendimento(banco({}), AGORA);

    expect(c.filas.aguardandoHumano).toBe(0);
    // ⭐ Aqui está a diferença que a tela precisa: sem handoff aberto não há
    // espera para medir — e isso NÃO é "espera de zero minuto".
    expect(c.espera).toEqual({ medido: false, motivo: "nenhumAberto" });
    expect(c.time.semCadastro).toBe(true);
  });

  it("⭐ a espera por gente sai dos handoffs ABERTOS, com o mais antigo dando o relógio", async () => {
    const db = banco({
      leadHandoff: [
        {
          id: "h1",
          leadId: "a",
          aceitoEm: null,
          para: "HUMANO",
          createdAt: new Date("2026-09-17T10:00:00.000Z"),
        },
        {
          id: "h2",
          leadId: "b",
          aceitoEm: null,
          para: "AGUARDANDO_HUMANO",
          createdAt: new Date("2026-09-17T11:00:00.000Z"),
        },
        // Já aceito: não conta. Se contasse, a fila nunca esvaziaria.
        {
          id: "h3",
          leadId: "c",
          aceitoEm: new Date("2026-09-17T09:00:00.000Z"),
          para: "HUMANO",
          createdAt: new Date("2026-09-16T00:00:00.000Z"),
        },
      ],
    });

    const c = await montarCentralDeAtendimento(db, AGORA);

    expect(c.espera).toEqual({ medido: true, handoffsAbertos: 2, maiorEsperaMin: 120 });
  });

  it("⭐ a carga por atendente sai do time E da contagem de leads dele", async () => {
    const db = banco({
      internalUser: [
        {
          id: "u1",
          nome: "Maria",
          isActive: true,
          disponibilidade: { estado: "DISPONIVEL", capacidade: 10, vistoEm: AGORA },
        },
        {
          id: "u2",
          nome: "João",
          isActive: true,
          disponibilidade: { estado: "OCUPADO", capacidade: 5, vistoEm: AGORA },
        },
        // Sem disponibilidade cadastrada: fora do painel do time.
        { id: "u3", nome: "Fantasma", isActive: true, disponibilidade: null },
      ],
      siteLead: [
        lead("1", { atendidoPor: "HUMANO", atendenteUserId: "u1" }),
        lead("2", { atendidoPor: "HUMANO", atendenteUserId: "u1" }),
        lead("3", { atendidoPor: "HUMANO", atendenteUserId: "u2" }),
        // GANHO não é carga: já fechou.
        lead("4", { atendidoPor: "HUMANO", atendenteUserId: "u2", stage: "GANHO" }),
      ],
    });

    const c = await montarCentralDeAtendimento(db, AGORA);

    expect(c.time.semCadastro).toBe(false);
    expect(c.time.sdrs.map((s) => [s.nome, s.carga])).toEqual([
      ["Maria", 2],
      ["João", 1],
    ]);
    expect(c.time.porEstado.DISPONIVEL).toBe(1);
    expect(c.time.porEstado.OCUPADO).toBe(1);
  });

  it("⭐ a fila do SDR traz TODOS os baldes, inclusive os zerados", async () => {
    const db = banco({
      empresa: [{ id: "e1", estagio: "GATEKEEPER", contatos: [], leads: [] }],
    });

    const c = await montarCentralDeAtendimento(db, AGORA);

    expect(c.filaDoSdr).toHaveLength(8);
    expect(c.filaDoSdr.find((f) => f.estado === "GATEKEEPER")!.total).toBe(1);
    expect(c.filaDoSdr.find((f) => f.estado === "REUNIAO")!.total).toBe(0);
  });
});

describe("⭐⭐ A TELA — o HTML que o usuário recebe vem do serviço", () => {
  async function html(dados: Parameters<typeof bancoDeProva>[0]) {
    const c = await montarCentralDeAtendimento(banco(dados), AGORA);
    return renderToStaticMarkup(React.createElement(CentralDeAtendimentoView, { c }));
  }

  it("⛔⛔ o número da tela MUDA quando o banco muda — não é constante", async () => {
    const comUm = await html({
      siteLead: [lead("a", { atendidoPor: "AGUARDANDO_HUMANO" })],
    });
    const comTres = await html({
      siteLead: [
        lead("a", { atendidoPor: "AGUARDANDO_HUMANO" }),
        lead("b", { atendidoPor: "AGUARDANDO_HUMANO" }),
        lead("c", { atendidoPor: "AGUARDANDO_HUMANO" }),
      ],
    });

    expect(comUm).not.toBe(comTres);
    expect(comTres).toContain(">3<");
  });

  it("o nome e o restaurante de quem espera aparecem, com link para a conversa", async () => {
    const saida = await html({
      siteLead: [
        lead("lead-42", {
          nome: "Ana Silva",
          restaurante: "Sushi House",
          atendidoPor: "AGUARDANDO_HUMANO",
          ultimaMensagemEm: new Date("2026-09-17T09:00:00.000Z"),
        }),
      ],
    });

    expect(saida).toContain("Ana Silva");
    expect(saida).toContain("Sushi House");
    expect(saida).toContain("/comercial/conversas?leadId=lead-42");
    // 180 minutos, escritos como gente lê.
    expect(saida).toContain("3 h");
  });

  it("⛔ sem mensagem registrada, a tela ESCREVE 'não medido' — e não '0 min'", async () => {
    const saida = await html({
      siteLead: [lead("x", { atendidoPor: "AGUARDANDO_HUMANO", ultimaMensagemEm: null })],
    });

    expect(saida).toContain("não medido");
    expect(saida).not.toContain("0 min");
  });

  it("⛔ time sem cadastro: a tela diz que NÃO MEDIU, e não que está tudo offline", async () => {
    const saida = await html({});

    expect(saida).toContain("ninguém registrou disponibilidade");
    expect(saida).toContain("Ninguém aguardando atendimento humano");
  });

  it("sem handoff aberto, a tela nega a espera em vez de estampar zero minuto", async () => {
    const saida = await html({ siteLead: [lead("a", { atendidoPor: "IA" })] });
    expect(saida).toContain("nenhuma passagem aberta");
  });

  it("o estado de ERRO é uma tela própria, e não uma tela de zeros", () => {
    const saida = renderToStaticMarkup(
      React.createElement(CentralComErro, { detalhe: "connection refused" }),
    );
    expect(saida).toContain("não pôde ser montada");
    expect(saida).toContain("connection refused");
  });
});

describe("os formatadores da tela", () => {
  it("duracaoHumana", () => {
    expect(duracaoHumana(0)).toBe("0 min");
    expect(duracaoHumana(59)).toBe("59 min");
    expect(duracaoHumana(60)).toBe("1 h");
    expect(duracaoHumana(200)).toBe("3 h 20 min");
  });

  it("frasesDaEspera nunca devolve um número quando não há medição", () => {
    expect(frasesDaEspera({ medido: false, motivo: "semMensagem" })).toContain("não medido");
    expect(frasesDaEspera({ medido: true, minutos: 90 })).toBe("1 h 30 min");
  });
});
