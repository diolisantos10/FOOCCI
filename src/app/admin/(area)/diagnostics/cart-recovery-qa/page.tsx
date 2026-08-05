"use client";

import { useState, useCallback } from "react";
import { DiagnosticReportActions } from "@/components/admin/DiagnosticReportActions";
import { buildDiagnosticReportText } from "@/lib/admin/diagnosticReport";

// ── Types ─────────────────────────────────────────────────────────────────────

interface QAStep {
  step:   string;
  status: "pass" | "fail" | "skip" | "warn";
  detail: string;
  data?:  Record<string, unknown>;
}

interface RecoverySendResult {
  checked:                 number;
  eligible:                number;
  sent:                    number;
  skippedNoPhone:          number;
  skippedAlreadySent:      number;
  skippedDailyLimit:       number;
  skippedOrderedAfter:     number;
  skippedPendingPayment:   number;
  skippedNoConfig:         number;
  skippedRestaurantClosed: number;
  failed:                  number;
  dryRun:                  boolean;
  inactivityMinutes:       number;
  durationMs:              number;
  skipReason?:             string;
}

interface LiveTestOutcome {
  accepted: boolean;
  detail:            string;
  externalMessageId?: string;
}

interface SchedulerState {
  wouldStart:   boolean;
  NODE_ENV:     string;
  NEXT_RUNTIME: string;
  note:         string;
}

interface QAResponse {
  ok:           boolean;
  queriedAt:    string;
  durationMs:   number;
  slug:         string;
  phoneMasked:  string | null;
  mode:         "dryRun" | "liveTest";
  verdict:      "PASS" | "FAIL" | "PARTIAL";
  failedStep:   string | null;
  failReason:   string | null;
  summary:      { passed: number; failed: number; warned: number; skipped: number; total: number };
  steps:        QAStep[];
  dryRunResult:   RecoverySendResult | null;
  liveTestResult: LiveTestOutcome | null;
  schedulerState: SchedulerState | null;
}

// ── Step status icon + colors ──────────────────────────────────────────────────

const STATUS_ICON: Record<QAStep["status"], string> = {
  pass: "✅",
  fail: "❌",
  warn: "⚠️",
  skip: "⏭️",
};

const STATUS_ROW_CLASS: Record<QAStep["status"], string> = {
  pass: "border-green-800/60 bg-green-950/20",
  fail: "border-red-800/60   bg-red-950/30",
  warn: "border-yellow-800/60 bg-yellow-950/20",
  skip: "border-gray-800     bg-transparent opacity-50",
};

const STATUS_DETAIL_CLASS: Record<QAStep["status"], string> = {
  pass: "text-green-200",
  fail: "text-red-300",
  warn: "text-yellow-200",
  skip: "text-gray-500",
};

const VERDICT_STYLES = {
  PASS:    "bg-green-900/50 border-green-600 text-green-200",
  FAIL:    "bg-red-900/50   border-red-700   text-red-200",
  PARTIAL: "bg-yellow-900/40 border-yellow-700 text-yellow-200",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StepRow({ step }: { step: QAStep }) {
  const [open, setOpen] = useState(false);
  const hasData = step.data && Object.keys(step.data).length > 0;

  return (
    <div className={`rounded-lg border px-3 py-2 ${STATUS_ROW_CLASS[step.status]}`}>
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5 shrink-0">{STATUS_ICON[step.status]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-[10px] font-mono text-gray-400 bg-gray-800/60 rounded px-1.5 py-0.5">
              {step.step}
            </code>
            {hasData && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
              >
                {open ? "ocultar dados" : "ver dados"}
              </button>
            )}
          </div>
          <p className={`mt-1 text-xs leading-relaxed ${STATUS_DETAIL_CLASS[step.status]}`}>
            {step.detail}
          </p>
          {open && hasData && (
            <pre className="mt-2 overflow-x-auto rounded bg-gray-950 border border-gray-800 p-2 text-[10px] text-gray-300 font-mono leading-relaxed">
              {JSON.stringify(step.data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function DryRunGrid({ r }: { r: RecoverySendResult }) {
  const cells: [string, number | string | boolean, string?][] = [
    ["checked",        r.checked,        r.checked === 0 ? "text-gray-500" : "text-white"],
    ["eligible",       r.eligible,       r.eligible > 0 ? "text-green-300" : "text-gray-400"],
    ["sent (dryRun)",  r.sent,           r.sent > 0 ? "text-green-300" : "text-gray-400"],
    ["failed",         r.failed,         r.failed > 0 ? "text-red-400" : "text-gray-400"],
    ["no phone",       r.skippedNoPhone, r.skippedNoPhone > 0 ? "text-red-400" : "text-gray-500"],
    ["daily limit",    r.skippedDailyLimit, r.skippedDailyLimit > 0 ? "text-yellow-400" : "text-gray-500"],
    ["ordered after",  r.skippedOrderedAfter, r.skippedOrderedAfter > 0 ? "text-yellow-400" : "text-gray-500"],
    ["pending pay",    r.skippedPendingPayment, r.skippedPendingPayment > 0 ? "text-yellow-400" : "text-gray-500"],
    ["no config",      r.skippedNoConfig, r.skippedNoConfig > 0 ? "text-red-400" : "text-gray-500"],
    ["rest. closed",   r.skippedRestaurantClosed, r.skippedRestaurantClosed > 0 ? "text-yellow-400" : "text-gray-500"],
    ["inactivity min", r.inactivityMinutes, "text-gray-400"],
    ["duration ms",    r.durationMs, "text-gray-400"],
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
      {cells.map(([label, value, cls]) => (
        <div key={label} className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`text-lg font-bold font-mono leading-tight mt-0.5 ${cls ?? "text-white"}`}>
            {String(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CartRecoveryQAPage() {
  const [slug,              setSlug]             = useState("sushi-cazza");
  const [phone,             setPhone]            = useState("+5511940595223");
  const [inactivityMinutes, setInactivityMinutes] = useState("2");
  const [loading,           setLoading]          = useState(false);
  const [result,            setResult]           = useState<QAResponse | null>(null);
  const [error,             setError]            = useState<string | null>(null);
  const [confirmLive,       setConfirmLive]      = useState(false);

  const buildReport = useCallback(() => {
    if (!result) return "";
    const dr = result.dryRunResult;
    return buildDiagnosticReportText({
      tool:        "QA — Cart Recovery",
      slug:        result.slug,
      phone:       result.phoneMasked ?? undefined,
      mode:        result.mode,
      verdict:     result.verdict,
      diagnosis:   result.failedStep ? `Falhou em: ${result.failedStep}${result.failReason ? ` — ${result.failReason}` : ""}` : "Todos os passos passaram",
      recommendation: result.verdict === "PASS" ? "Pipeline de recuperação funcional." : "Revisar passo com falha antes do próximo deploy.",
      inputs:      {
        slug:              result.slug,
        mode:              result.mode,
        inactivityMinutes: dr?.inactivityMinutes ?? "—",
      },
      sections: [
        {
          title: "Resumo dos passos",
          rows: [
            { label: "passed",  value: result.summary.passed },
            { label: "failed",  value: result.summary.failed },
            { label: "warned",  value: result.summary.warned },
            { label: "skipped", value: result.summary.skipped },
          ],
        },
        ...(dr ? [{
          title: "Dry-run",
          rows: [
            { label: "checked",       value: dr.checked },
            { label: "eligible",      value: dr.eligible },
            { label: "no phone",      value: dr.skippedNoPhone },
            { label: "no config",     value: dr.skippedNoConfig },
            { label: "daily limit",   value: dr.skippedDailyLimit },
            { label: "ordered after", value: dr.skippedOrderedAfter },
            { label: "pending pay",   value: dr.skippedPendingPayment },
            { label: "rest. closed",  value: dr.skippedRestaurantClosed },
            { label: "duration ms",   value: dr.durationMs },
          ],
        }] : []),
        {
          title: "Etapas",
          rows: result.steps.map((s) => ({ label: s.step, value: `${s.status.toUpperCase()} — ${s.detail}` })),
        },
      ],
    });
  }, [result]);

  const runQA = useCallback(async (live: boolean) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setConfirmLive(false);

    try {
      const params = new URLSearchParams({
        slug:              slug.trim(),
        inactivityMinutes: inactivityMinutes.trim() || "2",
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(live ? { liveTest: "true" } : {}),
      });

      const res = await fetch(`/api/admin/diagnostics/cart-recovery-qa?${params.toString()}`);

      if (res.status === 401 || res.status === 403) {
        setError("Sessão expirada ou sem permissão — faça login novamente em /admin/login.");
        return;
      }

      const json = await res.json() as QAResponse & { error?: string };

      if (json.error) {
        setError(json.error);
        return;
      }

      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [slug, phone, inactivityMinutes]);

  const { verdict, summary, steps, dryRunResult, liveTestResult, schedulerState } = result ?? {};

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">QA — Cart Recovery</h1>
        <p className="mt-1 text-sm text-gray-400">
          Prova determinística do pipeline completo: WhatsApp → waToken → draft → recuperação.
          Não depende do restaurante estar aberto, do cliente enviar mensagem, nem de resetar draft manualmente.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="qa-slug" className="text-xs font-medium text-gray-400">
              Slug do restaurante
            </label>
            <input
              id="qa-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="sushi-cazza"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="qa-phone" className="text-xs font-medium text-gray-400">
              Telefone de teste (E.164)
            </label>
            <input
              id="qa-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+5511999990000"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="qa-inactivity" className="text-xs font-medium text-gray-400">
              Inatividade (minutos)
            </label>
            <input
              id="qa-inactivity"
              type="number"
              min={1}
              max={60}
              value={inactivityMinutes}
              onChange={(e) => setInactivityMinutes(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => void runQA(false)}
            disabled={loading || !slug.trim()}
            className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            {loading && !confirmLive ? "Rodando…" : "Rodar QA (dry-run)"}
          </button>

          {!confirmLive ? (
            <button
              type="button"
              onClick={() => setConfirmLive(true)}
              disabled={loading || !slug.trim() || !phone.trim()}
              className="rounded-lg border border-orange-700 bg-orange-900/40 hover:bg-orange-800/50 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-orange-200 transition-colors"
            >
              Rodar teste real (WhatsApp)
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-orange-600 bg-orange-950/50 px-3 py-2">
              <span className="text-xs text-orange-300">
                Isso vai enviar uma mensagem WhatsApp real para {phone.trim() || "(telefone vazio)"}. Confirma?
              </span>
              <button
                type="button"
                onClick={() => void runQA(true)}
                disabled={loading}
                className="rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white transition-colors"
              >
                {loading ? "Enviando…" : "Confirmar envio"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLive(false)}
                className="rounded bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-xs text-gray-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        <p className="text-[11px] text-gray-600">
          dry-run: nenhuma mensagem enviada • teste real: envia apenas para o telefone de teste acima
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Results */}
      {result && verdict && summary && (
        <>
          {/* Export */}
          <DiagnosticReportActions
            buildReport={buildReport}
            jsonData={result}
            filenamePrefix="cart-recovery-qa"
            slug={result.slug}
            ranAt={result.queriedAt}
          />

          {/* Verdict + summary */}
          <div className="flex items-start gap-4 flex-wrap">
            <div className={`rounded-xl border-2 px-5 py-3 font-bold text-2xl tracking-wide ${VERDICT_STYLES[verdict]}`}>
              {verdict === "PASS" ? "✅ PASS" : verdict === "FAIL" ? "❌ FAIL" : "⚠️ PARTIAL"}
            </div>
            <div className="flex-1 rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-green-300">{summary.passed} passed</span>
                <span className={summary.failed > 0 ? "text-red-300 font-semibold" : "text-gray-600"}>{summary.failed} failed</span>
                <span className={summary.warned > 0 ? "text-yellow-300" : "text-gray-600"}>{summary.warned} warned</span>
                <span className="text-gray-600">{summary.skipped} skipped</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>slug: <code className="text-gray-300">{result.slug}</code></span>
                {result.phoneMasked && <span>phone: <code className="text-gray-300">{result.phoneMasked}</code></span>}
                <span>mode: <code className={result.mode === "liveTest" ? "text-orange-300" : "text-gray-300"}>{result.mode}</code></span>
                <span>ms: <code className="text-gray-300">{result.durationMs}</code></span>
                <span>at: <code className="text-gray-300">{new Date(result.queriedAt).toLocaleString("pt-BR")}</code></span>
              </div>
              {result.failedStep && (
                <p className="mt-2 text-xs text-red-300">
                  Falhou em: <code className="font-mono bg-gray-800 rounded px-1">{result.failedStep}</code>
                  {result.failReason && <> — {result.failReason}</>}
                </p>
              )}
            </div>
          </div>

          {/* Steps checklist */}
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Checklist de etapas
            </h2>
            <div className="space-y-1.5">
              {steps!.map((s, i) => (
                <StepRow key={i} step={s} />
              ))}
            </div>
          </section>

          {/* dryRunResult */}
          {dryRunResult && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Resultado do dryRun
                {dryRunResult.skipReason && (
                  <code className="ml-2 text-yellow-300 bg-gray-800 rounded px-1.5 py-0.5">
                    {dryRunResult.skipReason}
                  </code>
                )}
              </h2>
              <DryRunGrid r={dryRunResult} />
            </section>
          )}

          {/* liveTestResult */}
          {liveTestResult && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Resultado do envio real
              </h2>
              <div className={`rounded-lg border px-4 py-3 text-sm ${
                liveTestResult.accepted
                  ? "border-green-700 bg-green-950/30 text-green-200"
                  : "border-yellow-700 bg-yellow-950/30 text-yellow-200"
              }`}>
                <div className="flex items-center gap-2">
                  <span>{liveTestResult.accepted ? "✅" : "⚠️"}</span>
                  <span>{liveTestResult.detail}</span>
                </div>
                {liveTestResult.externalMessageId && (
                  <p className="mt-1 text-xs text-gray-400">
                    ID da mensagem na Meta:{" "}
                    <code className="font-mono text-gray-300">{liveTestResult.externalMessageId}</code>
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Scheduler state */}
          {schedulerState && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Estado do scheduler
              </h2>
              <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3 text-xs space-y-2">
                <div className="flex items-center gap-3">
                  <span className={`font-semibold ${schedulerState.wouldStart ? "text-green-300" : "text-yellow-300"}`}>
                    {schedulerState.wouldStart ? "✅ Scheduler ativo" : "⚠️ Scheduler inativo"}
                  </span>
                  <code className="text-gray-500">NODE_ENV={schedulerState.NODE_ENV}</code>
                  <code className="text-gray-500">NEXT_RUNTIME={schedulerState.NEXT_RUNTIME}</code>
                </div>
                <p className="text-gray-400 leading-relaxed">{schedulerState.note}</p>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
