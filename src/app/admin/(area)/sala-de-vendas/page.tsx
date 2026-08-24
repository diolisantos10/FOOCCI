/**
 * Admin → Sala de Vendas.
 *
 * A tela onde a receita da Foocci acontece. É a ÚNICA área do Admin que o SDR
 * humano alcança — e o isolamento é do servidor, não do menu.
 */

import { Suspense } from "react";
import { SalaDeVendasClient } from "./SalaDeVendasClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sala de Vendas" };

export default function SalaDeVendasPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl text-[13px] text-muted">Carregando…</div>
        </div>
      }
    >
      <SalaDeVendasClient />
    </Suspense>
  );
}
