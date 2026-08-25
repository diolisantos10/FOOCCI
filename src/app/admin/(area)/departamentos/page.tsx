/**
 * Admin → Departamentos e Agentes.
 *
 * A planta oficial da Foocci (v3): 6 departamentos, o Agente Gerente de cada um
 * em destaque, e os agentes subordinados com o tipo — IA, pessoa ou híbrido.
 *
 * Item PRÓPRIO no menu, não dentro de Configurações: a pergunta "quem responde
 * por quê?" é de primeira ordem.
 */

import { Suspense } from "react";
import { DepartamentosClient } from "./DepartamentosClient";

export const dynamic = "force-dynamic";

export default function DepartamentosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl text-[13px] text-muted">Carregando…</div>
        </div>
      }
    >
      <DepartamentosClient />
    </Suspense>
  );
}
