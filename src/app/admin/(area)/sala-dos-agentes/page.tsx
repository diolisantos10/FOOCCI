/**
 * Admin → Sala dos Agentes.
 *
 * Item PRÓPRIO no menu do admin, não dentro de Configurações — ordem explícita
 * do CEO, registrada na doutrina 20 do kit: a pergunta "quem trabalha aqui?" é
 * de primeira ordem.
 *
 * A aba vive na URL (`?aba=configuracoes`) e não em estado local: assim o
 * voltar do navegador funciona e a aba de custo pode ser mandada por link.
 */

import { Suspense } from "react";
import { SalaDosAgentesClient, type Aba } from "./SalaDosAgentesClient";
import { Carregando } from "./_ui";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { aba?: string };
}

export default function SalaDosAgentesPage({ searchParams }: PageProps) {
  const aba: Aba = searchParams.aba === "configuracoes" ? "configuracoes" : "agentes";

  return (
    <Suspense
      fallback={
        <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Carregando />
          </div>
        </div>
      }
    >
      <SalaDosAgentesClient aba={aba} />
    </Suspense>
  );
}
