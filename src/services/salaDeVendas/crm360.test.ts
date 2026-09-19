/**
 * O CRM 360 DO LEAD, medido contra um banco que FILTRA de verdade.
 *
 * ── A PERGUNTA OBRIGATÓRIA ──────────────────────────────────────────────────
 *
 * *O teste alcança o código que responde ao usuário?* Alcança. A ficha é lida
 * do `bancoDeProva` (que aplica o `where` de verdade) e o HTML é gerado pelo
 * componente REAL da tela, não por uma cópia de teste. Trocar o dado do banco
 * muda o HTML; trocar a tela por constantes reprova.
 *
 * ── O QUE ESTE ARQUIVO PROTEGE COM MAIS FORÇA ───────────────────────────────
 *
 * A diferença entre "zero" e "não sei". Score nulo, unidades nulas,
 * `deliveryProprio` nulo e marketplaces nunca apurados têm cada um o seu teste,
 * porque é exatamente aí que um `?? 0` entraria despercebido e transformaria
 * "ninguém apurou" numa afirmação.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrismaClient } from "@prisma/client";

import { bancoDeProva } from "./bancoDeProva";
import { lerFichaDoLead, type FichaDoLead } from "./crm360";
import {
  Crm360View,
  FichaNaoEncontrada,
  naoMedido,
  reais,
  simNaoOuNaoApurado,
} from "@/app/comercial/(area)/lead/[id]/Crm360View";

const AGORA = new Date("2026-09-17T12:00:00.000Z");

function banco(dados: Parameters<typeof bancoDeProva>[0]) {
  return bancoDeProva(dados) as unknown as PrismaClient;
}

function lead(campos: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    nome: "Ana Silva",
    whatsapp: "5511987654321",
    email: null,
    restaurante: "Sushi House",
    cidade: "São Paulo",
    tipo: "Japonesa",
    stage: "EM_QUALIFICACAO",
    score: null,
    temperatura: null,
    atendidoPor: "IA",
    atendenteUserId: null,
    prioritario: false,
    tags: [],
    origem: "site",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    optOutAt: null,
    consentAt: null,
    proximaAcaoEm: null,
    proximaAcaoNota: null,
    lastContactedAt: null,
    primeiraRespostaEm: null,
    ultimaMensagemEm: null,
    ultimaMensagemDeQuem: null,
    empresaId: null,
    // ── O que as seis abas do desenho 04 passaram a ler ──────────────────
    // Sem estes campos o dublê devolveria `undefined` onde o Postgres devolve
    // valor — e a tela leria "não medido" num teste que deveria reprovar.
    stageChangedAt: new Date("2026-09-10T00:00:00.000Z"),
    fonte: "FORMULARIO_DEMONSTRACAO",
    utmCampaign: null,
    utmSource: null,
    utmMedium: null,
    referrer: null,
    lastInteractionAt: null,
    naoLidas: 0,
    atendenteDesde: null,
    ...campos,
  };
}

function empresa(campos: Record<string, unknown> = {}) {
  return {
    id: "emp-1",
    nome: "Sushi House Ltda",
    categoria: "Japonesa",
    cidade: "São Paulo",
    estado: "SP",
    bairro: "Pinheiros",
    cnpj: null,
    site: null,
    instagram: null,
    whatsappPublicado: null,
    telefone: null,
    email: null,
    deliveryProprio: null,
    marketplaces: [],
    apuradoMarketplaceEm: null,
    cardapioProprio: null,
    numeroDeUnidades: null,
    sistemaIdentificado: null,
    ticketEstimadoCents: null,
    scoreIcp: null,
    prioridade: null,
    estagio: "ENRIQUECENDO",
    estagioMudouEm: new Date("2026-09-10T00:00:00.000Z"),
    fonteDaDescoberta: "planilha-outscraper",
    contatos: [],
    leads: [],
    ...campos,
  };
}

function contato(id: string, campos: Record<string, unknown> = {}) {
  return {
    id,
    empresaId: "emp-1",
    nome: `Contato ${id}`,
    cargo: null,
    canal: null,
    telefone: null,
    telefoneDigits: null,
    email: null,
    ehDecisor: false,
    ehGatekeeper: false,
    tipoDeGatekeeper: null,
    confianca: "MEDIA",
    comoFoiDescoberto: null,
    fonte: null,
    criadoEm: new Date("2026-09-05T00:00:00.000Z"),
    ...campos,
  };
}

async function ficha(dados: Parameters<typeof bancoDeProva>[0]): Promise<FichaDoLead> {
  const r = await lerFichaDoLead(banco(dados), { leadId: "lead-1", agora: AGORA });
  if (!r.achou) throw new Error("esperava achar a ficha");
  return r.ficha;
}

describe("⛔ lerFichaDoLead — lead que não existe", () => {
  it("não inventa uma ficha vazia: devolve a recusa nomeada", async () => {
    const r = await lerFichaDoLead(banco({}), { leadId: "sumido", agora: AGORA });
    expect(r).toEqual({ achou: false, motivo: "leadInexistente" });
  });
});

describe("⭐⭐ a ficha junta pessoa, empresa, decisor, oportunidade e proposta", () => {
  it("lead sem empresa: empresa é null e os contatos vêm vazios — não zerados", async () => {
    const f = await ficha({ siteLead: [lead()] });

    expect(f.empresa).toBeNull();
    expect(f.contatos).toEqual([]);
    expect(f.decisor).toBeNull();
    expect(f.gatekeepers).toEqual([]);
  });

  it("⭐ com empresa: os campos saem do banco, e os nulos continuam nulos", async () => {
    const f = await ficha({
      siteLead: [lead({ empresaId: "emp-1" })],
      empresa: [empresa({ numeroDeUnidades: 3, scoreIcp: 72, prioridade: "ALTA" })],
    });

    expect(f.empresa!.nome).toBe("Sushi House Ltda");
    expect(f.empresa!.numeroDeUnidades).toBe(3);
    expect(f.empresa!.scoreIcp).toBe(72);
    // ⛔ O que ninguém apurou continua null. Nunca zero, nunca false.
    expect(f.empresa!.deliveryProprio).toBeNull();
    expect(f.empresa!.ticketEstimadoCents).toBeNull();
    expect(f.empresa!.apuradoMarketplaceEm).toBeNull();
  });

  it("⭐ separa DECISOR de GATEKEEPER — e o gatekeeper traz o tipo", async () => {
    const f = await ficha({
      siteLead: [lead({ empresaId: "emp-1" })],
      empresa: [empresa()],
      contato: [
        contato("c1", {
          nome: "Recepção",
          ehGatekeeper: true,
          tipoDeGatekeeper: "RECEPCIONISTA",
          comoFoiDescoberto: "atendeu o WhatsApp geral",
        }),
        contato("c2", {
          nome: "Juliana Ribeiro",
          cargo: "Gerente comercial",
          ehDecisor: true,
          confianca: "ALTA",
        }),
      ],
    });

    expect(f.contatos).toHaveLength(2);
    expect(f.decisor!.nome).toBe("Juliana Ribeiro");
    expect(f.gatekeepers.map((g) => g.tipoDeGatekeeper)).toEqual(["RECEPCIONISTA"]);
  });

  it("⛔ contatos de OUTRA empresa não entram na ficha", async () => {
    const f = await ficha({
      siteLead: [lead({ empresaId: "emp-1" })],
      empresa: [empresa()],
      contato: [
        contato("meu", { nome: "Do meu restaurante" }),
        contato("alheio", { empresaId: "emp-999", nome: "De outro restaurante" }),
      ],
    });

    expect(f.contatos.map((c) => c.nome)).toEqual(["Do meu restaurante"]);
  });

  it("⭐ a oportunidade ABERTA é distinguida das fechadas", async () => {
    const f = await ficha({
      siteLead: [lead()],
      oportunidade: [
        {
          id: "op-velha",
          leadId: "lead-1",
          empresaId: "emp-1",
          estagio: "PERDIDA",
          estagioMudouEm: new Date("2026-03-01T00:00:00.000Z"),
          criadoEm: new Date("2026-02-01T00:00:00.000Z"),
          valorPotencialCents: null,
          produtoDeInteresse: null,
          probabilidade: null,
          dorIdentificada: null,
          objecoes: [],
          previsaoDeFechamento: null,
          fechadaEm: new Date("2026-03-01T00:00:00.000Z"),
        },
        {
          id: "op-viva",
          leadId: "lead-1",
          empresaId: "emp-1",
          estagio: "NEGOCIACAO",
          estagioMudouEm: new Date("2026-09-15T00:00:00.000Z"),
          criadoEm: new Date("2026-09-10T00:00:00.000Z"),
          valorPotencialCents: 24900,
          produtoDeInteresse: "plano completo",
          probabilidade: 60,
          dorIdentificada: "80% do faturamento no iFood",
          objecoes: ["acha caro"],
          previsaoDeFechamento: null,
          fechadaEm: null,
        },
      ],
    });

    expect(f.oportunidades).toHaveLength(2);
    expect(f.oportunidade!.id).toBe("op-viva");
    expect(f.oportunidade!.valorPotencialCents).toBe(24900);
  });

  it("⛔ oportunidade de OUTRO lead não entra", async () => {
    const f = await ficha({
      siteLead: [lead()],
      oportunidade: [
        {
          id: "alheia",
          leadId: "lead-999",
          empresaId: "emp-1",
          estagio: "PROPOSTA",
          estagioMudouEm: AGORA,
          criadoEm: AGORA,
          objecoes: [],
        },
      ],
    });

    expect(f.oportunidades).toEqual([]);
  });

  it("⭐ as propostas saem de lerPropostasDoLead, com a validade conferida", async () => {
    const f = await ficha({
      siteLead: [lead()],
      leadProposta: [
        {
          id: "p1",
          leadId: "lead-1",
          situacao: "ENVIADA",
          plano: "PRO",
          valorMensalCent: 24900,
          descontoPct: null,
          condicoes: null,
          enviadaEm: new Date("2026-09-01T00:00:00.000Z"),
          respondidaEm: null,
          validaAte: new Date("2026-09-08T00:00:00.000Z"),
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
          updatedAt: new Date("2026-09-01T00:00:00.000Z"),
        },
      ],
    });

    expect(f.propostas).toHaveLength(1);
    expect(f.propostas[0]!.vencida).toBe(true);
    expect(f.propostas[0]!.valorMensalCent).toBe(24900);
  });

  it("⭐ a linha do tempo sai da trilha, do mais recente para o mais antigo", async () => {
    const f = await ficha({
      siteLead: [lead()],
      siteLeadInteraction: [
        {
          id: "i1",
          leadId: "lead-1",
          tipo: "NOTA",
          fromStage: null,
          toStage: null,
          actor: "agente-sdr-ia",
          nota: "primeiro contato",
          interna: false,
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
        },
        {
          id: "i2",
          leadId: "lead-1",
          tipo: "NOTA",
          fromStage: null,
          toStage: null,
          actor: "agente-sdr-ia",
          nota: "pediu proposta",
          interna: false,
          createdAt: new Date("2026-09-10T00:00:00.000Z"),
        },
        // De outro lead: não pode vazar para esta ficha.
        {
          id: "i3",
          leadId: "lead-999",
          tipo: "NOTA",
          fromStage: null,
          toStage: null,
          actor: "agente-sdr-ia",
          nota: "SEGREDO DE OUTRO LEAD",
          interna: false,
          createdAt: new Date("2026-09-11T00:00:00.000Z"),
        },
      ],
    });

    expect(f.linhaDoTempo.map((e) => e.nota)).toEqual(["pediu proposta", "primeiro contato"]);
  });

  it("⭐ o follow-up traz o estado E o porquê", async () => {
    const f = await ficha({ siteLead: [lead({ optOutAt: new Date("2026-09-05T00:00:00.000Z") })] });

    expect(f.followUp!.classificacao.estado).toBe("PEDIU_SILENCIO");
    expect(f.followUp!.classificacao.porque.length).toBeGreaterThan(0);
  });
});

describe("⭐⭐ A TELA — o HTML que o vendedor recebe vem do serviço", () => {
  async function html(dados: Parameters<typeof bancoDeProva>[0]) {
    return renderToStaticMarkup(React.createElement(Crm360View, { f: await ficha(dados) }));
  }

  it("⛔⛔ o HTML MUDA quando o banco muda — a tela não é constante", async () => {
    const a = await html({ siteLead: [lead({ nome: "Ana Silva" })] });
    const b = await html({ siteLead: [lead({ nome: "Bruno Costa" })] });

    expect(a).toContain("Ana Silva");
    expect(b).toContain("Bruno Costa");
    expect(a).not.toContain("Bruno Costa");
  });

  it("⛔ score nulo vira 'ninguém pontuou' na tela — NUNCA 0", async () => {
    const saida = await html({ siteLead: [lead({ score: null })] });

    expect(saida).toContain("ninguém pontuou");
    expect(saida).not.toContain(">0<");
  });

  it("score medido aparece como número", async () => {
    const saida = await html({ siteLead: [lead({ score: 78 })] });
    expect(saida).toContain("78");
  });

  it("⛔ empresa sem ICP e sem unidades: a tela escreve os DOIS motivos", async () => {
    const saida = await html({
      siteLead: [lead({ empresaId: "emp-1" })],
      empresa: [empresa()],
    });

    expect(saida).toContain("ninguém mediu o ICP");
    expect(saida).toContain("não apurado");
    expect(saida).toContain("nunca apurado");
  });

  it("⭐ marketplaces: 'apurado: nenhum' e 'nunca apurado' são frases DIFERENTES", async () => {
    const nuncaApurado = await html({
      siteLead: [lead({ empresaId: "emp-1" })],
      empresa: [empresa({ marketplaces: [], apuradoMarketplaceEm: null })],
    });
    const apuradoENenhum = await html({
      siteLead: [lead({ empresaId: "emp-1" })],
      empresa: [empresa({ marketplaces: [], apuradoMarketplaceEm: AGORA })],
    });

    expect(nuncaApurado).toContain("nunca apurado");
    expect(apuradoENenhum).toContain("apurado: nenhum");
    expect(apuradoENenhum).not.toContain("nunca apurado");
  });

  it("⭐ o decisor e o gatekeeper aparecem MARCADOS na tela", async () => {
    const saida = await html({
      siteLead: [lead({ empresaId: "emp-1" })],
      empresa: [empresa()],
      contato: [
        contato("c1", { nome: "Recepção", ehGatekeeper: true, tipoDeGatekeeper: "BOT_DE_PEDIDOS" }),
        contato("c2", { nome: "Juliana Ribeiro", ehDecisor: true }),
      ],
    });

    expect(saida).toContain("Juliana Ribeiro");
    expect(saida).toContain("decisor");
    expect(saida).toContain("Bot de pedidos");
  });

  it("sem decisor, a tela DIZ que não foi encontrado em vez de omitir", async () => {
    const saida = await html({
      siteLead: [lead({ empresaId: "emp-1" })],
      empresa: [empresa()],
      contato: [contato("c1", { nome: "Recepção", ehGatekeeper: true })],
    });

    expect(saida).toContain("Decisor ainda não encontrado");
  });

  it("⭐ o valor da oportunidade aparece em reais, e o não estimado aparece como tal", async () => {
    const saida = await html({
      siteLead: [lead()],
      oportunidade: [
        {
          id: "op",
          leadId: "lead-1",
          empresaId: "emp-1",
          estagio: "NEGOCIACAO",
          estagioMudouEm: AGORA,
          criadoEm: AGORA,
          valorPotencialCents: 24900,
          probabilidade: null,
          objecoes: [],
        },
      ],
    });

    expect(saida).toContain("249,00");
    expect(saida).toContain("não estimada");
  });

  it("⛔ opt-out vira aviso VISÍVEL de não abordar", async () => {
    const saida = await html({ siteLead: [lead({ optOutAt: new Date("2026-09-05T00:00:00.000Z") })] });
    expect(saida).toContain("pediu silêncio");
    expect(saida).toContain("Não abordar");
  });

  it("os blocos vazios têm texto próprio, e não um bloco em branco", async () => {
    const saida = await html({ siteLead: [lead()] });

    expect(saida).toContain("Nenhuma oportunidade aberta");
    expect(saida).toContain("Nenhuma proposta emitida");
    expect(saida).toContain("ainda não foi ligado a uma empresa");
  });

  it("o link para a conversa existente está lá — e é o ÚNICO caminho de ação", async () => {
    const saida = await html({ siteLead: [lead()] });
    expect(saida).toContain("/comercial/conversas?leadId=lead-1");
  });

  it("'não encontrado' é uma tela própria", () => {
    const saida = renderToStaticMarkup(React.createElement(FichaNaoEncontrada));
    expect(saida).toContain("Lead não encontrado");
  });
});

describe("os formatadores da ficha", () => {
  it("reais", () => {
    expect(reais(24900).replace(/ /g, " ")).toBe("R$ 249,00");
  });

  it("naoMedido sempre carrega o motivo junto", () => {
    expect(naoMedido("ninguém apurou")).toBe("não medido — ninguém apurou");
  });

  it("⛔ simNaoOuNaoApurado tem TRÊS respostas, e null não é 'não'", () => {
    expect(simNaoOuNaoApurado(true)).toBe("sim");
    expect(simNaoOuNaoApurado(false)).toBe("não");
    expect(simNaoOuNaoApurado(null)).toContain("não medido");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ⭐ AS SEIS ABAS DA PEÇA 04 — e as três coisas que elas se recusam a inventar
//
// A auditoria de 19/09/2026 mediu que esta tela *"tem a substância e não tem a
// forma"*: sem abas, sem rosca de score, sem tags, sem barra de probabilidade.
// O que segue prova a forma — e prova que ela não trouxe número inventado junto.
// ═════════════════════════════════════════════════════════════════════════════

function htmlDaFicha(f: FichaDoLead): string {
  return renderToStaticMarkup(React.createElement(Crm360View, { f }));
}

describe("⭐ as seis abas existem, e todas ficam no HTML", () => {
  it("Resumo · Histórico · Compras · Conversas · Tags · Atividades", async () => {
    const h = htmlDaFicha(await ficha({ siteLead: [lead()] }));

    for (const rotulo of ["Resumo", "Histórico", "Compras", "Conversas", "Tags", "Atividades"]) {
      expect(h).toContain(`>${rotulo}`);
    }
    // Seis painéis, e as cinco inativas escondidas — não descartadas: a busca
    // do navegador e o leitor de tela precisam do que está na aba ao lado.
    expect(h.match(/role="tabpanel"/g)).toHaveLength(6);
    expect(h.match(/role="tab"/g)).toHaveLength(6);
  });

  it("a migalha diz LEADS — o desenho acende 'Painel', e é incoerência dele", async () => {
    const h = htmlDaFicha(await ficha({ siteLead: [lead()] }));
    expect(h).toContain("Leads");
    expect(h).toContain("Perfil do Lead");
  });
});

describe('⛔ "Como nos conheceu?" — o campo do desenho que NÃO existe no banco', () => {
  it("a tela não finge que é a resposta da pessoa: declara que é medição nossa", async () => {
    const h = htmlDaFicha(
      await ficha({ siteLead: [lead({ utmSource: "instagram" })] }),
    );

    expect(h).toContain("Como nos conheceu?");
    expect(h).toContain("não é a resposta da pessoa");
    expect(h).toContain("instagram");
  });

  it("sem utm nem referrer, fica dito que ninguém perguntou — e não em branco", async () => {
    const h = htmlDaFicha(await ficha({ siteLead: [lead()] }));
    expect(h).toContain("Como nos conheceu?");
    expect(h).toContain("não informado — ninguém perguntou");
  });
});

describe("⛔ a rosca do Lead Score não desenha nota que ninguém deu", () => {
  it("score nulo NÃO vira anel de zero: vira a frase de quem não foi pontuado", async () => {
    const h = htmlDaFicha(await ficha({ siteLead: [lead({ score: null })] }));

    expect(h).toContain("ninguém pontuou este lead");
    expect(h).not.toContain('role="img"');
  });

  it("score 92 desenha o anel com 92 no meio — e não o total da volta", async () => {
    const h = htmlDaFicha(
      await ficha({ siteLead: [lead({ score: 92, temperatura: "PRIORIDADE_MAXIMA" })] }),
    );

    expect(h).toContain('role="img"');
    expect(h).toContain(">92<");
    expect(h).toContain("Muito alto");
  });
});

describe("⛔ a barra de probabilidade não existe sem oportunidade", () => {
  it("sem oportunidade, o cartão da IA diz onde a probabilidade mora", async () => {
    const h = htmlDaFicha(await ficha({ siteLead: [lead()] }));

    expect(h).toContain("não há oportunidade aberta — a probabilidade mora nela");
    expect(h).not.toContain("0%");
  });

  it("com oportunidade estimada, a barra aparece com o número que a sustenta", async () => {
    const h = htmlDaFicha(
      await ficha({
        siteLead: [lead()],
        oportunidade: [
          {
            id: "op-1",
            leadId: "lead-1",
            empresaId: "emp-1",
            estagio: "NEGOCIACAO",
            estagioMudouEm: new Date("2026-09-12T00:00:00.000Z"),
            valorPotencialCents: 90000,
            produtoDeInteresse: "Plano Profissional",
            probabilidade: 80,
            dorIdentificada: null,
            objecoes: ["quer comparar com outra solução"],
            previsaoDeFechamento: null,
            fechadaEm: null,
            criadoEm: new Date("2026-09-12T00:00:00.000Z"),
          },
        ],
      }),
    );

    expect(h).toContain("80%");
    expect(h).toContain("quer comparar com outra solução");
  });
});

describe("⛔ a coluna da IA não escreve análise que ninguém gravou", () => {
  it("o parágrafo de leitura do desenho é declarado ausente, não redigido", async () => {
    const h = htmlDaFicha(await ficha({ siteLead: [lead()] }));

    expect(h).toContain("Nenhuma tabela guarda um resumo desses");
    expect(h).not.toContain("alto potencial de compra");
  });
});

describe("as tags e a ficha de qualificação", () => {
  it("sem tag, o vazio diz que ninguém marcou — não que o lead não tem nada", async () => {
    const h = htmlDaFicha(await ficha({ siteLead: [lead({ tags: [] })] }));
    expect(h).toContain("é um lead que ninguém marcou");
  });

  it("a ficha do SDR aparece campo a campo, inclusive o que ninguém perguntou", async () => {
    const h = htmlDaFicha(
      await ficha({
        siteLead: [lead()],
        leadQualificacao: [
          {
            id: "q1",
            leadId: "lead-1",
            segmento: "Japonesa",
            unidades: null,
            volumeMensal: null,
            canaisAtuais: [],
            sistemaAtual: null,
            marketplaceAtual: null,
            dorPrincipal: "Reduzir tempo de resposta",
            objetivo: null,
            planoDeInteresse: "Plano Profissional",
            urgencia: "Alta",
            poderDeDecisao: null,
            faixaDeOrcamento: null,
            objecoes: [],
            funcionalidadesDeInteresse: [],
            pedidoExplicito: null,
            observacoes: null,
            pediuHumano: false,
            pediuPararSondagem: false,
          },
        ],
      }),
    );

    expect(h).toContain("Reduzir tempo de resposta");
    expect(h).toContain("Plano Profissional");
    // As perguntas sem resposta continuam na tela: a lista do que falta é o que
    // faz a próxima conversa acontecer.
    expect(h).toContain("Quem decide");
    expect(h).toContain("não informado — ninguém perguntou");
  });
});

describe('⛔ os atos do desenho que esta casa NÃO tem não viram botão', () => {
  it('"Alterar" o vendedor não é desenhado — e a tela diz por quê', async () => {
    const h = htmlDaFicha(await ficha({ siteLead: [lead()] }));

    expect(h).toContain("Passar o lead para outra pessoa não é");
    expect(h).not.toContain(">Alterar<");
  });

  it('"Adicionar tag" e "Marcar como realizado" não aparecem como botão', async () => {
    const h = htmlDaFicha(
      await ficha({
        siteLead: [lead({ proximaAcaoEm: new Date("2026-09-18T19:00:00.000Z") })],
      }),
    );

    expect(h).not.toContain("Adicionar tag<");
    expect(h).not.toContain("Marcar como realizado<");
    expect(h).toContain("Dar o follow-up por");
  });

  it("a caixa de anotação interna não é desenhada: não há onde guardar a anotação", async () => {
    const h = htmlDaFicha(await ficha({ siteLead: [lead()] }));

    expect(h).toContain("Anotação interna não tem tabela nesta base");
    expect(h).not.toContain("<textarea");
  });
});

describe("a aba Conversas anuncia o recorte", () => {
  it("mostrando 5 de muitas, a tela diz quantas existem", async () => {
    const mensagens = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      leadId: "lead-1",
      direcao: i % 2 === 0 ? "ENTRADA" : "SAIDA",
      tipo: "TEXTO",
      status: "ENTREGUE",
      texto: `mensagem ${i}`,
      legenda: null,
      autor: i % 2 === 0 ? null : "IA",
      autorUserId: null,
      ocorreuEm: new Date(2026, 8, 10 + i),
    }));

    const f = await ficha({ siteLead: [lead()], leadMensagem: mensagens });
    expect(f.totalDeMensagens).toBe(8);

    const h = htmlDaFicha(f);
    expect(h).toContain("Mostrando 5 de 8 mensagens");
  });
});
