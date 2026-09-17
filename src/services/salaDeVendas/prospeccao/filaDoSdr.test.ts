/**
 * A FILA DO SDR — os oito baldes do documento, contados sem contar ninguém duas vezes.
 */

import { describe, it, expect } from "vitest";
import {
  ESTADOS_DA_FILA,
  contarFilaDoSdr,
  estadoDaFilaDoSdr,
  type EmpresaNaFila,
} from "./filaDoSdr";

const AGORA = new Date("2026-09-17T12:00:00Z");

const empresa = (p: Partial<EmpresaNaFila>): EmpresaNaFila => ({
  estagio: "PRONTA_PARA_SDR",
  contatos: [],
  leads: [],
  ...p,
});

const porteiro = (tipo: EmpresaNaFila["contatos"][number]["tipoDeGatekeeper"]) => ({
  ehDecisor: false,
  ehGatekeeper: true,
  tipoDeGatekeeper: tipo,
});

const decisor = { ehDecisor: true, ehGatekeeper: false, tipoDeGatekeeper: null };

describe("os estados que o documento pediu existem, todos", () => {
  it("são oito, com os rótulos do SDR Command Center", () => {
    expect(ESTADOS_DA_FILA.map((e) => e.estado)).toEqual([
      "REUNIAO",
      "ABORDAGEM_COMERCIAL",
      "FOLLOW_UP",
      "DECISOR_IDENTIFICADO",
      "FALANDO_COM_ATENDENTE",
      "GATEKEEPER",
      "SEM_CONTATO",
      "NOVOS_PROSPECTS",
    ]);
  });
});

describe("cada empresa cai em um balde só", () => {
  it("nunca abordada e pronta para o SDR: novos prospects", () => {
    expect(estadoDaFilaDoSdr(empresa({}), AGORA)).toBe("NOVOS_PROSPECTS");
  });

  it("abordada e calada: sem contato, não 'novo'", () => {
    const e = empresa({ leads: [{ stage: "PRIMEIRO_CONTATO", proximaAcaoEm: null, optOutAt: null }] });
    expect(estadoDaFilaDoSdr(e, AGORA)).toBe("SEM_CONTATO");
  });

  it("bot de pedidos respondendo: gatekeeper", () => {
    const e = empresa({ estagio: "GATEKEEPER", contatos: [porteiro("BOT_DE_PEDIDOS")] });
    expect(estadoDaFilaDoSdr(e, AGORA)).toBe("GATEKEEPER");
  });

  it("gente de verdade atendendo: falando com atendente", () => {
    const e = empresa({ estagio: "GATEKEEPER", contatos: [porteiro("RECEPCIONISTA")] });
    expect(estadoDaFilaDoSdr(e, AGORA)).toBe("FALANDO_COM_ATENDENTE");
  });

  it("decisor gravado e ninguém falou com ele ainda: decisor identificado", () => {
    const e = empresa({ estagio: "DECISOR_ENCONTRADO", contatos: [decisor] });
    expect(estadoDaFilaDoSdr(e, AGORA)).toBe("DECISOR_IDENTIFICADO");
  });

  it("decisor respondendo: abordagem comercial", () => {
    const e = empresa({
      estagio: "DECISOR_ENCONTRADO",
      contatos: [decisor],
      leads: [{ stage: "EM_QUALIFICACAO", proximaAcaoEm: null, optOutAt: null }],
    });
    expect(estadoDaFilaDoSdr(e, AGORA)).toBe("ABORDAGEM_COMERCIAL");
  });

  it("demo marcada ganha de tudo", () => {
    const e = empresa({
      estagio: "DECISOR_ENCONTRADO",
      contatos: [decisor],
      leads: [{ stage: "DEMO_AGENDADA", proximaAcaoEm: null, optOutAt: null }],
    });
    expect(estadoDaFilaDoSdr(e, AGORA)).toBe("REUNIAO");
  });

  it("hora de voltar a falar: follow-up", () => {
    const e = empresa({
      estagio: "GATEKEEPER",
      contatos: [porteiro("ATENDENTE")],
      leads: [{ stage: "PRIMEIRO_CONTATO", proximaAcaoEm: new Date(AGORA.getTime() - 1000), optOutAt: null }],
    });
    expect(estadoDaFilaDoSdr(e, AGORA)).toBe("FOLLOW_UP");
  });

  it("quem pediu silêncio não puxa a empresa para conversa nenhuma", () => {
    const e = empresa({
      estagio: "DECISOR_ENCONTRADO",
      contatos: [decisor],
      leads: [{ stage: "DEMO_AGENDADA", proximaAcaoEm: null, optOutAt: AGORA }],
    });
    expect(estadoDaFilaDoSdr(e, AGORA)).toBe("DECISOR_IDENTIFICADO");
  });
});

describe("a contagem", () => {
  const db = (linhas: EmpresaNaFila[]) =>
    ({
      empresa: { findMany: async () => linhas },
    }) as unknown as Parameters<typeof contarFilaDoSdr>[0];

  it("conta por estado e mostra o balde zerado também", async () => {
    const contagem = await contarFilaDoSdr(
      db([
        empresa({}),
        empresa({}),
        empresa({ estagio: "GATEKEEPER", contatos: [porteiro("BOT_DE_PEDIDOS")] }),
        empresa({ estagio: "DECISOR_ENCONTRADO", contatos: [decisor] }),
      ]),
      AGORA,
    );

    expect(contagem).toHaveLength(ESTADOS_DA_FILA.length);
    const total = (estado: string) => contagem.find((c) => c.estado === estado)?.total;
    expect(total("NOVOS_PROSPECTS")).toBe(2);
    expect(total("GATEKEEPER")).toBe(1);
    expect(total("DECISOR_IDENTIFICADO")).toBe(1);
    expect(total("REUNIAO")).toBe(0);
    expect(contagem.reduce((s, c) => s + c.total, 0)).toBe(4);
  });
});
