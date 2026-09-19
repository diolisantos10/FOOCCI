/**
 * AS CAIXAS DE CONVERSA, medidas contra um banco que FILTRA de verdade.
 *
 * ── A PERGUNTA OBRIGATÓRIA: o teste alcança o código que responde ao usuário? ─
 *
 * Alcança. As contagens da coluna esquerda saem de `montarCentralDeConversas`
 * com linhas de verdade no `bancoDeProva`, que aplica o `where` que o serviço
 * mandou. Um dublê que devolvesse 7 para qualquer consulta faria estes testes
 * passarem com a caixa errada — a régua verde sobre o componente errado.
 *
 * O que está medido aqui, e é o que o desenho 03 cobra:
 *   1. cada caixa conta a população que o nome dela promete;
 *   2. "Pagamento pendente" NÃO conta zero — ela devolve `null` e o motivo;
 *   3. os canais somam sobre a MESMA população das caixas (quem tem mensagem);
 *   4. o escopo da sessão entra no `where`: o SDR não vê a carteira dos outros.
 */

import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { SessaoInterna } from "@/lib/internal-auth";

import { bancoDeProva } from "./bancoDeProva";
import {
  montarCentralDeConversas,
  filtroDaCaixa,
  canalDaFonte,
  CAIXAS,
  CANAIS,
  type NomeDaCaixa,
} from "./caixasDeConversa";

const AGORA = new Date("2026-09-19T12:00:00.000Z");

function banco(dados: Parameters<typeof bancoDeProva>[0]) {
  return bancoDeProva(dados) as unknown as PrismaClient;
}

const CEO: SessaoInterna = {
  userId: "u-ceo",
  nome: "CEO",
  role: "MASTER_CEO",
  gerencia: [],
} as unknown as SessaoInterna;

const SDR: SessaoInterna = {
  userId: "u-sdr",
  nome: "SDR",
  role: "AGENTE_HUMANO",
  gerencia: [],
} as unknown as SessaoInterna;

function lead(id: string, campos: Record<string, unknown> = {}) {
  return {
    id,
    nome: `Lead ${id}`,
    whatsapp: "5511987654321",
    restaurante: `Restaurante ${id}`,
    cidade: "São Paulo",
    stage: "PRIMEIRO_CONTATO",
    temperatura: null,
    atendidoPor: "NINGUEM",
    atendenteUserId: null,
    prioritario: false,
    fonte: "FORMULARIO_DEMONSTRACAO",
    proximaAcaoEm: null,
    ultimaMensagemEm: new Date("2026-09-18T10:00:00.000Z"),
    ultimaMensagemTexto: "oi",
    ultimaMensagemDeQuem: "ENTRADA",
    naoLidas: 0,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    ...campos,
  };
}

/** Uma mensagem, que é o que faz um contato virar CONVERSA. */
function msg(leadId: string) {
  return { id: `m-${leadId}`, leadId, direcao: "ENTRADA" };
}

function totalDa(
  caixas: Array<{ nome: NomeDaCaixa; total: number | null }>,
  nome: NomeDaCaixa,
): number | null {
  return caixas.find((c) => c.nome === nome)!.total;
}

describe("as oito caixas contam o que o nome delas promete", () => {
  it("cada caixa pega a sua população, e só a dela", async () => {
    const db = banco({
      siteLead: [
        lead("novo", { stage: "NOVO" }),
        lead("quente", { temperatura: "QUENTE" }),
        lead("prioridade", { temperatura: "PRIORIDADE_MAXIMA" }),
        lead("frio", { temperatura: "FRIO" }),
        lead("aguardando", { ultimaMensagemDeQuem: "SAIDA" }),
        lead("follow", { proximaAcaoEm: new Date("2026-09-25T10:00:00.000Z") }),
        lead("ganho", { stage: "GANHO" }),
        lead("perdido", { stage: "PERDIDO" }),
        lead("meu", { atendenteUserId: "u-ceo", atendidoPor: "HUMANO" }),
      ],
      leadMensagem: [
        msg("novo"), msg("quente"), msg("prioridade"), msg("frio"),
        msg("aguardando"), msg("follow"), msg("ganho"), msg("perdido"), msg("meu"),
      ],
    });

    const r = await montarCentralDeConversas(db, {
      sessao: CEO,
      caixa: "novos",
      agora: AGORA,
    });

    expect(totalDa(r.caixas, "novos")).toBe(1);
    // QUENTE e PRIORIDADE_MAXIMA entram; FRIO não — e `temperatura: null`
    // tampouco, porque "ninguém mediu" não é "medido e não esquentou".
    expect(totalDa(r.caixas, "quentes")).toBe(2);
    expect(totalDa(r.caixas, "aguardandoCliente")).toBe(1);
    expect(totalDa(r.caixas, "followUp")).toBe(1);
    expect(totalDa(r.caixas, "fechados")).toBe(1);
    expect(totalDa(r.caixas, "perdidos")).toBe(1);
    expect(totalDa(r.caixas, "meusLeads")).toBe(1);

    expect(r.conversas.map((c) => c.leadId)).toEqual(["novo"]);
  });

  it("⛔ 'Pagamento pendente' devolve NULL e o motivo — nunca zero", async () => {
    const db = banco({ siteLead: [lead("a")], leadMensagem: [msg("a")] });

    const r = await montarCentralDeConversas(db, {
      sessao: CEO,
      caixa: "pagamentoPendente",
      agora: AGORA,
    });

    expect(totalDa(r.caixas, "pagamentoPendente")).toBeNull();
    expect(r.caixaMedida).toBe(false);
    expect(r.porQueNaoMedida).toMatch(/não registra pagamento/i);
    // A lista vem vazia de propósito — e a tela é obrigada a escrever o motivo
    // em vez de "nenhuma conversa".
    expect(r.conversas).toEqual([]);
    expect(filtroDaCaixa("pagamentoPendente", CEO)).toBeNull();
  });

  it("contato SEM mensagem não entra em caixa nenhuma", async () => {
    const db = banco({
      siteLead: [lead("mudo", { stage: "NOVO" })],
      leadMensagem: [],
    });

    const r = await montarCentralDeConversas(db, {
      sessao: CEO,
      caixa: "novos",
      agora: AGORA,
    });

    expect(totalDa(r.caixas, "novos")).toBe(0);
    expect(r.conversas).toEqual([]);
  });
});

describe("os canais de origem", () => {
  it("as onze fontes da base cabem nos seis baldes do desenho", () => {
    const fontes = [
      "FORMULARIO_DEMONSTRACAO", "AGENDAMENTO", "WHATSAPP_DIRETO", "INDICACAO",
      "MANUAL", "INSTAGRAM", "FACEBOOK", "CAMPANHA_PAGA", "LISTA_PROSPECCAO",
      "IMPORTACAO", "OUTRO",
    ] as const;

    for (const f of fontes) {
      expect(CANAIS.some((c) => c.nome === canalDaFonte(f))).toBe(true);
    }
    // Nenhuma fonte em dois baldes ao mesmo tempo: a soma dos canais precisa
    // bater com o total, e balde repetido contaria a mesma conversa duas vezes.
    const todas = CANAIS.flatMap((c) => c.fontes);
    expect(new Set(todas).size).toBe(todas.length);
  });

  it("contam sobre a mesma população das caixas — quem tem conversa", async () => {
    const db = banco({
      siteLead: [
        lead("w", { fonte: "WHATSAPP_DIRETO" }),
        lead("i", { fonte: "INSTAGRAM" }),
        lead("s1", { fonte: "FORMULARIO_DEMONSTRACAO" }),
        lead("s2", { fonte: "AGENDAMENTO" }),
        lead("paga", { fonte: "CAMPANHA_PAGA" }),
        lead("mudo", { fonte: "WHATSAPP_DIRETO" }),
      ],
      leadMensagem: [msg("w"), msg("i"), msg("s1"), msg("s2"), msg("paga")],
    });

    const r = await montarCentralDeConversas(db, {
      sessao: CEO,
      caixa: "novos",
      agora: AGORA,
    });

    const total = (nome: string) => r.canais.find((c) => c.nome === nome)!.total;
    expect(total("whatsapp")).toBe(1); // o "mudo" não tem mensagem
    expect(total("instagram")).toBe(1);
    expect(total("site")).toBe(2); // formulário + agendamento
    expect(total("outros")).toBe(1); // campanha paga cai aqui — ver o serviço
    expect(total("facebook")).toBe(0);
  });

  it("o canal escolhido recorta a lista, e não as contagens das caixas", async () => {
    const db = banco({
      siteLead: [
        lead("w", { stage: "NOVO", fonte: "WHATSAPP_DIRETO" }),
        lead("i", { stage: "NOVO", fonte: "INSTAGRAM" }),
      ],
      leadMensagem: [msg("w"), msg("i")],
    });

    const r = await montarCentralDeConversas(db, {
      sessao: CEO,
      caixa: "novos",
      canal: "instagram",
      agora: AGORA,
    });

    expect(r.conversas.map((c) => c.leadId)).toEqual(["i"]);
    // A caixa continua dizendo quantos existem nela. Se a contagem seguisse o
    // canal, a coluna deixaria de responder "quanto trabalho existe" e passaria
    // a responder "quanto trabalho sobrou depois do filtro" — outra pergunta.
    expect(totalDa(r.caixas, "novos")).toBe(2);
  });
});

describe("o escopo da sessão entra no `where`, e não na tela", () => {
  it("o SDR não conta a carteira dos outros", async () => {
    const db = banco({
      siteLead: [
        lead("meu", { atendenteUserId: "u-sdr", atendidoPor: "HUMANO", stage: "NOVO" }),
        lead("de-outro", { atendenteUserId: "u-alguem", atendidoPor: "HUMANO", stage: "NOVO" }),
        lead("livre", { atendidoPor: "NINGUEM", stage: "NOVO" }),
      ],
      leadMensagem: [msg("meu"), msg("de-outro"), msg("livre")],
    });

    const r = await montarCentralDeConversas(db, {
      sessao: SDR,
      caixa: "novos",
      agora: AGORA,
    });

    // O dele e o que está livre para pegar. O do colega, nunca.
    expect(r.conversas.map((c) => c.leadId).sort()).toEqual(["livre", "meu"]);
    expect(totalDa(r.caixas, "novos")).toBe(2);
  });

  it("a lista de quem pode receber uma transferência não inclui quem pede", async () => {
    const db = banco({
      siteLead: [],
      leadMensagem: [],
      internalUser: [
        { id: "u-sdr", nome: "SDR", isActive: true, disponibilidade: { estado: "DISPONIVEL" } },
        { id: "u-outro", nome: "Outra pessoa", isActive: true, disponibilidade: { estado: "DISPONIVEL" } },
      ],
    });

    const r = await montarCentralDeConversas(db, {
      sessao: SDR,
      caixa: "novos",
      agora: AGORA,
    });

    expect(r.atendentes.map((a) => a.userId)).toEqual(["u-outro"]);
  });
});

describe("o catálogo de caixas", () => {
  it("são as oito do desenho, nesta ordem", () => {
    expect(CAIXAS.map((c) => c.nome)).toEqual([
      "meusLeads",
      "novos",
      "quentes",
      "aguardandoCliente",
      "followUp",
      "pagamentoPendente",
      "fechados",
      "perdidos",
    ]);
  });

  it("toda caixa não medida carrega o motivo escrito", () => {
    for (const c of CAIXAS) {
      if (!c.medida) expect(c.porQueNaoMedida ?? "").not.toBe("");
    }
  });
});
