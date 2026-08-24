import { describe, it, expect, vi } from "vitest";
import { escopoDaConsulta, filtroDaFila, listarFila, FILAS } from "./filas";
import type { SessaoInterna } from "@/lib/internal-auth";

const sessao = (over: Partial<SessaoInterna> = {}): SessaoInterna => ({
  userId: "u1",
  nome: "SDR",
  role: "AGENTE_HUMANO",
  departamentos: ["vendas"],
  gerencia: [],
  ...over,
});

const AGORA = new Date("2026-08-25T12:00:00Z");

/**
 * ── O CRITÉRIO 6, NA CAMADA QUE COSTUMA FALTAR ──
 *
 * "SDR humano visualiza somente a Sala de Vendas autorizada."
 *
 * A rota protege o endereço. Estes testes protegem o DADO: eles olham o `where`
 * que sai para o banco. Um teste que só conferisse o resultado passaria numa
 * base de teste sem leads de outro SDR — e passaria exatamente até o dia em que
 * houvesse um.
 */
describe("o escopo da consulta", () => {
  it("o CEO e o Diretor não têm filtro — enxergam a base inteira", () => {
    expect(escopoDaConsulta(sessao({ role: "MASTER_CEO" }))).toEqual({});
    expect(escopoDaConsulta(sessao({ role: "DIRETOR_FOOCCI" }))).toEqual({});
  });

  it("o Agente Gerente Comercial enxerga Vendas inteiro", () => {
    // É ele quem distribui a fila e responde pelo SLA. Sem isso não teria como
    // ver a carteira do time que ele gerencia.
    const gerente = sessao({ role: "GERENTE_DEPARTAMENTO", gerencia: ["vendas"] });
    expect(escopoDaConsulta(gerente)).toEqual({});
  });

  it("o gerente de OUTRO departamento NÃO enxerga Vendas", () => {
    const financeiro = sessao({
      role: "GERENTE_DEPARTAMENTO",
      departamentos: ["financeiro"],
      gerencia: ["financeiro"],
    });
    expect(escopoDaConsulta(financeiro)).not.toEqual({});
  });

  it("o SDR fica preso aos leads dele mais os livres", () => {
    const filtro = escopoDaConsulta(sessao());
    expect(filtro).toEqual({
      OR: [
        { atendenteUserId: "u1" },
        { atendidoPor: { in: ["NINGUEM", "AGUARDANDO_HUMANO"] } },
      ],
    });
  });

  it("o SDR vê os leads LIVRES — senão as duas filas de pegar trabalho viriam vazias", () => {
    // O isolamento é contra ver a carteira dos OUTROS, não contra ver o que
    // está disponível. Sem isso, "sem responsável" e "aguardando humano" — as
    // duas filas que existem para ele pegar trabalho — nunca teriam nada.
    const filtro = escopoDaConsulta(sessao()) as { OR: Array<Record<string, unknown>> };
    const livres = filtro.OR.find((o) => "atendidoPor" in o);
    expect(livres).toBeDefined();
  });

  it("o filtro do SDR NÃO contém nada que devolva a base inteira", () => {
    // A metade que reprova: se alguém trocar o OR por um `{}`, isto pega.
    const filtro = escopoDaConsulta(sessao());
    expect(Object.keys(filtro).length).toBeGreaterThan(0);
  });
});

describe("fila e escopo se SOMAM, nunca se substituem", () => {
  it("toda fila do SDR sai com AND entre escopo e filtro", () => {
    // Um `OR` aqui deixaria a fila furar o isolamento — e é o tipo de erro que
    // passa despercebido porque a tela continua parecendo certa.
    for (const f of FILAS) {
      const filtro = filtroDaFila(f.nome, sessao(), AGORA);
      expect(filtro.AND, `fila ${f.nome}`).toBeDefined();
      expect(Array.isArray(filtro.AND), `fila ${f.nome}`).toBe(true);
      expect((filtro.AND as unknown[]).length, `fila ${f.nome}`).toBe(2);
    }
  });

  it("a fila 'todos' do SDR ainda carrega o escopo dele", () => {
    // "Todos" é a base inteira DO ESCOPO, não a base inteira.
    const filtro = filtroDaFila("todos", sessao(), AGORA);
    const [escopo] = filtro.AND as Array<Record<string, unknown>>;
    expect(escopo).toHaveProperty("OR");
  });

  it("a fila 'todos' do CEO não tem escopo restritivo", () => {
    const filtro = filtroDaFila("todos", sessao({ role: "MASTER_CEO" }), AGORA);
    const [escopo] = filtro.AND as Array<Record<string, unknown>>;
    expect(escopo).toEqual({});
  });
});

describe("o que cada fila pergunta", () => {
  const daFila = (nome: Parameters<typeof filtroDaFila>[0]) =>
    (filtroDaFila(nome, sessao({ role: "MASTER_CEO" }), AGORA).AND as Array<
      Record<string, unknown>
    >)[1];

  it("aguardando humano: a IA parou e ninguém pegou", () => {
    expect(daFila("aguardandoHumano")).toEqual({ atendidoPor: "AGUARDANDO_HUMANO" });
  });

  it("sem responsável: ninguém assumiu", () => {
    expect(daFila("semResponsavel")).toEqual({ atendidoPor: "NINGUEM" });
  });

  it("meus leads: meus E com dono humano", () => {
    // Sem o `atendidoPor: HUMANO`, um lead que eu já devolvi para a IA
    // continuaria aparecendo como meu.
    expect(daFila("meusLeads")).toEqual({ atendenteUserId: "u1", atendidoPor: "HUMANO" });
  });

  it("sem resposta ignora as três etapas terminais", () => {
    // Cobrar resposta de quem já fechou ou já foi perdido é ruído puro. NUTRICAO
    // entrou na lista quando o funil foi para 11 etapas: cobrar silêncio de quem
    // a gente mesmo mandou esperar noventa dias encheria a fila de gente em dia.
    const f = daFila("semResposta") as { stage: { notIn: string[] } };
    expect(f.stage.notIn).toEqual(["GANHO", "PERDIDO", "NUTRICAO"]);
  });

  it("follow-up vencido só conta quem espera há mais de um dia", () => {
    const f = daFila("followUpVencido") as {
      atendidoPor: string;
      atendenteDesde: { lt: Date };
    };
    expect(f.atendidoPor).toBe("AGUARDANDO_HUMANO");
    expect(AGORA.getTime() - f.atendenteDesde.lt.getTime()).toBe(86_400_000);
  });

  it("as sete filas têm título e pergunta escritos", () => {
    // A pergunta aparece na tela. Fila sem pergunta é filtro que ninguém sabe
    // para que serve.
    expect(FILAS).toHaveLength(7);
    for (const f of FILAS) {
      expect(f.titulo.length, f.nome).toBeGreaterThan(0);
      expect(f.pergunta.length, f.nome).toBeGreaterThan(10);
    }
  });
});

describe("listar a fila", () => {
  function bancoFalso(linhas: unknown[] = []) {
    return {
      siteLead: {
        findMany: vi.fn().mockResolvedValue(linhas),
        count: vi.fn().mockResolvedValue(0),
      },
    };
  }

  it("a consulta que sai para o banco carrega o escopo do SDR", async () => {
    const db = bancoFalso();
    await listarFila(db as never, { fila: "todos", sessao: sessao(), agora: AGORA });

    const where = db.siteLead.findMany.mock.calls[0]![0].where;
    expect(where.AND).toBeDefined();
    expect((where.AND as Array<Record<string, unknown>>)[0]).toHaveProperty("OR");
  });

  it("as contagens também são contadas dentro do escopo", async () => {
    // Se a contagem ignorasse o escopo, o SDR veria "42 leads sem responsável"
    // e abriria uma lista com 3. O número mentiria mesmo com a lista certa.
    const db = bancoFalso();
    await listarFila(db as never, { fila: "todos", sessao: sessao(), agora: AGORA });

    expect(db.siteLead.count).toHaveBeenCalledTimes(FILAS.length);
    for (const chamada of db.siteLead.count.mock.calls) {
      const where = chamada[0].where as { AND: Array<Record<string, unknown>> };
      expect(where.AND[0]).toHaveProperty("OR");
    }
  });

  it("banco fora do ar devolve leituraOk false com motivo, não lista vazia", async () => {
    const db = bancoFalso();
    db.siteLead.findMany.mockRejectedValueOnce(new Error("connection refused"));

    const r = await listarFila(db as never, { fila: "todos", sessao: sessao(), agora: AGORA });

    expect(r.leituraOk).toBe(false);
    expect(r.motivo).toContain("connection refused");
    expect(r.leads).toEqual([]);
  });

  it("base vazia com banco no ar devolve leituraOk true", async () => {
    const r = await listarFila(bancoFalso([]) as never, {
      fila: "todos",
      sessao: sessao(),
      agora: AGORA,
    });
    expect(r.leituraOk).toBe(true);
    expect(r.motivo).toBeUndefined();
  });

  it("ordena por quem espera há mais tempo", async () => {
    // Fila de espera ordenada por data de criação faria o lead que espera há
    // três dias ficar embaixo do que chegou agora.
    const db = bancoFalso();
    await listarFila(db as never, { fila: "aguardandoHumano", sessao: sessao(), agora: AGORA });

    const orderBy = db.siteLead.findMany.mock.calls[0]![0].orderBy;
    expect(orderBy[0]).toEqual({ atendenteDesde: "asc" });
  });
});
