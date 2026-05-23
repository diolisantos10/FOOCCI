"use client";

/**
 * Internal admin UI for menu photo enhancement review.
 *
 * Key invariants:
 * - Never auto-approves — all approvals are manual
 * - Never deletes original images
 * - Status tabs are always visible (never disappear based on count)
 * - Actions never navigate away from the page
 * - Toasts replace alert() calls
 */

import { useState, useCallback, useEffect, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProcessMode = "enhance" | "upscale" | "enhance+upscale";

interface EnhancementJob {
  id:           string;
  menuItemId:   string;
  originalUrl:  string;
  enhancedUrl:  string | null;
  status:       string;
  processMode:  string | null;
  providerName: string | null;
  errorReason:  string | null;
  notes:        string | null;
  approvedAt:   string | null;
  createdAt:    string;
  updatedAt:    string;
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

interface Toast {
  id:      string;
  message: string;
  type:    "success" | "error";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  PENDING:           { label: "Pendente",          color: "bg-gray-100 text-gray-600",   dot: "bg-gray-400" },
  PROCESSING:        { label: "Processando",        color: "bg-blue-100 text-blue-700",   dot: "bg-blue-500" },
  READY:             { label: "Pronta para revisão",color: "bg-yellow-100 text-yellow-700",dot:"bg-yellow-500" },
  FAILED:            { label: "Falhou",             color: "bg-red-100 text-red-600",     dot: "bg-red-500" },
  APPROVED:          { label: "Aprovada",           color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  REJECTED:          { label: "Rejeitada",          color: "bg-orange-100 text-orange-700",dot:"bg-orange-500" },
  LOW_SOURCE_QUALITY:{ label: "Baixa qualidade",    color: "bg-purple-100 text-purple-700",dot:"bg-purple-500" },
  NEEDS_NEW_PHOTO:   { label: "Precisa nova foto",  color: "bg-pink-100 text-pink-700",   dot: "bg-pink-500" },
};

// Tabs are always visible — never generated from counts
const STABLE_TABS = [
  { status: "all",                label: "Todas" },
  { status: "READY",              label: "Prontas" },
  { status: "PROCESSING",         label: "Processando" },
  { status: "FAILED",             label: "Falhas" },
  { status: "APPROVED",           label: "Aprovadas" },
  { status: "REJECTED",           label: "Rejeitadas" },
  { status: "LOW_SOURCE_QUALITY", label: "Baixa qualidade" },
  { status: "NEEDS_NEW_PHOTO",    label: "Nova foto" },
];

// Translate raw technical error messages to Portuguese user-friendly text
function mapErrorReason(raw: string | null): string {
  if (!raw) return "Erro desconhecido ao processar imagem.";
  const r = raw.toLowerCase();
  // Internal /api/media/ resolution failures (fixed by shared fetchImageBuffer, but may appear in old jobs)
  if (r.includes("failed to parse url") || r.includes("invalid url") || r.includes("url inválida"))
    return "Erro ao localizar a imagem interna para processamento.";
  if (r.includes("internal media not found"))
    return "Imagem interna não encontrada no banco de dados.";
  if (r.includes("failed to read internal media") || r.includes("/api/media/"))
    return "Erro ao ler imagem interna do armazenamento.";
  if (r.includes("relative url") || r.includes("protocolo não suportado"))
    return "URL da imagem em formato não suportado.";
  // Network / access errors
  if (r.includes("403") || r.includes("forbidden") || r.includes("blocked") || r.includes("access denied"))
    return "O link da imagem bloqueou o download.";
  if (r.includes("404") || r.includes("not found"))
    return "A imagem original não foi encontrada.";
  if (r.includes("429") || r.includes("too many requests"))
    return "O servidor da imagem limitou muitas tentativas.";
  if (r.includes("aborterror") || r.includes("aborted") || r.includes("timeout") || r.includes("timed out"))
    return "Tempo esgotado ao baixar a imagem.";
  // Image format / quality errors
  if (r.includes("cannot decode") || r.includes("unsupported format") || r.includes("corrupt") || r.includes("invalid image"))
    return "Formato de imagem não suportado ou arquivo corrompido.";
  if (r.includes("too small") || r.includes("minimum") || r.includes("200x200") || r.includes("resolution") || r.includes("low source quality"))
    return "Imagem pequena demais para melhorar com qualidade.";
  // Storage errors
  if (r.includes("s3") || r.includes("upload failed") || r.includes("storage"))
    return "Erro ao salvar a imagem no storage.";
  // Provider errors
  if (r.includes("not configured") || r.includes("provider"))
    return "Provider de melhoria de imagem não configurado.";
  return "Erro ao processar imagem.";
}

// ── Toast system ──────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium transition-all ${
            t.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          <span>{t.type === "success" ? "✓" : "✕"}</span>
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="ml-2 opacity-70 hover:opacity-100"
            aria-label="Fechar notificação"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-500", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Image comparison ──────────────────────────────────────────────────────────

function ImageComparison({ originalUrl, enhancedUrl, label }: {
  originalUrl: string;
  enhancedUrl: string | null;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
      <div className="flex-1">
        <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">Original</p>
        <div className="aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
          {originalUrl ? (
            <img src={originalUrl} alt={`Original — ${label}`} className="h-full w-full object-cover object-center" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">Sem imagem</div>
          )}
        </div>
      </div>
      <div className="flex-1">
        <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">Aprimorada</p>
        <div className="aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
          {enhancedUrl ? (
            <img src={enhancedUrl} alt={`Aprimorada — ${label}`} className="h-full w-full object-cover object-center" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">Aguardando</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

function ActionBtn({ label, color, busy, onClick }: {
  label:   string;
  color:   "green" | "red" | "orange" | "blue" | "gray";
  busy:    boolean;
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

// ── Job card ──────────────────────────────────────────────────────────────────

function JobCard({ job, onAction, actionBusy }: {
  job:        EnhancementJob;
  onAction:   (jobId: string, action: string, processMode?: ProcessMode) => Promise<void>;
  actionBusy: string | null;
}) {
  const [showTechnical, setShowTechnical] = useState(false);
  const busy = actionBusy === job.id;
  const friendlyError = job.errorReason ? mapErrorReason(job.errorReason) : null;

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

      {/* Before / after images */}
      <ImageComparison
        originalUrl={job.originalUrl}
        enhancedUrl={job.enhancedUrl}
        label={job.menuItem.name}
      />

      {/* Notes */}
      {job.notes && (
        <p className="mt-2 rounded-md bg-blue-50 px-2 py-1.5 text-[11px] text-blue-700">{job.notes}</p>
      )}

      {/* Friendly error + collapsible technical details */}
      {friendlyError && (
        <div className="mt-2 rounded-md bg-red-50 border border-red-100 px-2 py-1.5">
          <p className="text-[11px] text-red-700 font-medium">{friendlyError}</p>
          {job.errorReason && job.errorReason !== friendlyError && (
            <button
              type="button"
              onClick={() => setShowTechnical((v) => !v)}
              className="mt-0.5 text-[10px] text-red-400 hover:text-red-600 underline"
            >
              {showTechnical ? "Ocultar detalhes técnicos" : "Detalhes técnicos"}
            </button>
          )}
          {showTechnical && (
            <p className="mt-1 font-mono text-[10px] text-red-400 break-all">{job.errorReason}</p>
          )}
        </div>
      )}

      {/* Provider / mode metadata */}
      {job.providerName && (
        <p className="mt-1 text-[10px] text-gray-400">
          Provider: {job.providerName} · {job.processMode ?? "—"}
          {job.approvedAt && (
            <> · Aprovada em {new Date(job.approvedAt).toLocaleDateString("pt-BR")}</>
          )}
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {job.status === "READY" && (
          <>
            <ActionBtn label="Aprovar"  color="green" busy={busy} onClick={() => onAction(job.id, "approve")} />
            <ActionBtn label="Rejeitar" color="red"   busy={busy} onClick={() => onAction(job.id, "reject")} />
            <ActionBtn label="Regenerar" color="gray" busy={busy} onClick={() => onAction(job.id, "regenerate", "enhance+upscale")} />
          </>
        )}
        {job.status === "APPROVED" && (
          <ActionBtn label="Restaurar original" color="orange" busy={busy} onClick={() => onAction(job.id, "rollback")} />
        )}
        {(job.status === "FAILED" || job.status === "REJECTED" || job.status === "LOW_SOURCE_QUALITY" || job.status === "NEEDS_NEW_PHOTO") && (
          <ActionBtn label="Tentar novamente" color="blue" busy={busy} onClick={() => onAction(job.id, "regenerate", "enhance+upscale")} />
        )}
      </div>
    </div>
  );
}

// ── Summary stat card ─────────────────────────────────────────────────────────

function StatCard({ label, value, color, onClick, active }: {
  label:   string;
  value:   number;
  color:   string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
        active
          ? "border-gray-400 bg-gray-900 text-white"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <p className={`text-xl font-bold ${active ? "text-white" : color}`}>{value}</p>
      <p className={`text-xs ${active ? "text-gray-300" : "text-gray-500"}`}>{label}</p>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
  const [toasts, setToasts]       = useState<Toast[]>([]);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const toastIdRef = useRef(0);

  // ── Toast helpers ─────────────────────────────────────────────────────────

  function showToast(message: string, type: Toast["type"] = "success") {
    const id = String(++toastIdRef.current);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Refresh jobs from API ─────────────────────────────────────────────────

  const refreshJobs = useCallback(async (): Promise<boolean> => {
    try {
      const res  = await fetch(`/api/internal/enhance-images?restaurantId=${restaurant.id}&pageSize=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { data?: { jobs?: EnhancementJob[] } };
      if (data.data?.jobs) {
        setJobs(data.data.jobs);
        return true;
      }
      return false;
    } catch (err) {
      console.error("[refreshJobs]", err);
      showToast("Não foi possível atualizar a lista. Tente novamente.", "error");
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.id]);

  // ── Start batch ───────────────────────────────────────────────────────────

  async function startBatch() {
    setShowBatchConfirm(false);
    setBatchBusy(true);
    setLog(null);
    try {
      const res = await fetch("/api/internal/enhance-images", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ restaurantId: restaurant.id, dryRun, processMode }),
      });
      const data = await res.json() as { error?: string; data?: { stats: Record<string, number> & { dryRun: boolean } } };
      if (!res.ok) {
        setLog(`Erro: ${data.error ?? "Falha na requisição"}`);
        showToast(`Erro ao iniciar processamento: ${data.error ?? "Falha"}`, "error");
      } else {
        const s = data.data!.stats;
        const skippedParts: string[] = [];
        if ((s.skippedApproved ?? 0) > 0) skippedParts.push(`${s.skippedApproved} aprovadas ignoradas`);
        if ((s.skippedReady   ?? 0) > 0)  skippedParts.push(`${s.skippedReady} prontas ignoradas`);
        setLog(
          `Concluído: ${s.total} produtos · ${s.enqueued} processados · ${s.migrated} migrados · ${s.failed} falhas` +
          (skippedParts.length ? ` · ${skippedParts.join(" · ")}` : "") +
          (s.dryRun ? " (dry run)" : "")
        );
        await refreshJobs();
      }
    } catch (err) {
      setLog(`Erro de rede: ${String(err)}`);
      showToast("Erro de rede ao iniciar processamento.", "error");
    } finally {
      setBatchBusy(false);
    }
  }

  // ── Per-job actions ───────────────────────────────────────────────────────

  const TOAST_MSG: Record<string, string> = {
    approve:    "Imagem aprovada com sucesso.",
    reject:     "Imagem rejeitada.",
    rollback:   "Imagem original restaurada.",
    regenerate: "Tentando processar novamente.",
  };

  async function handleAction(jobId: string, action: string, pm?: ProcessMode) {
    setActionBusy(jobId);
    try {
      const res = await fetch(`/api/internal/enhance-images/${jobId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, processMode: pm ?? processMode }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        showToast(`Erro: ${data.error ?? "Falha ao executar ação"}`, "error");
      } else {
        showToast(TOAST_MSG[action] ?? "Ação concluída.", "success");
        await refreshJobs();
      }
    } catch {
      showToast("Erro de rede. Tente novamente.", "error");
    } finally {
      setActionBusy(null);
    }
  }

  // ── Derived counts ────────────────────────────────────────────────────────

  const statusCounts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = statusFilter === "all" ? jobs : jobs.filter((j) => j.status === statusFilter);

  const reviewed  = (statusCounts["APPROVED"] ?? 0) + (statusCounts["REJECTED"] ?? 0);
  const reviewable = (statusCounts["READY"] ?? 0) + reviewed;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-12">

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-500">
                Ferramenta interna · admin only
              </p>
              <h1 className="mt-0.5 text-xl font-bold text-gray-900">Melhoria de fotos do cardápio</h1>
              <p className="mt-0.5 text-sm text-gray-500">
                Revise as versões melhoradas antes de aplicar no cardápio. · {restaurant.name} · {totalWithImage} produtos com imagem
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
                onClick={() => setShowBatchConfirm(true)}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {batchBusy ? "Processando…" : "Iniciar processamento"}
              </button>
            </div>
          </div>

          {log && (
            <div className="mt-3 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">{log}</div>
          )}
        </div>
      </div>

      {/* Batch confirmation dialog */}
      {showBatchConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setShowBatchConfirm(false); }}
        >
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-1 text-base font-bold text-gray-900">Iniciar processamento</h2>
            <p className="mb-1 text-sm text-gray-600">
              Serão processadas imagens ainda <strong>não iniciadas</strong>, <strong>com falha</strong> e <strong>rejeitadas</strong>.
            </p>
            <p className="mb-4 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
              ⚠️ Imagens <strong>já aprovadas</strong> serão ignoradas e não serão alteradas.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowBatchConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={startBatch}
                className="flex-1 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                {dryRun ? "Simular (dry run)" : "Processar agora"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-6 pt-6">

        {/* Summary stat cards */}
        <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <StatCard label="Total"       value={jobs.length}                      color="text-gray-900" onClick={() => setStatusFilter("all")}                active={statusFilter === "all"} />
          <StatCard label="Processando" value={statusCounts["PROCESSING"] ?? 0}  color="text-blue-600" onClick={() => setStatusFilter("PROCESSING")}         active={statusFilter === "PROCESSING"} />
          <StatCard label="Prontas"     value={statusCounts["READY"] ?? 0}       color="text-yellow-600" onClick={() => setStatusFilter("READY")}             active={statusFilter === "READY"} />
          <StatCard label="Aprovadas"   value={statusCounts["APPROVED"] ?? 0}    color="text-green-600" onClick={() => setStatusFilter("APPROVED")}           active={statusFilter === "APPROVED"} />
          <StatCard label="Rejeitadas"  value={statusCounts["REJECTED"] ?? 0}    color="text-orange-600" onClick={() => setStatusFilter("REJECTED")}          active={statusFilter === "REJECTED"} />
          <StatCard label="Falhas"      value={statusCounts["FAILED"] ?? 0}      color="text-red-600" onClick={() => setStatusFilter("FAILED")}               active={statusFilter === "FAILED"} />
        </div>

        {/* Progress indicator */}
        {reviewable > 0 && (
          <p className="mb-4 text-xs text-gray-500">
            {reviewed} de {reviewable} revisadas
          </p>
        )}

        {/* Stable status tabs — always visible */}
        <div className="mb-5 flex flex-wrap gap-1.5">
          {STABLE_TABS.map(({ status, label }) => {
            const count = status === "all" ? jobs.length : (statusCounts[status] ?? 0);
            const isActive = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : count === 0
                    ? "border border-gray-200 bg-white text-gray-300"
                    : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label} ({count})
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

        {/* Jobs grid — or empty state */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            {jobs.length === 0 ? (
              <>
                <p className="text-gray-500 font-medium">Nenhum processamento iniciado.</p>
                <p className="mt-1 text-sm text-gray-400">
                  Clique em &quot;Iniciar processamento&quot; para começar.
                </p>
              </>
            ) : statusFilter === "READY" ? (
              <>
                <p className="text-gray-500 font-medium">Nenhuma foto pronta para revisão no momento.</p>
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                >
                  Ver todas
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-400">Nenhuma foto nesta etapa.</p>
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Ver todas
                </button>
              </>
            )}
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
