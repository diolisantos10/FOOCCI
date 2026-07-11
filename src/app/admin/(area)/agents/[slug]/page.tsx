/**
 * Admin → Agentes → [slug] — a FICHA TÉCNICA do agente (Prompt Room).
 *
 * A ficha de funcionário interna (master-only) de cada agente de IA: identidade,
 * funções, pode/não-pode, regras, domínio e escalação — editáveis — mais o
 * seletor de IA-piloto (governado pelo Brain). Comportamento/tom NÃO mora aqui:
 * é configuração do restaurante. Abaixo da ficha, a visão completa read-only
 * (AgentDashboard) continua disponível como referência.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminAgentProfile } from "@/services/agents/AgentProfileService";
import { AgentDashboard, AgentStatusRow } from "../_components";
import { TechSheet } from "./TechSheet";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AgentDetailPage({ params }: PageProps) {
  const { slug } = await params;

  let agent;
  try {
    agent = await getAdminAgentProfile(slug);
  } catch {
    return (
      <div className="min-h-full bg-white px-8 py-6">
        <p className="text-sm text-red-600">
          Não foi possível carregar este agente. Tente novamente.
        </p>
      </div>
    );
  }

  if (!agent) notFound();

  return (
    <div className="min-h-full space-y-6 bg-white px-8 py-6 text-gray-900">
      <Link
        href={`/admin/agents#${agent.slug}`}
        className="text-sm font-medium text-orange-600 hover:underline"
      >
        ← Voltar para Agentes de IA
      </Link>

      {/* Cabeçalho da ficha */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">
          Ficha Técnica — {agent.name}
        </h1>
        {agent.title && <p className="text-base text-gray-600">{agent.title}</p>}
        <AgentStatusRow agent={agent} />
      </header>

      {/* Ficha editável + IA-piloto */}
      <TechSheet agent={agent} />

      {/* Referência completa read-only (dashboard existente) */}
      <details className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">
          Visão completa (read-only) — dossiê do agente
        </summary>
        <div className="mt-4 rounded-xl bg-white p-4">
          <AgentDashboard agent={agent} />
        </div>
      </details>
    </div>
  );
}
