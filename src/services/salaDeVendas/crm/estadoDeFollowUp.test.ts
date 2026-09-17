/**
 * O ESTADO DE FOLLOW-UP — um caso por estado, e a ordem das regras.
 *
 * ── POR QUE CADA ESTADO GANHA UM TESTE PRÓPRIO ──────────────────────────────
 *
 * O defeito que este bloco existe para consertar é justamente o oposto: um
 * único `if` de "não respondeu" atendendo nove situações. Um teste que só
 * conferisse "classificou alguma coisa" reprovaria esse defeito com nota verde
 * — a régua no componente errado. Por isso a asserção é sempre sobre o estado
 * **específico** e sobre a **regra** que o produziu.
 */

import { describe, it, expect, vi } from "vitest";
import {
  REGUA,
  REGRAS,
  classificarFollowUp,
  estaEsfriando,
  pedeAcao,
  fichaDaLinha,
  notaDaClassificacao,
  chaveDaClassificacao,
  registrarClassificacao,
  type FichaParaClassificar,
} from "./estadoDeFollowUp";

const AGORA = new Date("2026-09-17T12:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000);
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000);
const horasAFrente = (h: number) => new Date(AGORA.getTime() + h * 3_600_000);

function ficha(p: Partial<FichaParaClassificar> = {}): FichaParaClassificar {
  return {
    leadId: "lead-1",
    nome: "Sushi House",
    stage: "EM_QUALIFICACAO",
    temperatura: null,
    score: null,
    optOutAt: null,
    lastContactedAt: null,
    primeiraRespostaEm: null,
    ultimaEntradaEm: null,
    propostas: [],
    compromissos: [],
    temOportunidadeGanha: false,
    valorPotencialCents: null,
    ...p,
  };
}

describe("classificarFollowUp — um estado por situação, como o documento exige", () => {
  it("quem pediu silêncio não entra em fila nenhuma", () => {
    const c = classificarFollowUp(ficha({ optOutAt: diasAtras(1) }), AGORA);
    expect(c.estado).toBe("PEDIU_SILENCIO");
    expect(c.regra).toBe("silencio");
  });

  it("quem fechou a venda sai do follow-up comercial", () => {
    expect(classificarFollowUp(ficha({ stage: "GANHO" }), AGORA).estado).toBe("VIROU_CLIENTE");
    expect(classificarFollowUp(ficha({ temOportunidadeGanha: true }), AGORA).estado).toBe("VIROU_CLIENTE");
  });

  it("venda perdida é estado próprio, e não sumiço", () => {
    const c = classificarFollowUp(ficha({ stage: "PERDIDO", ultimaEntradaEm: diasAtras(60) }), AGORA);
    expect(c.estado).toBe("VENDA_PERDIDA");
  });

  it("oportunidade futura é decisão, não descuido", () => {
    expect(classificarFollowUp(ficha({ stage: "NUTRICAO" }), AGORA).estado).toBe("OPORTUNIDADE_FUTURA");
    expect(classificarFollowUp(ficha({ temperatura: "NUTRICAO" }), AGORA).estado).toBe("OPORTUNIDADE_FUTURA");
  });

  it("lead sem perfil sai por desqualificação OU por score medido abaixo do piso", () => {
    expect(classificarFollowUp(ficha({ temperatura: "DESQUALIFICADO" }), AGORA).estado).toBe("LEAD_SEM_PERFIL");
    expect(classificarFollowUp(ficha({ score: REGUA.pisoDePerfil - 1 }), AGORA).estado).toBe("LEAD_SEM_PERFIL");
  });

  it("⚠️ score null é 'ninguém mediu' e NUNCA vira lead sem perfil", () => {
    const c = classificarFollowUp(ficha({ score: null, lastContactedAt: diasAtras(2) }), AGORA);
    expect(c.estado).not.toBe("LEAD_SEM_PERFIL");
    expect(c.estado).toBe("NUNCA_RESPONDEU");
  });

  it("pagamento abandonado: aceitou e não pagou", () => {
    const c = classificarFollowUp(
      ficha({
        propostas: [
          {
            situacao: "ACEITA",
            valorMensalCent: 49_900,
            enviadaEm: diasAtras(5),
            respondidaEm: horasAtras(REGUA.horasParaPagamentoAbandonado + 1),
            atualizadaEm: horasAtras(30),
          },
        ],
      }),
      AGORA,
    );
    expect(c.estado).toBe("PAGAMENTO_ABANDONADO");
    expect(c.porque).toContain("link");
  });

  it("pagamento aceito há pouco ainda NÃO é abandono", () => {
    const c = classificarFollowUp(
      ficha({
        lastContactedAt: horasAtras(1),
        propostas: [
          {
            situacao: "ACEITA",
            valorMensalCent: 49_900,
            enviadaEm: horasAtras(4),
            respondidaEm: horasAtras(1),
            atualizadaEm: horasAtras(1),
          },
        ],
      }),
      AGORA,
    );
    expect(c.estado).not.toBe("PAGAMENTO_ABANDONADO");
  });

  it("carrinho abandonado: proposta montada COM valor e nunca enviada", () => {
    const c = classificarFollowUp(
      ficha({
        propostas: [
          {
            situacao: "RASCUNHO",
            valorMensalCent: 29_900,
            enviadaEm: null,
            respondidaEm: null,
            atualizadaEm: horasAtras(REGUA.horasParaCarrinhoAbandonado + 1),
          },
        ],
      }),
      AGORA,
    );
    expect(c.estado).toBe("CARRINHO_ABANDONADO");
  });

  it("rascunho SEM valor não é carrinho — é proposta que nem existe ainda", () => {
    const c = classificarFollowUp(
      ficha({
        lastContactedAt: diasAtras(1),
        propostas: [
          {
            situacao: "RASCUNHO",
            valorMensalCent: null,
            enviadaEm: null,
            respondidaEm: null,
            atualizadaEm: horasAtras(100),
          },
        ],
      }),
      AGORA,
    );
    expect(c.estado).not.toBe("CARRINHO_ABANDONADO");
  });

  it("proposta parada: enviada, sem resposta, passado o prazo", () => {
    const c = classificarFollowUp(
      ficha({
        propostas: [
          {
            situacao: "ENVIADA",
            valorMensalCent: 49_900,
            enviadaEm: diasAtras(REGUA.diasParaPropostaParada + 1),
            respondidaEm: null,
            atualizadaEm: diasAtras(4),
          },
        ],
      }),
      AGORA,
    );
    expect(c.estado).toBe("PROPOSTA_PARADA");
  });

  it("proposta respondida não é proposta parada", () => {
    const c = classificarFollowUp(
      ficha({
        ultimaEntradaEm: diasAtras(1),
        propostas: [
          {
            situacao: "EM_NEGOCIACAO",
            valorMensalCent: 49_900,
            enviadaEm: diasAtras(10),
            respondidaEm: diasAtras(1),
            atualizadaEm: diasAtras(1),
          },
        ],
      }),
      AGORA,
    );
    expect(c.estado).toBe("PENSANDO");
  });

  it("reunião pendente: marcada dentro da janela e sem confirmação", () => {
    const c = classificarFollowUp(
      ficha({
        compromissos: [
          { situacao: "AGENDADO", comecaEm: horasAFrente(12), confirmadoEm: null, remarcadoParaId: null },
        ],
      }),
      AGORA,
    );
    expect(c.estado).toBe("REUNIAO_PENDENTE");
  });

  it("reunião pendente também cobre a falta sem remarcação", () => {
    const c = classificarFollowUp(
      ficha({
        compromissos: [
          { situacao: "NAO_COMPARECEU", comecaEm: diasAtras(2), confirmadoEm: null, remarcadoParaId: null },
        ],
      }),
      AGORA,
    );
    expect(c.estado).toBe("REUNIAO_PENDENTE");
    expect(c.porque).toContain("remarcou");
  });

  it("faltou mas foi remarcado: a agenda tem próximo encontro, não é pendência", () => {
    const c = classificarFollowUp(
      ficha({
        lastContactedAt: diasAtras(1),
        compromissos: [
          { situacao: "NAO_COMPARECEU", comecaEm: diasAtras(2), confirmadoEm: null, remarcadoParaId: "outro" },
        ],
      }),
      AGORA,
    );
    expect(c.estado).not.toBe("REUNIAO_PENDENTE");
  });

  it("⭐ 'sumiu' e 'pensando' são separados pela janela, e só valem para quem JÁ falou", () => {
    const sumiu = classificarFollowUp(
      ficha({ primeiraRespostaEm: diasAtras(30), ultimaEntradaEm: diasAtras(REGUA.diasParaSumico + 1) }),
      AGORA,
    );
    expect(sumiu.estado).toBe("CLIENTE_SUMIU");

    const pensando = classificarFollowUp(
      ficha({ primeiraRespostaEm: diasAtras(5), ultimaEntradaEm: diasAtras(2) }),
      AGORA,
    );
    expect(pensando.estado).toBe("PENSANDO");
  });

  it("quem nunca respondeu não 'sumiu' — o problema é a abordagem", () => {
    const c = classificarFollowUp(ficha({ lastContactedAt: diasAtras(20) }), AGORA);
    expect(c.estado).toBe("NUNCA_RESPONDEU");
    expect(c.porque).toContain("abordagem");
  });

  it("ninguém falou com ele ainda", () => {
    expect(classificarFollowUp(ficha({ stage: "NOVO" }), AGORA).estado).toBe("NAO_ABORDADO");
  });

  it("o toque recente NOSSO segura o relógio do sumiço", () => {
    // Respondeu há 20 dias, mas nós falamos ontem: a conversa andou.
    const c = classificarFollowUp(
      ficha({ primeiraRespostaEm: diasAtras(20), ultimaEntradaEm: diasAtras(20), lastContactedAt: diasAtras(1) }),
      AGORA,
    );
    expect(c.estado).toBe("PENSANDO");
  });
});

describe("a ordem das regras é normativa", () => {
  it("silêncio vence tudo — inclusive proposta parada e reunião pendente", () => {
    const c = classificarFollowUp(
      ficha({
        optOutAt: diasAtras(1),
        propostas: [
          { situacao: "ENVIADA", valorMensalCent: 1, enviadaEm: diasAtras(30), respondidaEm: null, atualizadaEm: diasAtras(30) },
        ],
        compromissos: [
          { situacao: "NAO_COMPARECEU", comecaEm: diasAtras(2), confirmadoEm: null, remarcadoParaId: null },
        ],
      }),
      AGORA,
    );
    expect(c.estado).toBe("PEDIU_SILENCIO");
  });

  it("cliente ganho não é contado como proposta sem retorno", () => {
    const c = classificarFollowUp(
      ficha({
        stage: "GANHO",
        propostas: [
          { situacao: "ENVIADA", valorMensalCent: 1, enviadaEm: diasAtras(30), respondidaEm: null, atualizadaEm: diasAtras(30) },
        ],
      }),
      AGORA,
    );
    expect(c.estado).toBe("VIROU_CLIENTE");
  });

  it("a lista de códigos de regra está congelada — trocar a ordem é mudar a doutrina", () => {
    expect(REGRAS.map((r) => r.codigo)).toEqual([
      "silencio",
      "virou-cliente",
      "perdido",
      "futura",
      "sem-perfil",
      "pagamento-abandonado",
      "carrinho-abandonado",
      "proposta-parada",
      "reuniao-pendente",
      "sem-relogio",
      "sumiu",
      "pensando",
      "nunca-respondeu",
      "nao-abordado",
    ]);
  });
});

describe("nunca chutar — NAO_MEDIDO é estado, não desculpa", () => {
  it("⭐ lead que já andou no funil e não tem NENHUM relógio não vira 'não abordado'", () => {
    const c = classificarFollowUp(
      ficha({ stage: "PROPOSTA_ENVIADA", lastContactedAt: null, primeiraRespostaEm: null, ultimaEntradaEm: null }),
      AGORA,
    );
    expect(c.estado).toBe("NAO_MEDIDO");
    expect(c.regra).toBe("sem-relogio");
    expect(c.medido).toBe(false);
  });

  it("nas etapas de entrada, não ter relógio é normal — e ali é NAO_ABORDADO mesmo", () => {
    for (const stage of ["NOVO", "DISPONIVEL_PARA_PROSPECCAO"] as const) {
      const c = classificarFollowUp(ficha({ stage }), AGORA);
      expect(c.estado).toBe("NAO_ABORDADO");
      expect(c.medido).toBe(true);
    }
  });

  it("NAO_MEDIDO não pede ação e não conta como esfriando", () => {
    const c = classificarFollowUp(ficha({ stage: "EM_NEGOCIACAO" }), AGORA);
    expect(c.estado).toBe("NAO_MEDIDO");
    expect(pedeAcao(c)).toBe(false);
    expect(estaEsfriando(c)).toBe(false);
  });
});

describe("esfriando é 'pensando' perto de virar sumiço", () => {
  it("dentro da primeira metade da janela não está esfriando", () => {
    const c = classificarFollowUp(ficha({ primeiraRespostaEm: diasAtras(5), ultimaEntradaEm: diasAtras(1) }), AGORA);
    expect(c.estado).toBe("PENSANDO");
    expect(estaEsfriando(c)).toBe(false);
  });

  it("passada a metade da janela, está esfriando", () => {
    const c = classificarFollowUp(ficha({ primeiraRespostaEm: diasAtras(10), ultimaEntradaEm: diasAtras(5) }), AGORA);
    expect(c.estado).toBe("PENSANDO");
    expect(estaEsfriando(c)).toBe(true);
  });
});

describe("fichaDaLinha — a direção da última mensagem importa", () => {
  it("última mensagem NOSSA não conta como resposta dele", () => {
    const f = fichaDaLinha({
      id: "l1",
      nome: "Bar do Zé",
      stage: "PRIMEIRO_CONTATO",
      temperatura: null,
      score: null,
      optOutAt: null,
      lastContactedAt: diasAtras(1),
      primeiraRespostaEm: null,
      ultimaMensagemEm: diasAtras(1),
      ultimaMensagemDeQuem: "SAIDA",
      propostas: [],
      compromissos: [],
      oportunidades: [],
    });
    expect(f.ultimaEntradaEm).toBeNull();
    expect(classificarFollowUp(f, AGORA).estado).toBe("NUNCA_RESPONDEU");
  });

  it("oportunidade GANHA e valor potencial da aberta chegam à ficha", () => {
    const f = fichaDaLinha({
      id: "l2",
      nome: "Cantina",
      stage: "EM_NEGOCIACAO",
      temperatura: null,
      score: null,
      optOutAt: null,
      lastContactedAt: null,
      primeiraRespostaEm: null,
      ultimaMensagemEm: null,
      ultimaMensagemDeQuem: null,
      propostas: [],
      compromissos: [],
      oportunidades: [
        { estagio: "PERDIDA", valorPotencialCents: 999 },
        { estagio: "NEGOCIACAO", valorPotencialCents: 120_000 },
      ],
    });
    expect(f.valorPotencialCents).toBe(120_000);
    expect(f.temOportunidadeGanha).toBe(false);
  });
});

describe("a trilha guarda o estado E o porquê", () => {
  function bancoFalso() {
    const interacoes: Record<string, unknown>[] = [];
    const eventos: Record<string, unknown>[] = [];

    return {
      interacoes,
      eventos,
      db: {
        siteLeadInteraction: {
          findFirst: vi.fn(async ({ where }: { where: { leadId: string; nota: string } }) => {
            return interacoes.find((i) => i.leadId === where.leadId && i.nota === where.nota) ?? null;
          }),
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            interacoes.push({ ...data, createdAt: AGORA });
            return data;
          }),
        },
        eventoDaJornada: {
          createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
            const novo = data[0]!;
            const chave = novo.chaveDeIdempotencia;
            if (chave && eventos.some((e) => e.chaveDeIdempotencia === chave)) return { count: 0 };
            eventos.push(novo);
            return { count: 1 };
          }),
        },
      } as never,
    };
  }

  const classificacao = classificarFollowUp(
    ficha({ primeiraRespostaEm: diasAtras(30), ultimaEntradaEm: diasAtras(20) }),
    AGORA,
  );

  it("a nota traz estado, regra e porquê", () => {
    const nota = notaDaClassificacao(classificacao);
    expect(nota).toContain("CLIENTE_SUMIU");
    expect(nota).toContain('regra "sumiu"');
    expect(nota).toContain("silêncio");
  });

  it("grava na conversa do lead mesmo sem empresa — é onde está a maioria da base", async () => {
    const { db, interacoes, eventos } = bancoFalso();
    const r = await registrarClassificacao(db, { leadId: "lead-1", classificacao, autoria: { autor: "IA", label: "CRM IA" }, agora: AGORA });

    expect(r.gravou).toBe(true);
    expect(r.naJornada).toBe(false);
    expect(interacoes).toHaveLength(1);
    expect(interacoes[0]!.interna).toBe(true);
    expect(eventos).toHaveLength(0);
  });

  it("⭐ rodar duas vezes no mesmo dia não duplica — nem na conversa, nem na jornada", async () => {
    const { db, interacoes, eventos } = bancoFalso();
    const params = {
      leadId: "lead-1",
      classificacao,
      autoria: { autor: "IA" as const, label: "CRM IA" },
      empresaId: "emp-1",
      agora: AGORA,
    };

    const primeira = await registrarClassificacao(db, params);
    const segunda = await registrarClassificacao(db, params);

    expect(primeira).toEqual({ gravou: true, naJornada: true });
    expect(segunda).toEqual({ gravou: false, naJornada: false });
    expect(interacoes).toHaveLength(1);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.motivo).toBe("CLIENTE_SUMIU");
  });

  it("a chave carrega o dia — no dia seguinte a mesma situação grava de novo", () => {
    const hoje = chaveDaClassificacao("lead-1", classificacao, AGORA);
    const amanha = chaveDaClassificacao("lead-1", classificacao, new Date("2026-09-18T09:00:00Z"));
    expect(hoje).not.toBe(amanha);
    expect(hoje).toContain("2026-09-17");
  });
});
