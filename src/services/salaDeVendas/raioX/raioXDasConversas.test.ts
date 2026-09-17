/**
 * O RAIO-X, CENÁRIO A CENÁRIO — e a parte que mais importa: o que ele RECUSA
 * a medir.
 *
 * Cada contagem aqui é montada com linhas de verdade num banco de prova que
 * FILTRA de verdade pelo `where` (`bancoDeProva`). Um dublê que devolvesse 42
 * para qualquer consulta faria estes testes passarem com a consulta errada —
 * que é a régua verde sobre o componente errado, o defeito que esta casa já
 * nomeou.
 */

import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { bancoDeProva } from "../bancoDeProva";
import { telefoneParaResposta, mascararTelefone } from "./telefone";
import {
  MODULO_GATEKEEPER_DESDE,
  TETO_DE_MENSAGENS_VARRIDAS,
  etapaAlcancada,
  raioXDasConversas,
  semanaDe,
} from "./raioXDasConversas";

const AGORA = new Date("2026-09-17T12:00:00.000Z");

function banco(dados: Parameters<typeof bancoDeProva>[0]) {
  return bancoDeProva(dados) as unknown as PrismaClient;
}

function rodar(db: PrismaClient, extra: Record<string, unknown> = {}) {
  return raioXDasConversas(db, {
    agora: AGORA,
    formatarTelefone: telefoneParaResposta,
    ...extra,
  });
}

function lead(id: string, campos: Record<string, unknown> = {}) {
  return {
    id,
    nome: `Lead ${id}`,
    whatsapp: "5511987654321",
    restaurante: `Restaurante ${id}`,
    cidade: "São Paulo",
    stage: "PRIMEIRO_CONTATO",
    optOutAt: null,
    empresaId: null,
    ultimaMensagemEm: null,
    ...campos,
  };
}

function msg(leadId: string, direcao: "SAIDA" | "ENTRADA", iso: string, campos: Record<string, unknown> = {}) {
  return {
    id: `${leadId}-${direcao}-${iso}`,
    leadId,
    direcao,
    ocorreuEm: new Date(iso),
    autor: direcao === "SAIDA" ? "IA" : null,
    texto: direcao === "SAIDA" ? "oi, tudo bem?" : "quem fala?",
    legenda: null,
    status: direcao === "SAIDA" ? "ENTREGUE" : "RECEBIDA",
    templateNome: null,
    ...campos,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("1 e 2 — quantos foram abordados, quantos responderam", () => {
  it("conta abordado por mensagem NOSSA, e responde por mensagem DELE", async () => {
    const db = banco({
      siteLead: [lead("a"), lead("b"), lead("c"), lead("so-entrada")],
      leadMensagem: [
        msg("a", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("a", "ENTRADA", "2026-09-01T11:00:00.000Z"),
        msg("b", "SAIDA", "2026-09-01T10:05:00.000Z"),
        msg("c", "SAIDA", "2026-09-08T10:00:00.000Z"),
        msg("c", "ENTRADA", "2026-09-08T10:30:00.000Z"),
        // ⚠️ quem só ESCREVEU para nós não foi abordado por nós.
        msg("so-entrada", "ENTRADA", "2026-09-02T09:00:00.000Z"),
      ],
    });

    const r = await rodar(db);
    expect(r.abordagem.medido).toBe(true);
    if (!r.abordagem.medido) throw new Error("deveria ter medido");
    expect(r.abordagem.valor.abordados).toBe(3);
    expect(r.abordagem.valor.responderam).toBe(2);
    expect(r.abordagem.valor.nuncaResponderam).toBe(1);
  });

  it("agrupa por dia e por semana pela PRIMEIRA abordagem", async () => {
    const db = banco({
      siteLead: [lead("a"), lead("b"), lead("c")],
      leadMensagem: [
        msg("a", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("a", "SAIDA", "2026-09-03T10:00:00.000Z"), // reabordagem não reconta
        msg("b", "SAIDA", "2026-09-01T18:00:00.000Z"),
        msg("c", "SAIDA", "2026-09-10T10:00:00.000Z"),
      ],
    });

    const r = await rodar(db);
    if (!r.abordagem.medido) throw new Error("deveria ter medido");
    expect(r.abordagem.valor.porDia).toEqual([
      { dia: "2026-09-01", abordados: 2 },
      { dia: "2026-09-10", abordados: 1 },
    ]);
    expect(r.abordagem.valor.porSemana).toEqual([
      { semana: semanaDe(new Date("2026-09-01T00:00:00.000Z")), abordados: 2 },
      { semana: semanaDe(new Date("2026-09-10T00:00:00.000Z")), abordados: 1 },
    ]);
  });

  it("a janela ?desde/?ate é respeitada — fora dela não entra na conta", async () => {
    const db = banco({
      siteLead: [lead("velho"), lead("novo")],
      leadMensagem: [
        msg("velho", "SAIDA", "2026-07-01T10:00:00.000Z"),
        msg("novo", "SAIDA", "2026-09-05T10:00:00.000Z"),
      ],
    });

    const r = await rodar(db, { desde: new Date("2026-09-01T00:00:00.000Z") });
    if (!r.abordagem.medido) throw new Error("deveria ter medido");
    expect(r.abordagem.valor.abordados).toBe(1);
    expect(r.mensagensNaJanela).toBe(1);
  });

  it("a taxa de resposta reusa `taxa()` do painel — amostra pequena não vira número", async () => {
    const db = banco({
      siteLead: [lead("a"), lead("b")],
      leadMensagem: [msg("a", "SAIDA", "2026-09-01T10:00:00.000Z"), msg("b", "SAIDA", "2026-09-01T10:00:00.000Z")],
    });
    const r = await rodar(db);
    if (!r.abordagem.medido) throw new Error("deveria ter medido");
    expect(r.abordagem.valor.taxaDeResposta).toEqual({ medido: false, motivo: "amostraPequena", base: 2 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("3 — onde a conversa morreu", () => {
  it("cada conversa conta em UM degrau só, e a soma fecha com os abordados", async () => {
    const db = banco({
      empresa: [
        { id: "e-gk", nome: "Casa do GK", estagio: "GATEKEEPER" },
        { id: "e-dec", nome: "Casa do Decisor", estagio: "DECISOR_ENCONTRADO" },
      ],
      contato: [
        { id: "c1", empresaId: "e-gk", nome: "Recepção", ehDecisor: false, ehGatekeeper: true, tipoDeGatekeeper: "RECEPCIONISTA", telefoneDigits: null, confianca: "MEDIA", cargo: null, canal: null, telefone: null, comoFoiDescoberto: null },
        { id: "c2", empresaId: "e-dec", nome: "Juliana", ehDecisor: true, ehGatekeeper: false, tipoDeGatekeeper: null, telefoneDigits: "5511999990000", confianca: "ALTA", cargo: "Sócia", canal: "whatsapp", telefone: "+5511999990000", comoFoiDescoberto: "informado pelo atendimento" },
      ],
      oportunidade: [],
      siteLead: [
        lead("mudo"),
        lead("parou"),
        lead("porteiro", { empresaId: "e-gk" }),
        lead("decisor", { empresaId: "e-dec" }),
        lead("reuniao", { stage: "PROPOSTA_ENVIADA" }),
        lead("venda", { stage: "GANHO" }),
      ],
      leadMensagem: [
        msg("mudo", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("parou", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("parou", "ENTRADA", "2026-09-01T10:10:00.000Z"),
        msg("porteiro", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("porteiro", "ENTRADA", "2026-09-01T10:10:00.000Z"),
        msg("decisor", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("decisor", "ENTRADA", "2026-09-01T10:10:00.000Z"),
        msg("reuniao", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("venda", "SAIDA", "2026-09-01T10:00:00.000Z"),
      ],
    });

    const r = await rodar(db);
    if (!r.ondeMorreu.medido) throw new Error("deveria ter medido");
    const porEtapa = Object.fromEntries(r.ondeMorreu.valor.map((l) => [l.etapa, l.quantos]));
    expect(porEtapa).toEqual({
      SO_PRIMEIRA_MENSAGEM: 1,
      RESPONDEU_E_PAROU: 1,
      GATEKEEPER: 1,
      DECISOR_IDENTIFICADO: 1,
      REUNIAO: 1,
      VENDA: 1,
    });
    const soma = r.ondeMorreu.valor.reduce((t, l) => t + l.quantos, 0);
    if (!r.abordagem.medido) throw new Error("deveria ter medido");
    expect(soma).toBe(r.abordagem.valor.abordados);
  });

  it("a escada é pura e o degrau mais alto vence", () => {
    const base = {
      estado: "PRIMEIRO_CONTATO" as const,
      respondeu: true,
      temDecisor: false,
      temGatekeeper: true,
      estagioDaEmpresa: null,
      temOportunidadeGanha: false,
    };
    expect(etapaAlcancada(base)).toBe("GATEKEEPER");
    expect(etapaAlcancada({ ...base, temDecisor: true })).toBe("DECISOR_IDENTIFICADO");
    expect(etapaAlcancada({ ...base, estado: "DEMO_AGENDADA" })).toBe("REUNIAO");
    expect(etapaAlcancada({ ...base, temOportunidadeGanha: true })).toBe("VENDA");
    expect(etapaAlcancada({ ...base, respondeu: false, temGatekeeper: false })).toBe("SO_PRIMEIRA_MENSAGEM");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("4 — gatekeepers por tipo, e os NÃO CLASSIFICADOS", () => {
  it("conta por tipo e NÃO força categoria em quem é anterior ao módulo", async () => {
    const antes = new Date(MODULO_GATEKEEPER_DESDE.getTime() - 5 * 86_400_000).toISOString();
    const depois = new Date(MODULO_GATEKEEPER_DESDE.getTime() + 3_600_000).toISOString();

    const db = banco({
      empresa: [
        { id: "e1", nome: "Um", estagio: "GATEKEEPER" },
        { id: "e2", nome: "Dois", estagio: "GATEKEEPER" },
        { id: "e3", nome: "Três", estagio: "PRONTA_PARA_SDR" },
        { id: "e4", nome: "Quatro", estagio: "PRONTA_PARA_SDR" },
      ],
      contato: [
        { id: "c1", empresaId: "e1", nome: "Bot", ehDecisor: false, ehGatekeeper: true, tipoDeGatekeeper: "BOT_DE_PEDIDOS", telefoneDigits: null, confianca: "ALTA", cargo: null, canal: null, telefone: null, comoFoiDescoberto: null },
        { id: "c2", empresaId: "e2", nome: "Recepção", ehDecisor: false, ehGatekeeper: true, tipoDeGatekeeper: "RECEPCIONISTA", telefoneDigits: null, confianca: "ALTA", cargo: null, canal: null, telefone: null, comoFoiDescoberto: null },
      ],
      oportunidade: [],
      siteLead: [
        lead("l1", { empresaId: "e1" }),
        lead("l2", { empresaId: "e2" }),
        lead("velho", { empresaId: "e3" }),
        lead("recente", { empresaId: "e4" }),
      ],
      leadMensagem: [
        msg("l1", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("l1", "ENTRADA", "2026-09-01T10:10:00.000Z"),
        msg("l2", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("l2", "ENTRADA", "2026-09-01T10:10:00.000Z"),
        msg("velho", "SAIDA", antes),
        msg("velho", "ENTRADA", antes),
        msg("recente", "SAIDA", depois),
        msg("recente", "ENTRADA", depois),
      ],
    });

    const r = await rodar(db);
    if (!r.gatekeepers.medido) throw new Error("deveria ter medido");
    expect(r.gatekeepers.valor.classificados).toBe(2);
    expect(r.gatekeepers.valor.porTipo).toEqual(
      expect.arrayContaining([
        { tipo: "BOT_DE_PEDIDOS", quantos: 1 },
        { tipo: "RECEPCIONISTA", quantos: 1 },
      ]),
    );
    // ⛔ os dois sem classificação NÃO viraram "OUTRO": viraram não classificado.
    expect(r.gatekeepers.valor.naoClassificados.anterioresAoModulo).toBe(1);
    expect(r.gatekeepers.valor.naoClassificados.posterioresAoModuloSemSinal).toBe(1);
    expect(r.gatekeepers.valor.porTipo.map((t) => t.tipo)).not.toContain("OUTRO");
  });

  it("⛔ sem Empresa ligada, a pergunta do porteiro sai NÃO MEDIDA — nunca zero", async () => {
    const db = banco({
      siteLead: [lead("a"), lead("b")],
      leadMensagem: [
        msg("a", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("b", "SAIDA", "2026-09-01T10:00:00.000Z"),
      ],
    });
    const r = await rodar(db);
    expect(r.gatekeepers.medido).toBe(false);
    expect(r.gatekeepers).toMatchObject({ motivo: expect.stringContaining("Não é zero porteiro") });
    expect(r.decisores.medido).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("5 — decisores capturados e as pistas sem telefone", () => {
  it("separa decisor com telefone de PISTA que não virou telefone", async () => {
    const db = banco({
      empresa: [
        { id: "e1", nome: "Sushi House", estagio: "DECISOR_ENCONTRADO" },
        { id: "e2", nome: "Padaria Central", estagio: "GATEKEEPER" },
      ],
      contato: [
        { id: "c1", empresaId: "e1", nome: "Juliana", cargo: "Sócia", canal: "whatsapp", telefone: "+5511999990000", telefoneDigits: "5511999990000", ehDecisor: true, ehGatekeeper: false, tipoDeGatekeeper: null, confianca: "ALTA", comoFoiDescoberto: "informado pelo atendimento" },
        { id: "c2", empresaId: "e2", nome: "Seu Marcos", cargo: "Dono", canal: null, telefone: null, telefoneDigits: null, ehDecisor: true, ehGatekeeper: false, tipoDeGatekeeper: null, confianca: "MEDIA", comoFoiDescoberto: "o atendente disse o nome, não deu o número" },
      ],
      oportunidade: [],
      siteLead: [lead("l1", { empresaId: "e1" }), lead("l2", { empresaId: "e2" })],
      leadMensagem: [
        msg("l1", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("l2", "SAIDA", "2026-09-01T10:00:00.000Z"),
      ],
    });

    const r = await rodar(db);
    if (!r.decisores.medido) throw new Error("deveria ter medido");
    expect(r.decisores.valor.comTelefone).toBe(1);
    expect(r.decisores.valor.semTelefone).toBe(1);
    expect(r.decisores.valor.pistasSemTelefone).toEqual([
      expect.objectContaining({
        empresa: "Padaria Central",
        nome: "Seu Marcos",
        cargo: "Dono",
        temTelefone: false,
        comoFoiDescoberto: "o atendente disse o nome, não deu o número",
      }),
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("6 — a amostra, com as mensagens em ordem", () => {
  it("devolve as conversas com quem falou, quando e o texto", async () => {
    const db = banco({
      siteLead: [lead("a")],
      leadMensagem: [
        msg("a", "ENTRADA", "2026-09-01T10:10:00.000Z", { texto: "quem tá falando?" }),
        msg("a", "SAIDA", "2026-09-01T10:00:00.000Z", { texto: "oi, aqui é a Foocci" }),
        msg("a", "SAIDA", "2026-09-01T10:20:00.000Z", { texto: "posso falar com o responsável?" }),
      ],
    });
    const r = await rodar(db);
    expect(r.amostra).toHaveLength(1);
    expect(r.amostra[0]!.mensagens.map((m) => [m.quem, m.texto])).toEqual([
      ["FOOCCI", "oi, aqui é a Foocci"],
      ["LEAD", "quem tá falando?"],
      ["FOOCCI", "posso falar com o responsável?"],
    ]);
  });

  it("respeita o padrão 20 e o teto 200", async () => {
    const leads = Array.from({ length: 30 }, (_, i) => lead(`l${i}`));
    const mensagens = leads.map((l, i) =>
      msg(l.id, "SAIDA", new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString()),
    );
    const db = banco({ siteLead: leads, leadMensagem: mensagens });

    expect((await rodar(db)).amostra).toHaveLength(20);
    expect((await rodar(db, { amostra: 5 })).amostra).toHaveLength(5);
    expect((await rodar(db, { amostra: 5000 })).amostra).toHaveLength(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("7 — os elegíveis para reabordagem", () => {
  it("exclui opt-out, exclui quem já tem decisor, exclui quem passou da reunião", async () => {
    const db = banco({
      empresa: [{ id: "e-dec", nome: "Com decisor", estagio: "DECISOR_ENCONTRADO" }],
      contato: [
        { id: "c1", empresaId: "e-dec", nome: "Dona Ana", cargo: null, canal: null, telefone: null, telefoneDigits: "5511900000000", ehDecisor: true, ehGatekeeper: false, tipoDeGatekeeper: null, confianca: "ALTA", comoFoiDescoberto: null },
      ],
      oportunidade: [],
      siteLead: [
        lead("elegivel-mudo"),
        lead("elegivel-parou"),
        lead("optout", { optOutAt: new Date("2026-09-02T00:00:00.000Z") }),
        lead("com-decisor", { empresaId: "e-dec" }),
        lead("em-negociacao", { stage: "EM_NEGOCIACAO" }),
      ],
      leadMensagem: [
        msg("elegivel-mudo", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("elegivel-parou", "SAIDA", "2026-09-02T10:00:00.000Z"),
        msg("elegivel-parou", "ENTRADA", "2026-09-02T10:05:00.000Z"),
        msg("optout", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("com-decisor", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("em-negociacao", "SAIDA", "2026-09-01T10:00:00.000Z"),
      ],
    });

    const r = await rodar(db);
    if (!r.reabordagem.medido) throw new Error("deveria ter medido");
    expect(r.reabordagem.valor.total).toBe(2);
    expect(r.reabordagem.valor.lista.map((l) => l.leadId).sort()).toEqual([
      "elegivel-mudo",
      "elegivel-parou",
    ]);
    expect(r.reabordagem.valor.lista.find((l) => l.leadId === "elegivel-parou")!.respondeuAlgumaVez).toBe(true);
  });

  it("pagina, e a página fora do fim vem vazia sem mentir o total", async () => {
    const leads = Array.from({ length: 7 }, (_, i) => lead(`l${i}`));
    const db = banco({
      siteLead: leads,
      leadMensagem: leads.map((l, i) =>
        msg(l.id, "SAIDA", new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString()),
      ),
    });

    const p1 = await rodar(db, { pagina: 1, porPagina: 3 });
    const p3 = await rodar(db, { pagina: 3, porPagina: 3 });
    const p9 = await rodar(db, { pagina: 9, porPagina: 3 });
    if (!p1.reabordagem.medido || !p3.reabordagem.medido || !p9.reabordagem.medido) {
      throw new Error("deveria ter medido");
    }
    expect(p1.reabordagem.valor.lista).toHaveLength(3);
    expect(p3.reabordagem.valor.lista).toHaveLength(1);
    expect(p9.reabordagem.valor.lista).toHaveLength(0);
    expect(p9.reabordagem.valor.total).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("⛔ dado não medido nunca vira zero", () => {
  it("janela sem NENHUMA saída sai NÃO MEDIDA, com o motivo", async () => {
    const db = banco({ siteLead: [lead("a")], leadMensagem: [msg("a", "ENTRADA", "2026-09-01T10:00:00.000Z")] });
    const r = await rodar(db);
    expect(r.abordagem).toEqual({ medido: false, motivo: expect.stringContaining("nenhuma mensagem de SAÍDA") });
    expect(r.ondeMorreu.medido).toBe(false);
    expect(r.reabordagem.medido).toBe(false);
    expect(r.amostra).toEqual([]);
  });

  it("acima do teto de varredura, tudo sai NÃO MEDIDO em vez de meio medido", async () => {
    const contagem = TETO_DE_MENSAGENS_VARRIDAS + 1;
    const db = {
      leadMensagem: {
        count: async () => contagem,
        findMany: async () => {
          throw new Error("não devia varrer acima do teto");
        },
      },
    } as unknown as PrismaClient;

    const r = await rodar(db);
    expect(r.mensagensNaJanela).toBe(contagem);
    for (const bloco of [r.abordagem, r.ondeMorreu, r.gatekeepers, r.decisores, r.reabordagem]) {
      expect(bloco.medido).toBe(false);
      expect(bloco).toMatchObject({ motivo: expect.stringContaining("acima do teto") });
    }
  });

  it("lead abordado cuja ficha sumiu é DECLARADO, não descontado em silêncio", async () => {
    const db = banco({
      siteLead: [lead("existe")],
      leadMensagem: [
        msg("existe", "SAIDA", "2026-09-01T10:00:00.000Z"),
        msg("fantasma", "SAIDA", "2026-09-01T10:00:00.000Z"),
      ],
    });
    const r = await rodar(db);
    expect(r.abordadosSemFicha).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("o telefone", () => {
  it("mascara por padrão, no formato +55 11 9****-**21", async () => {
    expect(mascararTelefone("5511987654321")).toBe("+55 11 9****-**21");
    expect(mascararTelefone("551134567890")).toBe("+55 11 3***-**90");
    expect(mascararTelefone("1199")).toBe("****");
    expect(mascararTelefone(null)).toBeNull();
  });

  it("a rota só devolve inteiro com o pedido explícito", async () => {
    const db = banco({
      siteLead: [lead("a")],
      leadMensagem: [msg("a", "SAIDA", "2026-09-01T10:00:00.000Z")],
    });

    const padrao = await rodar(db);
    expect(padrao.telefoneCompleto).toBe(false);
    expect(padrao.amostra[0]!.telefone).toBe("+55 11 9****-**21");
    if (!padrao.reabordagem.medido) throw new Error("deveria ter medido");
    expect(padrao.reabordagem.valor.lista[0]!.telefone).toBe("+55 11 9****-**21");

    const aberto = await rodar(db, { telefoneCompleto: true });
    expect(aberto.telefoneCompleto).toBe(true);
    expect(aberto.amostra[0]!.telefone).toBe("+5511987654321");
  });
});
