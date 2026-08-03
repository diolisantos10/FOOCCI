/**
 * Admin → Agentes → CRM — a CASA do Agente de CRM.
 *
 * Um lugar só que responde, à primeira olhada: em que degrau ele está, o que
 * ele está fazendo, o que a prova A/B diz, os controles governados (promover
 * com confirmação digitada / botão de pânico) e o que falta para o próximo
 * degrau. Unifica o que morava espalhado em /admin/crm-agente (que hoje
 * redireciona para cá) e dá teto à observabilidade do piloto
 * (CrmPilotObservability + crmAgentGovernance).
 *
 * O centro de testes determinístico continua em /admin/agentes/crm/testes.
 */

import Link from "next/link";
import { CrmAgentHousePanel } from "./CrmAgentHousePanel";

export const dynamic = "force-dynamic";

export default function AdminCrmAgentHousePage() {
  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Agente de CRM</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink2">
              A escada governada do agente: sombra → allowlist (time) → restaurante inteiro. Promover roda os
              portões no servidor — a escada não pula degrau, e nada aqui envia mensagem por conta própria.
            </p>
          </div>
          <Link
            href="/admin/agentes/crm/testes"
            className="text-[13.5px] font-semibold text-brand-600 hover:text-brand-700"
          >
            Centro de testes →
          </Link>
        </header>
        <CrmAgentHousePanel />
      </div>
    </div>
  );
}
