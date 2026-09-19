/**
 * O CONTRATO DA MOLDURA — medido no fonte que responde ao usuário.
 *
 * Um teste de componente provaria que a moldura desenha. Não provaria o que a
 * auditoria de 19/09/2026 achou: que ela **não estava em uso** e que cada tela
 * tinha a sua própria borda. Então o que este arquivo mede é o uso e as duas
 * regras que não podem voltar a escorregar:
 *
 *   1. a moldura é UMA peça, e o layout da área usa ELA;
 *   2. o Ctrl+K só existe porque a busca existe — atalho sem busca é a tela
 *      mentindo, e isso é pior que não ter atalho;
 *   3. a paleta da área sai dos tokens: `slate`/`violet`/`gray` crus não voltam.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const AREA = join(process.cwd(), "src/app/comercial/(area)");

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function ler(...p: string[]): string {
  return semComentarios(readFileSync(join(AREA, ...p), "utf8"));
}

/** Todo `.tsx` da área, em qualquer profundidade. */
function fontes(dir = AREA): string[] {
  return readdirSync(dir).flatMap((n) => {
    const caminho = join(dir, n);
    if (statSync(caminho).isDirectory()) return fontes(caminho);
    return n.endsWith(".tsx") ? [caminho] : [];
  });
}

describe("⭐ a moldura é uma peça só, e a área inteira usa ELA", () => {
  it("o layout da área monta a moldura", () => {
    const layout = ler("layout.tsx");
    expect(layout).toContain("./_moldura/MolduraDaSala");
    expect(layout).toContain("<MolduraDaSala");
  });

  it("nenhuma tela desenha a própria barra lateral nem a própria barra escura", () => {
    for (const f of fontes()) {
      if (f.includes("_moldura")) continue;
      const fonte = semComentarios(readFileSync(f, "utf8"));
      expect(fonte, `${f} traz a barra escura da moldura por conta própria`).not.toMatch(
        /bg-nav\b/,
      );
    }
  });

  it("a moldura traz o cabeçalho escuro, a lateral de 230px e o menu lateral", () => {
    const m = ler("_moldura", "MolduraDaSala.tsx");
    expect(m).toContain("bg-nav");
    expect(m).toContain("w-[230px]");
    expect(m).toContain("MenuDaSala");
  });
});

describe("⭐ o Ctrl+K só existe porque a busca existe", () => {
  const m = ler("_moldura", "MolduraDaSala.tsx");

  it("o atalho está armado", () => {
    expect(m).toMatch(/metaKey \|\| e\.ctrlKey/);
    expect(m).toMatch(/=== "k"/);
  });

  it("a caixa FILTRA de verdade, e não é só um campo desenhado", () => {
    // Sem `filter` aqui, o atalho abriria uma caixa que não procura nada.
    expect(m).toContain("telas.filter");
  });

  it("a caixa navega para o que ela achou", () => {
    expect(m).toContain("router.push");
  });

  it("o vazio da busca diz o que ela NÃO procura", () => {
    expect(m).toMatch(/ainda não procura lead/);
  });
});

describe("⭐ a paleta da área comercial sai dos tokens", () => {
  it("nenhum `slate`/`violet`/`purple`/`indigo`/`gray` cru", () => {
    for (const f of fontes()) {
      const fonte = semComentarios(readFileSync(f, "utf8"));
      expect(fonte, `${f} traz cor crua fora do DESIGN.md`).not.toMatch(
        /\b(slate|violet|purple|indigo|gray)-\d{2,3}\b/,
      );
    }
  });
});

describe("⭐ toda tela da moldura nasce com carregando e erro", () => {
  it("a área tem `loading.tsx` e `error.tsx` no segmento", () => {
    expect(ler("loading.tsx")).toContain("animate-pulse");
    const erro = ler("error.tsx");
    expect(erro).toContain("reset");
    expect(erro).toContain("Tentar de novo");
  });
});
