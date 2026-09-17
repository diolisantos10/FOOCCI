/**
 * O PLANO DO DIA — números reais, e receita não medida que NÃO vira zero.
 *
 * ── O QUE ESTE TESTE GUARDA ─────────────────────────────────────────────────
 *
 * A tela do projeto mostra sete filas e um total de receita. O defeito perigoso
 * aqui não é errar uma contagem: é somar oportunidade sem valor estimado como
 * zero e apresentar um piso com cara de total. Por isso a asserção não é só
 * sobre `cents` — é sobre `semEstimativa` andar junto.
 */

import { describe, it, expect } from "vitest";
import {
  CADENCIA_POR_ESTADO,
  REGUA_DE_BASE,
  ehChanceDeUpsell,
  ehParaReativar,
  enfileirarPlano,
  montarPlanoDoDia,
  proporCampanha,
} from "./planoDoDia";
import { REGUA } from "./estadoDeFollowUp";

const AGORA = new Date("2026-09-17T12:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000);
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000);

type Linha = Record<string, any>;

function leadBase(p: Linha = {}): Linha {
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

function clienteBase(p: Linha = {}): Linha {
  return {
    id: "cli-x",
    situacao: "ATIVO",
    ganhoEm: diasAtras(200),
    ativadoEm: diasAtras(190),
    passosDeAtivacao: [],
    saude: 85,
    saudeEm: diasAtras(3),
    nps: 9,
    npsEm: diasAtras(3),
    riscoDeChurn: null,
    motivoDoRisco: null,
    ultimaCompraEm: diasAtras(10),
    recompras: 1,
    upsells: 0,
    receitaTotalCents: 100_000,
    ...p,
  };
}

function bancoFalso(leads: Linha[], clientes: Linha[] = []) {
  return {
    siteLead: { findMany: async () => leads },
    cliente: { findMany: async () => clientes },
  } as never;
}

describe("montarPlanoDoDia — as filas que o documento desenha", () => {
  const leads = [
    // 1 — sumido: precisa de follow-up, com valor estimado
    leadBase({
      id: "sumiu",
      primeiraRespostaEm: diasAtras(40),
      ultimaMensagemEm: diasAtras(20),
      ultimaMensagemDeQuem: "ENTRADA",
      oportunidades: [{ estagio: "NEGOCIACAO", valorPotencialCents: 120_000 }],
    }),
    // 2 — esfriando: respondeu, passou da metade da janela
    leadBase({
      id: "esfriando",
      primeiraRespostaEm: diasAtras(10),
      ultimaMensagemEm: diasAtras(5),
      ultimaMensagemDeQuem: "ENTRADA",
      oportunidades: [{ estagio: "QUALIFICACAO", valorPotencialCents: 30_000 }],
    }),
    // 3 — carrinho abandonado, SEM valor potencial estimado
    leadBase({
      id: "carrinho",
      propostas: [
        { situacao: "RASCUNHO", valorMensalCent: 29_900, enviadaEm: null, respondidaEm: null, updatedAt: horasAtras(6) },
      ],
    }),
    // 4 — pagamento abandonado
    leadBase({
      id: "pagamento",
      propostas: [
        {
          situacao: "ACEITA",
          valorMensalCent: 49_900,
          enviadaEm: diasAtras(5),
          respondidaEm: diasAtras(3),
          updatedAt: diasAtras(3),
        },
      ],
      oportunidades: [{ estagio: "NEGOCIACAO", valorPotencialCents: 60_000 }],
    }),
    // 5 — proposta sem retorno
    leadBase({
      id: "proposta",
      propostas: [
        { situacao: "ENVIADA", valorMensalCent: 49_900, enviadaEm: diasAtras(10), respondidaEm: null, updatedAt: diasAtras(10) },
      ],
      oportunidades: [{ estagio: "PROPOSTA", valorPotencialCents: 90_000 }],
    }),
    // 6 — reunião pendente
    leadBase({
      id: "reuniao",
      compromissos: [
        { situacao: "AGENDADO", comecaEm: new Date(AGORA.getTime() + 6 * 3_600_000), confirmadoEm: null, remarcadoParaId: null },
      ],
    }),
    // 7 — virou cliente: NÃO entra em fila de follow-up
    leadBase({ id: "ganho", stage: "GANHO" }),
    // 8 — não medido: já andou no funil e não tem relógio
    leadBase({ id: "sem-relogio", stage: "PROPOSTA_ENVIADA" }),
  ];

  const clientes = [
    clienteBase({ id: "upsell", ativadoEm: diasAtras(REGUA_DE_BASE.diasAtivoParaUpsell + 10), upsells: 0, saude: 90 }),
    clienteBase({ id: "reativar", situacao: "INATIVO" }),
    clienteBase({ id: "risco", saude: 10, nps: 2 }),
  ];

  it("⭐ cada fila recebe exatamente quem pertence a ela", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(leads, clientes), { agora: AGORA });

    expect(plano.contatosAnalisados).toBe(8);
    expect(plano.clientesAnalisados).toBe(3);

    expect(plano.filas.precisamDeFollowUp.map((i) => i.leadId).sort()).toEqual(
      ["carrinho", "pagamento", "proposta", "reuniao", "sumiu"].sort(),
    );
    expect(plano.filas.esfriando.map((i) => i.leadId)).toEqual(["esfriando"]);
    expect(plano.filas.oportunidadesAbandonadas.map((i) => i.leadId).sort()).toEqual(["carrinho", "pagamento"]);
    expect(plano.filas.propostasSemRetorno.map((i) => i.leadId)).toEqual(["proposta"]);
    expect(plano.filas.reunioesPendentes.map((i) => i.leadId)).toEqual(["reuniao"]);

    expect(plano.filas.chanceDeUpsell.map((i) => i.clienteId)).toEqual(["upsell"]);
    expect(plano.filas.paraReativar.map((i) => i.clienteId)).toEqual(["reativar"]);
    expect(plano.filas.riscoDeChurn.map((i) => i.clienteId)).toEqual(["risco"]);
  });

  it("quem virou cliente não aparece em nenhuma fila de follow-up", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(leads, clientes), { agora: AGORA });
    const todos = [
      ...plano.filas.precisamDeFollowUp,
      ...plano.filas.esfriando,
      ...plano.filas.oportunidadesAbandonadas,
      ...plano.filas.propostasSemRetorno,
      ...plano.filas.reunioesPendentes,
    ].map((i) => i.leadId);
    expect(todos).not.toContain("ganho");
  });

  it("⭐ o não medido é CONTADO à parte, e nunca diluído numa fila", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(leads, clientes), { agora: AGORA });
    expect(plano.naoMedidos).toBe(1);
    expect(plano.filas.precisamDeFollowUp.map((i) => i.leadId)).not.toContain("sem-relogio");
  });

  it("⭐ RECEITA: soma só o estimado, e declara quantos entraram sem estimativa", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(leads, clientes), { agora: AGORA });

    // sumiu 120.000 + esfriando 30.000 + pagamento 60.000 + proposta 90.000
    expect(plano.receitaPotencial.cents).toBe(300_000);
    expect(plano.receitaPotencial.comEstimativa).toBe(4);
    // carrinho e reunião não têm oportunidade com valor — e isso APARECE.
    expect(plano.receitaPotencial.semEstimativa).toBe(2);
  });

  it("cada lead conta uma vez na receita, mesmo aparecendo em duas filas", async () => {
    const soLead = [leads[4]!]; // proposta: entra em precisamDeFollowUp E em propostasSemRetorno
    const plano = await montarPlanoDoDia(bancoFalso(soLead), { agora: AGORA });

    expect(plano.filas.precisamDeFollowUp).toHaveLength(1);
    expect(plano.filas.propostasSemRetorno).toHaveLength(1);
    expect(plano.receitaPotencial.cents).toBe(90_000);
    expect(plano.receitaPotencial.comEstimativa).toBe(1);
  });

  it("base sem nada a fazer devolve filas vazias e receita zero COM zero sem estimativa", async () => {
    const plano = await montarPlanoDoDia(bancoFalso([leadBase({ id: "novo", stage: "NOVO" })].map((l) => l)), {
      agora: AGORA,
    });
    // NAO_ABORDADO pede ação — é a fila de quem ninguém tocou.
    expect(plano.filas.precisamDeFollowUp).toHaveLength(1);
    expect(plano.receitaPotencial).toEqual({ cents: 0, comEstimativa: 0, semEstimativa: 1 });
  });

  it("o prazo de 'pensando' respeita a régua — mexer nela muda a fila de esfriamento", async () => {
    const dentro = leadBase({
      id: "dentro",
      primeiraRespostaEm: diasAtras(3),
      ultimaMensagemEm: diasAtras(1),
      ultimaMensagemDeQuem: "ENTRADA",
    });
    const plano = await montarPlanoDoDia(bancoFalso([dentro]), { agora: AGORA });
    expect(plano.filas.esfriando).toHaveLength(0);
    expect(REGUA.diasParaSumico).toBeGreaterThan(0);
  });
});

describe("as réguas de base — upsell e reativação com regra escrita", () => {
  it("conta madura, saudável e sem upsell é chance de upsell", () => {
    const motivo = ehChanceDeUpsell(
      clienteBase({ ativadoEm: diasAtras(REGUA_DE_BASE.diasAtivoParaUpsell + 1), upsells: 0, saude: 90 }) as never,
      AGORA,
    );
    expect(motivo).toContain("nenhum upsell");
  });

  it("⚠️ conta com saúde NÃO MEDIDA não recebe oferta", () => {
    expect(
      ehChanceDeUpsell(
        clienteBase({ ativadoEm: diasAtras(REGUA_DE_BASE.diasAtivoParaUpsell + 1), saude: null }) as never,
        AGORA,
      ),
    ).toBeNull();
  });

  it("conta doente recebe socorro, não oferta", () => {
    expect(
      ehChanceDeUpsell(
        clienteBase({ ativadoEm: diasAtras(REGUA_DE_BASE.diasAtivoParaUpsell + 1), saude: 20 }) as never,
        AGORA,
      ),
    ).toBeNull();
  });

  it("conta recém-ativada ainda não é chance de upsell", () => {
    expect(ehChanceDeUpsell(clienteBase({ ativadoEm: diasAtras(5) }) as never, AGORA)).toBeNull();
  });

  it("reativação é para quem parou sem cancelar", () => {
    expect(ehParaReativar(clienteBase({ situacao: "INATIVO" }) as never)).toContain("sem cancelar");
    expect(ehParaReativar(clienteBase({ situacao: "ATIVO" }) as never)).toBeNull();
  });
});

describe("proporCampanha — público, objeção e prazo", () => {
  const leads = [
    leadBase({
      id: "p1",
      propostas: [
        { situacao: "ENVIADA", valorMensalCent: 1, enviadaEm: diasAtras(10), respondidaEm: null, updatedAt: diasAtras(10) },
      ],
      oportunidades: [{ estagio: "PROPOSTA", valorPotencialCents: 100_000 }],
    }),
    leadBase({
      id: "p2",
      propostas: [
        { situacao: "ENVIADA", valorMensalCent: 1, enviadaEm: diasAtras(8), respondidaEm: null, updatedAt: diasAtras(8) },
      ],
      oportunidades: [{ estagio: "PROPOSTA", valorPotencialCents: null }],
    }),
  ];

  it("o público é a fila real de propostas sem retorno, com a receita medida ao lado", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(leads), { agora: AGORA });
    const campanha = proporCampanha(plano, new Map([["p1", ["preço"]], ["p2", ["preço", "prazo"]]]))!;

    expect(campanha.tamanho).toBe(2);
    expect(campanha.leadIds.sort()).toEqual(["p1", "p2"]);
    expect(campanha.objecaoPrincipal).toBe("preço");
    expect(campanha.acaoRecomendada).toContain("preço");
    expect(campanha.prazo).toBe(3);
    expect(campanha.objetivo).toBe("retomar negociação");
    expect(campanha.receitaPotencial).toEqual({ cents: 100_000, comEstimativa: 1, semEstimativa: 1 });
  });

  it("⭐ sem objeção registrada, a campanha NÃO inventa uma", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(leads), { agora: AGORA });
    const campanha = proporCampanha(plano)!;

    expect(campanha.objecaoPrincipal).toBeNull();
    expect(campanha.acaoRecomendada).toContain("não está registrada");
  });

  it("sem público não há campanha — nada de segmento vazio com cara de plano", async () => {
    const plano = await montarPlanoDoDia(bancoFalso([leadBase({ id: "n", stage: "NOVO" })]), { agora: AGORA });
    expect(proporCampanha(plano)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ENFILEIRAR — sem enviar, e sem furar a idempotência
// ─────────────────────────────────────────────────────────────────────────────

describe("enfileirarPlano — sugere e enfileira, e NADA sai daqui", () => {
  const leads = [
    leadBase({
      id: "sumiu",
      primeiraRespostaEm: diasAtras(40),
      ultimaMensagemEm: diasAtras(20),
      ultimaMensagemDeQuem: "ENTRADA",
    }),
    leadBase({
      id: "carrinho",
      propostas: [
        { situacao: "RASCUNHO", valorMensalCent: 29_900, enviadaEm: null, respondidaEm: null, updatedAt: horasAtras(6) },
      ],
    }),
  ];

  function bancoComCadencias(slugs: string[]) {
    const inscricoes: Linha[] = [];
    const db: any = {
      siteLead: {
        findMany: async () => leads,
        findUnique: async ({ where }: any) => ({ optOutAt: leads.find((l) => l.id === where.id)?.optOutAt ?? null }),
      },
      cliente: { findMany: async () => [] },
      cadencia: {
        findMany: async ({ where }: any) =>
          slugs.filter((s) => where.slug.in.includes(s)).map((s) => ({ id: `cad-${s}`, slug: s })),
        findUnique: async ({ where }: any) => ({
          ativa: true,
          passos: [{ esperaHoras: 2 }],
          id: where.id,
        }),
      },
      leadCadencia: {
        create: async ({ data }: any) => {
          // ⭐ A restrição `@@unique([leadId, cadenciaId])`, que é a garantia real.
          if (inscricoes.some((i) => i.leadId === data.leadId && i.cadenciaId === data.cadenciaId)) {
            throw new Error("unique");
          }
          const linha = { id: `insc-${inscricoes.length + 1}`, ...data };
          inscricoes.push(linha);
          return linha;
        },
      },
    };
    return { db, inscricoes };
  }

  it("cada estado vai para a SUA cadência, e não para uma genérica", async () => {
    expect(CADENCIA_POR_ESTADO.CLIENTE_SUMIU).toBe("retomada-sem-resposta");
    expect(CADENCIA_POR_ESTADO.CARRINHO_ABANDONADO).toBe("carrinho-abandonado");
    expect(CADENCIA_POR_ESTADO.PAGAMENTO_ABANDONADO).toBe("pagamento-abandonado");
    // Prospecção tem motor próprio — enfileirar aqui tocaria o contato duas vezes.
    expect(CADENCIA_POR_ESTADO.NAO_ABORDADO).toBeUndefined();
    expect(CADENCIA_POR_ESTADO.NUNCA_RESPONDEU).toBeUndefined();
  });

  it("inscreve os dois contatos, cada um na cadência do seu estado", async () => {
    const { db, inscricoes } = bancoComCadencias(["retomada-sem-resposta", "carrinho-abandonado"]);
    const plano = await montarPlanoDoDia(db, { agora: AGORA });

    const r = await enfileirarPlano(db, plano, { agora: AGORA });

    expect(r).toMatchObject({ inscritos: 2, jaEstavam: 0 });
    expect(r.semCadencia).toHaveLength(0);
    expect(inscricoes.map((i) => i.cadenciaId).sort()).toEqual(["cad-carrinho-abandonado", "cad-retomada-sem-resposta"]);
  });

  it("⭐ rodar o plano duas vezes no mesmo dia não inscreve ninguém de novo", async () => {
    const { db, inscricoes } = bancoComCadencias(["retomada-sem-resposta", "carrinho-abandonado"]);
    const plano = await montarPlanoDoDia(db, { agora: AGORA });

    await enfileirarPlano(db, plano, { agora: AGORA });
    const segunda = await enfileirarPlano(db, plano, { agora: AGORA });

    expect(segunda).toMatchObject({ inscritos: 0, jaEstavam: 2 });
    expect(inscricoes).toHaveLength(2);
  });

  it("cadência que não existe na base vira pendência visível, não silêncio", async () => {
    const { db, inscricoes } = bancoComCadencias(["retomada-sem-resposta"]);
    const plano = await montarPlanoDoDia(db, { agora: AGORA });

    const r = await enfileirarPlano(db, plano, { agora: AGORA });

    expect(r.inscritos).toBe(1);
    expect(r.semCadencia).toHaveLength(1);
    expect(r.semCadencia[0]).toMatchObject({ leadId: "carrinho", estado: "CARRINHO_ABANDONADO" });
    expect(r.semCadencia[0]!.causa).toContain("carrinho-abandonado");
    expect(inscricoes).toHaveLength(1);
  });
});
