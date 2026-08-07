/**
 * O DESCONTO DO PRIMEIRO MÊS TEM UM DONO, E NÃO É A PÁGINA.
 *
 * `firstMonthDiscountCents`, em `@/lib/billing/pricing`, é a função que tira metade
 * de um mês do que sai do cartão. `firstMonthDiscountPercent()` deriva o percentual
 * DELA. O site nunca digita o número: se um dia o desconto virar 30%, a página vira
 * junto, e é impossível anunciar uma coisa e cobrar outra.
 *
 * Isso já estava escrito no cabeçalho do `SinaisDeVenda` desde 05/08 — escrito,
 * apenas. Prompt é aviso, código é trava (guardrail 4): em 07/08 o CEO pediu a
 * oferta em escala de manchete, e "pôr 50% grande" é exatamente o pedido que
 * convida alguém a digitar `<span>50</span>` e seguir a vida. Este arquivo é a
 * trava que faltava.
 *
 * ── A SEGUNDA COISA QUE ELE GUARDA: A HIERARQUIA ────────────────────────────
 *
 * A faixa antiga punha a oferta e o "funciona no navegador" como dois marcadores
 * da MESMA lista, no mesmo tamanho. O CEO leu no celular: *"esse aviso de cinquenta
 * por cento está muito tímido… tem que ter um destaque maior."* O defeito não era
 * a cor: era empate de hierarquia, com o fato menor ganhando por volume de texto
 * (4 linhas contra 2).
 *
 * "Ficou bonito" não é testável, e não é isso que se testa aqui. O que se testa é o
 * fato estrutural que causava o empate: **os dois fatos não voltam para dentro da
 * mesma lista.** Quem quiser reempatá-los vai ter que apagar este teste, e aí a
 * decisão é de quem apaga.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  firstMonthDiscountPercent,
  ofertaPrimeiroMes,
  OFERTA,
  SEM_APLICATIVO,
} from "@/components/marketing/SinaisDeVenda";
import { PLAN_CYCLE_CENTS, firstMonthDiscountCents } from "@/lib/billing/pricing";

const RAIZ = process.cwd();
const PASTAS = ["src/app/site", "src/components/marketing"];

/** Comentário é onde se explica o número — ver a mesma nota em `precosSemValorSemLastro`. */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * O DETECTOR. Procura um dígito colado na oferta do primeiro mês — nas duas ordens
 * em que a frase aparece na vida real ("50% … primeiro mês" e "1º mês … −50%").
 *
 * Deliberadamente estreito. Um detector genérico de "qualquer porcentagem" acusaria
 * `object-position: 50% 38%`, a classe `max-w-[80%]`, o gradiente
 * `transparent_65%` e o "10% de desconto em cada mês" do ciclo trimestral — todos
 * legítimos. Portão que reprova o caso certo ensina a desligar o portão.
 *
 * `[^.<>{}]` corta a busca em `${…}`: `1º mês −${firstMonthDiscountPercent()}%` é
 * justamente a forma CERTA, e não pode ser acusada.
 */
const PERCENTUAL_DIGITADO: RegExp[] = [
  /\d{1,3}\s*%[^.<>{}]{0,40}(primeiro|1º|1o)\s*m[êe]s/i,
  /(primeiro|1º|1o)\s*m[êe]s[^.<>{}]{0,40}[−-]?\d{1,3}\s*%/i,
  /metade[^.<>{}]{0,30}\d{1,3}\s*%/i,
];

function digitouODesconto(texto: string): boolean {
  return PERCENTUAL_DIGITADO.some((re) => re.test(texto));
}

function arquivosDoSite(): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) { andar(completo); continue; }
      if (!/\.(tsx|ts)$/.test(entrada.name)) continue;
      if (/\.test\.tsx?$/.test(entrada.name)) continue;
      achados.push(completo);
    }
  };
  for (const pasta of PASTAS) {
    const completo = path.join(RAIZ, pasta);
    if (fs.existsSync(completo)) andar(completo);
  }
  return achados;
}

describe("o percentual do primeiro mês vem da função que cobra o cartão", () => {
  it("o percentual é derivado do motor, não de uma constante paralela", () => {
    const umMes = PLAN_CYCLE_CENTS.STARTER.MENSAL;
    const esperado = Math.round((firstMonthDiscountCents("STARTER", "MENSAL") / umMes) * 100);
    expect(firstMonthDiscountPercent()).toBe(esperado);
  });

  it("a frase única e os pedaços do anúncio dizem o MESMO número", () => {
    // Duas superfícies para a mesma oferta (a frase corrida e o anúncio em escala
    // de manchete) é como nasce um site que anuncia 50 num lugar e 30 no outro.
    expect(OFERTA.numero).toBe(String(firstMonthDiscountPercent()));
    expect(ofertaPrimeiroMes()).toContain(`${firstMonthDiscountPercent()}%`);
  });

  /* ── A metade que prova que o detector REPROVA ──────────────────────────── */

  it("o detector acusa o número digitado à mão, nas duas ordens", () => {
    expect(digitouODesconto("<p>50% de desconto no primeiro mês</p>")).toBe(true);
    expect(digitouODesconto('label: "1º mês −50%"')).toBe(true);
    expect(digitouODesconto("Primeiro mês pela metade: 50% de abatimento")).toBe(true);
  });

  it("o detector NÃO acusa o que é legítimo", () => {
    // A forma certa: o número entra por expressão, não por dígito.
    expect(digitouODesconto("label: `1º mês −${firstMonthDiscountPercent()}%`")).toBe(false);
    // Porcentagens que não são o desconto do primeiro mês.
    expect(digitouODesconto('focus: "50% 38%"')).toBe(false);
    expect(digitouODesconto('{ badge: "−10%", gain: "10% de desconto em cada mês." }')).toBe(false);
    expect(digitouODesconto('className="max-w-[80%]"')).toBe(false);
  });

  /* ── A metade que varre o site de verdade ──────────────────────────────── */

  it("varre uma quantidade plausível de arquivos", () => {
    expect(arquivosDoSite().length).toBeGreaterThan(20);
  });

  it("nenhum arquivo do site digita o percentual do primeiro mês", () => {
    const culpados = arquivosDoSite().filter((a) =>
      digitouODesconto(semComentarios(fs.readFileSync(a, "utf8"))),
    ).map((a) => path.relative(RAIZ, a));

    expect(
      culpados,
      `Percentual do primeiro mês digitado à mão em: ${culpados.join(", ")}\n` +
        `Ele sai de firstMonthDiscountPercent(), que lê a MESMA função que cobra o ` +
        `cartão (firstMonthDiscountCents). Digitado, o site continua anunciando o ` +
        `valor velho no dia em que o desconto mudar — e anunciar diferente do que ` +
        `se cobra é o furo que a fonte única existe para fechar.`,
    ).toEqual([]);
  });
});

/* ── A hierarquia: os dois fatos não voltam para a mesma lista ───────────── */

/**
 * O empate, medido no markup: os dois fatos como itens de uma mesma lista. Era
 * exatamente esta a forma da faixa antiga.
 */
function doisFatosEmpatados(html: string): boolean {
  const itens = html.match(/<li\b[\s\S]*?<\/li>/g) ?? [];
  const temOferta = itens.some((li) => /\d{1,3}%\s*de desconto/.test(li));
  const temNavegador = itens.some((li) => li.includes("Funciona no navegador"));
  return temOferta && temNavegador;
}

const FAIXA_ANTIGA = `
  <div class="rounded-2xl border border-brand-200 bg-brand-50/60">
    <ul>
      <li><span class="text-[14.5px] font-semibold text-ink">50% de desconto no primeiro mês, em qualquer plano.</span></li>
      <li><span class="text-[14.5px] text-ink2">${SEM_APLICATIVO}.</span></li>
    </ul>
  </div>`;

describe("a oferta e o fato do navegador não dividem a mesma moldura", () => {
  it("o detector reprova a faixa antiga — a que o CEO chamou de tímida", () => {
    expect(doisFatosEmpatados(FAIXA_ANTIGA)).toBe(true);
  });

  it("o componente de hoje não empata os dois", () => {
    const fonte = fs.readFileSync(
      path.join(RAIZ, "src/components/marketing/SinaisDeVenda.tsx"),
      "utf8",
    );
    const visivel = semComentarios(fonte);
    expect(
      visivel.includes("<li"),
      "Voltou uma lista ao SinaisDeVenda. A oferta e o 'sem aplicativo' têm pesos " +
        "comerciais diferentes: empatados numa lista, o maior perde para o mais " +
        "comprido — foi assim que 50% de desconto virou nota de rodapé.",
    ).toBe(false);
  });

  it("a oferta é o único texto dentro da moldura escura; o navegador fica fora", () => {
    const fonte = semComentarios(
      fs.readFileSync(path.join(RAIZ, "src/components/marketing/SinaisDeVenda.tsx"), "utf8"),
    );
    const anuncio = fonte.slice(
      fonte.indexOf("export function OfertaPrimeiroMes"),
      fonte.indexOf("export function SemAplicativo"),
    );
    expect(anuncio.length).toBeGreaterThan(100);
    expect(
      anuncio.includes("SEM_APLICATIVO"),
      "O fato do navegador voltou para dentro do anúncio da oferta.",
    ).toBe(false);
  });
});
