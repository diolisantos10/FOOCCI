"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AGENCY_SERVICES } from "@/services/agency/StrategyRoomService";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectRow = {
  id:         string;
  name:       string;
  objective:  string;
  status:     string;
  services:   unknown;
  createdAt:  string;
  strategySession: { id: string; generatedAt: string } | null;
};

type Props = {
  projects:       ProjectRow[];
  restaurantName: string;
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT:            "Rascunho",
  STRATEGY_PENDING: "Estratégia pendente",
  STRATEGY_DONE:    "Estratégia pronta",
  PROPOSAL_READY:   "Proposta pronta",
  ACTIVE:           "Ativo",
  COMPLETED:        "Concluído",
  CANCELLED:        "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT:            "bg-[#F4F4F2] text-ink2",
  STRATEGY_PENDING: "bg-yellow-50 text-yellow-700",
  STRATEGY_DONE:    "bg-blue-50 text-blue-700",
  PROPOSAL_READY:   "bg-purple-50 text-purple-700",
  ACTIVE:           "bg-green-50 text-green-700",
  COMPLETED:        "bg-green-100 text-green-800",
  CANCELLED:        "bg-red-50 text-red-600",
};

// ─── New Project Form ─────────────────────────────────────────────────────────

function NewProjectForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name:      "",
    objective: "",
    audience:  "",
    timeline:  "",
    budget:    "",
    services:  [] as string[],
    notes:     "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function toggleService(name: string) {
    setForm((f) => ({
      ...f,
      services: f.services.includes(name)
        ? f.services.filter((s) => s !== name)
        : [...f.services, name],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.objective.trim()) {
      setError("Nome e objetivo são obrigatórios.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agency/projects", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error((data as { error?: string }).error ?? "Erro ao criar projeto");
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-ink2 mb-1">Nome do projeto *</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ex: Lançamento Sushi Cazza — Verão 2026"
            className="w-full rounded-lg border border-line2 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            required
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-ink2 mb-1">Objetivo *</label>
          <textarea
            value={form.objective}
            onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
            rows={3}
            placeholder="Descreva o objetivo principal do projeto. Ex: Lançar a nova unidade do restaurante gerando awareness local e convertendo seguidores em primeiras visitas."
            className="w-full rounded-lg border border-line2 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink2 mb-1">Público-alvo</label>
          <input
            value={form.audience}
            onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
            placeholder="Ex: Jovens adultos 22–35, bairro Vila Madalena"
            className="w-full rounded-lg border border-line2 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink2 mb-1">Prazo estimado</label>
          <input
            value={form.timeline}
            onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))}
            placeholder="Ex: 3 meses, até dezembro/2026"
            className="w-full rounded-lg border border-line2 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink2 mb-1">Budget disponível</label>
          <input
            value={form.budget}
            onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
            placeholder="Ex: R$ 8.000/mês, até R$ 30.000"
            className="w-full rounded-lg border border-line2 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink2 mb-1">Notas internas</label>
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Observações para a equipe"
            className="w-full rounded-lg border border-line2 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink2 mb-2">Serviços — selecione os relevantes</label>
        <div className="flex flex-wrap gap-2">
          {AGENCY_SERVICES.map((svc) => {
            const selected = form.services.includes(svc.name);
            return (
              <button
                key={svc.id}
                type="button"
                onClick={() => toggleService(svc.name)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selected
                    ? "bg-brand-600 text-white"
                    : "bg-[#F4F4F2] text-ink2 hover:bg-line2"
                }`}
              >
                {svc.name}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-ink2 hover:bg-[#F4F4F2]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? "Criando…" : "Criar projeto"}
        </button>
      </div>
    </form>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function AgenciaClient({ projects: initial, restaurantName }: Props) {
  const router              = useRouter();
  const [projects, setProjects] = useState(initial);
  const [showForm, setShowForm] = useState(false);

  function handleSuccess() {
    setShowForm(false);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-ink">Projetos de Agência</h1>
          <p className="text-sm text-muted">{restaurantName} · Uso interno</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + Novo Projeto
          </button>
        )}
      </div>

      {/* New project form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-line2 bg-paper p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-ink">Novo Projeto</h2>
          <NewProjectForm onSuccess={handleSuccess} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Projects list */}
      {projects.length === 0 && !showForm ? (
        <div className="rounded-xl border border-dashed border-line2 py-16 text-center">
          <p className="text-sm font-medium text-muted">Nenhum projeto ainda.</p>
          <p className="mt-1 text-xs text-muted">Clique em &ldquo;Novo Projeto&rdquo; para começar.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => {
            const services = Array.isArray(p.services) ? (p.services as string[]) : [];
            return (
              <li
                key={p.id}
                onClick={() => router.push(`/agencia/${p.id}`)}
                className="flex cursor-pointer items-start gap-4 rounded-xl border border-line2 bg-paper px-5 py-4 shadow-sm hover:border-brand-200 hover:shadow-md transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink text-sm">{p.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_COLORS[p.status] ?? "bg-[#F4F4F2] text-ink2"}`}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                    {p.strategySession && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                        Strategy Room ✓
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted line-clamp-2">{p.objective}</p>
                  {services.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {services.slice(0, 4).map((s) => (
                        <span key={s} className="rounded-full bg-[#F4F4F2] px-2 py-0.5 text-[10px] text-ink2">{s}</span>
                      ))}
                      {services.length > 4 && (
                        <span className="rounded-full bg-[#F4F4F2] px-2 py-0.5 text-[10px] text-muted">+{services.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-muted">{new Date(p.createdAt).toLocaleDateString("pt-BR")}</p>
                  {p.strategySession && (
                    <p className="text-[10px] text-indigo-400 mt-0.5">
                      Gerado {new Date(p.strategySession.generatedAt).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
