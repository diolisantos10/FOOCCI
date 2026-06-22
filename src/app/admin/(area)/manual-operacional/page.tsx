"use client";

/**
 * /admin/manual-operacional
 *
 * Internal Foocci Operational Manual — Phase 1 UI.
 *
 * What this is:
 *   The "Bíblia do Foocci". Single internal source of truth for product rules,
 *   AI agent behaviour, flows, integrations, UI rules, CRM rules, WhatsApp rules,
 *   checkout rules, and operational decisions.
 *
 * What this is NOT (yet):
 *   - NOT connected to AI agents (Phase 2+)
 *   - NOT using RAG/embeddings (Phase 2+)
 *   - NOT visible to restaurant users — ever
 *
 * Approval gate:
 *   Change requests MUST be approved before any chapter is published.
 *   Nothing becomes official without internal admin review.
 */

import { useState, useEffect, useCallback, FormEvent } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type ManualArea =
  | "GENERAL" | "WAITER_AGENT" | "CRM" | "WHATSAPP" | "UI_UX"
  | "BRANDING" | "INTEGRATIONS" | "CHECKOUT" | "PAYMENTS"
  | "ANALYTICS" | "SECURITY" | "BACKLOG";

type ManualRuleStatus = "IMPLEMENTED" | "PARTIAL" | "DECIDED" | "BACKLOG";
type ManualChangeStatus = "PENDING" | "APPROVED" | "REJECTED";
type ManualSourceType =
  | "CHATGPT" | "CLAUDE_AUDIT" | "CODE_AUDIT" | "MANUAL"
  | "DEPLOY" | "BUGFIX" | "PRODUCT_DECISION";

interface Chapter {
  id: string; slug: string; title: string; area: ManualArea;
  description: string | null; status: ManualRuleStatus; version: string;
  isPublished: boolean; agentVisibility: boolean;
  createdAt: string; updatedAt: string; publishedAt: string | null;
  createdBy: string | null; updatedBy: string | null; approvedBy: string | null;
  _count?: { revisions: number; changeRequests: number };
}

interface ChapterDetail extends Chapter {
  content: string;
  revisions: Revision[];
  changeRequests: ChangeRequest[];
}

interface Revision {
  id: string; version: string; changeSummary: string | null;
  sourceType: ManualSourceType; createdAt: string; createdBy: string | null;
}

interface ChangeRequest {
  id: string; chapterId: string | null; title: string;
  proposedContent: string; reason: string; impactAreas: string | null;
  status: ManualChangeStatus; sourceType: ManualSourceType;
  createdAt: string; reviewedAt: string | null;
  createdBy: string | null; reviewedBy: string | null;
  chapter?: { id: string; slug: string; title: string } | null;
}

interface Decision {
  id: string; title: string; description: string; area: ManualArea;
  status: ManualRuleStatus; sourceType: ManualSourceType;
  sourceReference: string | null; createdAt: string; createdBy: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AREAS: { value: ManualArea | ""; label: string }[] = [
  { value: "",            label: "Todas as áreas"  },
  { value: "GENERAL",     label: "Geral"            },
  { value: "WAITER_AGENT",label: "Waiter Agent"     },
  { value: "CRM",         label: "CRM"              },
  { value: "WHATSAPP",    label: "WhatsApp"         },
  { value: "UI_UX",       label: "UI/UX"            },
  { value: "BRANDING",    label: "Branding"         },
  { value: "INTEGRATIONS",label: "Integrações"      },
  { value: "CHECKOUT",    label: "Checkout"         },
  { value: "PAYMENTS",    label: "Pagamentos"       },
  { value: "ANALYTICS",   label: "Analytics"        },
  { value: "SECURITY",    label: "Segurança"        },
  { value: "BACKLOG",     label: "Backlog"          },
];

const STATUS_LABELS: Record<ManualRuleStatus, string> = {
  IMPLEMENTED: "Implementado",
  PARTIAL:     "Parcial",
  DECIDED:     "Decidido",
  BACKLOG:     "Backlog",
};

const STATUS_COLORS: Record<ManualRuleStatus, string> = {
  IMPLEMENTED: "bg-green-100 text-green-800 ring-green-200",
  PARTIAL:     "bg-yellow-100 text-yellow-800 ring-yellow-200",
  DECIDED:     "bg-blue-100 text-blue-800 ring-blue-200",
  BACKLOG:     "bg-gray-100 text-gray-600 ring-gray-200",
};

const CHANGE_STATUS_COLORS: Record<ManualChangeStatus, string> = {
  PENDING:  "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const SOURCE_LABELS: Record<ManualSourceType, string> = {
  CHATGPT:         "ChatGPT",
  CLAUDE_AUDIT:    "Auditoria Claude",
  CODE_AUDIT:      "Auditoria Código",
  MANUAL:          "Manual",
  DEPLOY:          "Deploy",
  BUGFIX:          "Bugfix",
  PRODUCT_DECISION:"Decisão de produto",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function areaLabel(a: ManualArea) {
  return AREAS.find(x => x.value === a)?.label ?? a;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ManualRuleStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function PublishedBadge({ isPublished }: { isPublished: boolean }) {
  return isPublished
    ? <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 ring-1 ring-inset ring-green-200">Publicado</span>
    : <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 ring-1 ring-inset ring-gray-200">Rascunho</span>;
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-orange-500" />
  );
}

// ── New Chapter Modal ─────────────────────────────────────────────────────────

function NewChapterModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: "", slug: "", area: "GENERAL" as ManualArea,
    description: "", status: "BACKLOG" as ManualRuleStatus,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function autoSlug(title: string) {
    return title.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/admin/manual/chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, content: "" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Erro ao criar capítulo.");
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-bold text-gray-900">Novo capítulo</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Título *</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              value={form.title} required
              onChange={e => setForm(f => ({ ...f, title: e.target.value, slug: autoSlug(e.target.value) }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Slug *</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              value={form.slug} required pattern="[a-z0-9-]+"
              onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
            />
            <p className="mt-1 text-[11px] text-gray-400">Apenas letras minúsculas, números e hífens.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Área</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none"
                value={form.area}
                onChange={e => setForm(f => ({ ...f, area: e.target.value as ManualArea }))}
              >
                {AREAS.filter(a => a.value).map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as ManualRuleStatus }))}
              >
                {(Object.keys(STATUS_LABELS) as ManualRuleStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Descrição</label>
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              rows={2} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button
              type="submit" disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {saving && <Spinner />} Criar capítulo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── New Change Request Modal ──────────────────────────────────────────────────

function NewChangeRequestModal({
  chapters, onClose, onCreated,
}: { chapters: Chapter[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    chapterId: "" as string,
    title: "", reason: "", proposedContent: "", impactAreas: "",
    sourceType: "MANUAL" as ManualSourceType,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/admin/manual/change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          chapterId: form.chapterId || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Erro ao criar solicitação.");
      }
      onCreated(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-bold text-gray-900">Nova solicitação de atualização</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Capítulo (opcional)</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none"
                value={form.chapterId}
                onChange={e => setForm(f => ({ ...f, chapterId: e.target.value }))}
              >
                <option value="">— Geral / sem capítulo —</option>
                {chapters.map(ch => (
                  <option key={ch.id} value={ch.id}>{ch.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Origem</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none"
                value={form.sourceType}
                onChange={e => setForm(f => ({ ...f, sourceType: e.target.value as ManualSourceType }))}
              >
                {(Object.keys(SOURCE_LABELS) as ManualSourceType[]).map(s => (
                  <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Título da solicitação *</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              value={form.title} required
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Motivo *</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              value={form.reason} required
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Por que essa mudança é necessária?"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Conteúdo proposto *</label>
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              rows={6} required value={form.proposedContent}
              onChange={e => setForm(f => ({ ...f, proposedContent: e.target.value }))}
              placeholder="Cole aqui o conteúdo completo proposto (Markdown)."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Áreas de impacto</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none"
              value={form.impactAreas}
              onChange={e => setForm(f => ({ ...f, impactAreas: e.target.value }))}
              placeholder="ex: checkout, whatsapp, agente"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button
              type="submit" disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {saving && <Spinner />} Criar solicitação
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── New Decision Modal ────────────────────────────────────────────────────────

function NewDecisionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: "", description: "", area: "GENERAL" as ManualArea,
    status: "DECIDED" as ManualRuleStatus, sourceType: "PRODUCT_DECISION" as ManualSourceType,
    sourceReference: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/admin/manual/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Erro ao registrar decisão.");
      }
      onCreated(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-bold text-gray-900">Registrar decisão</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Título *</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              value={form.title} required
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Área</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none"
                value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value as ManualArea }))}>
                {AREAS.filter(a => a.value).map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Origem</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none"
                value={form.sourceType} onChange={e => setForm(f => ({ ...f, sourceType: e.target.value as ManualSourceType }))}>
                {(Object.keys(SOURCE_LABELS) as ManualSourceType[]).map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Descrição *</label>
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              rows={4} required value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descreva a decisão, o contexto e as consequências."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Referência (opcional)</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none"
              value={form.sourceReference} placeholder="URL, PR, issue, sessão…"
              onChange={e => setForm(f => ({ ...f, sourceReference: e.target.value }))} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
              {saving && <Spinner />} Registrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Chapter Detail Panel ──────────────────────────────────────────────────────

function ChapterDetail({
  chapter, onClose, onRefresh,
}: { chapter: ChapterDetail; onClose: () => void; onRefresh: () => void }) {
  const [publishing, setPublishing] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState(chapter.content);
  const [savingContent, setSavingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryInput, setSummaryInput] = useState("");

  async function handlePublish() {
    if (!confirm(`Publicar capítulo "${chapter.title}" como v${bumpVersion(chapter.version)}?`)) return;
    setPublishing(true); setError(null);
    try {
      const res = await fetch(`/api/admin/manual/chapters/${chapter.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeSummary: summaryInput || "Publicação manual" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Erro ao publicar.");
      }
      onRefresh(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleSaveContent() {
    setSavingContent(true); setError(null);
    try {
      const res = await fetch(`/api/admin/manual/chapters/${chapter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentDraft }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Erro ao salvar.");
      }
      setEditingContent(false); onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setSavingContent(false);
    }
  }

  function bumpVersion(v: string): string {
    const [maj, min] = v.split(".").map(Number);
    const nMin = (min ?? 0) + 1;
    return nMin >= 10 ? `${(maj ?? 0) + 1}.0` : `${maj ?? 0}.${nMin}`;
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />
      {/* Panel */}
      <div className="flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2 flex-wrap">
              <StatusBadge status={chapter.status} />
              <PublishedBadge isPublished={chapter.isPublished} />
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-mono text-gray-500">v{chapter.version}</span>
              <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-700">{areaLabel(chapter.area)}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900">{chapter.title}</h2>
            {chapter.description && <p className="mt-0.5 text-sm text-gray-500">{chapter.description}</p>}
          </div>
          <button onClick={onClose} className="ml-4 shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        <div className="flex-1 space-y-6 p-6">
          {/* Content */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Conteúdo</h3>
              {!editingContent && (
                <button onClick={() => { setContentDraft(chapter.content); setEditingContent(true); }}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">
                  Editar
                </button>
              )}
            </div>
            {editingContent ? (
              <div className="space-y-2">
                <textarea
                  className="w-full rounded-xl border border-orange-200 bg-orange-50/30 px-4 py-3 font-mono text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                  rows={14} value={contentDraft}
                  onChange={e => setContentDraft(e.target.value)}
                />
                <div className="flex gap-2">
                  <button onClick={handleSaveContent} disabled={savingContent}
                    className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
                    {savingContent && <Spinner />} Salvar rascunho
                  </button>
                  <button onClick={() => setEditingContent(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 font-mono text-sm text-gray-800 leading-relaxed">
                {chapter.content || <span className="italic text-gray-400">Sem conteúdo ainda.</span>}
              </pre>
            )}
          </section>

          {/* Publish */}
          <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Publicar versão</h3>
            <input
              className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none"
              placeholder="Resumo da mudança (opcional)"
              value={summaryInput}
              onChange={e => setSummaryInput(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handlePublish} disabled={publishing}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {publishing && <Spinner />} Publicar versão {bumpVersion(chapter.version)}
              </button>
              {chapter.publishedAt && (
                <span className="text-xs text-gray-400">Última publicação: {fmtDate(chapter.publishedAt)}</span>
              )}
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </section>

          {/* Revisions */}
          {chapter.revisions.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Histórico de versões</h3>
              <div className="space-y-2">
                {chapter.revisions.map(r => (
                  <div key={r.id} className="flex items-start justify-between rounded-lg border border-gray-100 px-3 py-2">
                    <div>
                      <span className="font-mono text-xs font-semibold text-gray-700">v{r.version}</span>
                      {r.changeSummary && <span className="ml-2 text-xs text-gray-500">{r.changeSummary}</span>}
                      <p className="text-[11px] text-gray-400">{SOURCE_LABELS[r.sourceType]} · {r.createdBy ?? "admin"}</p>
                    </div>
                    <span className="text-[11px] text-gray-400">{fmtDate(r.createdAt)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Change requests for this chapter */}
          {chapter.changeRequests.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Solicitações de atualização</h3>
              <div className="space-y-2">
                {chapter.changeRequests.map(cr => (
                  <div key={cr.id} className="rounded-lg border border-gray-100 px-3 py-2">
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-medium text-gray-800">{cr.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHANGE_STATUS_COLORS[cr.status]}`}>
                        {cr.status === "PENDING" ? "Pendente" : cr.status === "APPROVED" ? "Aprovada" : "Rejeitada"}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500">{cr.reason}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Metadata */}
          <section className="border-t border-gray-100 pt-4 text-[11px] text-gray-400">
            <div className="grid grid-cols-2 gap-1">
              <span>Criado por: {chapter.createdBy ?? "—"}</span>
              <span>Atualizado: {fmtDate(chapter.updatedAt)}</span>
              {chapter.approvedBy && <span>Aprovado por: {chapter.approvedBy}</span>}
              <span>Visível para agentes: {chapter.agentVisibility ? "Sim" : "Não (Phase 2+)"}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Import Manual v0.1 Panel ──────────────────────────────────────────────────

interface ImportChapterResult {
  slug:             string;
  title:            string;
  action:           "UPDATED" | "NO_CHANGE" | "MISSING" | "SKIPPED";
  changes?:         string[];
  revisionCreated?: boolean;
  warning?:         string;
}

interface ImportSummary {
  dryRun:           boolean;
  source:           string;
  payloadCount:     number;
  validationErrors: string[];
  results:          ImportChapterResult[];
  countUpdated:     number;
  countNoChange:    number;
  countMissing:     number;
  countSkipped:     number;
  countRevisions:   number;
  countPublished:   number;
}

function ImportResultCard({ result, isPublish = false }: { result: ImportSummary; isPublish?: boolean }) {
  if (result.validationErrors.length > 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm space-y-2">
        <p className="font-semibold text-red-800">❌ Payload inválido</p>
        <ul className="list-disc list-inside space-y-0.5 text-red-700">
          {result.validationErrors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </div>
    );
  }

  const hasProblems = result.countMissing > 0;

  return (
    <div className={`rounded-xl border p-4 text-sm space-y-3 ${
      isPublish ? "border-green-200 bg-green-50" :
      hasProblems ? "border-orange-200 bg-orange-50" :
      "border-blue-200 bg-blue-50"
    }`}>
      <p className="font-semibold text-gray-900">
        {isPublish ? "✅ Publicação concluída" : "🔍 Resultado da simulação"}
      </p>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Atualizados",  value: result.countUpdated,   color: "text-blue-700"   },
          { label: "Publicados",   value: result.countPublished,  color: "text-green-700"  },
          { label: "Sem mudança",  value: result.countNoChange,   color: "text-gray-500"   },
          { label: "Pulados",      value: result.countSkipped,    color: "text-yellow-700" },
          { label: "Faltando",     value: result.countMissing,    color: result.countMissing > 0 ? "text-red-700" : "text-gray-400" },
          { label: "Revisões",     value: result.countRevisions,  color: "text-purple-700" },
        ].map(s => (
          <div key={s.label} className="rounded-lg bg-white/60 px-2 py-2">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      {result.countMissing > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-1">
          <p className="font-semibold text-red-800 text-xs">
            ⚠️ {result.countMissing} capítulo(s) não encontrado(s) no banco.
          </p>
          <p className="text-[11px] text-red-700">
            Use o botão{" "}
            <strong>🌱 Criar capítulos base</strong>{" "}
            para criar a estrutura de capítulos antes de importar.
          </p>
          <ul className="mt-1 list-disc list-inside text-[11px] text-red-600">
            {result.results.filter(r => r.action === "MISSING").map(r => (
              <li key={r.slug}>{r.slug}</li>
            ))}
          </ul>
        </div>
      )}

      {result.results.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer select-none text-gray-500 hover:text-gray-700">
            Ver detalhes dos capítulos ({result.results.length})
          </summary>
          <div className="mt-2 space-y-1">
            {result.results.map(r => (
              <div key={r.slug} className="flex items-start gap-2 leading-snug">
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                  r.action === "UPDATED"   ? "bg-blue-100 text-blue-700"   :
                  r.action === "NO_CHANGE" ? "bg-gray-100 text-gray-500"   :
                  r.action === "MISSING"   ? "bg-red-100 text-red-700"     :
                                             "bg-yellow-100 text-yellow-700"
                }`}>{r.action}</span>
                <span className="text-gray-700">{r.title}</span>
                {r.changes && r.changes.length > 0 && (
                  <span className="text-gray-400 text-[10px]">({r.changes.join(", ")})</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {result.dryRun && (
        <p className="text-[11px] text-gray-400 italic">
          Simulação apenas — nenhum dado foi gravado no banco.
        </p>
      )}
    </div>
  );
}

function ImportManualV01Panel({ onClose, chapterCount }: { onClose: () => void; chapterCount: number }) {
  const [dryRunResult,  setDryRunResult]  = useState<ImportSummary | null>(null);
  const [publishResult, setPublishResult] = useState<ImportSummary | null>(null);
  const [loading,       setLoading]       = useState<"dry-run" | "publish" | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [confirmation,  setConfirmation]  = useState("");

  async function runDryRun() {
    setLoading("dry-run"); setError(null); setDryRunResult(null);
    try {
      const res = await fetch("/api/admin/manual/import-v01", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "dry-run" }),
      });
      const data = await res.json() as { result?: ImportSummary; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro na simulação.");
      setDryRunResult(data.result!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setLoading(null);
    }
  }

  async function runPublish() {
    setLoading("publish"); setError(null); setPublishResult(null);
    try {
      const res = await fetch("/api/admin/manual/import-v01", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "publish", confirmation }),
      });
      const data = await res.json() as { result?: ImportSummary; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro na publicação.");
      setPublishResult(data.result!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setLoading(null);
    }
  }

  const dryRunOk =
    dryRunResult !== null &&
    dryRunResult.validationErrors.length === 0 &&
    dryRunResult.countMissing === 0;

  const canPublish = dryRunOk && !publishResult && loading === null && confirmation === "IMPORT_MANUAL_V01";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">📥 Importar Manual v0.1</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Publica a primeira versão aprovada do Manual Operacional (ChatGPT seed).
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">

          {/* Seed warning */}
          {chapterCount === 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-semibold">❌ Nenhum capítulo encontrado no banco.</p>
              <p className="mt-1 text-xs text-red-700">
                Feche este painel e clique em{" "}
                <strong>🌱 Criar capítulos base</strong>{" "}
                antes de importar. A importação pulará capítulos inexistentes.
              </p>
            </div>
          )}

          {/* Safety notice */}
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 space-y-1.5">
            <p className="font-semibold">⚠️ Ação interna — leia antes de prosseguir</p>
            <ul className="list-disc list-inside space-y-0.5 text-yellow-700 text-xs">
              <li>Importa e publica os 14 capítulos do Manual v0.1 aprovado.</li>
              <li>Cria snapshots de revisão antes de sobrescrever conteúdo existente.</li>
              <li><strong>Não conecta agentes de IA.</strong></li>
              <li><strong>Não adiciona RAG/embeddings.</strong></li>
              <li><strong>Não expõe conteúdo a usuários de restaurante.</strong></li>
              <li>Capítulos faltando no banco não são criados — use o seed separadamente.</li>
            </ul>
          </div>

          {/* Step 1 — Dry-run */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">Passo 1 — Simular importação</p>
                <p className="text-xs text-gray-500">
                  Verifica o payload sem gravar nada no banco. Obrigatório antes de publicar.
                </p>
              </div>
              <button
                onClick={runDryRun}
                disabled={loading !== null || !!publishResult}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading === "dry-run" && <Spinner />}
                Simular importação
              </button>
            </div>

            {dryRunResult && <ImportResultCard result={dryRunResult} />}
          </div>

          {/* Step 2 — Publish */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Passo 2 — Publicar Manual v0.1</p>
              <p className="text-xs text-gray-500">
                Só habilitado após simulação bem-sucedida (sem erros e sem capítulos faltando).
              </p>
            </div>

            {!publishResult ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Digite{" "}
                    <code className="rounded bg-gray-100 px-1 text-gray-800">IMPORT_MANUAL_V01</code>
                    {" "}para confirmar a publicação:
                  </label>
                  <input
                    type="text"
                    value={confirmation}
                    onChange={e => setConfirmation(e.target.value)}
                    disabled={!dryRunOk || loading !== null}
                    placeholder="IMPORT_MANUAL_V01"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm text-gray-900 placeholder-gray-300 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <button
                  onClick={runPublish}
                  disabled={!canPublish}
                  className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading === "publish" && <Spinner />}
                  Publicar Manual v0.1
                </button>
              </div>
            ) : (
              <ImportResultCard result={publishResult} isPublish />
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {publishResult ? "Fechar" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Seed Chapters Modal ───────────────────────────────────────────────────────

interface SeedResult {
  created: number;
  skipped: number;
  total:   number;
  errors:  string[];
  createdSlugs: string[];
}

function SeedChaptersModal({ onClose, onSeeded }: { onClose: () => void; onSeeded: () => void }) {
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<SeedResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function runSeed() {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/admin/manual/seed", { method: "POST" });
      const data = await res.json() as SeedResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar capítulos.");
      setResult(data);
      onSeeded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">

        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">🌱 Criar capítulos base</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Cria os 14 capítulos estruturais do Manual Operacional. Idempotente — seguro executar múltiplas vezes.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700 space-y-1.5">
            <p className="font-medium text-gray-900">O que esta ação faz:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-600">
              <li>Cria até 14 capítulos estruturais (status BACKLOG, não publicados).</li>
              <li>Pula capítulos que já existem — nenhum conteúdo é sobrescrito.</li>
              <li>Não conecta agentes de IA. Não adiciona RAG. Não expõe nada ao restaurante.</li>
            </ul>
          </div>

          {!result && !error && (
            <button
              onClick={runSeed}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && <Spinner />}
              {loading ? "Criando capítulos…" : "Criar capítulos base"}
            </button>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm space-y-3">
              <p className="font-semibold text-green-800">✅ Concluído</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Criados",  value: result.created, color: "text-green-700" },
                  { label: "Pulados",  value: result.skipped, color: "text-gray-500"  },
                  { label: "Total",    value: result.total,   color: "text-gray-900"  },
                ].map(s => (
                  <div key={s.label} className="rounded-lg bg-white/70 px-2 py-2">
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">{s.label}</p>
                  </div>
                ))}
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-xs font-semibold text-red-700">{result.errors.length} erro(s):</p>
                  <ul className="mt-1 list-disc list-inside text-xs text-red-600">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {result ? "Fechar" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ManualOperacionalPage() {
  const [tab, setTab] = useState<"chapters" | "requests" | "decisions">("chapters");

  // Chapters state
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterArea, setFilterArea] = useState<ManualArea | "">("");
  const [filterStatus, setFilterStatus] = useState<ManualRuleStatus | "">("");
  const [selectedChapter, setSelectedChapter] = useState<ChapterDetail | null>(null);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [showNewChapter, setShowNewChapter] = useState(false);

  // Change requests state
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [filterReqStatus, setFilterReqStatus] = useState<ManualChangeStatus | "PENDING">("PENDING");
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  // Decisions state
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [decisionsLoading, setDecisionsLoading] = useState(false);
  const [showNewDecision, setShowNewDecision] = useState(false);

  // Import v0.1 panel
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [showSeedModal,   setShowSeedModal]   = useState(false);

  // ── Fetch helpers ────────────────────────────────────────────────────────────

  const fetchChapters = useCallback(async () => {
    setChaptersLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterArea)   qs.set("area",   filterArea);
      if (filterStatus) qs.set("status", filterStatus);
      if (search)       qs.set("q",      search);
      const res = await fetch(`/api/admin/manual/chapters?${qs}`);
      if (res.ok) {
        const d = await res.json() as { data: Chapter[] };
        setChapters(d.data);
      }
    } finally {
      setChaptersLoading(false);
    }
  }, [filterArea, filterStatus, search]);

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterReqStatus) qs.set("status", filterReqStatus);
      const res = await fetch(`/api/admin/manual/change-requests?${qs}`);
      if (res.ok) {
        const d = await res.json() as { data: ChangeRequest[] };
        setRequests(d.data);
      }
    } finally {
      setRequestsLoading(false);
    }
  }, [filterReqStatus]);

  const fetchDecisions = useCallback(async () => {
    setDecisionsLoading(true);
    try {
      const res = await fetch("/api/admin/manual/decisions");
      if (res.ok) {
        const d = await res.json() as { data: Decision[] };
        setDecisions(d.data);
      }
    } finally {
      setDecisionsLoading(false);
    }
  }, []);

  useEffect(() => { fetchChapters(); }, [fetchChapters]);
  useEffect(() => { if (tab === "requests") fetchRequests(); }, [tab, fetchRequests]);
  useEffect(() => { if (tab === "decisions") fetchDecisions(); }, [tab, fetchDecisions]);

  async function openChapter(id: string) {
    setChapterLoading(true);
    try {
      const res = await fetch(`/api/admin/manual/chapters/${id}`);
      if (res.ok) {
        const d = await res.json() as { chapter: ChapterDetail };
        setSelectedChapter(d.chapter);
      }
    } finally {
      setChapterLoading(false);
    }
  }

  async function handleApprove(requestId: string) {
    const apply = confirm("Aplicar o conteúdo proposto ao capítulo vinculado?");
    setActioning(requestId);
    try {
      await fetch(`/api/admin/manual/change-requests/${requestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applyToChapter: apply }),
      });
      fetchRequests();
    } finally {
      setActioning(null);
    }
  }

  async function handleReject(requestId: string) {
    if (!confirm("Rejeitar esta solicitação?")) return;
    setActioning(requestId);
    try {
      await fetch(`/api/admin/manual/change-requests/${requestId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      fetchRequests();
    } finally {
      setActioning(null);
    }
  }

  // Pending count badge
  const pendingCount = chapters.reduce((s, c) => s + (c._count?.changeRequests ?? 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-white">

      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manual Operacional</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Bíblia interna do Foocci/Fute — fonte oficial de regras de produto, agentes e operação.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowSeedModal(true)}
              className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
              title="Criar os 14 capítulos base do Manual Operacional"
            >
              🌱 Criar capítulos base
            </button>
            <button
              onClick={() => setShowImportPanel(true)}
              className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100"
              title="Importar e publicar Manual Operacional v0.1"
            >
              📥 Importar v0.1
            </button>
            <button
              onClick={() => { setTab("chapters"); setShowNewRequest(true); }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Criar atualização pendente
            </button>
            <button
              onClick={() => { setTab("chapters"); setShowNewChapter(true); }}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              + Novo capítulo
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mt-4 flex items-center gap-6 text-sm text-gray-500">
          <span><strong className="text-gray-900">{chapters.length}</strong> capítulos</span>
          <span><strong className="text-green-700">{chapters.filter(c => c.isPublished).length}</strong> publicados</span>
          <span><strong className="text-gray-500">{chapters.filter(c => !c.isPublished).length}</strong> rascunhos</span>
          {pendingCount > 0 && (
            <span
              onClick={() => setTab("requests")}
              className="cursor-pointer font-medium text-orange-600 hover:underline"
            >
              ⚠ {pendingCount} solicitações pendentes
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 border-b border-gray-200">
          {([
            { key: "chapters",  label: "Capítulos"     },
            { key: "requests",  label: "Solicitações"  },
            { key: "decisions", label: "Decisões"      },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-b-2 border-orange-500 text-orange-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chapters Tab ── */}
      {tab === "chapters" && (
        <div className="px-8 py-6">
          {/* Filters */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <input
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 w-56"
              placeholder="Buscar capítulo…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-orange-400 focus:outline-none"
              value={filterArea}
              onChange={e => setFilterArea(e.target.value as ManualArea | "")}
            >
              {AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <select
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-orange-400 focus:outline-none"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as ManualRuleStatus | "")}
            >
              <option value="">Todos os status</option>
              {(Object.keys(STATUS_LABELS) as ManualRuleStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Chapter list */}
          {chaptersLoading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-gray-400">
              <Spinner /> Carregando capítulos…
            </div>
          ) : chapters.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-2xl">📖</p>
              <p className="mt-2 text-sm text-gray-500">Nenhum capítulo encontrado.</p>
              <p className="mt-1 text-xs text-gray-400">
                Se esta é a primeira execução, crie os capítulos base antes de importar a v0.1.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button onClick={() => setShowSeedModal(true)}
                  className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100">
                  🌱 Criar capítulos base
                </button>
                <button onClick={() => setShowNewChapter(true)}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
                  + Criar manualmente
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {chapters.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => openChapter(ch.id)}
                  className="flex w-full items-start gap-4 px-4 py-3 text-left transition-colors hover:bg-orange-50/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 text-sm">{ch.title}</span>
                      <StatusBadge status={ch.status} />
                      <PublishedBadge isPublished={ch.isPublished} />
                    </div>
                    {ch.description && (
                      <p className="text-xs text-gray-500 truncate">{ch.description}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {areaLabel(ch.area)} · v{ch.version} · atualizado {fmtDate(ch.updatedAt)}
                      {(ch._count?.changeRequests ?? 0) > 0 && (
                        <span className="ml-2 font-medium text-orange-600">
                          {ch._count?.changeRequests} solicitação{(ch._count?.changeRequests ?? 0) > 1 ? "ões" : ""}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-gray-300">›</span>
                </button>
              ))}
            </div>
          )}
          {chapterLoading && (
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-white/60">
              <Spinner />
            </div>
          )}
        </div>
      )}

      {/* ── Change Requests Tab ── */}
      {tab === "requests" && (
        <div className="px-8 py-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex gap-1">
              {(["PENDING","APPROVED","REJECTED"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterReqStatus(s)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    filterReqStatus === s
                      ? "bg-orange-100 text-orange-700"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {s === "PENDING" ? "Pendentes" : s === "APPROVED" ? "Aprovadas" : "Rejeitadas"}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowNewRequest(true)}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              + Nova solicitação
            </button>
          </div>

          {requestsLoading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-gray-400"><Spinner /> Carregando…</div>
          ) : requests.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-2xl">✅</p>
              <p className="mt-2 text-sm text-gray-500">
                {filterReqStatus === "PENDING" ? "Nenhuma solicitação pendente." : "Nenhuma solicitação encontrada."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map(req => (
                <div key={req.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900 text-sm">{req.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHANGE_STATUS_COLORS[req.status]}`}>
                          {req.status === "PENDING" ? "Pendente" : req.status === "APPROVED" ? "Aprovada" : "Rejeitada"}
                        </span>
                      </div>
                      {req.chapter && (
                        <p className="text-xs text-orange-600 font-medium">📄 {req.chapter.title}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">{req.reason}</p>
                      {req.impactAreas && (
                        <p className="text-[11px] text-gray-400 mt-0.5">Impacto: {req.impactAreas}</p>
                      )}
                      <p className="text-[11px] text-gray-400 mt-1">
                        {SOURCE_LABELS[req.sourceType]} · {fmtDate(req.createdAt)}
                        {req.reviewedBy && ` · Revisado por ${req.reviewedBy}`}
                      </p>
                    </div>
                    {req.status === "PENDING" && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          disabled={actioning === req.id}
                          onClick={() => handleApprove(req.id)}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {actioning === req.id ? <Spinner /> : "Aprovar"}
                        </button>
                        <button
                          disabled={actioning === req.id}
                          onClick={() => handleReject(req.id)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Rejeitar
                        </button>
                      </div>
                    )}
                  </div>
                  {req.proposedContent && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">
                        Ver conteúdo proposto
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-700 leading-relaxed">
                        {req.proposedContent}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Decisions Tab ── */}
      {tab === "decisions" && (
        <div className="px-8 py-6">
          <div className="mb-5 flex items-center justify-end">
            <button
              onClick={() => setShowNewDecision(true)}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              + Registrar decisão
            </button>
          </div>

          {decisionsLoading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-gray-400"><Spinner /> Carregando…</div>
          ) : decisions.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-2xl">📝</p>
              <p className="mt-2 text-sm text-gray-500">Nenhuma decisão registrada ainda.</p>
              <button onClick={() => setShowNewDecision(true)}
                className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
                Registrar primeira decisão
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {decisions.map(d => (
                <div key={d.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{d.title}</span>
                    <StatusBadge status={d.status} />
                    <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-700">{areaLabel(d.area)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{d.description}</p>
                  <p className="mt-2 text-[11px] text-gray-400">
                    {SOURCE_LABELS[d.sourceType]}
                    {d.sourceReference && <> · <a href={d.sourceReference} target="_blank" rel="noreferrer" className="underline">{d.sourceReference}</a></>}
                    {" · "}{fmtDate(d.createdAt)}
                    {d.createdBy && ` · ${d.createdBy}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {showSeedModal && (
        <SeedChaptersModal
          onClose={() => setShowSeedModal(false)}
          onSeeded={fetchChapters}
        />
      )}
      {showImportPanel && (
        <ImportManualV01Panel
          chapterCount={chapters.length}
          onClose={() => { setShowImportPanel(false); fetchChapters(); }}
        />
      )}
      {showNewChapter && (
        <NewChapterModal
          onClose={() => setShowNewChapter(false)}
          onCreated={fetchChapters}
        />
      )}
      {showNewRequest && (
        <NewChangeRequestModal
          chapters={chapters}
          onClose={() => setShowNewRequest(false)}
          onCreated={fetchRequests}
        />
      )}
      {showNewDecision && (
        <NewDecisionModal
          onClose={() => setShowNewDecision(false)}
          onCreated={fetchDecisions}
        />
      )}
      {selectedChapter && (
        <ChapterDetail
          chapter={selectedChapter}
          onClose={() => setSelectedChapter(null)}
          onRefresh={() => { fetchChapters(); openChapter(selectedChapter.id); }}
        />
      )}
    </div>
  );
}
