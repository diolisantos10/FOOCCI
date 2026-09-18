/**
 * A PROVA DA LIMPEZA. Três perguntas, e nenhuma delas é "o código roda":
 *
 *   1. o OPT-OUT sobrevive à limpeza;
 *   2. os leads de campanha (e as conversas deles) não são tocados;
 *   3. rodar duas vezes não quebra e não duplica o arquivo;
 *   4. e, fail-closed: cópia incompleta NÃO apaga.
 *
 * O banco aqui é de mentira, mas o CAMINHO é o de verdade — a função sob teste
 * é a mesma que a rota chama.
 */

import { describe, expect, it } from "vitest";
import { limparConversas } from "./limparConversas";

type Lead = {
  id: string;
  fonte: string;
  codigo: string | null;
  whatsappDigits: string | null;
  nome: string;
  whatsapp: string;
  optOutAt: Date | null;
  optOutCanal: string | null;
  lastContactedAt: Date | null;
  lastInteractionAt: Date | null;
  ultimaMensagemEm: Date | null;
  ultimaMensagemTexto: string | null;
  ultimaMensagemDeQuem: string | null;
  naoLidas: number;
  primeiraRespostaEm: Date | null;
  slaVenceEm: Date | null;
};

type Msg = { id: string; leadId: string; direcao: string; tipo: string; status: string; ocorreuEm: Date; createdAt: Date; texto: string | null };

function casa(registro: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [campo, cond] of Object.entries(where)) {
    if (campo === "OR") {
      const lista = cond as Record<string, unknown>[];
      if (!lista.some((c) => casa(registro, c))) return false;
      continue;
    }
    const valor = registro[campo];
    if (cond && typeof cond === "object") {
      const c = cond as Record<string, unknown>;
      if ("notIn" in c && (c.notIn as unknown[]).includes(valor)) return false;
      if ("in" in c && !(c.in as unknown[]).includes(valor)) return false;
      if ("not" in c && c.not === null && valor === null) return false;
    } else if (valor !== cond) {
      return false;
    }
  }
  return true;
}

function tabela<T extends Record<string, unknown>>(linhas: T[]) {
  return {
    linhas,
    count: async (args?: { where?: Record<string, unknown> }) =>
      linhas.filter((l) => casa(l, args?.where)).length,
    findMany: async (args?: { where?: Record<string, unknown>; take?: number; orderBy?: unknown; select?: unknown }) => {
      const achados = linhas.filter((l) => casa(l, args?.where));
      achados.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      return args?.take ? achados.slice(0, args.take) : achados;
    },
    deleteMany: async (args?: { where?: Record<string, unknown> }) => {
      const sobrar = linhas.filter((l) => !casa(l, args?.where));
      const count = linhas.length - sobrar.length;
      linhas.length = 0;
      linhas.push(...sobrar);
      return { count };
    },
    updateMany: async (args: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const l of linhas) {
        if (casa(l, args.where)) {
          Object.assign(l, args.data);
          count += 1;
        }
      }
      return { count };
    },
  };
}

function bancoDeMentira(opcoes: { arquivoQuebrado?: boolean } = {}) {
  const leads: Lead[] = [
    lead("frio-1", { optOutAt: new Date("2026-08-01"), optOutCanal: "whatsapp" }),
    lead("frio-2", {}),
    lead("frio-3", { optOutAt: new Date("2026-08-02"), optOutCanal: "whatsapp" }),
    lead("camp-1", { fonte: "CAMPANHA_PAGA", codigo: "HQ4YF", whatsappDigits: "5511900000001" }),
    lead("camp-2", { codigo: "337AN", whatsappDigits: "5511900000002" }),
  ];
  const mensagens: Msg[] = [
    msg("m1", "frio-1"),
    msg("m2", "frio-1"),
    msg("m3", "frio-2"),
    msg("m4", "frio-3"),
    msg("m5", "camp-1"),
    msg("m6", "camp-2"),
  ];
  const arquivadas: Record<string, unknown>[] = [];
  const t = {
    siteLead: tabela(leads as unknown as Record<string, unknown>[]),
    leadMensagem: {
      ...tabela(mensagens as unknown as Record<string, unknown>[]),
      findMany: async (args: { where?: Record<string, unknown>; take?: number }) => {
        const achados = mensagens
          .filter((l) => casa(l as unknown as Record<string, unknown>, args?.where))
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, args?.take ?? mensagens.length);
        return achados.map((m) => ({
          ...m,
          autor: null,
          autorUserId: null,
          waMessageId: null,
          templateNome: null,
          legenda: null,
          turnoId: null,
          papelDoAgente: null,
          origemDaFala: null,
          lead: leads.find((l) => l.id === m.leadId) ?? null,
        }));
      },
    },
    conversaArquivada: {
      ...tabela(arquivadas),
      createMany: async (args: { data: Record<string, unknown>[] }) => {
        if (opcoes.arquivoQuebrado) return { count: 0 };
        for (const d of args.data) {
          if (!arquivadas.some((a) => a.id === d.id)) arquivadas.push(d);
        }
        return { count: args.data.length };
      },
    },
    travaDaConversa: tabela([{ leadId: "frio-1" }, { leadId: "camp-1" }]),
    reabordagemExecucao: tabela([{ leadId: "frio-2" }, { leadId: "camp-2" }]),
    travaDeAbordagemEnviada: tabela([
      { telefoneDigits: "5511800000000" },
      { telefoneDigits: "5511900000001" },
    ]),
    travaDeAbordagemRitmo: tabela([
      { telefoneDigits: "5511800000000" },
      { telefoneDigits: "5511900000002" },
    ]),
    travaDeAbordagemRecusa: tabela([{ telefoneDigits: "5511800000000" }]),
  };
  return { db: t as never, leads, mensagens, arquivadas, t };
}

function lead(id: string, extra: Partial<Lead>): Lead {
  return {
    id,
    fonte: "FORMULARIO_DEMONSTRACAO",
    codigo: null,
    whatsappDigits: "5511800000000",
    nome: `Restaurante ${id}`,
    whatsapp: "+55 11 80000-0000",
    optOutAt: null,
    optOutCanal: null,
    lastContactedAt: new Date("2026-09-01"),
    lastInteractionAt: new Date("2026-09-01"),
    ultimaMensagemEm: new Date("2026-09-01"),
    ultimaMensagemTexto: "Olá, tudo bem?",
    ultimaMensagemDeQuem: "SAIDA",
    naoLidas: 3,
    primeiraRespostaEm: new Date("2026-09-01"),
    slaVenceEm: new Date("2026-09-02"),
    ...extra,
  };
}

function msg(id: string, leadId: string): Msg {
  return {
    id,
    leadId,
    direcao: "SAIDA",
    tipo: "TEXTO",
    status: "ENVIADA",
    ocorreuEm: new Date("2026-09-01"),
    createdAt: new Date("2026-09-01"),
    texto: "Olá, tudo bem?",
  };
}

describe("limpeza das conversas", () => {
  it("ensaio não escreve nada", async () => {
    const b = bancoDeMentira();
    const r = await limparConversas(b.db, {});
    expect(r.ensaio).toBe(true);
    expect(r.conversas.noAlvo).toBe(4);
    expect(r.conversas.apagadas).toBe(0);
    expect(b.mensagens).toHaveLength(6);
    expect(b.arquivadas).toHaveLength(0);
  });

  it("apaga as conversas, e o OPT-OUT sobrevive", async () => {
    const b = bancoDeMentira();
    const r = await limparConversas(b.db, { apagar: true, tamanhoDoLote: 2 });

    expect(r.conversas.apagadas).toBe(4);
    expect(r.preservado.optOuts).toBe(2);
    const comOptOut = b.leads.filter((l) => l.optOutAt !== null);
    expect(comOptOut).toHaveLength(2);
    expect(comOptOut.every((l) => l.optOutCanal === "whatsapp")).toBe(true);
    // O contato fica.
    expect(b.leads).toHaveLength(5);
  });

  it("não toca nos leads de campanha nem nas conversas deles", async () => {
    const b = bancoDeMentira();
    await limparConversas(b.db, { apagar: true });

    expect(b.mensagens.map((m) => m.id).sort()).toEqual(["m5", "m6"]);
    const camp = b.leads.find((l) => l.id === "camp-1")!;
    expect(camp.lastContactedAt).not.toBeNull();
    expect(camp.ultimaMensagemEm).not.toBeNull();
    expect(camp.naoLidas).toBe(3);
    // As travas dos telefones de campanha ficam de pé.
    expect(b.t.travaDeAbordagemEnviada.linhas).toEqual([{ telefoneDigits: "5511900000001" }]);
    expect(b.t.travaDeAbordagemRitmo.linhas).toEqual([{ telefoneDigits: "5511900000002" }]);
    expect(b.t.travaDaConversa.linhas).toEqual([{ leadId: "camp-1" }]);
    expect(b.t.reabordagemExecucao.linhas).toEqual([{ leadId: "camp-2" }]);
  });

  it("zera os contadores que barram a reabordagem", async () => {
    const b = bancoDeMentira();
    const r = await limparConversas(b.db, { apagar: true });
    const frio = b.leads.find((l) => l.id === "frio-1")!;
    expect(frio.lastContactedAt).toBeNull();
    expect(frio.ultimaMensagemEm).toBeNull();
    expect(frio.ultimaMensagemTexto).toBeNull();
    expect(frio.naoLidas).toBe(0);
    expect(r.zerados.contadoresDeContato).toBe(3);
    expect(r.zerados.travaRecusas).toBe(1);
  });

  it("grava a cópia antes de apagar, e a cópia tem o texto", async () => {
    const b = bancoDeMentira();
    await limparConversas(b.db, { apagar: true });
    expect(b.arquivadas).toHaveLength(4);
    expect(b.arquivadas[0]).toMatchObject({ texto: "Olá, tudo bem?", leadId: "frio-1" });
  });

  it("FAIL-CLOSED: cópia que não grava não apaga nada", async () => {
    const b = bancoDeMentira({ arquivoQuebrado: true });
    await expect(limparConversas(b.db, { apagar: true })).rejects.toThrow(/cópia incompleta/);
    expect(b.mensagens).toHaveLength(6);
  });

  it("rodar duas vezes não quebra nem duplica o arquivo", async () => {
    const b = bancoDeMentira();
    const um = await limparConversas(b.db, { apagar: true });
    const dois = await limparConversas(b.db, { apagar: true });
    expect(um.conversas.apagadas).toBe(4);
    expect(dois.conversas.apagadas).toBe(0);
    expect(b.arquivadas).toHaveLength(4);
    expect(dois.preservado.optOuts).toBe(2);
    expect(dois.faltaRodarDeNovo).toBe(false);
  });
});
