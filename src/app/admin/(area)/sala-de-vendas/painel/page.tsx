/** Admin → Sala de Vendas → Painel do gerente. */

import { Suspense } from "react";
import { PainelClient } from "./PainelClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel · Sala de Vendas" };

export default function PainelDaSalaPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
      <PainelClient />
    </Suspense>
  );
}
