/**
 * PORTÃO DA CONTAGEM — as duas metades, sempre.
 *
 * A metade que REPROVA prova que o formato desconhecido não vira zero.
 * A metade que PASSA prova que os dois formatos reais deste repositório
 * continuam sendo contados. Sem a segunda, o detector viraria carimbo: bastaria
 * devolver "não medido" para tudo e o portão ficaria verde para sempre — com a
 * tela mostrando "não medido" no lugar de sete blocos de trabalho.
 */

import { describe, expect, it } from "vitest";
import { contarEntradas, dataDaEntrada, diasDesde } from "../contagemDeEntradas";

const AGORA = new Date("2026-08-07T12:00:00.000Z");

const OFICINA_COM_CABECALHO = `# Oficina — canais

> Append-only.

---

## 2026-08-04 · Extração total da Evolution

Texto do bloco.

### Um subtítulo que NÃO é entrada

Mais texto.

---

## 2026-08-07 · A Central não sabe que o Instagram existe

Outro bloco.
`;

/** O formato do \`garcom\`: nenhum cabeçalho, data em negrito depois da régua. */
const OFICINA_DATADA = `# Oficina — garçom (corrente)

> Append-only. O agente escreve aqui.

---

2026-08-03 — **sushi-cazza: número reconhecido sem nome.** Investigação
somente-leitura.

---

2026-08-04 — **Categorias de upsell viram configuração.** Pedido do CEO.

---

2026-08-07 (2ª parte) — **Os três consertos autorizados.** Fim.
`;

describe("os dois formatos reais são contados", () => {
  it("conta seções `## …` e ignora subtítulo `### …`", () => {
    const c = contarEntradas(OFICINA_COM_CABECALHO, AGORA);
    expect(c.formato).toBe("cabecalho");
    expect(c.entradas).toBe(2);
    expect(c.ultimaData).toBe("2026-08-07");
  });

  it("conta blocos datados SEM cabeçalho — o caso do `garcom`", () => {
    /*
      Esta é a asserção que existe por causa de uma armadilha medida no
      repositório: `docs/agents/garcom/oficina.md` não usa `## `. Um contador de
      `^## ` devolveria 0 para o agente com sete incidentes registrados.
    */
    const c = contarEntradas(OFICINA_DATADA, AGORA);
    expect(c.formato).toBe("datado");
    expect(c.entradas).toBe(3);
    expect(c.ultimaData).toBe("2026-08-07");
  });

  it("aceita a data em DD/MM, que `interface` e `operacao` usam", () => {
    const c = contarEntradas("# t\n\n## 04/08 — Checkout self-service\n\ncorpo\n", AGORA);
    expect(c.formato).toBe("cabecalho");
    expect(c.entradas).toBe(1);
    expect(c.ultimaData).toBe("2026-08-04");
  });
});

describe("o que NÃO é entrada não infla a contagem", () => {
  it("`## ` dentro de bloco de código não conta", () => {
    const texto = [
      "# Oficina",
      "",
      "## 2026-08-01 — entrada real",
      "",
      "```md",
      "## 2026-08-02 — exemplo colado dentro de bloco de código",
      "```",
      "",
      "fim",
    ].join("\n");
    expect(contarEntradas(texto, AGORA).entradas).toBe(1);
  });

  it("`---` dentro de bloco de código não parte a entrada em duas", () => {
    const texto = [
      "# Oficina",
      "",
      "2026-08-01 — **entrada real**",
      "",
      "```",
      "---",
      "2026-08-02 — linha de exemplo",
      "```",
      "",
      "fim",
    ].join("\n");
    const c = contarEntradas(texto, AGORA);
    expect(c.formato).toBe("datado");
    expect(c.entradas).toBe(1);
  });

  it("data no MEIO da frase não vira data da entrada", () => {
    // "o Instagram mudo desde 23/07" existe em docs/agents/meta/oficina.md.
    const c = contarEntradas("# t\n\n## 2026-08-05 · O Instagram mudo desde 23/07\n\ncorpo\n", AGORA);
    expect(c.ultimaData).toBe("2026-08-05");
  });
});

describe("formato não reconhecido NUNCA vira zero", () => {
  it("texto sem cabeçalho e sem data sai como `desconhecido`, com evidência", () => {
    /*
      A metade que reprova. Se alguém "simplificar" a contagem para
      `linhas.filter(...).length`, este caso passa a devolver 0 e a tela escreve
      zero em cima de trabalho que existe.
    */
    const texto = "# Oficina — alguem\n\n> nota\n\nUm registro escrito em prosa, sem data e sem título.\n";
    const c = contarEntradas(texto, AGORA);
    expect(c.formato).toBe("desconhecido");
    expect(c.entradas).toBe(0);
    expect(c.linhasDeConteudo).toBeGreaterThan(0);
    expect(c.amostraNaoReconhecida).toContain("Um registro escrito em prosa");
  });

  it("arquivo só com título e citação é `vazio` — o único zero honesto", () => {
    const c = contarEntradas("# Oficina — novo\n\n> Append-only.\n\n---\n", AGORA);
    expect(c.formato).toBe("vazio");
    expect(c.linhasDeConteudo).toBe(0);
  });
});

describe("interpretação de data", () => {
  it("DD/MM sem ano no futuro cai para o ano anterior", () => {
    // Em 07/08/2026, "28/12" só pode ser 2025 — senão um agente parado há oito
    // meses apareceria como ativo ontem.
    expect(dataDaEntrada("## 28/12 — bloco antigo", AGORA)).toBe("2025-12-28");
  });

  it("data impossível é recusada em vez de normalizada", () => {
    expect(dataDaEntrada("## 31/02 — nada", AGORA)).toBeNull();
    expect(dataDaEntrada("## 2026-13-01 — nada", AGORA)).toBeNull();
  });

  it("`diasDesde` conta dias inteiros e não fica negativo", () => {
    expect(diasDesde("2026-08-07", AGORA)).toBe(0);
    expect(diasDesde("2026-07-08", AGORA)).toBe(30);
    expect(diasDesde("2026-09-01", AGORA)).toBe(0);
  });
});
