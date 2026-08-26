/** Admin → Sala de Vendas → Agentes. As nove fichas, com desempenho. */

import { Suspense } from "react";
import { AgentesClient } from "./AgentesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agentes · Sala de Vendas" };

export default function AgentesDaSalaPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
      <AgentesClient />
    </Suspense>
  );
}
