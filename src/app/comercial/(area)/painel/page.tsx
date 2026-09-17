/**
 * Admin → Sala de Vendas → Painel do gerente + Revenue Supervisor.
 *
 * ── DUAS SUSPENSÕES, E NÃO UMA ──────────────────────────────────────────────
 *
 * O painel do gerente e o supervisor leem rotas diferentes e falham por motivos
 * diferentes. Num `Suspense` só, o diagnóstico sumiria da tela sempre que a
 * consulta das filas tropeçasse — e é justamente no dia ruim que o supervisor
 * serve para alguma coisa. Cada um carrega, esvazia e falha por conta própria.
 */

import { Suspense } from "react";
import { PainelClient } from "./PainelClient";
import { SupervisorClient } from "./SupervisorClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel · Sala de Vendas" };

export default function PainelDaSalaPage() {
  return (
    <div className="min-h-full bg-canvas">
      <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
        <PainelClient />
      </Suspense>

      <div className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Suspense
            fallback={<div className="text-[13px] text-muted">Carregando o supervisor…</div>}
          >
            <SupervisorClient />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
