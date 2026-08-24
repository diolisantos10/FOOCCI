/**
 * As regras de negócio da Sala: funil, follow-up, agenda, QA e painel.
 *
 * O fio que costura este arquivo é sempre o mesmo: **zero e "não sei" não são a
 * mesma coisa**, e quase todo teste aqui existe para provar que o código
 * distingue os dois. É a diferença entre um painel que informa e um painel que
 * acusa a operação de algo que ninguém mediu.
 */

import { describe, it, expect, vi } from "vitest";
import { validarMovimento, efeitoDeEntrar, ehTerminal } from "./funil";
import { validarTarefa } from "./followUp";
import { validarCompromisso, taxaDeComparecimento } from "./agenda";
import {
  validarAvaliacao, calcularNota, ehAlertaCritico, desempenhoDe, CRITERIOS,
} from "./qa";
import { taxa, MINIMO_PARA_TAXA, receitaGanha, tempoDePrimeiraResposta } from "./painel";

const AGORA = new Date("2026-08-25T12:00:00Z");

// ═══════════════════════════════════════════════════════════════════════════
// FUNIL
// ═══════════════════════════════════════════════════════════════════════════

describe("mover no funil", () => {
  it("avançar um degrau passa", () => {
    expect(validarMovimento({ de: "QUALIFICADO", para: "DEMO_AGENDADA" })).toEqual([]);
  });

  it("PULAR etapas é permitido", () => {
    // Um funil que só anda de um em um obriga o vendedor a mentir: a demo que
    // virou fechamento na mesma ligação passaria por três cliques em etapas que
    // nunca existiram.
    expect(validarMovimento({ de: "NOVO", para: "DEMO_REALIZADA" })).toEqual([]);
  });

  it("VOLTAR também", () => {
    // Quem "ia fechar" volta para negociação. Proibir faz o vendedor deixar o
    // lead na etapa errada — pior do que registrar o retrocesso.
    expect(validarMovimento({ de: "EM_NEGOCIACAO", para: "QUALIFICADO" })).toEqual([]);
  });

  it("ficar na mesma etapa não é movimento", () => {
    const r = validarMovimento({ de: "QUALIFICADO", para: "QUALIFICADO" });
    expect(r.map((x) => x.campo)).toContain("para");
  });

  it("perder SEM motivo estruturado é recusado", () => {
    // Motivo em texto livre não vira relatório: cada um escreve "caro", "achou
    // caro" e "sem verba", e a pergunta que paga a próxima decisão de produto
    // fica sem resposta.
    const r = validarMovimento({ de: "EM_NEGOCIACAO", para: "PERDIDO" });
    expect(r.map((x) => x.campo)).toContain("motivoPerdaId");
  });

  it("perder COM motivo passa", () => {
    const r = validarMovimento({ de: "EM_NEGOCIACAO", para: "PERDIDO", motivoPerdaId: "m1" });
    expect(r).toEqual([]);
  });

  it("uma nota não substitui o motivo estruturado", () => {
    const r = validarMovimento({
      de: "EM_NEGOCIACAO", para: "PERDIDO", nota: "achou caro demais",
    });
    expect(r.map((x) => x.campo)).toContain("motivoPerdaId");
  });

  it("sair de terminal exige gerente", () => {
    // GANHO virou contrato; PERDIDO entrou em relatório. Desfazer é correção, e
    // correção tem dono.
    const semGerente = validarMovimento({ de: "GANHO", para: "EM_NEGOCIACAO" });
    expect(semGerente.map((x) => x.campo)).toContain("de");

    const comGerente = validarMovimento({
      de: "GANHO", para: "EM_NEGOCIACAO", ehGerente: true,
    });
    expect(comGerente).toEqual([]);
  });

  it("NUTRICAO é terminal — mas não é perda", () => {
    expect(ehTerminal("NUTRICAO")).toBe(true);
    expect(ehTerminal("PERDIDO")).toBe(true);
    expect(ehTerminal("EM_NEGOCIACAO")).toBe(false);
  });
});

describe("o que acontece ao entrar numa etapa", () => {
  it("toda etapa em aberto marca uma próxima ação", () => {
    // "Nenhum lead em aberto deve ficar sem responsável e sem próxima ação."
    const abertas = [
      "NOVO", "PRIMEIRO_CONTATO", "EM_QUALIFICACAO", "QUALIFICADO",
      "DEMO_AGENDADA", "DEMO_REALIZADA", "PROPOSTA_ENVIADA", "EM_NEGOCIACAO",
    ] as const;

    for (const e of abertas) {
      expect(efeitoDeEntrar(e).proximaAcaoEmHoras, e).not.toBeNull();
    }
  });

  it("NOVO tem o prazo mais curto — é o único momento em que velocidade converte", () => {
    expect(efeitoDeEntrar("NOVO").proximaAcaoEmHoras).toBe(1);
  });

  it("demo agendada cobra a CONFIRMAÇÃO, não a demo", () => {
    // Demo marcada e não confirmada é a maior fonte de não comparecimento.
    expect(efeitoDeEntrar("DEMO_AGENDADA").proximaAcaoNota).toMatch(/[Cc]onfirmar/);
  });

  it("PERDIDO não marca próxima ação e encerra cadências", () => {
    const e = efeitoDeEntrar("PERDIDO");
    expect(e.proximaAcaoEmHoras).toBeNull();
    expect(e.encerraCadencias).toBe(true);
  });

  it("NUTRICAO encerra cadência MAS mantém data de volta", () => {
    // Sem data de retomada, nutrição é perda que ninguém admitiu — e a lista
    // cresce sem nunca ser trabalhada.
    const e = efeitoDeEntrar("NUTRICAO");
    expect(e.encerraCadencias).toBe(true);
    expect(e.proximaAcaoEmHoras).toBe(24 * 90);
  });

  it("GANHO prepara a implantação", () => {
    expect(efeitoDeEntrar("GANHO").preparaImplantacao).toBe(true);
  });

  it("e nenhuma outra etapa prepara", () => {
    expect(efeitoDeEntrar("PROPOSTA_ENVIADA").preparaImplantacao).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TAREFAS
// ═══════════════════════════════════════════════════════════════════════════

describe("uma tarefa", () => {
  const boa = { leadId: "l1", titulo: "Ligar", venceEm: new Date("2026-08-26T10:00:00Z") };

  it("completa passa", () => {
    expect(validarTarefa(boa, AGORA)).toEqual([]);
  });

  it("sem título não passa", () => {
    expect(validarTarefa({ ...boa, titulo: " " }, AGORA).map((r) => r.campo))
      .toContain("titulo");
  });

  it("sem prazo não passa — ela nunca apareceria em fila nenhuma", () => {
    const r = validarTarefa({ ...boa, venceEm: new Date("x") }, AGORA);
    expect(r.map((x) => x.campo)).toContain("venceEm");
  });

  it("prazo no passado recente é ACEITO — atraso real precisa aparecer", () => {
    // "Ligar hoje de manhã", registrada à tarde, é um atraso de verdade.
    const ontem = new Date(AGORA.getTime() - 86_400_000);
    expect(validarTarefa({ ...boa, venceEm: ontem }, AGORA)).toEqual([]);
  });

  it("prazo há mais de um ano é engano de digitação", () => {
    const r = validarTarefa({ ...boa, venceEm: new Date("2024-01-01") }, AGORA);
    expect(r.map((x) => x.campo)).toContain("venceEm");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AGENDA
// ═══════════════════════════════════════════════════════════════════════════

describe("um compromisso", () => {
  const bom = { leadId: "l1", titulo: "Demonstração", comecaEm: new Date("2026-08-26T15:00:00Z") };

  it("no futuro passa", () => {
    expect(validarCompromisso(bom, AGORA)).toEqual([]);
  });

  it("no passado é RECUSADO — ao contrário da tarefa", () => {
    // A diferença é real: tarefa vencida é trabalho atrasado; compromisso no
    // passado cria uma demo que nunca vai acontecer nem cobrar ninguém.
    const r = validarCompromisso({ ...bom, comecaEm: new Date("2026-08-24T10:00:00Z") }, AGORA);
    expect(r.map((x) => x.campo)).toContain("comecaEm");
  });

  it("duração absurda é recusada", () => {
    const r = validarCompromisso({ ...bom, duracaoMin: 900 }, AGORA);
    expect(r.map((x) => x.campo)).toContain("duracaoMin");
  });
});

describe("a taxa de comparecimento", () => {
  const db = (realizadas: number, faltaram: number) => ({
    leadCompromisso: {
      count: vi.fn().mockResolvedValueOnce(realizadas).mockResolvedValueOnce(faltaram),
    },
  });

  it("sem demonstração nenhuma NÃO é 0% nem 100%", () => {
    // As duas seriam mentiras convictas: 0% acusa uma operação que não fez nada
    // errado, e 100% comemora um mês em que ninguém marcou nada.
    return expect(
      taxaDeComparecimento(db(0, 0) as never, { de: AGORA, ate: AGORA }),
    ).resolves.toEqual({ medido: false, motivo: "semDemonstracoes" });
  });

  it("com demonstrações, calcula", async () => {
    const r = await taxaDeComparecimento(db(8, 2) as never, { de: AGORA, ate: AGORA });
    expect(r).toEqual({ medido: true, realizadas: 8, naoCompareceram: 2, taxa: 0.8 });
  });

  it("ninguém compareceu É zero — e aqui zero é verdade", async () => {
    const r = await taxaDeComparecimento(db(0, 5) as never, { de: AGORA, ate: AGORA });
    expect(r).toEqual({ medido: true, realizadas: 0, naoCompareceram: 5, taxa: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QA
// ═══════════════════════════════════════════════════════════════════════════

describe("uma avaliação de QA", () => {
  it("com notas boas passa", () => {
    expect(validarAvaliacao([
      { criterio: "ABERTURA", nota: 4 },
      { criterio: "CLAREZA", nota: 5 },
    ])).toEqual([]);
  });

  it("nota baixa SEM comentário é recusada", () => {
    // Um 1 sem explicação não ensina nada e não se defende. QA sem "por quê" é
    // só uma nota ruim no fim do mês.
    const r = validarAvaliacao([{ criterio: "OBJECOES", nota: 1 }]);
    expect(r.map((x) => x.campo)).toContain("OBJECOES");
  });

  it("nota baixa COM comentário passa", () => {
    expect(validarAvaliacao([
      { criterio: "OBJECOES", nota: 1, comentario: "não respondeu a objeção de preço" },
    ])).toEqual([]);
  });

  it("critério em branco NÃO exige comentário — não se aplica não é nota ruim", () => {
    expect(validarAvaliacao([
      { criterio: "FECHAMENTO", nota: null },
      { criterio: "ABERTURA", nota: 4 },
    ])).toEqual([]);
  });

  it("tudo em branco é uma avaliação vazia com aparência de completa", () => {
    const r = validarAvaliacao(CRITERIOS.map((c) => ({ criterio: c, nota: null })));
    expect(r.map((x) => x.campo)).toContain("criterios");
  });

  it("nenhum critério não avalia nada", () => {
    expect(validarAvaliacao([]).map((x) => x.campo)).toContain("criterios");
  });

  it("critério repetido é recusado", () => {
    const r = validarAvaliacao([
      { criterio: "CLAREZA", nota: 4 },
      { criterio: "CLAREZA", nota: 2, comentario: "x" },
    ]);
    expect(r.map((x) => x.campo)).toContain("CLAREZA");
  });

  it("nota fora da escala é recusada", () => {
    const r = validarAvaliacao([{ criterio: "CLAREZA", nota: 9 }]);
    expect(r.map((x) => x.campo)).toContain("CLAREZA");
  });
});

describe("a nota final", () => {
  it("critérios em branco saem do numerador E do denominador", () => {
    // Se ficassem no denominador, conversa curta e correta tiraria nota baixa
    // por não ter tido chance de pontuar — o vendedor punido pelo tamanho da
    // conversa, que é o defeito que o item 13 manda evitar.
    const r = calcularNota([
      { criterio: "ABERTURA", nota: 5 },
      { criterio: "CLAREZA", nota: 5 },
      { criterio: "FECHAMENTO", nota: null },
      { criterio: "OBJECOES", nota: null },
    ]);

    expect(r).toEqual({ calculada: true, nota: 100, criteriosContados: 2 });
  });

  it("tudo em branco não vira zero — vira 'nada se aplica'", () => {
    const r = calcularNota([{ criterio: "FECHAMENTO", nota: null }]);
    expect(r).toEqual({ calculada: false, motivo: "nadaSeAplica" });
  });

  it("é ponderada: conformidade pesa mais que abertura", () => {
    const conformidadeRuim = calcularNota([
      { criterio: "CONFORMIDADE", nota: 0, comentario: "x" },
      { criterio: "ABERTURA", nota: 5 },
    ]);
    const aberturaRuim = calcularNota([
      { criterio: "CONFORMIDADE", nota: 5 },
      { criterio: "ABERTURA", nota: 0, comentario: "x" },
    ]);

    expect(conformidadeRuim.calculada && conformidadeRuim.nota)
      .toBeLessThan(aberturaRuim.calculada ? aberturaRuim.nota : 0);
  });

  it("zerado em tudo é zero — e aqui zero é verdade", () => {
    const r = calcularNota([{ criterio: "CLAREZA", nota: 0, comentario: "x" }]);
    expect(r).toEqual({ calculada: true, nota: 0, criteriosContados: 1 });
  });
});

describe("o alerta crítico", () => {
  it("inventar informação dispara, mesmo com o resto bom", () => {
    // A média o esconderia atrás de um 78.
    expect(ehAlertaCritico([
      { criterio: "SEGURANCA_DA_INFORMACAO", nota: 0, comentario: "prometeu integração que não existe" },
      { criterio: "ABERTURA", nota: 5 },
      { criterio: "CLAREZA", nota: 5 },
    ])).toBe(true);
  });

  it("nota baixa em critério comum NÃO dispara", () => {
    expect(ehAlertaCritico([{ criterio: "ABERTURA", nota: 0, comentario: "x" }])).toBe(false);
  });

  it("conformidade zerada dispara", () => {
    expect(ehAlertaCritico([{ criterio: "CONFORMIDADE", nota: 1, comentario: "x" }])).toBe(true);
  });
});

describe("o desempenho de quem nunca foi avaliado", () => {
  const db = (count: number, media: number | null) => ({
    leadAvaliacaoQA: {
      aggregate: vi.fn().mockResolvedValue({ _avg: { nota: media }, _count: { _all: count } }),
      count: vi.fn().mockResolvedValue(0),
    },
  });

  it("NÃO é zero — é 'sem avaliações'", async () => {
    // Mostrar zero para quem nunca foi avaliado colocaria o SDR novo no fim do
    // ranking na primeira semana, sem ninguém ter olhado uma conversa dele.
    const r = await desempenhoDe(db(0, null) as never, { avaliadoUserId: "u1" });
    expect(r).toEqual({ medido: false, motivo: "semAvaliacoes" });
  });

  it("com avaliações, devolve a média", async () => {
    const r = await desempenhoDe(db(4, 82.4) as never, { avaliadoUserId: "u1" });
    expect(r).toEqual({ medido: true, media: 82, avaliacoes: 4, alertas: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL
// ═══════════════════════════════════════════════════════════════════════════

describe("uma taxa do painel", () => {
  it("com amostra suficiente, calcula", () => {
    expect(taxa(3, 10)).toEqual({ medido: true, valor: 0.3, base: 10 });
  });

  it("sem base nenhuma é 'sem dados'", () => {
    expect(taxa(0, 0)).toEqual({ medido: false, motivo: "semDados" });
  });

  it("amostra pequena tem motivo PRÓPRIO, e devolve a base", () => {
    // "3 de 5 necessários" é acionável; um traço mudo não é. E as duas negativas
    // são situações diferentes: uma vira a outra em uma semana.
    expect(taxa(1, 3)).toEqual({ medido: false, motivo: "amostraPequena", base: 3 });
  });

  it("exatamente no mínimo já vale", () => {
    const r = taxa(1, MINIMO_PARA_TAXA);
    expect(r.medido).toBe(true);
  });
});

describe("a receita", () => {
  const db = (propostas: Array<{ valorMensalCent: number | null }>) => ({
    leadProposta: { findMany: vi.fn().mockResolvedValue(propostas) },
  });

  it("com valores, soma", async () => {
    const r = await receitaGanha(
      db([{ valorMensalCent: 29900 }, { valorMensalCent: 49900 }]) as never,
      { de: AGORA, ate: AGORA },
    );
    expect(r).toEqual({ medido: true, centavos: 79800, propostas: 2 });
  });

  it("propostas aceitas SEM valor não viram R$ 0", async () => {
    // O CEO não fechou os valores dos planos. "Receita: R$ 0" ao lado de "8
    // aceitas" seria lido como defeito do sistema — e estaria certo.
    const r = await receitaGanha(
      db([{ valorMensalCent: null }, { valorMensalCent: null }]) as never,
      { de: AGORA, ate: AGORA },
    );
    expect(r).toEqual({ medido: false, motivo: "semValores", propostas: 2 });
  });

  it("nenhuma proposta aceita tem motivo diferente de 'sem valores'", async () => {
    const r = await receitaGanha(db([]) as never, { de: AGORA, ate: AGORA });
    expect(r).toEqual({ medido: false, motivo: "semPropostas" });
  });

  it("mistura de com e sem valor soma só as que têm, e diz quantas", async () => {
    const r = await receitaGanha(
      db([{ valorMensalCent: 29900 }, { valorMensalCent: null }]) as never,
      { de: AGORA, ate: AGORA },
    );
    expect(r).toEqual({ medido: true, centavos: 29900, propostas: 1 });
  });
});

describe("o tempo de primeira resposta", () => {
  const db = (leads: Array<{ createdAt: Date; primeiraRespostaEm: Date }>) => ({
    siteLead: { findMany: vi.fn().mockResolvedValue(leads) },
  });

  it("devolve a BASE junto com a média", async () => {
    // Sem a fração, o indicador MELHORA quando a operação piora: quanto menos
    // gente responde, melhor a média dos que responderam.
    const r = await tempoDePrimeiraResposta(
      db([
        { createdAt: new Date("2026-08-25T10:00:00Z"), primeiraRespostaEm: new Date("2026-08-25T10:10:00Z") },
        { createdAt: new Date("2026-08-25T10:00:00Z"), primeiraRespostaEm: new Date("2026-08-25T10:20:00Z") },
      ]) as never,
      { de: AGORA, ate: AGORA },
    );

    expect(r).toEqual({ medido: true, minutos: 15, base: 2 });
  });

  it("ninguém respondeu é 'sem dados', não zero minutos", async () => {
    const r = await tempoDePrimeiraResposta(db([]) as never, { de: AGORA, ate: AGORA });
    expect(r).toEqual({ medido: false, motivo: "semDados" });
  });
});
