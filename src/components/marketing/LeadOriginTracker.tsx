"use client";

/**
 * Guarda de onde o visitante veio, na primeira página que ele abrir no /site.
 *
 * Não desenha nada. Precisa estar no LAYOUT do site (e não no formulário) porque
 * o anúncio raramente cai direto na página do formulário: cai na home, e os
 * parâmetros da campanha só existem naquela primeira URL.
 *
 * Ver `leadOriginStorage.ts` — inclusive por que isto não é uma tag de analytics.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { registraPrimeiroToque } from "./leadOriginStorage";

export function LeadOriginTracker() {
  // `usePathname` e NÃO `useSearchParams`: este último obriga toda página do
  // /site a ficar dentro de um <Suspense> no build. A query é lida direto de
  // `window.location.search` dentro do efeito, que roda só no navegador.
  const pathname = usePathname();

  // Roda também nas navegações internas do App Router: o primeiro toque pode ser
  // uma página que o visitante abriu num segundo clique dentro do mesmo anúncio.
  // A função é idempotente — só grava se ainda não houver origem identificada.
  useEffect(() => {
    registraPrimeiroToque();
  }, [pathname]);

  return null;
}
