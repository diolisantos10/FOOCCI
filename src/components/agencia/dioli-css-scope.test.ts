import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A folha da referência Dioli escreve em nomes genéricos — `.card`, `.head`,
// `.pill`, `.kpis` — e originalmente também em `html`, `body` e `*`. Ela é
// importada globalmente pelo Next: se um seletor escapar do escopo `.dioliOS`,
// ele reescreve o painel Foocci inteiro, e o estrago aparece numa tela que
// ninguém abriu nesta sessão.
//
// Guardrail 4 — prompt é aviso, código é trava. O comentário no topo do CSS
// pede escopo; este teste é quem o obriga.

const CSS = readFileSync(join(__dirname, "dioli.css"), "utf8");

/** Tira comentários, blocos de declaração e chaves de at-rule, sobrando só
 *  os seletores. */
function selectors(css: string): string[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  // Cada prelúdio de bloco é o texto entre `}` (ou início) e `{`.
  for (const m of noComments.matchAll(/(^|[{}])([^{}]+)\{/g)) {
    const prelude = (m[2] ?? "").trim();
    if (!prelude || prelude.startsWith("@")) continue;
    for (const sel of prelude.split(",")) {
      const s = sel.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

describe("dioli.css — escopo", () => {
  const sels = selectors(CSS);

  it("a folha tem conteúdo (o teste não passa por arquivo vazio)", () => {
    expect(sels.length).toBeGreaterThan(800);
  });

  it("TODO seletor começa por .dioliOS — nada vaza para o painel Foocci", () => {
    // Percentuais de keyframes são os únicos preludios legítimos sem escopo.
    const KEYFRAME = /^(from|to|\d+%)$/;
    const escapees = sels.filter((s) => !s.startsWith(".dioliOS") && !KEYFRAME.test(s));
    expect(escapees).toEqual([]);
  });

  it("não sobrou seletor de elemento global (html, body, *) sem escopo", () => {
    const globals = sels.filter((s) => /^(html|body|\*|:root)\b/.test(s));
    expect(globals).toEqual([]);
  });

  it("não sobrou @import — o Tailwind do Foocci é o único", () => {
    // Sem os comentários: o cabeçalho do arquivo CITA o `@import` que removeu.
    const code = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/@import/);
  });

  it("a ponte de fontes religa --inter e --sora aos tokens do Foocci", () => {
    expect(CSS).toMatch(/--inter:\s*var\(--font-inter\)/);
    expect(CSS).toMatch(/--sora:\s*var\(--font-sora\)/);
  });
});
