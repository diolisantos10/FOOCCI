import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  lerCatalogo,
  porDepartamento,
  porModo,
  slugDe,
  SLUGS_PROIBIDOS,
  paraPerfilNovo,
  cargoDaFicha,
  cargoResponsavelPor,
  ehAgenteGerente,
  registrarGerentes,
  REGRAS_UNIVERSAIS,
  type FichaDaEmpresa,
  type VinculoDeFicha,
} from "./fichasDaEmpresa";
import { DEFAULT_AGENT_PROFILES } from "./defaultAgentProfiles";
import { DEPARTAMENTOS } from "@/services/organizacao/departamentosCanonicos";

const CATALOGO = path.join(
  process.cwd(),
  "docs/arquitetura-operacional-foocci-v3/02-DEPARTAMENTOS-E-AGENTES.md",
);

const texto = readFileSync(CATALOGO, "utf8");
const fichas = lerCatalogo(texto);

registrarGerentes(fichas, new Map(DEPARTAMENTOS.map((d) => [d.numero, d.slug])));

/**
 * ── OS CRITÉRIOS DE ACEITE DO CEO, COMO TESTE ──
 *
 * O comando de 25/08/2026 lista 16 critérios. Os cinco que se verificam no
 * catálogo estão aqui, e cada um reprova sozinho.
 *
 * Um critério verificado por leitura humana é um critério que passa a valer até
 * a próxima revisão distraída.
 */
describe("critérios de aceite da planta v3", () => {
  it("1 — existem exatamente 6 departamentos oficiais", () => {
    expect(DEPARTAMENTOS).toHaveLength(6);
    expect(porDepartamento(fichas).size).toBe(6);
  });

  it("2 — cada departamento tem um Agente Gerente, e só um", () => {
    // Departamento sem gerente é departamento sem dono, e trabalho sem dono não
    // é cobrado de ninguém. Dois gerentes é pior: ninguém sabe de quem é.
    for (const d of DEPARTAMENTOS) {
      const gerentes = fichas.filter((f) => f.departamento === d.numero && ehAgenteGerente(f));
      expect(gerentes.map((g) => g.nome), `departamento ${d.numero} (${d.nome})`).toHaveLength(1);
    }
  });

  it("3 — todo cargo abaixo do Diretor começa com a palavra 'Agente'", () => {
    // Não é estética: é o que impede confundir uma função da empresa com uma
    // pessoa contratada ou com um agente vendido dentro do produto.
    for (const f of fichas) {
      expect(f.nome.startsWith("Agente"), `${f.numero} — "${f.nome}"`).toBe(true);
    }
  });

  it("4 — marketing NÃO está duplicado dentro da Foocci", () => {
    // A aquisição é executada pela Dioli. Um departamento de marketing aqui
    // dentro produziria dois times fazendo a mesma coisa e brigando pelo mesmo
    // número.
    const proibidos = /marketing|growth|social media|m[íi]dia paga|CRO\b/i;

    for (const d of DEPARTAMENTOS) {
      expect(proibidos.test(d.nome), `departamento "${d.nome}"`).toBe(false);
    }
    for (const f of fichas) {
      expect(proibidos.test(f.nome), `ficha "${f.nome}"`).toBe(false);
    }
  });

  it("10 — não existe cargo de Gerente Geral", () => {
    // O Diretor da Foocci já ocupa essa camada. O cargo criaria um degrau a mais
    // sem ninguém para ocupá-lo.
    for (const f of fichas) {
      expect(/gerente geral/i.test(f.nome), f.nome).toBe(false);
      expect(cargoResponsavelPor(f, "vendas")).not.toBe("gerente-geral");
    }
  });
});

/**
 * ── A METADE QUE CONFERE O DOCUMENTO ──
 *
 * A v1 publicou "32 fichas" quando eram 34 — alguém (eu) somou à mão. A correção
 * só vale se o número parar de depender de quem soma: a contagem é CONTADA do
 * documento e comparada com a tabela que ele publica.
 */
describe("o catálogo bate com a tabela que ele mesmo publica", () => {
  function tabelaPublicada(): Map<number, number> {
    const mapa = new Map<number, number>();
    for (const [, n, qtd] of texto.matchAll(/^\| (\d) · .+? \| (\d+) \|$/gm)) {
      mapa.set(Number(n), Number(qtd));
    }
    return mapa;
  }

  it("o documento publica uma tabela com os 6 departamentos", () => {
    // Sem esta metade, apagar a tabela faria as comparações abaixo passarem
    // comparando dois conjuntos vazios.
    expect(tabelaPublicada().size).toBe(6);
  });

  it("cada departamento tem no documento o número de fichas que a tabela afirma", () => {
    const contadas = porDepartamento(fichas);
    for (const [dep, prometido] of tabelaPublicada()) {
      expect({ dep, fichas: contadas.get(dep) }).toEqual({ dep, fichas: prometido });
    }
  });

  it("o total impresso confere com as fichas contadas mais as 2 de direção", () => {
    const impresso = /\*\*(\d+) fichas:\*\*/.exec(texto);
    expect(impresso).not.toBeNull();
    expect(Number(impresso![1])).toBe(fichas.length + 2);
  });

  it("os modos impressos conferem com os modos contados", () => {
    const impresso = /Modo: \*\*(\d+) IA · (\d+) HUMANO · (\d+) HÍBRIDO\.\*\*/.exec(texto);
    expect(impresso).not.toBeNull();

    const conta = porModo(fichas);
    expect({
      ia: Number(impresso![1]),
      humano: Number(impresso![2]),
      hibrido: Number(impresso![3]),
    }).toEqual({ ia: conta.IA, humano: conta.HUMANO, hibrido: conta.HIBRIDO });
  });
});

describe("as fichas lidas do catálogo", () => {
  it("são 32 fichas de departamento", () => {
    // Eram 28 até 25/08/2026. Vendas foi de 5 para 9 quando o CEO nomeou os nove
    // agentes comerciais no reforço de escopo.
    expect(fichas.length).toBe(32);
  });

  it("toda ficha tem slug, nome e departamento entre 1 e 6", () => {
    for (const f of fichas) {
      expect(f.slug.length, `${f.numero} sem slug`).toBeGreaterThan(0);
      expect(f.nome.length, `${f.numero} sem nome`).toBeGreaterThan(0);
      expect(f.departamento, `${f.numero} fora da faixa`).toBeGreaterThanOrEqual(1);
      expect(f.departamento, `${f.numero} fora da faixa`).toBeLessThanOrEqual(6);
    }
  });

  it("nenhum slug se repete", () => {
    const vistos = new Map<string, string>();
    for (const f of fichas) {
      expect(vistos.has(f.slug), `${f.slug}: ${vistos.get(f.slug)} e ${f.numero}`).toBe(false);
      vistos.set(f.slug, f.numero);
    }
  });

  it("nenhuma ficha da empresa usa slug de Essencial nem de aposentado", () => {
    // O corte de 07/08/2026 aconteceu porque quatro fichas duplicavam, pelo
    // nome, um dos cinco que constroem o sistema.
    for (const f of fichas) {
      expect(SLUGS_PROIBIDOS, `${f.numero} (${f.slug})`).not.toContain(f.slug);
    }
  });

  it("toda ficha de IA tem limite declarado — no catálogo ou na constituição que ela aponta", () => {
    // Ficha de IA sem trava escrita é uma IA sem limite declarado. A exceção é a
    // ficha que APONTA para um agente de produto já existente — e a exceção só
    // vale se a constituição existir de verdade.
    const registro = new Map(DEFAULT_AGENT_PROFILES.map((p) => [p.slug, p]));

    for (const f of fichas.filter((x) => x.modo === "IA")) {
      const apontado = f.jaExisteComo ? registro.get(f.jaExisteComo) : undefined;
      const limite = f.naoPode.length + (apontado?.forbiddenActions?.length ?? 0);
      expect(limite, `${f.numero} ${f.nome}: nem catálogo nem constituição`).toBeGreaterThan(0);
    }
  });

  it("toda ficha diz alguma coisa — resumo, pode ou não pode", () => {
    for (const f of fichas) {
      const temAlgo = f.resumo || f.pode.length || f.naoPode.length;
      expect(Boolean(temAlgo), `${f.numero} ${f.nome} veio vazia`).toBe(true);
    }
  });

  it("as três que já operam apontam para o agente de produto certo", () => {
    const ligadas = fichas.filter((f) => f.jaExisteComo);
    expect(ligadas.map((f) => [f.numero, f.jaExisteComo])).toEqual([
      ["3.2", "waiter"],
      ["3.3", "crm"],
      ["3.4", "whatsapp"],
    ]);
  });

  it("`analytics-product` NÃO é apresentado como agente pronto", () => {
    // O slot existe no registro desde a Fase 0 como placeholder vazio. Chamá-lo
    // de "agente que já existe" seria vender uma vaga com nome como produto.
    const analytics = DEFAULT_AGENT_PROFILES.find((p) => p.slug === "analytics-product");
    expect(analytics?.allowedActions ?? []).toHaveLength(0);
    for (const f of fichas) expect(f.jaExisteComo).not.toBe("analytics-product");
  });

  it("`suporte-tecnico` NÃO foi amarrado a ficha nenhuma", () => {
    // Ligar as duas coisas faria uma função da empresa herdar, calada, as
    // permissões de um agente de produto em operação.
    for (const f of fichas) expect(f.jaExisteComo).not.toBe("suporte-tecnico");
  });

  it("a ficha 1.5 (Agente SDR IA — TA) chega inteira", () => {
    // Era a 1.2 até Vendas ganhar Abordagem, Recepção e Qualificação na frente.
    const sdr = fichas.find((f) => f.numero === "1.5");
    expect(sdr).toBeDefined();
    expect(sdr!.modo).toBe("IA");
    expect(sdr!.pode.length).toBeGreaterThan(5);
    expect(sdr!.naoPode.length).toBeGreaterThan(3);
    expect(sdr!.escalaQuando.length).toBeGreaterThan(0);
    expect(sdr!.medeSePor.length).toBeGreaterThan(0);
  });

  it("a regra dura do SDR humano sobrevive à leitura", () => {
    const humano = fichas.find((f) => f.numero === "1.6");
    expect(humano!.regraDura.length).toBeGreaterThan(0);
    expect(humano!.regraDura.join(" ")).toContain("atômico");
  });

  it("os dois CRMs são fichas diferentes, em departamentos diferentes", () => {
    // É a confusão mais cara possível neste sistema: misturar os dois faria a
    // Foocci mandar campanha de venda para o cliente final de um restaurante.
    const comercial = fichas.find((f) => f.numero === "1.9");
    const produto = fichas.find((f) => f.numero === "3.3");

    expect(comercial!.departamento).toBe(1);
    expect(produto!.departamento).toBe(3);
    expect(comercial!.slug).not.toBe(produto!.slug);
  });
});

describe("da ficha do catálogo para a linha do banco", () => {
  const sdr = fichas.find((f) => f.numero === "1.5")!;
  const gerente = fichas.find((f) => f.numero === "1.1")!;

  it("nenhuma ficha nova nasce ligada nem ativa", () => {
    for (const f of fichas.filter((x) => !x.jaExisteComo)) {
      const p = paraPerfilNovo(f);
      expect(p.status, f.numero).toBe("DRAFT");
      expect(p.isRuntimeEnabled, f.numero).toBe(false);
      expect(p.visibility, f.numero).toBe("INTERNAL");
    }
  });

  it("modo do catálogo vira modo do banco", () => {
    expect(paraPerfilNovo(sdr).executionMode).toBe("AI");
    expect(paraPerfilNovo(gerente).executionMode).toBe("HUMAN");
    expect(paraPerfilNovo(fichas.find((f) => f.numero === "1.9")!).executionMode).toBe("HYBRID");
  });

  it("as três regras universais viajam com toda ficha de IA e híbrida", () => {
    for (const f of fichas.filter((x) => x.modo !== "HUMANO" && !x.jaExisteComo)) {
      const regras = paraPerfilNovo(f).safetyRules;
      for (const universal of REGRAS_UNIVERSAIS) {
        expect(regras, `${f.numero} ${f.nome}`).toContain(universal);
      }
    }
  });

  it("ficha de humano NÃO recebe as regras de IA", () => {
    const p = paraPerfilNovo(gerente);
    for (const universal of REGRAS_UNIVERSAIS) {
      expect(p.safetyRules).not.toContain(universal);
    }
  });

  it("o que a ficha pode e não pode chega inteiro na linha", () => {
    const p = paraPerfilNovo(sdr);
    expect(p.allowedActions).toEqual(sdr.pode);
    expect(p.forbiddenActions).toEqual(sdr.naoPode);
    expect(p.escalationRules).toEqual(sdr.escalaQuando);
    expect(p.evaluationCriteria).toEqual(sdr.medeSePor);
  });

  it("o vínculo NÃO carrega nenhum campo de conteúdo", () => {
    // A trava que impede o seed de apagar a constituição do Waiter numa
    // segunda-feira de manhã.
    const vinculo: VinculoDeFicha = {
      catalogNumber: "3.2",
      departmentId: "dep3",
      ownerPositionId: null,
      managerPositionId: null,
    };
    for (const campo of [
      "allowedActions",
      "forbiddenActions",
      "status",
      "isRuntimeEnabled",
      "mission",
      "population",
      "executionMode",
      "safetyRules",
    ]) {
      expect(Object.keys(vinculo), `vínculo não pode carregar ${campo}`).not.toContain(campo);
    }
  });
});

describe("cada ficha é também um cargo no organograma", () => {
  const sdr = fichas.find((f) => f.numero === "1.5")!;
  const gerente = fichas.find((f) => f.numero === "1.1")!;

  it("a ficha x.1 é o Agente Gerente, e o cargo dela é de nível GERENTE", () => {
    expect(ehAgenteGerente(gerente)).toBe(true);
    expect(cargoDaFicha(gerente, "vendas").nivel).toBe("GERENTE");
  });

  it("as outras são de operação", () => {
    expect(ehAgenteGerente(sdr)).toBe(false);
    expect(cargoDaFicha(sdr, "vendas").nivel).toBe("OPERACAO");
  });

  it("o Agente Gerente reporta DIRETO ao Diretor — sem camada no meio", () => {
    // Regra 4 da hierarquia, e regra 10: não existe Gerente Geral.
    expect(cargoDaFicha(gerente, "vendas").reportaA).toBe("diretor-foocci");
  });

  it("o agente comum reporta ao Agente Gerente do departamento dele", () => {
    expect(cargoDaFicha(sdr, "vendas").reportaA).toBe(gerente.slug);
  });

  it("quem responde pelo agente é o gerente; pelo gerente, o Diretor", () => {
    // Sem isso, quem cobra e quem é cobrado seriam a mesma pessoa.
    expect(cargoResponsavelPor(sdr, "vendas")).toBe(gerente.slug);
    expect(cargoResponsavelPor(gerente, "vendas")).toBe("diretor-foocci");
  });

  it("toda cadeia de comando chega ao CEO, sem ciclo", () => {
    const slugPorNumero = new Map(DEPARTAMENTOS.map((d) => [d.numero, d.slug]));
    const cargos = new Map<string, string | undefined>([
      ["ceo", undefined],
      ["diretor-foocci", "ceo"],
    ]);
    for (const f of fichas) {
      const c = cargoDaFicha(f, slugPorNumero.get(f.departamento)!);
      cargos.set(c.slug, c.reportaA);
    }

    for (const inicio of cargos.keys()) {
      const visitados = new Set<string>();
      let atual: string | undefined = inicio;
      while (atual) {
        expect(visitados.has(atual), `ciclo no organograma em "${atual}"`).toBe(false);
        visitados.add(atual);
        expect(cargos.has(atual), `"${atual}" reporta a cargo que não existe`).toBe(true);
        atual = cargos.get(atual);
      }
      expect(visitados.has("ceo"), `"${inicio}" não chega ao CEO`).toBe(true);
    }
  });
});

/**
 * ── A METADE QUE REPROVA ──
 *
 * Os testes acima leem o documento de verdade e, se ele estiver bom, passam
 * todos. Isso deixaria passar um parser que devolve lixo em qualquer outra
 * entrada. Os casos abaixo são sintéticos.
 */
describe("o leitor do catálogo, exercitado no papel", () => {
  const ler = (md: string): FichaDaEmpresa | undefined => lerCatalogo(md)[0];

  it("ignora cabeçalho que não é ficha", () => {
    expect(lerCatalogo("### Como ler uma ficha\ntexto qualquer\n")).toEqual([]);
  });

  it("não confunde `Não pode` com `Pode`", () => {
    const f = ler("### 1.1 Teste · IA\n**Pode:** ler\n**Não pode:** escrever\n");
    expect(f!.pode).toEqual(["ler"]);
    expect(f!.naoPode).toEqual(["escrever"]);
  });

  it("`Não pode também` soma à mesma trava, em vez de sobrescrever", () => {
    const f = ler(
      "### 6.3 Teste · HÍBRIDO\n**Não pode:** pagar\n**Não pode também:** derivar receita\n",
    );
    expect(f!.naoPode).toEqual(["pagar", "derivar receita"]);
  });

  it("não quebra item dentro de crase nem de parêntese", () => {
    const f = ler("### 1.1 T · IA\n**Pode:** mover `A, B`, abrir (x, y), fechar\n");
    expect(f!.pode).toEqual(["mover `A, B`", "abrir (x, y)", "fechar"]);
  });

  it("HÍBRIDO do documento vira HIBRIDO no código, sem acento", () => {
    expect(ler("### 1.1 T · HÍBRIDO\ntexto\n")!.modo).toBe("HIBRIDO");
  });

  it("para no separador: o que vem depois do `---` não entra na ficha", () => {
    const f = ler("### 1.1 T · IA\n**Pode:** ler\n\n---\n\n## Outra seção\n**Pode:** tudo\n");
    expect(f!.pode).toEqual(["ler"]);
  });

  it("uma linha solta antes dos rótulos vira resumo, e só a primeira", () => {
    const f = ler("### 1.1 T · HUMANO\nDono disso.\nOutra coisa.\n");
    expect(f!.resumo).toBe("Dono disso.");
  });

  it("slug é determinístico e não carrega acento nem símbolo", () => {
    expect(slugDe("Agente Gerente Comercial")).toBe("agente-gerente-comercial");
    expect(slugDe("Agente de Implantação e Onboarding")).toBe(
      "agente-de-implantacao-e-onboarding",
    );
    expect(slugDe("Agente SDR IA")).toBe("agente-sdr-ia");
    expect(slugDe("Análise")).toBe(slugDe("Analise"));
  });
});
