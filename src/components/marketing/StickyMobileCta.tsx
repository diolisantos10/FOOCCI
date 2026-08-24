"use client";

/**
 * Barra fixa de CTA no rodapé — só no celular. Aparece depois que a pessoa passa
 * do hero. Sem dependência: puro ouvinte de scroll.
 *
 * ELA SE CALA DIANTE DO FORMULÁRIO — E DO CTA DA PRÓPRIA PÁGINA. Quando o
 * formulário de demonstração (ou a tela que o substitui depois do envio) ou o CTA
 * comercial da página estão na dobra, a barra some. Motivo: são duas ações
 * primárias laranja, de largura cheia, a poucos pixels uma da outra. "Uma ação
 * principal clara por tela" é a régua declarada nas Referências do DESIGN.md
 * (norte estético do painel: Linear).
 *
 * O CTA da página entrou nesta regra em 05/08, junto com o rótulo único: antes a
 * barra dizia outra coisa e ia para outro lugar, então as duas ainda se
 * distinguiam. Agora são o MESMO texto para o MESMO destino — repetido, vira
 * ruído, não insistência.
 *
 * As marcas procuradas são `[data-demo-form]` (posta pelo `DemoForm`) e
 * `[data-demo-cta]` (posta pela `CtaBand`, pela calculadora e por quem mais for o
 * CTA único de uma página). Assim a barra não precisa conhecer rota nenhuma — o
 * dono da marca é quem sabe qual botão é o principal daquela tela.
 *
 * PARA ONDE ELA LEVA (corrigido em 05/08): o FORMULÁRIO. Ela apontava para
 * `/site/como-funciona`, e isso tinha dois defeitos. O primeiro é que ela já foi
 * construída como caminho do formulário — a regra de se calar diante de
 * `[data-demo-form]` só faz sentido se ela levasse para lá. O segundo é pior: em
 * `/site/como-funciona` a barra linkava para a própria página em que a pessoa
 * estava, um botão fixo que não fazia nada.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DEMO_PAGE_PATH, ASSINAR_URL, ASSINAR_CTA_LABEL } from "./config";

/**
 * A barra fixa do celular é o TOPO do celular: ela carrega o mesmo convite do
 * cabeçalho — **Assinar** — desde 24/08/2026. Quem tem dúvida usa o botão verde
 * do canto, que no celular fica logo acima desta barra.
 */
export function StickyMobileCta() {
  const [show, setShow] = useState(false);
  /*
    NA PRÓPRIA PÁGINA DO FORMULÁRIO A BARRA NÃO EXISTE. Antes da dobra do
    formulário ela apareceria apontando para a página em que a pessoa já está —
    um botão fixo, laranja, de largura cheia, que ao ser tocado não faz nada. Era
    o defeito que a barra tinha em `/site/como-funciona` quando levava para lá.

    ⚠️ COMPARAR COM `DEMO_PAGE_PATH`, NUNCA COM `DEMO_URL`. Desde 06/08 o destino
    carrega âncora (`/site/precos#demonstracao`) e `usePathname()` NUNCA devolve o
    `#` — comparar com a URL inteira nunca mais daria verdadeiro, e a barra
    voltaria a aparecer na página do formulário sem ninguém ver. Falha muda: o
    botão até rolaria a tela, mas competiria em laranja com os três "Contratar
    agora" dos cartões de plano, que são a ação principal daquela tela.
  */
  const naPaginaDoFormulario = usePathname() === DEMO_PAGE_PATH;

  useEffect(() => {
    const onScroll = () => {
      const passouDoHero = window.scrollY > 640;
      setShow(passouDoHero && !conversaoNaDobra());
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    // Reavaliar no resize: girar o celular muda a dobra.
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (!show || naPaginaDoFormulario) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 p-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto max-w-md">
        <a
          href={ASSINAR_URL}
          className="inline-flex w-full items-center justify-center rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          {ASSINAR_CTA_LABEL}
        </a>
      </div>
    </div>
  );
}

/** O formulário — ou o CTA comercial da página — está visível na tela agora? */
function conversaoNaDobra(): boolean {
  const els = document.querySelectorAll("[data-demo-form], [data-demo-cta]");
  for (const el of Array.from(els)) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) return true;
  }
  return false;
}
