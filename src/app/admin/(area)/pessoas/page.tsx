/** Admin → Pessoas e acessos. A área de RH: cria, mostra e corta acesso. */

import { Suspense } from "react";
import { PessoasClient } from "./PessoasClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pessoas e acessos" };

export default function PessoasPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Carregando…</div>}>
      <PessoasClient />
    </Suspense>
  );
}
