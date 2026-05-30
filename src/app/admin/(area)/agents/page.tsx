/**
 * Admin → AI Agents — overview (Phase 2, READ-ONLY).
 *
 * Lists every agent profile (Waiter rich + DRAFT placeholders) as compact cards.
 * Server-rendered inside the admin-protected (area) layout, so no public API and
 * no client data fetching are needed. Sourced via AgentProfileService, which
 * falls back to the code registry when the DB flag is OFF or the DB is down.
 *
 * Strictly read-only: no create/edit/delete affordances in this phase.
 */

import Link from "next/link";
import { getAdminAgentProfiles } from "@/services/agents/AgentProfileService";
import {
  AreaBadge,
  RuntimeBadge,
  StatusBadge,
  VisibilityBadge,
} from "./_components";

export const dynamic = "force-dynamic";

export default async function AdminAgentsPage() {
  let agents;
  try {
    agents = await getAdminAgentProfiles();
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

  return (
    <div className="min-h-full space-y-6 bg-white px-8 py-6 text-gray-900">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">AI Agents</h1>
        <p className="text-sm text-gray-500">
          {agents.length} agentes no quadro · somente leitura ·{" "}
          {dbOrigin ? "origem: banco de dados" : "origem: registro de código (runtime DB desligado)"}
        </p>
      </header>

      {/* Read-only / safety notice — internal/master tone */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p>
          Este é o <strong>quadro interno de agentes de IA</strong>. Nesta fase a área é{" "}
          <strong>somente visualização</strong>: nada aqui altera prompts, regras de segurança ou o
          comportamento em produção. As <em>regras de segurança</em> e <em>ações proibidas</em> são
          visíveis apenas aqui (master) e nunca são expostas a usuários do restaurante.
        </p>
      </div>

      {agents.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhum agente cadastrado ainda.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Link
              key={agent.slug}
              href={`/admin/agents/${agent.slug}`}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-orange-300 hover:shadow-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-gray-900">{agent.name}</h2>
                  {agent.title && (
                    <p className="truncate text-xs text-gray-500">{agent.title}</p>
                  )}
                </div>
                <StatusBadge status={agent.status} />
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                <AreaBadge area={agent.area} />
                <VisibilityBadge visibility={agent.visibility} />
                <RuntimeBadge enabled={agent.isRuntimeEnabled} />
              </div>

              <p className="mb-4 line-clamp-3 flex-1 text-sm text-gray-600">
                {agent.mission || agent.description || "Sem descrição definida."}
              </p>

              <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
                <span>v{agent.version}</span>
                <span className="font-medium text-orange-600 group-hover:underline">
                  Ver detalhes →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
