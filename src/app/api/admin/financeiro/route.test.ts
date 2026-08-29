/**
 * A PORTA DO FINANCEIRO, EXERCITADA PELA PORTA.
 *
 * ── POR QUE PELA PORTA, E NÃO PELA TELA ─────────────────────────────────────
 *
 * A tela esconde o item do menu de quem não pode e trava o botão sem os campos
 * essenciais. Nada disso é autorização nem validação: é conveniência. Quem
 * souber o endereço manda o JSON que quiser, e é assim que estes testes mandam —
 * sem passar por tela nenhuma. É o caminho de quem quer burlar, e é por ele que
 * a rota precisa ser exercitada.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece barrando quem não pode E deixando passar quem pode. Um
 * arquivo só com a primeira metade ficaria verde contra uma rota que recusasse
 * todo mundo — indistinguível de uma rota quebrada, com o agravante de parecer
 * segura.
 *
 * ── OS DOIS DEFEITOS MAIS CAROS QUE ESTE ARQUIVO TRANCA ─────────────────────
 *
 *   · **O autor vindo do corpo.** `criadoPor` responde "quem afirmou que a
 *     empresa pagou isto". Se o formulário pudesse escolher esse nome, o
 *     registro de responsabilidade seria escrito por quem age — o mesmo que não
 *     existir.
 *   · **O vendedor lendo a conta da empresa.** Esta tela mostra o prejuízo
 *     inteiro numa fase sem cliente. É o número mais sensível da casa, e ele
 *     não é assunto de quem vende nem de quem audita conversa.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

const autorizarInterno = vi.fn();
const criarEvento = vi.fn();
const acharLogsDeIa = vi.fn();
const acharGastos = vi.fn();
const criarGasto = vi.fn();

vi.mock("@/lib/internal-auth", async () => {
  const real = await vi.importActual<typeof import("@/lib/internal-auth")>("@/lib/internal-auth");
  return { ...real, autorizarInterno: (...a: unknown[]) => autorizarInterno(...a) };
});

// Os serviços têm testes próprios. Aqui o assunto é o que a rota monta em volta
// deles: quem entra, o que ela recusa antes de chamar, e o que devolve à tela.
// As funções puras seguem sendo as de verdade — só o banco é de mentira.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    internalAuditEvent: { create: (...a: unknown[]) => criarEvento(...a) },
    aIInteractionLog: { findMany: (...a: unknown[]) => acharLogsDeIa(...a) },
    gastoManual: {
      findMany: (...a: unknown[]) => acharGastos(...a),
      create: (...a: unknown[]) => criarGasto(...a),
    },
  },
}));

const CEO = {
  userId: "u-ceo",
  nome: "Dioli",
  role: "MASTER_CEO" as const,
  departamentos: [],
  gerencia: [],
};
const DIRETOR = { ...CEO, userId: "u-dir", nome: "Ana", role: "DIRETOR_FOOCCI" as const };
const SDR = { ...CEO, userId: "u-sdr", nome: "Marina", role: "AGENTE_HUMANO" as const };
const GERENTE = { ...CEO, userId: "u-ger", nome: "Léo", role: "GERENTE_DEPARTAMENTO" as const };
const AUDITOR = { ...CEO, userId: "u-qa", nome: "QA", role: "AUDITOR_QA" as const };

const ROTA = "/api/admin/financeiro";

function post(corpo: unknown): NextRequest {
  return new NextRequest(
    new Request(`https://foocci.com.br${ROTA}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
}

function get(): NextRequest {
  return new NextRequest(new Request(`https://foocci.com.br${ROTA}`));
}

/** O lançamento que se sustenta. Cada teste mexe em um campo só. */
function lancamento(over: Record<string, unknown> = {}) {
  return {
    descricao: "Fatura Railway de agosto",
    categoria: "hospedagem",
    fornecedor: "Railway",
    valorCent: 12_345,
    moeda: "BRL",
    // Ontem em São Paulo, seja qual for o dia em que a suíte rodar: competência
    // no futuro é recusada, e cravar uma data fixa faria este arquivo apodrecer.
    competencia: ontemEmSaoPaulo(),
    ...over,
  };
}

function ontemEmSaoPaulo(): string {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

const semSessao = () =>
  autorizarInterno.mockReturnValue({
    ok: false,
    status: 401,
    motivo: "sem sessão interna",
    sessao: null,
  });

const comPapel = (sessao: typeof CEO) => {
  // `autorizarInterno` de verdade é quem confere o papel; aqui o molde repete a
  // decisão dele para que o teste possa exercitar cada papel sem forjar cookie.
  const permitido = sessao.role === "MASTER_CEO" || sessao.role === "DIRETOR_FOOCCI";
  autorizarInterno.mockReturnValue(
    permitido
      ? { ok: true, sessao }
      : { ok: false, status: 403, motivo: `papel ${sessao.role} não atende`, sessao },
  );
};

beforeEach(() => {
  autorizarInterno.mockReset().mockReturnValue({ ok: true, sessao: CEO });
  criarEvento.mockReset().mockResolvedValue({});
  acharLogsDeIa.mockReset().mockResolvedValue([]);
  acharGastos.mockReset().mockResolvedValue([]);
  criarGasto.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "g-1",
    ...data,
  }));
});

// ═══════════════════════════════════════════════════════════════════════════
// QUEM ENTRA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o financeiro é do dono da casa", () => {
  it("o CEO lê a conta: é o pedido que fez esta tela existir", async () => {
    // A metade que PASSA. Sem ela, tudo abaixo ficaria verde contra uma rota que
    // recusasse todo mundo — e o CEO continuaria sem saber quanto gastou ontem.
    comPapel(CEO);

    const { GET } = await import("./route");
    const res = await GET(get());

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("o Diretor também", async () => {
    comPapel(DIRETOR);

    const { GET } = await import("./route");
    expect((await GET(get())).status).toBe(200);
  });

  it("⭐ sem sessão, 401 — e o banco NÃO é consultado", async () => {
    // Esconder o item do menu não é autorização. Quem digitar o endereço direto
    // bate aqui, e é aqui que a porta fecha.
    semSessao();

    const { GET } = await import("./route");
    const res = await GET(get());

    expect(res.status).toBe(401);
    expect(acharLogsDeIa).not.toHaveBeenCalled();
    expect(acharGastos).not.toHaveBeenCalled();
  });

  it("⭐ o vendedor NÃO lê a conta da empresa — 403", async () => {
    // Critério 6 do CEO levado a sério: o SDR alcança a Sala e nada mais. E
    // aqui não é uma tela qualquer — é o prejuízo da empresa inteira.
    comPapel(SDR);

    const { GET } = await import("./route");
    expect((await GET(get())).status).toBe(403);
    expect(acharLogsDeIa).not.toHaveBeenCalled();
  });

  it("o gerente de departamento e a auditoria também não", async () => {
    // A auditoria lê muito — trilha e conversa. A conta da empresa não é isso.
    for (const sessao of [GERENTE, AUDITOR]) {
      comPapel(sessao);
      const { GET } = await import("./route");
      expect((await GET(get())).status, sessao.role).toBe(403);
    }
  });

  it("⭐ a negativa entra na trilha ANTES de a resposta sair", async () => {
    // Uma tentativa de ler a conta da empresa por quem não pode só tem valor se
    // ficar registrada. Descobrir depois que aconteceu, sem data e sem nome,
    // não serve para nada.
    comPapel(SDR);

    const { GET } = await import("./route");
    await GET(get());

    expect(criarEvento).toHaveBeenCalledTimes(1);
    const evento = criarEvento.mock.calls[0]![0].data;
    expect(evento.resultado).toBe("NEGADO");
    expect(evento.recurso).toBe("financeiro");
    expect(evento.actorLabel).toContain("u-sdr");
  });

  it("trilha fora do ar NÃO abre a porta", async () => {
    // A negativa vale mesmo que o registro dela falhe. Um `await` sem try/catch
    // aqui transformaria banco indisponível em 500 — e um 500 numa rota
    // protegida é o tipo de coisa que alguém "conserta" abrindo a porta.
    comPapel(SDR);
    criarEvento.mockRejectedValue(new Error("banco fora"));

    const { GET } = await import("./route");
    expect((await GET(get())).status).toBe(403);
  });

  it("⭐ a lista de papéis é EXATAMENTE dois — e ela não cresce sem alguém ver", async () => {
    /*
      ── A LACUNA QUE ESTE CASO FECHA, ACHADA QUEBRANDO DE PROPÓSITO ─────────

      Os casos acima trocam a SESSÃO e conferem o 403. Só que quem decide se o
      papel serve é `autorizarInterno`, e ele está dublado neste arquivo — então
      alargar `PAPEIS_DO_FINANCEIRO` para incluir o vendedor **não fazia nenhum
      teste reprovar**. A porta ficava escancarada com a suíte verde.

      Aqui a asserção é sobre o que a rota PEDE ao portão, que é a única coisa
      que ela realmente controla. Um papel a mais na lista reprova aqui, e quem
      o acrescentar terá de explicar por quê no diff.
    */
    comPapel(CEO);

    const { GET, POST } = await import("./route");
    await GET(get());
    await POST(post(lancamento()));

    for (const [, exigencia] of autorizarInterno.mock.calls as Array<
      [unknown, { papeis: readonly string[] }]
    >) {
      expect([...exigencia.papeis].sort()).toEqual(["DIRETOR_FOOCCI", "MASTER_CEO"]);
    }
    // As duas portas — ler e escrever — pediram a MESMA lista. Uma leitura
    // fechada com uma escrita aberta é o defeito clássico de RBAC feito rota a
    // rota, e aqui a escrita é pior: ela ENTRA na conta.
    expect(autorizarInterno.mock.calls.length).toBe(2);
  });

  it("⭐ o POST fecha para os mesmos papéis que o GET", async () => {
    // Uma porta de leitura fechada com a de escrita aberta é o defeito clássico
    // de RBAC feito rota a rota. Aqui a escrita é pior: ela ENTRA na conta.
    for (const sessao of [SDR, GERENTE, AUDITOR]) {
      comPapel(sessao);
      const { POST } = await import("./route");
      expect((await POST(post(lancamento()))).status, sessao.role).toBe(403);
    }
    expect(criarGasto).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A ASSINATURA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o autor vem da sessão, e o corpo não consegue escolher outro", () => {
  it("⭐ o autor forjado no corpo é IGNORADO", async () => {
    comPapel(CEO);

    const { POST } = await import("./route");
    await POST(
      post(
        lancamento({
          // Tudo isto é o que um pedido forjado mandaria. Nada disso é lido.
          criadoPor: "Fulano que não existe",
          autor: "u-outro",
          quem: "u-outro",
          criadoEm: "2020-01-01",
        }),
      ),
    );

    const gravado = criarGasto.mock.calls[0]![0].data;
    expect(gravado.criadoPor).toBe("Dioli (u-ceo)");
    expect(gravado.criadoPor).not.toContain("Fulano");
  });

  it("trocar a sessão troca o autor — é ela, e só ela, que decide", async () => {
    // A metade que passa: o autor não é uma constante escrita na rota, é quem
    // está logado. Sem este caso, um `criadoPor: "Dioli"` cravado no código
    // passaria no teste acima.
    comPapel(DIRETOR);

    const { POST } = await import("./route");
    await POST(post(lancamento({ criadoPor: "Fulano" })));

    expect(criarGasto.mock.calls[0]![0].data.criadoPor).toBe("Ana (u-dir)");
  });

  it("⭐ o corpo também não escolhe a data de criação", async () => {
    // `criadoEm` é o `@default(now())` do banco. Se ele viajasse no corpo, um
    // lançamento poderia nascer datado de antes de a empresa existir — e a
    // trilha de quando cada gasto foi registrado deixaria de valer.
    comPapel(CEO);

    const { POST } = await import("./route");
    await POST(post(lancamento({ criadoEm: "2020-01-01T00:00:00Z" })));

    expect(criarGasto.mock.calls[0]![0].data).not.toHaveProperty("criadoEm");
    expect(criarGasto.mock.calls[0]![0].data).not.toHaveProperty("id");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O QUE A ROTA RECUSA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ a rota recusa antes de gravar, e diz por quê em português", () => {
  beforeEach(() => comPapel(CEO));

  it("um lançamento completo passa, e o gasto volta para a tela", async () => {
    // A metade que PASSA de todo este bloco.
    const { POST } = await import("./route");
    const res = await POST(post(lancamento()));
    const j = (await res.json()) as { ok: boolean; data: { gasto: { valorCent: number } } };

    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.data.gasto.valorCent).toBe(12_345);
    expect(criarGasto).toHaveBeenCalledTimes(1);
  });

  it("⭐ valor negativo é 400 — e nada é gravado", async () => {
    // Abateria a conta em silêncio e faria o total mentir para MENOS.
    const { POST } = await import("./route");
    const res = await POST(post(lancamento({ valorCent: -50_000 })));

    expect(res.status).toBe(400);
    expect(criarGasto).not.toHaveBeenCalled();
    expect((await res.json()).error.toLowerCase()).toContain("negativo");
  });

  it("⭐ valor fracionado é 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(lancamento({ valorCent: 4989.999999999999 })));

    expect(res.status).toBe(400);
    expect(criarGasto).not.toHaveBeenCalled();
    expect((await res.json()).error).toContain("centavos inteiros");
  });

  it("⭐ competência no futuro é 400 — previsão não é gasto", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(lancamento({ competencia: "2099-12-31" })));

    expect(res.status).toBe(400);
    expect(criarGasto).not.toHaveBeenCalled();
    expect((await res.json()).error.toLowerCase()).toContain("futuro");
  });

  it('⭐ "outro" sem descrição específica é 400', async () => {
    // O balde onde gasto some. Aceitar "diversos" faria "outro" virar a escolha
    // padrão de quem tem pressa.
    const { POST } = await import("./route");
    const res = await POST(post(lancamento({ categoria: "outro", descricao: "diversos" })));

    expect(res.status).toBe(400);
    expect(criarGasto).not.toHaveBeenCalled();
  });

  it('"outro" COM descrição específica passa — a metade que aceita a resposta honesta', async () => {
    const { POST } = await import("./route");
    const res = await POST(
      post(lancamento({ categoria: "outro", descricao: "Multa de trânsito da entrega" })),
    );

    expect(res.status).toBe(200);
  });

  it("categoria inventada é 400", async () => {
    const { POST } = await import("./route");
    expect((await POST(post(lancamento({ categoria: "marketing" })))).status).toBe(400);
    expect(criarGasto).not.toHaveBeenCalled();
  });

  it("valor ausente é 400 — e não um lançamento de zero", async () => {
    // A tela manda `null` quando o texto digitado não é um valor. Tratar isso
    // como zero criaria um gasto de R$ 0,00 no lugar de um erro de digitação.
    const { POST } = await import("./route");
    expect((await POST(post(lancamento({ valorCent: null })))).status).toBe(400);
    expect((await POST(post(lancamento({ valorCent: "49,90" })))).status).toBe(400);
    expect(criarGasto).not.toHaveBeenCalled();
  });

  it("a recusa é frase de gente, e não o código da causa", async () => {
    const { POST } = await import("./route");
    const j = (await (await POST(post(lancamento({ valorCent: -1 })))).json()) as { error: string };

    expect(j.error).not.toContain("valorNegativo");
    expect(j.error.length).toBeGreaterThan(30);
  });

  it("corpo que não é JSON é 400, e não derruba a rota", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest(
        new Request(`https://foocci.com.br${ROTA}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "isto não é json",
        }),
      ),
    );

    expect(res.status).toBe(400);
    expect(criarGasto).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O QUE A ROTA DEVOLVE
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o painel que a tela mostra", () => {
  beforeEach(() => comPapel(CEO));

  it("⭐ hoje, ontem e os 30 dias vêm da MESMA leitura", async () => {
    /*
      Três consultas separadas dariam três respostas que podem discordar entre
      si quando a virada do dia cai no meio da requisição — e o cartão "hoje"
      mostraria um número que a linha de hoje na tabela contradiz.

      Duas consultas ao log de IA (uma por dia, outra por agente) e UMA aos
      lançamentos. Nenhuma a mais.
    */
    const { GET } = await import("./route");
    const j = (await (await GET(get())).json()) as {
      data: { hoje: string; ontem: string; janela: { dias: number }; ia: { dias: unknown[] } };
    };

    expect(acharGastos).toHaveBeenCalledTimes(1);
    expect(j.data.janela.dias).toBe(30);
    expect(j.data.ia.dias).toHaveLength(30);
    expect(j.data.ontem < j.data.hoje).toBe(true);
  });

  it("⭐ dia sem dado chega com FRASE, e a frase não contém valor nenhum", async () => {
    /*
      A trava que a tela depende. Se a rota devolvesse só `centavosUsd: 0`, o
      cartão escreveria "US$ 0,00" para um dia em que ninguém mediu nada — e um
      cartão assim não se confere, porque parece certo.
    */
    const { GET } = await import("./route");
    const j = (await (await GET(get())).json()) as {
      data: {
        ia: { hoje: { estado: string; frase: string }; ontem: { frase: string } };
        manual: { hoje: { estado: string; frase: string } };
      };
    };

    expect(j.data.ia.hoje.estado).toBe("NO_USAGE");
    expect(j.data.ia.hoje.frase).toContain("Sem uso");
    expect(j.data.ia.hoje.frase).not.toMatch(/US\$|R\$|0,00/);

    expect(j.data.manual.hoje.estado).toBe("SEM_LANCAMENTO");
    expect(j.data.manual.hoje.frase).toContain("não quer dizer gasto zero");
    expect(j.data.manual.hoje.frase).not.toMatch(/R\$|US\$|0,00/);
  });

  it("⭐ dia COM gasto chega com o valor — a metade que passa", async () => {
    // Sem este caso, uma rota que devolvesse "sem uso" para tudo passaria no
    // teste acima, e a tela nunca mostraria gasto nenhum.
    const agora = new Date();
    acharLogsDeIa.mockResolvedValue([
      {
        model: "gpt-4o",
        agentSlug: "ta",
        promptTokens: 4_000,
        completionTokens: 2_000,
        createdAt: agora,
      },
    ]);

    const { GET } = await import("./route");
    const j = (await (await GET(get())).json()) as {
      data: {
        ia: {
          hoje: { estado: string; frase: string; microUsd: number; centavosUsd: number };
          porAgente: Array<{ chave: string }>;
        };
      };
    };

    expect(j.data.ia.hoje.estado).toBe("PRICED");
    expect(j.data.ia.hoje.microUsd).toBe(30_000);
    expect(j.data.ia.hoje.centavosUsd).toBe(3);
    expect(j.data.ia.hoje.frase).toBe("US$ 0,03");
    expect(j.data.ia.porAgente.map((a) => a.chave)).toEqual(["ta"]);
  });

  it("⭐ modelo fora da tabela chega como UNPRICED, com o nome do modelo junto", async () => {
    // "Não sei o preço" precisa chegar à tela COM a evidência: sem o nome do
    // modelo, o alerta é uma reclamação que ninguém consegue resolver.
    acharLogsDeIa.mockResolvedValue([
      {
        model: "modelo-que-ninguem-cadastrou",
        agentSlug: null,
        promptTokens: 10_000,
        completionTokens: 10_000,
        createdAt: new Date(),
      },
    ]);

    const { GET } = await import("./route");
    const j = (await (await GET(get())).json()) as {
      data: { ia: { hoje: { estado: string; frase: string; modelosSemPreco: string[] } } };
    };

    expect(j.data.ia.hoje.estado).toBe("UNPRICED");
    expect(j.data.ia.hoje.modelosSemPreco).toEqual(["modelo-que-ninguem-cadastrou"]);
    expect(j.data.ia.hoje.frase).toContain("não sabemos quanto");
  });

  it("as opções do formulário viajam pela rota que as valida", async () => {
    // Um valor no seletor que a rota recusa vira "escolhi e não funciona", e o
    // CEO culpa o sistema — com razão.
    const { GET, POST } = await import("./route");
    const j = (await (await GET(get())).json()) as {
      data: {
        formulario: {
          categorias: Array<{ valor: string; rotulo: string }>;
          moedas: Array<{ valor: string }>;
          maximoDaCompetencia: string;
        };
      };
    };

    expect(j.data.formulario.categorias.length).toBeGreaterThanOrEqual(7);
    for (const c of j.data.formulario.categorias) {
      expect(c.rotulo.trim().length, c.valor).toBeGreaterThan(5);
    }

    // ⭐ Toda categoria anunciada é aceita pelo POST — a trava contra a
    // divergência silenciosa entre o seletor e a recusa.
    for (const c of j.data.formulario.categorias) {
      criarGasto.mockClear();
      const res = await POST(
        post(lancamento({ categoria: c.valor, descricao: "Assinatura mensal descrita" })),
      );
      expect(res.status, c.valor).toBe(200);
    }

    // E toda moeda anunciada também.
    for (const m of j.data.formulario.moedas) {
      const res = await POST(post(lancamento({ moeda: m.valor })));
      expect(res.status, m.valor).toBe(200);
    }
  });

  it("⭐ o teto de competência anunciado é HOJE — o dia seguinte é recusado", async () => {
    // A legenda da tela precisa ser a mesma régua da recusa. Se o `max` do campo
    // dissesse amanhã, a pessoa escolheria uma data que a rota nega, e o erro
    // apareceria como "não consegui lançar" sem dizer o motivo.
    const { GET, POST } = await import("./route");
    const j = (await (await GET(get())).json()) as {
      data: { hoje: string; formulario: { maximoDaCompetencia: string } };
    };

    expect(j.data.formulario.maximoDaCompetencia).toBe(j.data.hoje);

    const depoisDoTeto = new Date(`${j.data.hoje}T00:00:00Z`);
    depoisDoTeto.setUTCDate(depoisDoTeto.getUTCDate() + 1);
    const res = await POST(
      post(lancamento({ competencia: depoisDoTeto.toISOString().slice(0, 10) })),
    );

    expect(res.status).toBe(400);
  });

  it("⭐ real e dólar chegam separados, e não somados", async () => {
    // Não há cotação neste sistema. Um total convertido por uma taxa inventada
    // não bateria com fatura nenhuma — e seria o número que o CEO leria primeiro.
    const dia = ontemEmSaoPaulo();
    acharGastos.mockResolvedValue([
      {
        id: "a", descricao: "Railway", categoria: "hospedagem", fornecedor: null,
        valorCent: 10_000, moeda: "BRL", competencia: new Date(`${dia}T00:00:00.000Z`),
        pagoEm: null, recorrente: false, criadoPor: "Dioli (u-ceo)",
      },
      {
        id: "b", descricao: "Crédito OpenAI", categoria: "ia", fornecedor: null,
        valorCent: 2_000, moeda: "USD", competencia: new Date(`${dia}T00:00:00.000Z`),
        pagoEm: null, recorrente: false, criadoPor: "Dioli (u-ceo)",
      },
    ]);

    const { GET } = await import("./route");
    const j = (await (await GET(get())).json()) as {
      data: { manual: { periodo: { porMoeda: Array<{ moeda: string; centavos: number }> } } };
    };

    expect(j.data.manual.periodo.porMoeda).toEqual([
      { moeda: "BRL", centavos: 10_000, lancamentos: 1 },
      { moeda: "USD", centavos: 2_000, lancamentos: 1 },
    ]);
    // Nenhum campo que junte as duas moedas.
    expect(j.data.manual.periodo).not.toHaveProperty("centavos");
    expect(j.data.manual.periodo).not.toHaveProperty("total");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTA ROTA NÃO FAZ
// ═══════════════════════════════════════════════════════════════════════════

describe("⛔ os limites da rota, em código", () => {
  it("a rota só tem GET e POST — não existe verbo que apague um lançamento", async () => {
    // Apagar gasto é reescrever a história da conta, e isso não pode ser um
    // clique. Quando existir, terá porta própria e confirmação.
    const modulo = await import("./route");
    expect(Object.keys(modulo).sort()).toEqual(["GET", "POST", "dynamic", "runtime"]);
  });

  it("⭐ a TELA não importa o serviço que fala com o banco", () => {
    /* A trava estrutural, e o defeito que ela impede é dos que não dão erro:
     *
     * `import { CATEGORIAS_DE_GASTO } from "@/services/financeiro/gastoManual"`
     * é a coisa mais natural do mundo de se escrever num componente que precisa
     * montar um seletor. Só que `gastoManual.ts` importa o Prisma — o import
     * arrastaria o serviço de GRAVAÇÃO inteiro para dentro do pacote que vai ao
     * navegador.
     *
     * Uma asserção de comportamento provaria que o seletor de HOJE está certo.
     * Ler o código-fonte prova que o caminho para errar amanhã não existe.
     */
    const tela = readFileSync(
      path.join(process.cwd(), "src/app/admin/(area)/financeiro/FinanceiroClient.tsx"),
      "utf8",
    );

    expect(tela).not.toContain("financeiro/gastoManual");
    expect(tela).not.toContain("financeiro/gastoDiario");
    // A metade que passa: ela busca as opções na rota que as valida, e só
    // importa o módulo de dinheiro, que é puro.
    expect(tela).toContain("/api/admin/financeiro");
    expect(tela).toContain("financeiro/valor");
  });

  it("⭐ a tela NÃO monta valor a partir dos centavos de um balde de IA", () => {
    /*
      ── O DEFEITO QUE ESTE ARQUIVO INTEIRO EXISTE PARA IMPEDIR ──────────────

      `{(g.centavosUsd / 100).toFixed(2)}` num cartão é uma linha que qualquer
      pessoa escreve sem pensar duas vezes. Ela funciona, fica bonita, e escreve
      "US$ 0,00" nos dois estados em que não existe número a escrever: dia sem
      uso e dia sem preço conhecido.

      A tela mostra a `frase` que vem do servidor, e a frase nasce do ESTADO.
      Ler o fonte é o único jeito de garantir que o atalho não volte.
    */
    const tela = readFileSync(
      path.join(process.cwd(), "src/app/admin/(area)/financeiro/FinanceiroClient.tsx"),
      "utf8",
    );
    const semComentarios = tela
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    // Os campos de dinheiro cru nem são DECLARADOS na tela: um campo declarado
    // é um campo que alguém usa, e o atalho começa por declará-lo.
    expect(semComentarios).not.toMatch(/centavosUsd/);
    expect(semComentarios).not.toMatch(/microUsd/);
    // A metade que passa: é a frase do servidor que aparece.
    expect(semComentarios).toMatch(/\{g\.frase\}/);
  });

  it("⭐ nenhum cartão desta tela é verde", () => {
    /*
      Verde é a cor de "está tudo bem". Nesta tela ela apareceria justamente onde
      a fonte do número está ausente — um dia sem dado pintado de verde é a tela
      afirmando "sem gastos" sobre algo que ela não sabe.

      A paleta é neutra para o que foi medido, âmbar para o incerto e cinza para
      o que não existe. E nada aqui comemora: a empresa está em prejuízo, e o CEO
      disse isso com essas palavras.
    */
    const tela = readFileSync(
      path.join(process.cwd(), "src/app/admin/(area)/financeiro/FinanceiroClient.tsx"),
      "utf8",
    );
    const semComentarios = tela
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(semComentarios).not.toMatch(/(bg|text|border)-(green|emerald|lime|teal)-/);
  });

  it("⭐ a rota não converte moeda — não existe cotação no código", () => {
    // Guardrail 1 aplicado a dinheiro: sem fonte de câmbio, um total em reais
    // seria um número inventado com cara de conta fechada.
    const fonte = readFileSync(
      path.join(process.cwd(), "src/app/api/admin/financeiro/route.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    expect(fonte).not.toMatch(/cotacao|cotação|exchangeRate|USD_BRL|paraReais/i);
  });
});
