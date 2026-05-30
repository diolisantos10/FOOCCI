/**
 * Admin → Agentes → [slug] — single-agent deep link (Phase 2, READ-ONLY).
 *
 * Keeps a stable, shareable URL per agent. Renders the same shared AgentDashboard
 * used by the dashboard tabs, so there is a single source of truth for the agent
 * view. Internal-only sections (forbidden actions, safety rules, prompt
 * instructions) are shown here — this area is master-only, never exposed to
 * restaurant users. Strictly read-only: no edit controls.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminAgentProfile } from "@/services/agents/AgentProfileService";
import { AgentDashboard } from "../_components";

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
      <AgentDashboard agent={agent} />
    </div>
  );
}
