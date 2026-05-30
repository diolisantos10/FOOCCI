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
  AgentDashboard,
  AreaBadge,
  RuntimeBadge,
  StatusBadge,
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
  const activeCount = agents.filter((a) => a.status === "ACTIVE").length;
  const draftCount = agents.filter((a) => a.status === "DRAFT").length;
  const runtimeCount = agents.filter((a) => a.isRuntimeEnabled).length;

  const waiter = agents.find((a) => a.slug === "waiter");
  const security = agents.find((a) => a.slug === "security-governance");
  const orchestrator = agents.find((a) => a.slug === "orchestrator");

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Agentes" value={total} />
        <Kpi label="Ativos" value={activeCount} accent="green" />
        <Kpi label="Rascunhos" value={draftCount} accent="amber" />
        <Kpi label="Runtime ON" value={runtimeCount} accent="orange" />
      </div>

      {/* Read-only / safety notice */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        Este é o <strong>centro de comando interno dos agentes de IA</strong>. Nesta fase a área é{" "}
        <strong>somente visualização</strong>: nada aqui altera prompts, regras de segurança ou o
        comportamento em produção. As <em>regras de segurança</em> e <em>ações proibidas</em> são
        visíveis apenas aqui (master) e nunca expostas a usuários do restaurante.{" "}
        {dbOrigin ? "Origem dos dados: banco." : "Origem dos dados: registro de código (runtime DB desligado)."}
      </div>

      {/* Highlight cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {waiter && (
          <HighlightCard
            tone="orange"
            kicker="Prioridade · Ativo"
            title={waiter.name}
            subtitle={waiter.title ?? "Garçom digital e especialista em vendas"}
            text="Único agente com perfil profissional completo. Vende como um garçom, lê o cardápio real e conduz o pedido."
            onClick={() => onOpen("waiter")}
          />
        )}
        {security && (
          <HighlightCard
            tone="red"
            kicker="Governança mandatória (futuro)"
            title={security.name}
            subtitle="Guardião de Segurança e Governança"
            text="Camada futura obrigatória antes de qualquer automação de execução: veto, risco, segredos, permissões e portões de aprovação."
            onClick={() => onOpen("security-governance")}
          />
        )}
        {orchestrator && (
          <HighlightCard
            tone="gray"
            kicker="Roteamento (futuro)"
            title={orchestrator.name}
            subtitle="Camada de orquestração"
            text="Coordenará os demais agentes, roteando conversas e arbitrando prioridades entre eles."
            onClick={() => onOpen("orchestrator")}
          />
        )}
      </div>

      {/* Compact list of all agents */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-900">
          Todos os agentes
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <button
              key={agent.slug}
              type="button"
              onClick={() => onOpen(agent.slug)}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-orange-300 hover:shadow-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-gray-900">{agent.name}</h3>
                  {agent.title && <p className="truncate text-xs text-gray-500">{agent.title}</p>}
                </div>
                <StatusBadge status={agent.status} />
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <AreaBadge area={agent.area} />
                <RuntimeBadge enabled={agent.isRuntimeEnabled} />
              </div>
              <p className="mb-3 line-clamp-2 flex-1 text-sm text-gray-600">
                {agent.mission || agent.description || "Sem descrição definida."}
              </p>
              <span className="text-xs font-medium text-orange-600 group-hover:underline">
                Abrir painel →
              </span>
            </button>
          ))}
        </div>
      </div>

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

// ── Small presentational helpers (client-local) ─────────────────────────────────

function Kpi({
  label,
  value,
  accent = "gray",
}: {
  label: string;
  value: number;
  accent?: "gray" | "green" | "amber" | "orange";
}) {
  const accentCls = {
    gray: "text-gray-900",
    green: "text-green-700",
    amber: "text-amber-700",
    orange: "text-orange-600",
  }[accent];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className={`text-3xl font-bold ${accentCls}`}>{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  );
}

function HighlightCard({
  tone,
  kicker,
  title,
  subtitle,
  text,
  onClick,
}: {
  tone: "orange" | "red" | "gray";
  kicker: string;
  title: string;
  subtitle: string;
  text: string;
  onClick: () => void;
}) {
  const toneCls = {
    orange: "border-orange-200 bg-orange-50",
    red: "border-red-200 bg-red-50",
    gray: "border-gray-200 bg-gray-50",
  }[tone];
  const kickerCls = {
    orange: "text-orange-700",
    red: "text-red-700",
    gray: "text-gray-500",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col rounded-xl border p-4 text-left transition-shadow hover:shadow-sm ${toneCls}`}
    >
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${kickerCls}`}>
        {kicker}
      </span>
      <h3 className="mt-1 font-bold text-gray-900">{title}</h3>
      <p className="text-xs text-gray-600">{subtitle}</p>
      <p className="mt-2 flex-1 text-sm text-gray-700">{text}</p>
      <span className="mt-3 text-xs font-medium text-orange-600">Abrir painel →</span>
    </button>
  );
}
