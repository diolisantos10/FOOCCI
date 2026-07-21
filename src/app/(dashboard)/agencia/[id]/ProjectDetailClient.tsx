"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SpecialistOutput, StrategySynthesis } from "@/services/agency/StrategyRoomService";

// ─── Types ────────────────────────────────────────────────────────────────────

type StrategySession = {
  id:             string;
  status:         string;
  generatedAt:    string;
  briefSnapshot:  unknown;
  strategist:     unknown;
  socialMedia:    unknown;
  creative:       unknown;
  paidTraffic:    unknown;
  businessScope:  unknown;
  criticalReview: unknown;
  synthesis:      unknown;
};

type Project = {
  id:             string;
  name:           string;
  objective:      string;
  audience:       string | null;
  timeline:       string | null;
  budget:         string | null;
  services:       string[];
  notes:          string | null;
  status:         string;
  createdAt:      string;
  strategySession: StrategySession | null;
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
  STRATEGY_DONE:    "bg-blue-50 text-blue-700",
  PROPOSAL_READY:   "bg-brand-50 text-brand-600",
  ACTIVE:           "bg-green-50 text-green-700",
  COMPLETED:        "bg-green-100 text-green-800",
  CANCELLED:        "bg-red-50 text-red-600",
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low:    "bg-[#FAFAF8] text-ink2 border-line2",
};

const PRIORITY_LABELS: Record<string, string> = {
  high:   "Alta",
  medium: "Média",
  low:    "Baixa",
};

// ─── Specialist icons ─────────────────────────────────────────────────────────

const SPECIALIST_ICONS: Record<string, string> = {
  "Strategy":       "🧭",
  "Social Media":   "📱",
  "Creative":       "🎨",
  "Paid Traffic":   "📡",
  "Business/Scope": "💼",
  "Critical Reviewer": "🔍",
};

// ─── Specialist card ──────────────────────────────────────────────────────────

function SpecialistCard({ data }: { data: SpecialistOutput }) {
  const [expanded, setExpanded] = useState(false);
  const icon = SPECIALIST_ICONS[data.role] ?? "👤";

  return (
    <div className={`rounded-xl border bg-paper shadow-sm overflow-hidden ${
      data.priority === "high" ? "border-red-200" : "border-line2"
    }`}>
      {/* Header */}
      <div
        className="flex cursor-pointer items-start gap-3 p-4"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FAFAF8] text-lg">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink">{data.specialist}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PRIORITY_COLORS[data.priority]}`}>
              Prioridade {PRIORITY_LABELS[data.priority]}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted line-clamp-2">{data.mainInsight}</p>
        </div>
        <span className="text-muted text-sm shrink-0">{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-line px-4 pb-4 pt-3 space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Direção Recomendada</p>
            <p className="text-sm text-ink2">{data.recommendedDirection}</p>
          </div>

          {data.risks.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Riscos</p>
              <ul className="space-y-1">
                {data.risks.map((risk, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink2">
                    <span className="mt-0.5 shrink-0 text-red-400">⚠</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.suggestedDeliverables.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Entregáveis Sugeridos</p>
              <ul className="space-y-1">
                {data.suggestedDeliverables.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink2">
                    <span className="mt-0.5 shrink-0 text-green-500">✓</span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Synthesis section ────────────────────────────────────────────────────────

function SynthesisSection({ synthesis }: { synthesis: StrategySynthesis }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">🧬</span>
        <h3 className="text-sm font-bold text-brand-800">Síntese Estratégica — Recomendação Final</h3>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-1">Melhor Direção Estratégica</p>
        <p className="text-sm text-brand-800">{synthesis.bestStrategicDirection}</p>
      </div>

      {synthesis.recommendedServices.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-2">Serviços Recomendados para a Proposta</p>
          <div className="flex flex-wrap gap-2">
            {synthesis.recommendedServices.map((s) => (
              <span key={s} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">{s}</span>
            ))}
          </div>
        </div>
      )}

      {synthesis.proposalImplications.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-1">Implicações para a Proposta</p>
          <ul className="space-y-1">
            {synthesis.proposalImplications.map((imp, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-brand-700">
                <span className="mt-0.5 shrink-0">→</span>
                {imp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {synthesis.risksToMention.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-1">Riscos a Mencionar na Proposta</p>
          <ul className="space-y-1">
            {synthesis.risksToMention.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-brand-700">
                <span className="mt-0.5 shrink-0 text-amber-500">⚠</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg bg-paper border border-brand-200 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-1">Próxima Ação para o PM</p>
        <p className="text-sm font-medium text-brand-800">{synthesis.nextActionForPM}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProjectDetailClient({ project }: { project: Project }) {
  const router               = useRouter();
  const [tab, setTab]        = useState<"brief" | "strategy">("brief");
  const [generating, setGen] = useState(false);
  const [error, setError]    = useState<string | null>(null);

  const session = project.strategySession;

  async function generateStrategy() {
    setGen(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/projects/${project.id}/strategy`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error((data as { error?: string }).error ?? "Erro ao gerar estratégia");
      }
      router.refresh();
      setTab("strategy");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setGen(false);
    }
  }

  // Parse session data
  const specialists: SpecialistOutput[] | null = session
    ? [
        session.strategist,
        session.socialMedia,
        session.creative,
        session.paidTraffic,
        session.businessScope,
        session.criticalReview,
      ].filter(Boolean).map((s) => s as unknown as SpecialistOutput)
    : null;

  const synthesis: StrategySynthesis | null = session
    ? (session.synthesis as unknown as StrategySynthesis)
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Back + title */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => router.push("/agencia")}
          className="text-sm text-muted hover:text-ink"
        >
          ← Projetos
        </button>
        <span className="text-muted">/</span>
        <span className="text-sm font-semibold text-ink truncate">{project.name}</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_COLORS[project.status] ?? "bg-[#F4F4F2] text-ink2"}`}>
          {STATUS_LABELS[project.status] ?? project.status}
        </span>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex border-b border-line2">
        {(["brief", "strategy"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 pb-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-brand-600 text-brand-700"
                : "text-muted hover:text-ink2"
            }`}
          >
            {t === "brief" ? "Brief" : "Strategy Room"}
            {t === "strategy" && session && (
              <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold text-brand-500">✓</span>
            )}
          </button>
        ))}
      </div>

      {/* Brief tab */}
      {tab === "brief" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-line2 bg-paper p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Objetivo</h2>
            <p className="text-sm text-ink2 whitespace-pre-line">{project.objective}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {project.audience && (
              <InfoField label="Público-alvo" value={project.audience} />
            )}
            {project.timeline && (
              <InfoField label="Prazo" value={project.timeline} />
            )}
            {project.budget && (
              <InfoField label="Budget" value={project.budget} />
            )}
            {project.notes && (
              <InfoField label="Notas internas" value={project.notes} className="sm:col-span-2" />
            )}
          </div>

          {project.services.length > 0 && (
            <div className="rounded-xl border border-line2 bg-paper p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Serviços Selecionados</h2>
              <div className="flex flex-wrap gap-2">
                {project.services.map((s) => (
                  <span key={s} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">{s}</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={generateStrategy}
              disabled={generating}
              className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {generating
                ? "Gerando estratégia…"
                : session
                  ? "↺ Regenerar Strategy Room"
                  : "▶ Gerar Strategy Room"}
            </button>
          </div>
          {error && <p className="text-sm text-red-500 text-right">{error}</p>}
        </div>
      )}

      {/* Strategy Room tab */}
      {tab === "strategy" && (
        <div className="space-y-4">
          {!session ? (
            <div className="rounded-xl border border-dashed border-line2 py-16 text-center">
              <p className="text-sm font-medium text-muted">Strategy Room ainda não gerado.</p>
              <p className="mt-1 text-xs text-muted mb-4">Vá ao brief e clique em &ldquo;Gerar Strategy Room&rdquo;.</p>
              <button
                onClick={() => setTab("brief")}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Ir ao Brief →
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted">
                  Gerado em {new Date(session.generatedAt).toLocaleString("pt-BR")} · Uso interno
                </p>
                <button
                  onClick={generateStrategy}
                  disabled={generating}
                  className="rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50"
                >
                  {generating ? "Gerando…" : "↺ Regenerar"}
                </button>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              {/* 6 specialist cards */}
              {specialists && (
                <div className="space-y-3">
                  {specialists.map((s) => (
                    <SpecialistCard key={s.role} data={s} />
                  ))}
                </div>
              )}

              {/* Synthesis */}
              {synthesis && (
                <div className="pt-2">
                  <SynthesisSection synthesis={synthesis} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function InfoField({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-line2 bg-paper p-4 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">{label}</p>
      <p className="text-sm text-ink2">{value}</p>
    </div>
  );
}
