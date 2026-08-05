"use client";

/**
 * Barra fixa de CTA no rodapé — só no celular. Aparece depois que a pessoa passa
 * do hero. Sem dependência: puro ouvinte de scroll.
 *
 * ELA SE CALA DIANTE DO FORMULÁRIO. Quando o formulário de demonstração (ou a tela
 * que o substitui depois do envio) está na dobra, a barra some. Motivo: são duas
 * ações primárias laranja, de largura cheia, a poucos pixels uma da outra — e a da
 * barra leva a pessoa PARA LONGE da conversão que ela já começou. "Uma ação
 * principal clara por tela" é a régua declarada nas Referências do DESIGN.md
 * (norte estético do painel: Linear).
 *
 * A marca procurada é `[data-demo-form]`, posta pelo próprio `DemoForm` — assim
 * vale para qualquer página que carregue o formulário, hoje ou depois, sem esta
 * barra precisar conhecer rota nenhuma.
 */

import { useEffect, useState } from "react";
import { COMO_FUNCIONA_URL, PRIMARY_CTA_LABEL } from "./config";

export function StickyMobileCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const passouDoHero = window.scrollY > 640;
      setShow(passouDoHero && !formularioNaDobra());
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

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 p-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto max-w-md">
        <a
          href={COMO_FUNCIONA_URL}
          className="inline-flex w-full items-center justify-center rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          {PRIMARY_CTA_LABEL}
        </a>
      </div>
    </div>
  );
}

/** O formulário de demonstração está visível na tela agora? */
function formularioNaDobra(): boolean {
  const el = document.querySelector("[data-demo-form]");
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
}
