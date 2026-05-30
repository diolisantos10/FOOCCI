/**
 * Presentational helpers for the internal Admin → AI Agents area (read-only).
 *
 * Pure render functions (no client hooks) so they run in server components.
 * Design tokens: white background, black text, orange ONLY for primary actions,
 * compact cards, clear status badges. No editing affordances in Phase 2.
 */

import type { AgentArea, AgentStatus, AgentVisibility } from "@/services/agents/types";

// ── Label maps (internal/master tone, plain Portuguese) ─────────────────────────

export const AREA_LABELS: Record<AgentArea, string> = {
  ORCHESTRATOR: "Orquestrador",
  SECURITY: "Segurança & Governança",
  WAITER: "Atendimento / Vendas",
  WHATSAPP: "WhatsApp",
  CRM: "CRM",
  UI_UX: "UI/UX",
  MANUAL: "Manual / Constituição",
  QA: "QA / Testes",
  INTEGRATION: "Integrações",
  BRANDING: "Marca",
  ANALYTICS: "Analytics / Produto",
  GENERAL: "Geral",
};

const STATUS_STYLES: Record<AgentStatus, { label: string; cls: string; dot: string }> = {
  ACTIVE: { label: "Ativo", cls: "bg-green-50 text-green-700", dot: "bg-green-500" },
  DRAFT: { label: "Rascunho", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  ARCHIVED: { label: "Arquivado", cls: "bg-gray-100 text-gray-500", dot: "bg-gray-400" },
};

const VISIBILITY_STYLES: Record<AgentVisibility, { label: string; cls: string }> = {
  INTERNAL: { label: "Interno", cls: "bg-gray-100 text-gray-600" },
  RESTAURANT: { label: "Restaurante", cls: "bg-blue-50 text-blue-700" },
  PUBLIC: { label: "Público", cls: "bg-purple-50 text-purple-700" },
};

// ── Badges ──────────────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: AgentStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function VisibilityBadge({ visibility }: { visibility: AgentVisibility }) {
  const v = VISIBILITY_STYLES[visibility];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

export function RuntimeBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        enabled ? "bg-orange-50 text-orange-700" : "bg-gray-100 text-gray-500"
      }`}
      title={
        enabled
          ? "Este perfil pode influenciar o runtime (quando habilitado globalmente)."
          : "Runtime desligado — este perfil é apenas dado/visualização (Fase 2)."
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-orange-500" : "bg-gray-400"}`} />
      Runtime {enabled ? "ON" : "OFF"}
    </span>
  );
}

export function AreaBadge({ area }: { area: AgentArea }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      {AREA_LABELS[area]}
    </span>
  );
}

// ── Detail section renderers ─────────────────────────────────────────────────────

/** A titled block wrapper used across the detail view. */
export function Section({
  title,
  children,
  internal = false,
}: {
  title: string;
  children: React.ReactNode;
  internal?: boolean;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">{title}</h2>
        {internal && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-600">
            Interno · master-only
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/** Render a string[] as a clean bullet list, or an empty-state line. */
export function BulletList({ items }: { items: string[] }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-400">— sem itens definidos —</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-gray-800">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Render a single text paragraph or an empty-state line. */
export function TextBlock({ text }: { text?: string }) {
  if (!text || !text.trim()) {
    return <p className="text-sm text-gray-400">— não definido —</p>;
  }
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{text}</p>;
}

/** Render a monospace, read-only block (for prompt instructions). */
export function CodeBlock({ text }: { text?: string }) {
  if (!text || !text.trim()) {
    return <p className="text-sm text-gray-400">— não definido —</p>;
  }
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-xs leading-relaxed text-gray-800">
      {text}
    </pre>
  );
}
