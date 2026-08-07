/**
 * OS TRÊS PLANOS CONTINUAM NO HTML DEPOIS QUE A PÁGINA GANHOU BOTÕES.
 *
 * O pedido do CEO (07/08) foi de DESCOBERTA: no celular só aparecia o Essencial, e
 * quem não rolava não sabia que existiam outros dois. A solução — três botões que
 * trocam o cartão — traz junto um risco que é pior que o problema original:
 * **conteúdo que só existe depois do clique some do Google.** `/site/precos` é
 * página comercial indexada; se dois planos deixarem de ser servidos no HTML, a
 * página perde busca por "Crescimento" e "Performance" e ninguém percebe.
 *
 * Por isso a troca é `display`, feita por `<input type="radio">` + `:checked`, e
 * nunca renderização condicional. O que este arquivo cobra:
 *
 *   1. a visibilidade de cada plano tem as três classes do contrato;
 *   2. a página monta os cartões percorrendo a lista INTEIRA, sem filtro;
 *   3. a página não virou componente de cliente (`"use client"`), que é como o
 *      seletor viraria `useState` e os outros dois planos parariam de ser servidos.
 *
 * As três verificações têm as duas metades: cada uma roda contra um exemplo com o
 * defeito (que precisa reprovar) e contra o código de verdade (que precisa passar).
 *
 * ⚠️ O que este arquivo NÃO substitui: a prova de que o clique realmente troca o
 * cartão. Essa foi feita no navegador, com o JavaScript LIGADO e DESLIGADO, em
 * 375/768/1280 — está no registro de oficina de 07/08. Teste de unidade não
 * enxerga cascata de CSS; ele guarda o contrato, não o pixel.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SELETOR, PLANO_ABERTO, faltasDaVisibilidade } from "@/lib/site/seletorDePlanos";
import { SITE_PLAN_IDS } from "@/lib/billing/pricing";

const RAIZ = process.cwd();
const PAGINA = "src/app/site/(gated)/precos/page.tsx";

function fontePagina(): string {
  return fs.readFileSync(path.join(RAIZ, PAGINA), "utf8");
}

describe("o seletor de planos não esconde plano do HTML", () => {
  it("todo plano do site tem regra de visibilidade", () => {
    for (const id of SITE_PLAN_IDS) {
      expect(SELETOR[id], `plano "${id}" sem entrada em SELETOR`).toBeTruthy();
    }
    expect(Object.keys(SELETOR).sort()).toEqual([...SITE_PLAN_IDS].sort());
  });

  it("cada plano cumpre o contrato de visibilidade", () => {
    for (const id of SITE_PLAN_IDS) {
      expect(faltasDaVisibilidade(id, SELETOR[id].cartao), `plano "${id}"`).toEqual([]);
    }
  });

  it("o plano que abre é um dos três", () => {
    expect(SITE_PLAN_IDS).toContain(PLANO_ABERTO);
  });

  /* ── A metade que prova que a verificação REPROVA ───────────────────────── */

  it("acusa quem tira o desktop, o botão ou o estado de partida", () => {
    expect(faltasDaVisibilidade("essencial", "hidden peer-checked/essencial:block")).toEqual([
      expect.stringContaining("lg:block"),
    ]);
    expect(faltasDaVisibilidade("essencial", "hidden lg:block")).toEqual([
      expect.stringContaining("peer-checked/essencial:block"),
    ]);
    expect(faltasDaVisibilidade("essencial", "peer-checked/essencial:block lg:block")).toEqual([
      expect.stringContaining("hidden"),
    ]);
  });

  it("acusa o `peer-checked` montado em template, que o Tailwind não enxerga", () => {
    // eslint-disable-next-line no-template-curly-in-string
    const montado = "hidden peer-checked/${id}:block lg:block";
    expect(faltasDaVisibilidade("essencial", montado).length).toBeGreaterThan(0);
  });
});

/* ── A página: monta os três, e monta no servidor ────────────────────────── */

/** Filtrar a lista de planos antes de montar = dois planos fora do HTML servido. */
function montaSoUmPlano(fonte: string): boolean {
  return /PLANS\s*\.\s*(filter|find|slice)\s*\(/.test(fonte);
}

describe("a página de preços serve os três planos", () => {
  it("percorre a lista inteira e não filtra nenhum plano", () => {
    const fonte = fontePagina();
    expect(fonte).toContain("PLANS.map(");
    expect(
      montaSoUmPlano(fonte),
      "A página passou a escolher quais planos monta. Com botão de seleção, isso " +
        "tira dois planos do HTML servido — e conteúdo que só nasce depois do " +
        "clique some do buscador. A seleção é `display`, nunca montagem.",
    ).toBe(false);
  });

  it("o detector de filtro reprova o código com o defeito", () => {
    expect(montaSoUmPlano("{PLANS.filter((p) => p.id === selecionado).map((plan) => ...)}")).toBe(true);
    expect(montaSoUmPlano("{PLANS.find((p) => p.id === selecionado)}")).toBe(true);
    expect(montaSoUmPlano("{PLANS.map((plan) => <PlanCard plan={plan} />)}")).toBe(false);
  });

  it("continua renderizando no servidor", () => {
    // `"use client"` aqui significaria estado de React no lugar do rádio nativo:
    // o visitante sem JavaScript ficaria preso no plano de partida.
    expect(fontePagina().slice(0, 400)).not.toContain('"use client"');
  });

  it("os três rádios são irmãos diretos dos três cartões", () => {
    // A mecânica é o seletor `~` do CSS. Envolver os rótulos numa div
    // "organizadora" quebra a troca em silêncio — sem erro, sem aviso.
    const fonte = fontePagina();
    const grid = fonte.slice(fonte.indexOf('name="plano"'), fonte.indexOf("Passa de 4.000"));
    expect(grid).toContain("SELETOR[plan.id].peer");
    expect(grid).toContain("SELETOR[plan.id].cartao");
    expect(grid).toContain("sr-only");
  });
});
