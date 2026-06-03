"use client";

/**
 * Admin → Build OS dashboard (Priority 1.2, READ-ONLY).
 *
 * Pill/tab shell: Comandos · Projetos · Configuração. All data is passed from
 * the server page (no client fetching, no public API). No editing, no sending,
 * no confirmation actions — pure visualization.
 */

import { useState } from "react";
import type { AdminBuildCommandView } from "@/services/buildos/types";
import type { BuildProjectView } from "@/services/buildos/BuildProjectService";
import { BuildOsConfigPanel } from "./BuildOsConfigPanel";
import { BuildOsDiagnosticsPanel } from "./BuildOsDiagnosticsPanel";

interface Props {
  commands: AdminBuildCommandView[];
  projects: BuildProjectView[];
  loadError: boolean;
}

type Tab = "comandos" | "projetos" | "configuracao" | "diagnostico";

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: "bg-blue-50 text-blue-700",
  AWAITING_CONFIRMATION: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  FAILED: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

const RISK_STYLES: Record<string, string> = {
  LOW: "bg-green-50 text-green-700",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-orange-50 text-orange-700",
  CRITICAL: "bg-red-50 text-red-700",
  UNKNOWN: "bg-gray-100 text-gray-500",
};

function RiskBadge({ risk }: { risk: string }) {
  const cls = RISK_STYLES[risk] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {risk}
    </span>
  );
}

const INTENT_STYLES: Record<string, string> = {
  AUDIT_ONLY: "bg-blue-50 text-blue-700",
  IMPLEMENT: "bg-purple-50 text-purple-700",
  FIX: "bg-orange-50 text-orange-700",
  REVIEW: "bg-cyan-50 text-cyan-700",
  EXPLAIN: "bg-gray-100 text-gray-600",
  UNKNOWN: "bg-gray-100 text-gray-500",
};

function IntentBadge({ intent }: { intent: string }) {
  const cls = INTENT_STYLES[intent] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {intent}
    </span>
  );
}

function TaskBadge({ task }: { task: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      {task}
    </span>
  );
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 3)}•••${phone.slice(-4)}`;
}

export function BuildOsDashboard({
  commands,
  projects,
  loadError,
}: Props) {
  const [tab, setTab] = useState<Tab>("comandos");

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "comandos", label: "Comandos", count: commands.length },
    { key: "projetos", label: "Projetos", count: projects.length },
    { key: "configuracao", label: "Configuração" },
    { key: "diagnostico", label: "Diagnóstico" },
  ];

  return (
    <div className="min-h-full space-y-6 bg-white px-8 py-6 text-gray-900">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Build OS · Prompt Relay</h1>
        <p className="text-sm text-gray-500">
          Central interna de comandos e projetos. Somente leitura.
        </p>
      </header>

      {/* Pills */}
      <nav className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t.label}
              {typeof t.count === "number" && (
                <span className={`ml-1.5 ${active ? "text-orange-100" : "text-gray-400"}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === "comandos" && (
        <CommandsTab commands={commands} loadError={loadError} />
      )}
      {tab === "projetos" && <ProjectsTab projects={projects} />}
      {tab === "configuracao" && <ConfigTab />}
      {tab === "diagnostico" && <BuildOsDiagnosticsPanel />}
    </div>
  );
}

// ── Comandos ────────────────────────────────────────────────────────────────────

function CommandsTab({
  commands,
  loadError,
}: {
  commands: AdminBuildCommandView[];
  loadError: boolean;
}) {
  if (loadError) {
    return <p className="text-sm text-red-600">Não foi possível carregar os comandos.</p>;
  }
  if (commands.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <p className="text-sm text-gray-500">Nenhum comando recebido ainda.</p>
        <p className="mt-1 text-xs text-gray-400">
          Comandos chegam quando um operador autorizado envia <code>/build</code>,{" "}
          <code>/cmd</code> ou <code>/prompt</code> no WhatsApp.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {commands.map((c) => (
        <CommandCard key={c.id} c={c} />
      ))}
    </div>
  );
}

function CommandCard({ c }: { c: AdminBuildCommandView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-gray-500">#{c.shortId}</span>
            <StatusBadge status={c.status} />
            {c.latestPromptVersion !== null && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                prompt v{c.latestPromptVersion}
              </span>
            )}
          </div>
          <p className="text-gray-900">
            <span className="mr-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
              {c.commandPrefix}
            </span>
            {c.commandText || <span className="text-gray-400">(vazio)</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <RiskBadge risk={c.riskLevel} />
            <TaskBadge task={c.taskType} />
            <IntentBadge intent={c.executionIntent} />
            {c.targetArea && c.targetArea !== "unknown" && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {c.targetArea}
              </span>
            )}
            {c.requiresHumanConfirmation && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                ⚠ confirmar
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            {c.senderName ?? "—"} · {maskPhone(c.senderPhone)} ·{" "}
            {c.projectName ?? "projeto não resolvido"} ·{" "}
            {new Date(c.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
        {c.latestPromptText && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {open ? "Ocultar prompt" : "Ver prompt"}
          </button>
        )}
      </div>

      {open && c.latestPromptText && (
        <div className="mt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Prompt v{c.latestPromptVersion} (somente leitura · gerado por TEMPLATE, sem IA · não enviado a Claude/GitHub)
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-xs leading-relaxed text-gray-800">
            {c.latestPromptText}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Projetos ────────────────────────────────────────────────────────────────────

function ProjectsTab({ projects }: { projects: BuildProjectView[] }) {
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <p className="text-sm text-gray-500">Nenhum projeto cadastrado.</p>
        <p className="mt-1 text-xs text-gray-400">
          Rode <code>npm run db:seed:build-projects</code> para semear o projeto Foocci.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {projects.map((p) => (
        <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                {p.isDefault && (
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-orange-700">
                    Default
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${p.isActive ? "bg-green-500" : "bg-gray-400"}`} />
                  {p.isActive ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="font-mono text-xs text-gray-400">{p.slug}</p>
            </div>
          </div>

          {p.description && <p className="mb-3 text-sm text-gray-600">{p.description}</p>}

          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Meta label="GitHub" value={p.githubOwner && p.githubRepo ? `${p.githubOwner}/${p.githubRepo}` : "— a configurar —"} />
            <Meta label="Branch" value={p.defaultBranch} />
            <Meta label="Categoria" value={p.category ?? "—"} />
            <Meta label="Ordem" value={String(p.displayOrder)} />
          </dl>

          {p.projectRules.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Regras do projeto
              </p>
              <ul className="space-y-1">
                {p.projectRules.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-700">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.riskNotes && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠️ {p.riskNotes}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-800">{value}</dd>
    </div>
  );
}

// ── Configuração ────────────────────────────────────────────────────────────────

function ConfigTab() {
  // Interactive panel: enable/disable + authorized operators (DB-driven).
  return <BuildOsConfigPanel />;
}
