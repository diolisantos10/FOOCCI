"use client";

/**
 * Admin → Agentes — dashboard client (Phase 2, READ-ONLY).
 *
 * Renders a pill/tab navigation: a "Geral" overview hub plus one tab per agent.
 * All data is passed in from the server page (no client fetching, no public API).
 *
 * Strictly read-only: no edit/save/forms/toggles. The active tab is reflected in
 * the URL hash (#waiter, #geral, …) so tabs are deep-linkable and back/forward
 * works, without any navigation that could mutate state.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminAgentProfileView } from "@/services/agents/types";
import {
  AGENT_TAB_ORDER,
  AgentBridges,
  AgentDashboard,
  AreaBadge,
  GROUP_META,
  GroupBadge,
  MaturityBadge,
  agentGroupOf,
} from "./_components";

interface Props {
  agents: AdminAgentProfileView[];
  /** true when at least one agent was sourced from the DB (vs the code registry). */
  dbOrigin: boolean;
  /** Optional initial tab key (e.g. deep-linked from /admin/agents/[slug]). */
  initialTab?: string;
}

export function AgentsDashboard({ agents, dbOrigin, initialTab }: Props) {
  const bySlug = new Map(agents.map((a) => [a.slug, a]));

  // Only show pills for agents that actually exist in the registry, in canonical order.
  const tabs = AGENT_TAB_ORDER.filter((t) => t.key === "geral" || bySlug.has(t.key));

  const validKeys = new Set(tabs.map((t) => t.key));
  const [active, setActive] = useState<string>(
    initialTab && validKeys.has(initialTab) ? initialTab : "geral",
  );

  // Sync active tab with the URL hash for deep-linking + back/forward.
  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "");
    if (fromHash && validKeys.has(fromHash)) setActive(fromHash);

    const onHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h && validKeys.has(h)) setActive(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTab(key: string) {
    setActive(key);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", key === "geral" ? "#geral" : `#${key}`);
    }
  }

  const activeAgent = active !== "geral" ? bySlug.get(active) : undefined;

  return (
    <div className="min-h-full space-y-6 bg-white px-8 py-6 text-gray-900">
      {/* Title */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Agentes de IA</h1>
        <p className="text-sm text-gray-500">
          Central interna para visualizar escopo, missão, regras e governança dos agentes.
        </p>
      </header>

      {/* Discreet wayfinding: this is NOT the Build OS / Prompt Relay screen. */}
      <a
        href="/admin/build-os"
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 hover:border-orange-300 hover:text-orange-700"
      >
        🛠️ Procurando o Prompt Relay / diagnóstico do WhatsApp? Acesse <strong>Build OS</strong> →
      </a>

      {/* Pill / tab navigation */}
      <nav className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {active === "geral" ? (
        <GeralOverview agents={agents} dbOrigin={dbOrigin} onOpen={selectTab} />
      ) : activeAgent ? (
        <AgentDashboard agent={activeAgent} />
      ) : (
        <p className="text-sm text-gray-400">Agente não encontrado.</p>
      )}
    </div>
  );
}

// ── "Geral" overview hub ────────────────────────────────────────────────────────

function GeralOverview({
  agents,
  dbOrigin,
  onOpen,
}: {
  agents: AdminAgentProfileView[];
  dbOrigin: boolean;
  onOpen: (key: string) => void;
}) {
  const total = agents.length;
  const product = agents.filter((a) => agentGroupOf(a.area) === "product");
  const buildos = agents.filter((a) => agentGroupOf(a.area) === "buildos");
  const activeCount = agents.filter((a) => a.status === "ACTIVE").length;
  const plannedCount = agents.filter((a) => a.status === "DRAFT").length;

  return (
    <div className="space-y-6">
      {/* KPI row — honest counts; no misleading "Runtime ON=0" */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Kpi label="Agentes" value={total} />
        <Kpi label="Produto / Runtime" value={product.length} accent="blue" />
        <Kpi label="Build OS / Admin" value={buildos.length} accent="violet" />
        <Kpi label="Ativos" value={activeCount} accent="green" />
        <Kpi label="Rascunho / Planejados" value={plannedCount} accent="amber" />
      </div>

      {/* Read-only / runtime notice */}
      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p>
          Este é o <strong>centro de comando interno dos agentes de IA</strong>.{" "}
          <strong>Esta página é read-only nesta fase. Alterações de comportamento/runtime virão em fase posterior.</strong>{" "}
          As <em>regras de segurança</em> e <em>ações proibidas</em> são visíveis apenas aqui (master) e nunca expostas a
          usuários do restaurante.
        </p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-500">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> Runtime DB: desligado / Fase 1
          </span>
          {dbOrigin ? "Origem dos dados: banco." : "Origem dos dados: registro de código."}
        </p>
      </div>

      {/* Grouped sections */}
      <AgentGroupSection
        group="product"
        agents={product}
        onOpen={onOpen}
      />
      <AgentGroupSection
        group="buildos"
        agents={buildos}
        onOpen={onOpen}
      />

      {/* Deep-link hint (read-only) */}
      <p className="text-xs text-gray-400">
        Dica: cada agente também tem um link direto em{" "}
        <Link href="/admin/agents/waiter" className="text-orange-600 hover:underline">
          /admin/agents/&lt;slug&gt;
        </Link>
        .
      </p>
    </div>
  );
}

// ── Grouped section: Produto/Runtime vs Build OS/Admin ──────────────────────────

function AgentGroupSection({
  group,
  agents,
  onOpen,
}: {
  group: "product" | "buildos";
  agents: AdminAgentProfileView[];
  onOpen: (key: string) => void;
}) {
  const meta = GROUP_META[group];
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${meta.cls}`}>
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        <span className="text-xs text-gray-500">{meta.blurb}</span>
      </div>
      {agents.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhum agente neste grupo.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.slug}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-orange-300 hover:shadow-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <button type="button" onClick={() => onOpen(agent.slug)} className="min-w-0 text-left">
                  <h3 className="truncate font-semibold text-gray-900 hover:underline">{agent.name}</h3>
                  {agent.title && <p className="truncate text-xs text-gray-500">{agent.title}</p>}
                </button>
                <MaturityBadge agent={agent} />
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <GroupBadge area={agent.area} />
                <AreaBadge area={agent.area} />
              </div>
              <p className="mb-3 line-clamp-2 flex-1 text-sm text-gray-600">
                {agent.mission || agent.description || "Perfil planejado — conteúdo será preenchido em fase futura."}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(agent.slug)}
                  className="text-xs font-medium text-orange-600 hover:underline"
                >
                  Abrir painel →
                </button>
                <AgentBridges agent={agent} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}


// ── Small presentational helpers (client-local) ─────────────────────────────────

function Kpi({
  label,
  value,
  accent = "gray",
}: {
  label: string;
  value: number;
  accent?: "gray" | "green" | "amber" | "orange" | "blue" | "violet";
}) {
  const accentCls = {
    gray: "text-gray-900",
    green: "text-green-700",
    amber: "text-amber-700",
    orange: "text-orange-600",
    blue: "text-blue-700",
    violet: "text-violet-700",
  }[accent];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className={`text-3xl font-bold ${accentCls}`}>{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  );
}
