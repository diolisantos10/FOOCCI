"use client";

import { useState, useRef, useCallback } from "react";
import { CUSTOMER_PROFILES } from "./profiles";
import { validateStep, buildReport, toCsv, toSummaryText, IMPROVEMENT_SUGGESTIONS } from "./engine";
import type {
  CustomerProfile,
  CatalogItem,
  CartItem,
  ScenarioResult,
  ScenarioStep,
  AutoPilotReport,
  AutoPilotStatus,
  FailureType,
} from "./types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  slug:           string;
  catalog:        CatalogItem[];
  restaurantName: string;
}

// ── Speed options ─────────────────────────────────────────────────────────────

const SPEED_OPTIONS: { label: string; ms: number }[] = [
  { label: "Rápido",  ms: 500  },
  { label: "Normal",  ms: 900  },
  { label: "Devagar", ms: 1800 },
];

// ── API helper ────────────────────────────────────────────────────────────────

async function callWaiterApi(
  slug:        string,
  event:       string,
  message:     string,
  history:     { role: string; content: string }[],
  cart:        CartItem[],
  lastAddedId?: string,
) {
  const body: Record<string, unknown> = {
    event, message, history,
    cart:  cart.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
    stage: "BROWSE",
  };
  if (lastAddedId) body.lastAddedId = lastAddedId;

  const res = await fetch(`/api/pedido/${encodeURIComponent(slug)}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const d    = json.data ?? json;
  return {
    reply:   typeof d.reply   === "string" ? d.reply                     : "",
    cards:   Array.isArray(d.cards)        ? (d.cards   as string[])     : [],
    options: Array.isArray(d.options)      ? (d.options as { label: string; value: string }[]) : [],
    mode:    typeof d.mode    === "string" ? d.mode                      : "BROWSE",
  };
}

// ── Scenario runner ───────────────────────────────────────────────────────────

async function runScenario(
  profile:     CustomerProfile,
  slug:        string,
  catalogIds:  Set<string>,
  firstItem:   CatalogItem | null,
  stepDelay:   number,
  stopRef:     React.MutableRefObject<boolean>,
  onStep:      (step: ScenarioStep) => void,
): Promise<ScenarioResult> {
  const t0       = Date.now();
  const steps:   ScenarioStep[]             = [];
  const history: { role: string; content: string }[] = [];
  const cart:    CartItem[]                 = [];
  const allCards:    string[] = [];
  const allMessages: string[] = [];
  const allFailures: FailureType[] = [];
  let checkoutReached = false;
  let orderConfirmed  = false;

  // Build step sequence
  type StepDef = { event: string; message: string; requireCards: boolean; lastAddedId?: string };
  const seq: StepDef[] = [
    { event: "ON_ENTRY", message: "", requireCards: false },
  ];

  // Indecisive / passive profiles get an idle prompt before messages
  if (profile.behavior === "indecisive" || profile.behavior === "passive") {
    seq.push({ event: "ON_IDLE", message: "", requireCards: false });
  }

  // Intent messages
  profile.intentMessages.forEach((msg, i) => {
    const isLast = i === profile.intentMessages.length - 1;
    seq.push({
      event:        "ON_USER_MESSAGE",
      message:      msg,
      requireCards: isLast && profile.requiresCart && catalogIds.size > 0,
    });
  });

  // Cart addition
  if (profile.requiresCart && firstItem) {
    seq.push({
      event:        "ON_ITEM_ADDED",
      message:      "",
      requireCards: false,
      lastAddedId:  firstItem.id,
    });
  }

  // Checkout flow
  if (profile.requiresCheckout) {
    seq.push({ event: "ON_CHECKOUT_STARTED", message: "", requireCards: false });
    seq.push({ event: "AFTER_CHECKOUT",       message: "", requireCards: false });
  }

  // Execute
  for (let i = 0; i < seq.length; i++) {
    if (stopRef.current) break;

    const def = seq[i];
    if (!def) break;
    const { event, message, requireCards, lastAddedId } = def;
    const t1 = Date.now();

    let response: { reply: string; cards: string[]; options: { label: string; value: string }[]; mode: string } | null = null;
    let stepFailures: FailureType[] = [];
    let stepAssertions: { label: string; pass: boolean; detail?: string }[] = [];

    try {
      response = await callWaiterApi(slug, event, message, history, cart, lastAddedId);

      if (message)         history.push({ role: "user",      content: message        });
      if (response.reply)  history.push({ role: "assistant", content: response.reply });

      if (event === "ON_ITEM_ADDED" && firstItem) {
        const existing = cart.find((c) => c.id === firstItem.id);
        if (existing) existing.qty += 1;
        else          cart.push({ ...firstItem, qty: 1 });
      }

      allMessages.push(response.reply);
      allCards.push(...response.cards);
      if (event === "ON_CHECKOUT_STARTED") checkoutReached = true;
      if (event === "AFTER_CHECKOUT")       orderConfirmed  = true;

      const v = validateStep(event, response, catalogIds, requireCards);
      stepAssertions = v.assertions;
      stepFailures   = v.failureTypes;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const ft: FailureType = msg.startsWith("HTTP 429") ? "timeout" : "unknown_error";
      stepFailures   = [ft];
      stepAssertions = [{ label: `Erro na API: ${msg.slice(0, 100)}`, pass: false }];
    }

    allFailures.push(...stepFailures);

    const step: ScenarioStep = {
      stepIndex:    i,
      event,
      message,
      response,
      assertions:   stepAssertions,
      passed:       stepFailures.length === 0,
      failureTypes: stepFailures,
      durationMs:   Date.now() - t1,
    };

    steps.push(step);
    onStep(step);

    if (i < seq.length - 1 && !stopRef.current) {
      await new Promise((r) => setTimeout(r, stepDelay));
    }
  }

  // Checkout not reached but required
  if (profile.requiresCheckout && !checkoutReached) {
    allFailures.push("checkout_not_reached");
  }
  if (profile.requiresCheckout && checkoutReached && !orderConfirmed) {
    allFailures.push("order_not_confirmed");
  }

  const unique = [...new Set(allFailures)];
  return {
    profileId:   profile.id,
    profileName: profile.name,
    goal:        profile.goal,
    status:      unique.length === 0 ? "PASS" : "FAIL",
    stepsRun:    steps.length,
    failures:    unique,
    steps,
    waiterMessages:         allMessages.filter(Boolean),
    cardsShown:             allCards,
    cartFinal:              [...cart],
    checkoutReached,
    orderConfirmed,
    improvementSuggestions: unique.map((f) => IMPROVEMENT_SUGGESTIONS[f]).filter(Boolean),
    durationMs:             Date.now() - t0,
  };
}

// ── Download helper ───────────────────────────────────────────────────────────

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-green-400" :
    score >= 50 ? "text-amber-400" : "text-red-400";
  return (
    <span className={`text-4xl font-bold tabular-nums ${color}`}>
      {score}<span className="text-lg text-gray-600">/100</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "PASS"    ? "bg-green-900 text-green-300" :
    status === "FAIL"    ? "bg-red-900   text-red-300"   :
    status === "running" ? "bg-amber-900 text-amber-300 animate-pulse" :
                           "bg-gray-800  text-gray-400";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${cls}`}>
      {status}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AutoPilotPanel({ slug, catalog, restaurantName }: Props) {
  const [status,          setStatus]          = useState<AutoPilotStatus>("idle");
  const [selectedIds,     setSelectedIds]      = useState<Set<string>>(
    new Set(CUSTOMER_PROFILES.map((p) => p.id)),
  );
  const [speedIdx,        setSpeedIdx]         = useState(1);  // Normal
  const [profileIdx,      setProfileIdx]       = useState(0);
  const [currentStepLabel, setCurrentStepLabel] = useState("");
  const [currentSteps,    setCurrentSteps]     = useState<ScenarioStep[]>([]);
  const [results,         setResults]          = useState<ScenarioResult[]>([]);
  const [report,          setReport]           = useState<AutoPilotReport | null>(null);
  const [expandedResult,  setExpandedResult]   = useState<string | null>(null);
  const stopRef = useRef(false);

  const catalogIds = new Set(catalog.map((c) => c.id));
  const firstItem  = catalog[0] ?? null;
  const stepDelay  = SPEED_OPTIONS[speedIdx]?.ms ?? 900;

  // ── Runner ──────────────────────────────────────────────────────────────────

  const runAutoPilot = useCallback(async () => {
    const toRun = CUSTOMER_PROFILES.filter((p) => selectedIds.has(p.id));
    if (toRun.length === 0) return;

    stopRef.current = false;
    setStatus("running");
    setResults([]);
    setReport(null);
    setCurrentSteps([]);

    const accumulated: ScenarioResult[] = [];

    for (let i = 0; i < toRun.length; i++) {
      if (stopRef.current) break;

      setProfileIdx(i);
      setCurrentStepLabel("Iniciando…");
      setCurrentSteps([]);

      const profile = toRun[i];
      if (!profile) continue;

      try {
        const result = await runScenario(
          profile, slug, catalogIds, firstItem, stepDelay, stopRef,
          (step) => {
            setCurrentStepLabel(
              `${step.event}${step.message ? `: "${step.message.slice(0, 40)}"` : ""}`,
            );
            setCurrentSteps((prev) => [...prev, step]);
          },
        );
        accumulated.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        accumulated.push({
          profileId:   profile.id,
          profileName: profile.name,
          goal:        profile.goal,
          status:      "ERROR",
          stepsRun:    0,
          failures:    ["unknown_error"],
          steps:       [],
          waiterMessages:         [],
          cardsShown:             [],
          cartFinal:              [],
          checkoutReached:        false,
          orderConfirmed:         false,
          improvementSuggestions: [IMPROVEMENT_SUGGESTIONS.unknown_error],
          durationMs:             0,
        });
        console.error("[AutoPilot] scenario error:", msg);
      }

      setResults([...accumulated]);
    }

    const finalReport = buildReport(accumulated, slug, restaurantName);
    setReport(finalReport);
    setStatus(stopRef.current ? "stopped" : "done");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, slug, catalog, restaurantName, stepDelay]);

  const stopAutoPilot = () => { stopRef.current = true; };

  const resetAll = () => {
    stopRef.current = true;
    setStatus("idle");
    setResults([]);
    setReport(null);
    setCurrentSteps([]);
    setCurrentStepLabel("");
  };

  const toggleProfile = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll  = () => setSelectedIds(new Set(CUSTOMER_PROFILES.map((p) => p.id)));
  const selectNone = () => setSelectedIds(new Set());

  const currentProfile = CUSTOMER_PROFILES.filter((p) => selectedIds.has(p.id))[profileIdx];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Left: Controls ──────────────────────────────────────────────────── */}
      <div className="flex w-52 shrink-0 flex-col border-r border-gray-800 overflow-y-auto">

        {/* Profile selector */}
        <div className="border-b border-gray-800 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-gray-600">Perfis</span>
            <span className="flex gap-2">
              <button onClick={selectAll}  className="text-[9px] text-gray-600 hover:text-amber-400">todos</button>
              <button onClick={selectNone} className="text-[9px] text-gray-600 hover:text-red-400">nenhum</button>
            </span>
          </div>
          <div className="space-y-1">
            {CUSTOMER_PROFILES.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-start gap-1.5">
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleProfile(p.id)}
                  className="mt-px shrink-0 accent-amber-500"
                />
                <span className="text-[10px] leading-snug text-gray-400">{p.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[9px] text-gray-700">
            {selectedIds.size}/{CUSTOMER_PROFILES.length} selecionados
          </p>
        </div>

        {/* Speed */}
        <div className="border-b border-gray-800 px-3 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-widest text-gray-600">Velocidade</div>
          <div className="flex gap-1">
            {SPEED_OPTIONS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setSpeedIdx(i)}
                className={`flex-1 rounded border px-1 py-0.5 text-[9px] transition-colors ${
                  speedIdx === i
                    ? "border-amber-600 text-amber-300"
                    : "border-gray-800 text-gray-600 hover:border-gray-700 hover:text-gray-400"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-0.5 text-[9px] text-gray-700">{stepDelay}ms entre passos</p>
        </div>

        {/* Controls */}
        <div className="border-b border-gray-800 px-3 py-2 space-y-1.5">
          <button
            onClick={() => void runAutoPilot()}
            disabled={status === "running" || selectedIds.size === 0 || catalog.length === 0}
            className="w-full rounded bg-amber-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ▶ Run AutoPilot
          </button>
          <button
            onClick={stopAutoPilot}
            disabled={status !== "running"}
            className="w-full rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-500 hover:border-red-700 hover:text-red-400 disabled:opacity-30"
          >
            ■ Stop
          </button>
          <button
            onClick={resetAll}
            disabled={status === "running"}
            className="w-full rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-500 hover:border-gray-600 hover:text-gray-300 disabled:opacity-30"
          >
            ↺ Reset Results
          </button>
          {catalog.length === 0 && (
            <p className="text-[9px] text-red-500">Catálogo não carregado</p>
          )}
        </div>

        {/* Export */}
        {report && (
          <div className="px-3 py-2 space-y-1">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-gray-600">Exportar</div>
            <button
              onClick={() =>
                download(
                  JSON.stringify(report, null, 2),
                  `waiter-lab-${slug}-${Date.now()}.json`,
                  "application/json",
                )
              }
              className="w-full rounded border border-gray-700 px-2 py-1 text-left text-[10px] text-gray-500 hover:border-amber-700 hover:text-amber-400"
            >
              ⬇ JSON
            </button>
            <button
              onClick={() =>
                download(
                  toCsv(report),
                  `waiter-lab-${slug}-${Date.now()}.csv`,
                  "text/csv",
                )
              }
              className="w-full rounded border border-gray-700 px-2 py-1 text-left text-[10px] text-gray-500 hover:border-amber-700 hover:text-amber-400"
            >
              ⬇ CSV
            </button>
            <button
              onClick={() =>
                download(
                  toSummaryText(report),
                  `waiter-lab-${slug}-${Date.now()}.txt`,
                  "text/plain",
                )
              }
              className="w-full rounded border border-gray-700 px-2 py-1 text-left text-[10px] text-gray-500 hover:border-amber-700 hover:text-amber-400"
            >
              ⬇ Sumário TXT
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Live progress + Report ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* ── Idle state ──────────────────────────────────────────────────── */}
        {status === "idle" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-6">
            <span className="text-3xl">🤖</span>
            <p className="text-sm font-semibold text-gray-400">AutoPilot pronto</p>
            <p className="max-w-xs text-[11px] text-gray-600">
              {selectedIds.size} perfis selecionados · catálogo: {catalog.length} itens
            </p>
            <p className="text-[10px] text-gray-700">
              Clique <span className="text-amber-500">▶ Run AutoPilot</span> para iniciar
            </p>
          </div>
        )}

        {/* ── Running: Live progress ───────────────────────────────────────── */}
        {status === "running" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header bar */}
            <div className="shrink-0 border-b border-gray-800 px-3 py-2">
              <div className="flex items-center gap-2">
                <StatusBadge status="running" />
                <span className="text-[11px] font-semibold text-gray-300">
                  {currentProfile?.name ?? "…"}
                </span>
                <span className="text-[10px] text-gray-600">
                  {profileIdx + 1}/{selectedIds.size}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-gray-600">{currentStepLabel}</p>
            </div>

            {/* Completed scenarios */}
            <div className="shrink-0 border-b border-gray-800 px-3 py-1.5">
              <div className="flex flex-wrap gap-1">
                {results.map((r) => (
                  <span
                    key={r.profileId}
                    title={r.profileName}
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                      r.status === "PASS" ? "bg-green-900 text-green-300" :
                      r.status === "FAIL" ? "bg-red-900   text-red-300"   :
                                            "bg-gray-800  text-gray-500"
                    }`}
                  >
                    {r.status === "PASS" ? "✓" : "✗"} {r.profileName.split(" ").slice(-1)}
                  </span>
                ))}
              </div>
            </div>

            {/* Live step list */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-gray-600">
                Passos — {currentProfile?.name ?? ""}
              </div>
              <div className="space-y-1.5">
                {currentSteps.map((step, i) => (
                  <div key={i} className={`rounded border px-2 py-1.5 ${
                    step.passed ? "border-green-900 bg-green-950/20" : "border-red-900 bg-red-950/20"
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <span className={step.passed ? "text-green-400" : "text-red-400"}>
                        {step.passed ? "✓" : "✗"}
                      </span>
                      <span className="text-[10px] font-mono text-gray-400">
                        {step.event}
                      </span>
                      {step.message && (
                        <span className="truncate text-[9px] text-gray-600">
                          "{step.message.slice(0, 50)}"
                        </span>
                      )}
                      <span className="ml-auto text-[9px] text-gray-700">{step.durationMs}ms</span>
                    </div>
                    {step.response && (
                      <div className="mt-0.5 flex gap-2 text-[9px] text-gray-600">
                        <span>mode: <span className="text-gray-400">{step.response.mode}</span></span>
                        <span>cards: <span className="text-gray-400">{step.response.cards.length}</span></span>
                        <span>opts: <span className="text-gray-400">{step.response.options.length}</span></span>
                      </div>
                    )}
                    {!step.passed && step.failureTypes.length > 0 && (
                      <div className="mt-0.5 text-[9px] text-red-500">
                        {step.failureTypes.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
                {currentSteps.length === 0 && (
                  <div className="animate-pulse text-[10px] text-gray-700">Aguardando primeiro passo…</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Done / Stopped: Report ───────────────────────────────────────── */}
        {(status === "done" || status === "stopped") && report && (
          <div className="flex flex-1 flex-col overflow-hidden">

            {/* Score header */}
            <div className="shrink-0 border-b border-gray-800 px-4 py-3">
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-center">
                  <ScoreRing score={report.score} />
                  <span className="mt-0.5 text-[9px] uppercase tracking-wide text-gray-600">Score</span>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                  <div>
                    <span className="text-green-400 font-bold">{report.passed}</span>
                    <span className="ml-1 text-gray-600">passou</span>
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">{report.failed}</span>
                    <span className="ml-1 text-gray-600">falhou</span>
                  </div>
                  <div>
                    <span className="text-gray-300 font-bold">{report.totalScenarios}</span>
                    <span className="ml-1 text-gray-600">total</span>
                  </div>
                  <div>
                    <span className="text-amber-300 font-bold">{report.conversionRate}%</span>
                    <span className="ml-1 text-gray-600">checkout</span>
                  </div>
                  <div>
                    <span className="text-gray-300 font-bold">{report.avgTurns}</span>
                    <span className="ml-1 text-gray-600">turnos avg</span>
                  </div>
                  <div>
                    <span className="text-gray-300 font-bold">{report.avgCardsReturned}</span>
                    <span className="ml-1 text-gray-600">cards avg</span>
                  </div>
                </div>
                {status === "stopped" && (
                  <span className="ml-auto text-[10px] text-amber-500">Interrompido</span>
                )}
              </div>

              {/* Recommendations */}
              {report.recommendations.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {report.recommendations.map((r, i) => (
                    <p key={i} className="text-[10px] text-amber-300">
                      {i + 1}. {r}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Failure type summary */}
            {Object.keys(report.failureTypes).length > 0 && (
              <div className="shrink-0 border-b border-gray-800 px-3 py-2">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-gray-600">Falhas detectadas</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(report.failureTypes)
                    .sort(([, a], [, b]) => b - a)
                    .map(([ft, count]) => (
                      <span
                        key={ft}
                        title={IMPROVEMENT_SUGGESTIONS[ft as FailureType]}
                        className="rounded bg-red-950/40 px-1.5 py-0.5 text-[9px] text-red-400"
                      >
                        {ft} ×{count}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Scenario results */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <div className="mb-1.5 text-[10px] uppercase tracking-widest text-gray-600">Cenários</div>
              <div className="space-y-2">
                {report.scenarioResults.map((r) => (
                  <div
                    key={r.profileId}
                    className={`rounded border ${
                      r.status === "PASS"
                        ? "border-green-900 bg-green-950/10"
                        : "border-red-900 bg-red-950/10"
                    }`}
                  >
                    {/* Scenario header */}
                    <button
                      onClick={() =>
                        setExpandedResult(expandedResult === r.profileId ? null : r.profileId)
                      }
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                    >
                      <StatusBadge status={r.status} />
                      <span className="flex-1 text-[11px] font-semibold text-gray-300">
                        {r.profileName}
                      </span>
                      <span className="text-[9px] text-gray-600">
                        {r.stepsRun} turnos · {r.cardsShown.length} cards
                        {r.checkoutReached ? " · checkout ✓" : ""}
                      </span>
                      <span className="text-[10px] text-gray-700">
                        {expandedResult === r.profileId ? "▲" : "▼"}
                      </span>
                    </button>

                    {/* Expanded detail */}
                    {expandedResult === r.profileId && (
                      <div className="border-t border-gray-800 px-2 py-2 space-y-1.5">
                        <p className="text-[10px] text-gray-500">Objetivo: {r.goal}</p>

                        {r.failures.length > 0 && (
                          <div>
                            <p className="text-[9px] text-red-500 font-semibold mb-0.5">
                              Falhas: {r.failures.join(", ")}
                            </p>
                            {r.improvementSuggestions.map((s, i) => (
                              <p key={i} className="text-[9px] text-amber-400">↳ {s}</p>
                            ))}
                          </div>
                        )}

                        {/* Step breakdown */}
                        <div className="space-y-1">
                          {r.steps.map((step, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-[9px]">
                              <span className={step.passed ? "text-green-400" : "text-red-400"}>
                                {step.passed ? "✓" : "✗"}
                              </span>
                              <span className="font-mono text-gray-500">{step.event}</span>
                              {step.message && (
                                <span className="truncate text-gray-600">
                                  "{step.message.slice(0, 40)}"
                                </span>
                              )}
                              {step.response && (
                                <span className="ml-auto shrink-0 text-gray-700">
                                  {step.response.mode} · {step.response.cards.length}c
                                </span>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Waiter messages */}
                        {r.waiterMessages.length > 0 && (
                          <div>
                            <p className="text-[9px] text-gray-600 mb-0.5">Mensagens do Waiter:</p>
                            {r.waiterMessages.map((m, i) => (
                              <p key={i} className="text-[9px] text-gray-400 italic">
                                "{m.slice(0, 100)}{m.length > 100 ? "…" : ""}"
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
