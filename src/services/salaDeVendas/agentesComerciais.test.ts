/**
 * Os nove agentes comerciais: a ficha, o cargo e o desempenho.
 *
 * ── O TESTE QUE MAIS IMPORTA AQUI ───────────────────────────────────────────
 *
 * O que liga a ficha do catálogo às pessoas do banco é o **slug do cargo**. Eu o
 * montei à mão (`agente-${slug}`) e estava errado — o slug de verdade é o da
 * própria ficha.
 *
 * A diferença nunca teria sido notada: com o prefixo errado a busca não acha
 * ninguém, e todo cargo humano mostra "ninguém ocupa este cargo" — que é
 * exatamente o que parece verdade hoje, porque de fato ninguém foi contratado.
 * O defeito só apareceria no dia da primeira contratação, e apareceria como
 * "o painel não enxerga o time".
 *
 * Por isso o teste compara com `cargoDaFicha`, a função que o seed usa, em vez de
 * repetir o formato do slug. Duas cópias do formato discordariam em silêncio.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fichasComerciais, resumir, type AgenteComercial } from "./agentesComerciais";
import { cargoDaFicha, lerCatalogo } from "@/services/agents/fichasDaEmpresa";

const fichas = fichasComerciais();

describe("as fichas comerciais do catálogo", () => {
  it("são as nove que o CEO nomeou", () => {
    expect(fichas).toHaveLength(9);
  });

  it("todas pertencem ao departamento de Vendas", () => {
    for (const f of fichas) expect(f.departamento, f.numero).toBe(1);
  });

  it("cobrem os nove papéis nomeados no reforço de escopo", () => {
    // abordagem · recepção · qualificação · TA · SDR humano · CRM · consultor ·
    // closer · gerente. A busca é por palavra no nome, e não por número, porque
    // o número muda quando alguém entra no meio da lista.
    const nomes = fichas.map((f) => f.nome.toLowerCase()).join(" | ");

    for (const papel of [
      "gerente", "abordagem", "recepção", "qualificação",
      "ta", "sdr humano", "consultor", "closer", "crm",
    ]) {
      expect(nomes, `falta o agente de ${papel}`).toContain(papel);
    }
  });

  it("a ficha x.1 é o gerente, e é a única", () => {
    const gerentes = fichas.filter((f) => f.numero.endsWith(".1"));
    expect(gerentes).toHaveLength(1);
    expect(gerentes[0]!.nome).toContain("Gerente");
  });

  it("toda ficha começa com a palavra Agente", () => {
    for (const f of fichas) expect(f.nome, f.numero).toMatch(/^Agente/);
  });
});

describe("o slug do cargo — o elo que já esteve quebrado", () => {
  it("é o da própria ficha, e NÃO um prefixo montado à mão", () => {
    for (const f of fichas) {
      expect(cargoDaFicha(f, "vendas").slug, f.numero).toBe(f.slug);
    }
  });

  it("o gerente é de nível GERENTE e reporta ao Diretor", () => {
    const gerente = fichas.find((f) => f.numero.endsWith(".1"))!;
    const cargo = cargoDaFicha(gerente, "vendas");
    expect(cargo.nivel).toBe("GERENTE");
    expect(cargo.reportaA).toBe("diretor-foocci");
  });

  it("os outros oito são de operação", () => {
    const operacao = fichas.filter((f) => !f.numero.endsWith(".1"));
    expect(operacao).toHaveLength(8);
    for (const f of operacao) {
      expect(cargoDaFicha(f, "vendas").nivel, f.numero).toBe("OPERACAO");
    }
  });
});

describe("o TA carrega as próprias travas", () => {
  const ta = fichas.find((f) => f.nome.includes("TA"))!;

  it("existe e é de IA", () => {
    expect(ta).toBeDefined();
    expect(ta.modo).toBe("IA");
  });

  it("tem proibições PRÓPRIAS, e não por referência", () => {
    // `pode` e `naoPode` viram as ações permitidas e proibidas do perfil no
    // banco. Uma ficha que dissesse "vale o que as outras dizem" produziria o
    // agente que MAIS opera com as MENORES travas.
    expect(ta.naoPode.length).toBeGreaterThan(5);
    expect(ta.pode.length).toBeGreaterThan(5);
  });

  it("proíbe explicitamente negociar preço", () => {
    expect(ta.naoPode.join(" ").toLowerCase()).toMatch(/pre[çc]o|desconto/);
  });

  it("proíbe explicitamente falar com quem pediu silêncio", () => {
    expect(ta.naoPode.join(" ").toLowerCase()).toContain("silêncio");
  });

  it("diz quando escala", () => {
    expect(ta.escalaQuando.length).toBeGreaterThan(0);
  });
});

describe("a Abordagem é a ficha que pode queimar o número", () => {
  const abordagem = fichas.find((f) => f.nome.toLowerCase().includes("abordagem"))!;

  it("existe", () => {
    expect(abordagem).toBeDefined();
  });

  it("é a única de Vendas que fala primeiro — e por isso proíbe mais", () => {
    const proibicoes = abordagem.naoPode.join(" ").toLowerCase();
    expect(proibicoes).toContain("consenti");
    expect(proibicoes).toContain("silêncio");
    expect(proibicoes).toMatch(/24\s?h|janela/);
  });

  it("mede reclamação, e não só resposta", () => {
    // Uma abordagem pode ir bem no número de respostas e estar queimando a
    // marca. Sem medir reclamação, isso não aparece até o número ser banido.
    expect(abordagem.medeSePor.join(" ").toLowerCase()).toContain("reclamação");
  });
});

describe("a Recepção não vende", () => {
  const recepcao = fichas.find((f) => f.nome.toLowerCase().includes("recep"))!;

  it("é proibida de qualificar e de dar preço", () => {
    const proibicoes = recepcao.naoPode.join(" ").toLowerCase();
    expect(proibicoes).toContain("qualificar");
    expect(proibicoes).toMatch(/preço|prazo/);
  });

  it("mede segundos, e não conversas", () => {
    expect(recepcao.medeSePor.join(" ").toLowerCase()).toContain("segundos");
  });
});

describe("o resumo", () => {
  const falso = (over: Partial<AgenteComercial>): AgenteComercial => ({
    numero: "1.1", slug: "x", nome: "Agente X", modo: "IA", resumo: null,
    pode: [], naoPode: [], escalaQuando: [], medeSePor: [], regraDura: [],
    cadastrada: false, status: null, ligada: false, pessoas: 0,
    desempenho: {
      mensagens: { medido: false, motivo: "x" },
      handoffs: { medido: false, motivo: "x" },
      qa: { medido: false, motivo: "x" },
      leadsAgora: { medido: false, motivo: "x" },
    },
    ...over,
  });

  it("conta por modo", () => {
    const r = resumir([
      falso({ modo: "IA" }),
      falso({ modo: "IA" }),
      falso({ modo: "HUMANO" }),
      falso({ modo: "HIBRIDO" }),
    ]);

    expect(r.total).toBe(4);
    expect(r.deIA).toBe(2);
    expect(r.humanos).toBe(1);
    expect(r.hibridos).toBe(1);
  });

  it("conta quantas estão LIGADAS — hoje, zero", () => {
    const r = resumir([falso({ ligada: false }), falso({ ligada: false })]);
    expect(r.ligadas).toBe(0);
  });

  it("e conta certo quando alguma for ligada", () => {
    // A metade que passa: sem ela, um contador que devolvesse sempre zero
    // ficaria verde no teste acima.
    const r = resumir([falso({ ligada: true }), falso({ ligada: false })]);
    expect(r.ligadas).toBe(1);
  });

  it("conta cargos ocupados", () => {
    const r = resumir([falso({ pessoas: 2 }), falso({ pessoas: 0 })]);
    expect(r.ocupados).toBe(1);
  });
});

describe("o catálogo lido do arquivo é o mesmo que o serviço usa", () => {
  it("nenhuma cópia da lista em TypeScript", () => {
    // Se alguém um dia transcrever as fichas para dentro do código, esta
    // asserção continua passando — mas ela existe para deixar registrado que a
    // FONTE é o markdown, e o teste lê o markdown pelo mesmo caminho.
    const md = readFileSync(
      path.join(process.cwd(), "docs/arquitetura-operacional-foocci-v3/02-DEPARTAMENTOS-E-AGENTES.md"),
      "utf8",
    );
    const doArquivo = lerCatalogo(md).filter((f) => f.departamento === 1);
    expect(doArquivo.map((f) => f.slug)).toEqual(fichas.map((f) => f.slug));
  });
});
