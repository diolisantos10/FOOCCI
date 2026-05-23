"use client";

/**
 * Internal admin UI for menu photo enhancement review.
 *
 * Features:
 * - Start batch enhancement (all products or selected)
 * - Before/after comparison (side-by-side desktop, stacked mobile)
 * - Approve / Reject / Rollback / Regenerate per product
 * - Status badges and quality indicators
 * - Progress indicator during batch
 */

import { useState, useTransition, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProcessMode = "enhance" | "upscale" | "enhance+upscale";

interface EnhancementJob {
  id:            string;
  menuItemId:    string;
  originalUrl:   string;
  enhancedUrl:   string | null;
  status:        string;
  processMode:   string | null;
  providerName:  string | null;
  errorReason:   string | null;
  notes:         string | null;
  approvedAt:    string | null;
  createdAt:     string;
  updatedAt:     string;
  menuItem: {
    id:       string;
    name:     string;
    imageUrl: string | null;
    category: { name: string };
  };
}

interface UnprocessedItem {
  id:       string;
  name:     string;
  imageUrl: string | null;
  category: { name: string };
}

interface Props {
  restaurant:       { id: string; name: string };
  jobs:             EnhancementJob[];
  unprocessedItems: UnprocessedItem[];
  totalWithImage:   number;
}

// ── Status display ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:           { label: "Pendente",        color: "bg-gray-100 text-gray-600" },
  PROCESSING:        { label: "Processando…",    color: "bg-blue-100 text-blue-700" },
  READY:             { label: "Pronto",          color: "bg-yellow-100 text-yellow-700" },
  FAILED:            { label: "Falha",           color: "bg-red-100 text-red-600" },
  APPROVED:          { label: "Aprovado ✓",      color: "bg-green-100 text-green-700" },
  REJECTED:          { label: "Rejeitado",       color: "bg-orange-100 text-orange-700" },
  LOW_SOURCE_QUALITY:{ label: "Baixa qualidade", color: "bg-purple-100 text-purple-700" },
  NEEDS_NEW_PHOTO:   { label: "Nova foto",       color: "bg-pink-100 text-pink-700" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ── Image comparison ──────────────────────────────────────────────────────────

function ImageComparison({
  originalUrl,
  enhancedUrl,
  label,
}: {
  originalUrl: string;
  enhancedUrl: string | null;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
      <div className="flex-1">
        <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Original
        </p>
        <div className="aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
          {originalUrl ? (
            <img
              src={originalUrl}
              alt={`Original — ${label}`}
              className="h-full w-full object-cover object-center"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">
              Sem imagem
            </div>
          )}
        </div>
      </div>
      <div className="flex-1">
        <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Aprimorada
        </p>
        <div className="aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
          {enhancedUrl ? (
            <img
              src={enhancedUrl}
              alt={`Aprimorada — ${label}`}
              className="h-full w-full object-cover object-center"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">
              {enhancedUrl === null ? "Aguardando" : "—"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────

function JobCard({
  job,
  onAction,
  actionBusy,
}: {
  job:        EnhancementJob;
  onAction:   (jobId: string, action: string, processMode?: ProcessMode) => Promise<void>;
  actionBusy: string | null;
}) {
  const busy = actionBusy === job.id;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{job.menuItem.name}</p>
          <p className="text-[11px] text-gray-400">{job.menuItem.category.name}</p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Before / After comparison */}
      <ImageComparison
        originalUrl={job.originalUrl}
        enhancedUrl={job.enhancedUrl}
        label={job.menuItem.name}
      />

      {/* Notes / error */}
      {job.notes && (
        <p className="mt-2 rounded-md bg-blue-50 px-2 py-1 text-[11px] text-blue-700">
          {job.notes}
        </p>
      )}
      {job.errorReason && (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-600">
          {job.errorReason}
        </p>
      )}
      {job.providerName && (
        <p className="mt-1 text-[10px] text-gray-400">
          Provider: {job.providerName} · {job.processMode ?? "—"}
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {job.status === "READY" && (
          <>
            <ActionBtn
              label="Aprovar"
              color="green"
              busy={busy}
              onClick={() => onAction(job.id, "approve")}
            />
            <ActionBtn
              label="Rejeitar"
              color="red"
              busy={busy}
              onClick={() => onAction(job.id, "reject")}
            />
          </>
        )}
        {job.status === "APPROVED" && (
          <ActionBtn
            label="Reverter"
            color="orange"
            busy={busy}
            onClick={() => onAction(job.id, "rollback")}
          />
        )}
        {(job.status === "FAILED" || job.status === "REJECTED" || job.status === "LOW_SOURCE_QUALITY") && (
          <ActionBtn
            label="Tentar novamente"
            color="blue"
            busy={busy}
            onClick={() => onAction(job.id, "regenerate", "enhance+upscale")}
          />
        )}
        {job.status === "READY" && (
          <ActionBtn
            label="Regerar"
            color="gray"
            busy={busy}
            onClick={() => onAction(job.id, "regenerate", "enhance+upscale")}
          />
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  color,
  busy,
  onClick,
}: {
  label: string;
  color: "green" | "red" | "orange" | "blue" | "gray";
  busy: boolean;
  onClick: () => void;
}) {
  const colorMap = {
    green:  "bg-green-500 text-white hover:bg-green-600",
    red:    "border border-red-300 text-red-600 hover:bg-red-50",
    orange: "border border-orange-300 text-orange-600 hover:bg-orange-50",
    blue:   "bg-blue-500 text-white hover:bg-blue-600",
    gray:   "border border-gray-300 text-gray-600 hover:bg-gray-50",
  };
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${colorMap[color]}`}
    >
      {busy ? "…" : label}
    </button>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export function EnhancementClient({
  restaurant,
  jobs: initialJobs,
  unprocessedItems,
  totalWithImage,
}: Props) {
  const [jobs, setJobs]           = useState<EnhancementJob[]>(initialJobs);
  const [processMode, setProcessMode] = useState<ProcessMode>("enhance+upscale");
  const [dryRun, setDryRun]       = useState(false);
  const [log, setLog]             = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [, startTransition]       = useTransition();

  // ── Refresh jobs from API ─────────────────────────────────────────────────

  const refreshJobs = useCallback(async () => {
    const res  = await fetch(`/api/internal/enhance-images?restaurantId=${restaurant.id}`);
    const data = await res.json();
    if (data.data?.jobs) setJobs(data.data.jobs);
  }, [restaurant.id]);

  // ── Start batch ───────────────────────────────────────────────────────────

  async function startBatch() {
    setBatchBusy(true);
    setLog(null);
    try {
      const res = await fetch("/api/internal/enhance-images", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          restaurantId: restaurant.id,
          dryRun,
          processMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLog(`Erro: ${data.error ?? "Falha na requisição"}`);
      } else {
        const s = data.data.stats;
        setLog(
          `Concluído: ${s.total} produtos · ${s.enqueued} processados · ${s.migrated} migrados · ${s.failed} falhas${s.dryRun ? " (dry run)" : ""}`
        );
        await refreshJobs();
      }
    } catch (err) {
      setLog(`Erro de rede: ${String(err)}`);
    } finally {
      setBatchBusy(false);
    }
  }

  // ── Per-job actions ───────────────────────────────────────────────────────

  async function handleAction(jobId: string, action: string, pm?: ProcessMode) {
    setActionBusy(jobId);
    try {
      const res = await fetch(`/api/internal/enhance-images/${jobId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, processMode: pm ?? processMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Erro: ${data.error ?? "Falha"}`);
      } else {
        startTransition(() => { void refreshJobs(); });
      }
    } catch (err) {
      alert(`Erro de rede: ${String(err)}`);
    } finally {
      setActionBusy(null);
    }
  }

  // ── Filtered jobs ─────────────────────────────────────────────────────────

  const filtered = statusFilter === "all"
    ? jobs
    : jobs.filter((j) => j.status === statusFilter);

  const statusCounts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-500">
                Ferramenta interna · admin only
              </p>
              <h1 className="mt-0.5 text-xl font-bold text-gray-900">
                Aprimoramento de Fotos
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">
                {restaurant.name} · {totalWithImage} produtos com imagem
              </p>
            </div>

            {/* Batch controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600">Modo:</label>
                <select
                  value={processMode}
                  onChange={(e) => setProcessMode(e.target.value as ProcessMode)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                >
                  <option value="enhance+upscale">Aprimorar + Upscale</option>
                  <option value="enhance">Só aprimorar</option>
                  <option value="upscale">Só upscale</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                />
                Dry run
              </label>
              <button
                type="button"
                disabled={batchBusy}
                onClick={startBatch}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {batchBusy ? "Processando…" : "Iniciar processamento"}
              </button>
            </div>
          </div>

          {log && (
            <div className="mt-3 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
              {log}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-6">
        {/* Status summary pills */}
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === "all"
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Todos ({jobs.length})
          </button>
          {Object.entries(statusCounts).map(([status, count]) => {
            const cfg = STATUS_CONFIG[status];
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === status
                    ? "bg-gray-900 text-white"
                    : `${cfg?.color ?? "bg-gray-100 text-gray-500"} hover:opacity-80`
                }`}
              >
                {cfg?.label ?? status} ({count})
              </button>
            );
          })}
        </div>

        {/* Unprocessed products notice */}
        {unprocessedItems.length > 0 && (
          <div className="mb-5 rounded-xl border border-dashed border-orange-300 bg-orange-50 px-4 py-3">
            <p className="text-sm font-medium text-orange-700">
              {unprocessedItems.length} produto{unprocessedItems.length !== 1 ? "s" : ""} ainda não processado{unprocessedItems.length !== 1 ? "s" : ""}
            </p>
            <p className="mt-0.5 text-xs text-orange-600">
              Clique em &quot;Iniciar processamento&quot; para incluí-los.
            </p>
          </div>
        )}

        {/* Jobs grid */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-400">
              {jobs.length === 0
                ? 'Nenhum processamento iniciado. Clique em "Iniciar processamento".'
                : "Nenhum item com este filtro."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onAction={handleAction}
                actionBusy={actionBusy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
