/**
 * O SELETOR DE PLANO DE `/site/precos` — a parte que dá para MEDIR.
 *
 * Por que estas quatro linhas de classe moram fora da página: elas são a mecânica
 * inteira do seletor, e a mecânica precisa de portão. Dentro do `page.tsx` só o
 * `tsc` olhava para elas — e o defeito que este arquivo previne é **mudo por
 * construção**: uma classe do Tailwind escrita errada não quebra compilação, não
 * emite aviso e não aparece em nenhum log. A página só passa a esconder dois
 * planos de todo mundo, para sempre, sem ninguém saber.
 *
 * ── O QUE O SELETOR PROMETE (e o que o teste cobra) ──────────────────────────
 *
 * A página se chama "Três planos". No celular, o visitante só via o Essencial —
 * o Crescimento começava a três telas e meia de rolagem. A troca por botão
 * resolve a descoberta, e cria um risco novo: **planos que só existem depois do
 * clique somem do buscador.**
 *
 * Por isso a visibilidade é `display`, nunca montagem, e cada plano carrega três
 * classes que não são estilo, são contrato:
 *
 *   `hidden`                     → estado de partida abaixo de `lg`
 *   `peer-checked/<id>:block`    → o rádio irmão marcado revela ESTE cartão
 *   `lg:block`                   → no desktop os três voltam, sempre, lado a lado
 *
 * Tirar `lg:block` esconderia dois planos no monitor. Tirar `peer-checked` deixaria
 * o botão sem efeito. Trocar `display` por renderização condicional tiraria os
 * outros dois do HTML servido. Os três casos passam no `tsc` e passam no olho de
 * quem abre a página no plano certo.
 *
 * ⚠️ As classes são LITERAIS de propósito. `peer-checked/${id}:block` montado em
 * template não existe para o Tailwind — ele lê o código como texto e simplesmente
 * não gera a regra. Mesmo defeito mudo, por outra porta.
 */

import type { SitePlanId } from "@/lib/billing/pricing";

/**
 * ONDE O SELETOR ABRE — decisão do CEO, não do código.
 *
 * `crescimento` é o plano marcado como "Mais vendido". Abrir nele entrega o
 * empurrão comercial na primeira tela; abrir no `essencial` entrega o menor preço
 * primeiro. O selo "Mais vendido" sobrevive nos dois casos, porque ele vive no
 * BOTÃO do seletor e não só dentro do cartão.
 */
export const PLANO_ABERTO: SitePlanId = "crescimento";

export type ClassesDoSeletor = {
  /** O `peer` nomeado do `<input type="radio">`. */
  peer: string;
  /** O que muda no botão quando ele é o escolhido. */
  rotulo: string;
  /** A visibilidade do cartão. É esta linha que o portão mede. */
  cartao: string;
};

export const SELETOR: Record<SitePlanId, ClassesDoSeletor> = {
  essencial: {
    peer: "peer/essencial",
    rotulo:
      "peer-checked/essencial:border-brand-500 peer-checked/essencial:bg-brand-500 peer-checked/essencial:text-white peer-checked/essencial:shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] peer-focus-visible/essencial:ring-2 peer-focus-visible/essencial:ring-brand-100",
    cartao: "hidden peer-checked/essencial:block lg:block",
  },
  crescimento: {
    peer: "peer/crescimento",
    rotulo:
      "peer-checked/crescimento:border-brand-500 peer-checked/crescimento:bg-brand-500 peer-checked/crescimento:text-white peer-checked/crescimento:shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] peer-focus-visible/crescimento:ring-2 peer-focus-visible/crescimento:ring-brand-100",
    cartao: "hidden peer-checked/crescimento:block lg:block",
  },
  performance: {
    peer: "peer/performance",
    rotulo:
      "peer-checked/performance:border-brand-500 peer-checked/performance:bg-brand-500 peer-checked/performance:text-white peer-checked/performance:shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] peer-focus-visible/performance:ring-2 peer-focus-visible/performance:ring-brand-100",
    cartao: "hidden peer-checked/performance:block lg:block",
  },
};

/**
 * O QUE FALTA PARA UM PLANO CONTINUAR ALCANÇÁVEL. Lista vazia = contrato cumprido.
 *
 * Devolve motivo, não `false`: alerta que diz "algo está errado" sem o caso
 * concreto é ruído que ninguém investiga.
 */
export function faltasDaVisibilidade(id: SitePlanId, cartao: string): string[] {
  const faltas: string[] = [];
  if (!cartao.split(/\s+/).includes("lg:block")) {
    faltas.push(`sem "lg:block" — o plano ${id} sumiria do desktop, onde os três sempre couberam`);
  }
  if (!cartao.split(/\s+/).includes(`peer-checked/${id}:block`)) {
    faltas.push(
      `sem "peer-checked/${id}:block" — o botão do ${id} ficaria sem efeito no celular`,
    );
  }
  if (!cartao.split(/\s+/).includes("hidden")) {
    faltas.push(`sem "hidden" — os três cartões apareceriam empilhados, que é o defeito de origem`);
  }
  return faltas;
}
