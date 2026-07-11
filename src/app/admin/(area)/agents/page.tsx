/**
 * Admin → Agentes — dashboard entry (Phase 2, READ-ONLY).
 *
 * Server component: loads every agent profile via AgentProfileService (which
 * falls back to the code registry when the DB flag is OFF or the DB is down) and
 * hands them to the client dashboard. No public API, no client fetching, no
 * mutations. Strictly read-only.
 */

import { getAdminAgentProfiles } from "@/services/agents/AgentProfileService";
import { stripToneForFicha } from "@/services/agents/fichaVisibility";
import { AgentsDashboard } from "./AgentsDashboard";

export const dynamic = "force-dynamic";

export default async function AdminAgentsPage() {
  let agents;
  try {
    agents = (await getAdminAgentProfiles()).map(stripToneForFicha);
  } catch {
    return (
      <div className="min-h-full bg-white px-8 py-6">
        <p className="text-sm text-red-600">
          Não foi possível carregar os perfis de agentes. Tente novamente.
        </p>
      </div>
    );
  }

  const dbOrigin = agents.some((a) => a.origin === "db");

  return <AgentsDashboard agents={agents} dbOrigin={dbOrigin} />;
}
