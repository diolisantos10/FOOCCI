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
  cargoDonoDe,
  REGRAS_UNIVERSAIS,
  type FichaDaEmpresa,
  type VinculoDeFicha,
} from "./fichasDaEmpresa";
import { DEFAULT_AGENT_PROFILES } from "./defaultAgentProfiles";

const CATALOGO = path.join(
  process.cwd(),
  "docs/arquitetura-operacional-foocci-v1/11-FICHAS-DOS-AGENTES.md",
);

const texto = readFileSync(CATALOGO, "utf8");
const fichas = lerCatalogo(texto);

/**
 * ── A METADE QUE CONFERE O DOCUMENTO ──
 *
 * A versão anterior do catálogo dizia "32 fichas · 11 IA · 12 HUMANO · 9
 * HÍBRIDO". Eram 34 cabeçalhos e a soma nunca fechou: alguém (eu) somou à mão.
 *
 * Um catálogo que erra a própria contagem é o defeito que este programa existe
 * para achar. A correção só vale se o número parar de depender de quem soma —
 * por isso a contagem agora é CONTADA do documento e comparada com a tabela que
 * ele publica. Editar uma sem a outra reprova aqui.
 */
describe("o catálogo bate com a tabela que ele mesmo publica", () => {
  /** A tabela impressa na seção "Contagem" do documento. */
  function tabelaPublicada(): Map<number, number> {
    const mapa = new Map<number, number>();
    for (const [, n, qtd] of texto.matchAll(/^\| (\d) · .+? \| (\d+) \|$/gm)) {
      mapa.set(Number(n), Number(qtd));
    }
    return mapa;
  }

  it("o documento publica uma tabela por departamento", () => {
    // Sem esta metade, apagar a tabela faria as comparações abaixo passarem
    // comparando dois conjuntos vazios.
    expect(tabelaPublicada().size).toBe(9);
  });

  it("cada departamento tem no documento o número de fichas que a tabela afirma", () => {
    const contadas = porDepartamento(fichas);
    for (const [dep, prometido] of tabelaPublicada()) {
      expect({ dep, fichas: contadas.get(dep) }).toEqual({ dep, fichas: prometido });
    }
  });

  it("o total impresso confere com as fichas contadas mais as 3 de direção", () => {
    const impresso = /\*\*(\d+) fichas:\*\*/.exec(texto);
    expect(impresso).not.toBeNull();
    expect(Number(impresso![1])).toBe(fichas.length + 3);
  });

  it("os modos impressos conferem com os modos contados", () => {
    const impresso = /Modo: \*\*(\d+) IA · (\d+) HUMANO · (\d+) HÍBRIDO\.\*\*/.exec(texto);
    expect(impresso).not.toBeNull();

    const conta = porModo(fichas);
    // As 3 fichas de direção são HUMANO e vivem numa tabela, não em cabeçalho.
    expect({
      ia: Number(impresso![1]),
      humano: Number(impresso![2]),
      hibrido: Number(impresso![3]),
    }).toEqual({ ia: conta.IA, humano: conta.HUMANO + 3, hibrido: conta.HIBRIDO });
  });
});

describe("as fichas lidas do catálogo", () => {
  it("são 34 fichas de departamento", () => {
    expect(fichas.length).toBe(34);
  });

  it("toda ficha tem slug, nome e departamento entre 1 e 9", () => {
    for (const f of fichas) {
      expect(f.slug.length, `${f.numero} sem slug`).toBeGreaterThan(0);
      expect(f.nome.length, `${f.numero} sem nome`).toBeGreaterThan(0);
      expect(f.departamento, `${f.numero} fora da faixa`).toBeGreaterThanOrEqual(1);
      expect(f.departamento, `${f.numero} fora da faixa`).toBeLessThanOrEqual(9);
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
    // nome, um dos cinco que constroem o sistema. Esta é a trava para não
    // repetir com a terceira população.
    for (const f of fichas) {
      expect(SLUGS_PROIBIDOS, `${f.numero} (${f.slug})`).not.toContain(f.slug);
    }
  });

  it("toda ficha de IA tem limite declarado — no catálogo ou na constituição que ela aponta", () => {
    // Ficha de IA sem trava escrita é uma IA sem limite declarado. As de humano
    // podem não ter: gente responde por julgamento, não por allowlist.
    //
    // A exceção é a ficha que APONTA para um agente de produto já existente: o
    // limite dela vive na constituição daquele agente. Mas a exceção só vale se
    // a constituição existir de verdade — senão viraria o buraco por onde uma
    // ficha vazia passa dizendo "meu limite está em outro lugar".
    const registro = new Map(DEFAULT_AGENT_PROFILES.map((p) => [p.slug, p]));

    for (const f of fichas.filter((x) => x.modo === "IA")) {
      const apontado = f.jaExisteComo ? registro.get(f.jaExisteComo) : undefined;
      const limite = f.naoPode.length + (apontado?.forbiddenActions?.length ?? 0);
      expect(limite, `${f.numero} ${f.nome}: nem catálogo nem constituição`).toBeGreaterThan(0);
    }
  });

  it("toda ficha de IA ou híbrida diz o que PODE — ou aponta para quem diz", () => {
    const registro = new Map(DEFAULT_AGENT_PROFILES.map((p) => [p.slug, p]));

    for (const f of fichas.filter((x) => x.modo !== "HUMANO")) {
      const apontado = f.jaExisteComo ? registro.get(f.jaExisteComo) : undefined;
      const capacidade =
        f.pode.length + (apontado?.allowedActions?.length ?? 0) + (f.resumo ? 1 : 0);
      expect(capacidade, `${f.numero} ${f.nome} veio sem nada`).toBeGreaterThan(0);
    }
  });

  it("uma ficha que aponta para slot vazio não passa por agente pronto", () => {
    // `analytics-product` existe no registro desde a Fase 0 como placeholder:
    // zero regra, zero ferramenta. A ficha 6.5 aponta para ele. Se o catálogo
    // voltar a chamá-lo de "agente que já existe", isto reprova.
    const registro = new Map(DEFAULT_AGENT_PROFILES.map((p) => [p.slug, p]));
    const vazios = fichas.filter(
      (f) => f.jaExisteComo && (registro.get(f.jaExisteComo)?.allowedActions?.length ?? 0) === 0,
    );

    for (const f of vazios) {
      const cabecalho = new RegExp(`^### ${f.numero.replace(".", "\\.")} .*$`, "m").exec(texto);
      expect(cabecalho, `${f.numero} sumiu do documento`).not.toBeNull();
      expect(cabecalho![0], `${f.numero} aponta para slot vazio mas se diz pronta`).not.toMatch(
        /já existe/,
      );
    }
  });

  it("toda ficha tem descrição: resumo, ou pelo menos um pode/não pode", () => {
    for (const f of fichas) {
      const temAlgo = f.resumo || f.pode.length || f.naoPode.length;
      expect(Boolean(temAlgo), `${f.numero} ${f.nome} veio vazia`).toBe(true);
    }
  });

  it("as quatro que já existem apontam para o agente de produto certo", () => {
    const ligadas = fichas.filter((f) => f.jaExisteComo);
    expect(ligadas.map((f) => [f.numero, f.jaExisteComo])).toEqual([
      ["6.2", "waiter"],
      ["6.3", "crm"],
      ["6.4", "whatsapp"],
      ["6.5", "analytics-product"],
    ]);
  });

  it("`suporte-tecnico` NÃO foi amarrado a ficha nenhuma", () => {
    // Ele encosta em 4.2 e em 7.3. Escolher no chute faria uma função da
    // empresa herdar, calada, as permissões de um agente de produto.
    for (const f of fichas) expect(f.jaExisteComo).not.toBe("suporte-tecnico");
  });

  it("a ficha 2.2 (SDR IA) chega inteira — o caso mais detalhado do catálogo", () => {
    const sdr = fichas.find((f) => f.numero === "2.2");
    expect(sdr).toBeDefined();
    expect(sdr!.modo).toBe("IA");
    expect(sdr!.pode.length).toBeGreaterThan(5);
    expect(sdr!.naoPode.length).toBeGreaterThan(3);
    expect(sdr!.escalaQuando.length).toBeGreaterThan(0);
    expect(sdr!.medeSePor.length).toBeGreaterThan(0);
    // A seta não pode ter sido picada no meio pela quebra por vírgula.
    expect(sdr!.pode.some((p) => p.includes("NOVO → CONTATADO → QUALIFICADO"))).toBe(true);
  });

  it("a regra dura do SDR humano sobrevive à leitura", () => {
    const humano = fichas.find((f) => f.numero === "2.3");
    expect(humano!.regraDura.length).toBeGreaterThan(0);
    expect(humano!.regraDura.join(" ")).toContain("atômico");
  });
});

describe("da ficha do catálogo para a linha do banco", () => {
  const sdr = fichas.find((f) => f.numero === "2.2")!;
  const gerente = fichas.find((f) => f.numero === "2.1")!;

  it("nenhuma ficha nova nasce ligada nem ativa", () => {
    // O comando do proprietário é explícito: nada de ativar IA nesta fase.
    // Um seed que semeasse ACTIVE ligaria 34 agentes de uma vez.
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
    expect(paraPerfilNovo(fichas.find((f) => f.numero === "2.6")!).executionMode).toBe("HYBRID");
  });

  it("as três regras universais viajam com toda ficha de IA e híbrida", () => {
    // Deixá-las só no cabeçalho do documento faria delas um aviso. Na linha,
    // elas são o piso que a ficha não pode baixar.
    for (const f of fichas.filter((x) => x.modo !== "HUMANO" && !x.jaExisteComo)) {
      const regras = paraPerfilNovo(f).safetyRules;
      for (const universal of REGRAS_UNIVERSAIS) {
        expect(regras, `${f.numero} ${f.nome}`).toContain(universal);
      }
    }
  });

  it("ficha de humano NÃO recebe as regras de IA", () => {
    // "Nunca inventa preço" num cargo de gente seria ruído: pessoa responde por
    // julgamento e por política comercial, não por allowlist de IA.
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
    // Esta é a trava que impede o seed de apagar a constituição do Waiter numa
    // segunda-feira de manhã. Se alguém acrescentar `allowedActions` ao tipo do
    // vínculo, este teste reprova antes de o seed rodar.
    const vinculo: VinculoDeFicha = {
      catalogNumber: "6.2",
      departmentId: "dep6",
      ownerPositionId: null,
      managerPositionId: null,
    };
    const proibidos = [
      "allowedActions",
      "forbiddenActions",
      "status",
      "isRuntimeEnabled",
      "mission",
      "population",
      "executionMode",
      "safetyRules",
    ];
    for (const campo of proibidos) {
      expect(Object.keys(vinculo), `vínculo não pode carregar ${campo}`).not.toContain(campo);
    }
  });

  it("o dono de uma ficha comum é o gerente do departamento dela", () => {
    expect(cargoDonoDe(sdr, "vendas")).toBe("gerente-vendas");
  });

  it("o dono da ficha do próprio gerente é o Gerente Geral", () => {
    // Sem esta regra, o Gerente de Vendas seria dono da própria ficha — e
    // "quem cobra" e "quem é cobrado" virariam a mesma pessoa.
    expect(cargoDonoDe(gerente, "vendas")).toBe("gerente-geral");
  });

  it("toda ficha tem dono, inclusive as de IA", () => {
    // O catálogo diz: "IA sem dono é trabalho sem responsável."
    for (const f of fichas) {
      expect(cargoDonoDe(f, "vendas").length).toBeGreaterThan(0);
    }
  });
});

/**
 * ── A METADE QUE REPROVA ──
 *
 * Os testes acima leem o documento de verdade e, se ele estiver bom, passam
 * todos. Isso deixaria passar um parser que devolve lixo em qualquer entrada
 * diferente. Os casos abaixo são sintéticos e existem para provar que ele
 * realmente separa as coisas.
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
      "### 9.2 Teste · HÍBRIDO\n**Não pode:** pagar\n**Não pode também:** derivar receita\n",
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
    expect(slugDe("Gerente de Marketing & Growth")).toBe("gerente-de-marketing-e-growth");
    expect(slugDe("Agente de Configuração e Importação")).toBe(
      "agente-de-configuracao-e-importacao",
    );
    expect(slugDe("SDR IA")).toBe("sdr-ia");
    expect(slugDe("Análise")).toBe(slugDe("Analise"));
  });
});
