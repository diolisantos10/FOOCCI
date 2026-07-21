"use client";

import { useState, useCallback } from "react";
import type {
  SimulationReport,
  ScenarioResult,
  CheckResult,
  SalesMetrics,
  CartSnapshot,
  TestDepth,
  SimStage,
} from "@/services/ai/AISimulatorService";
import type {
  RealConversationReport,
  ClassifiedConversation,
  ConversationPattern,
  ConversationClass,
} from "@/services/ai/RealConversationService";
import type { ParsedPrompt } from "@/services/ai/PromptParser";
import { AutoSimulatorPanel } from "./AutoSimulatorPanel";

// ─── types ────────────────────────────────────────────────────

type RunState = "idle" | "running" | "done" | "error";

interface ProgressInfo {
  current:      number;
  total:        number;
  scenarioName: string;
}

// ─── main client ──────────────────────────────────────────────

type ActiveTab = "standard" | "lab" | "auto" | "real";

const SCENARIO_PRESETS = [
  { label: "Rápido (5 cenários)",   value: 5  },
  { label: "Padrão (10 cenários)",  value: 10 },
  { label: "Stress (20 cenários)",  value: 20 },
] as const;

const TEST_DEPTH_PRESETS: Array<{ label: string; value: TestDepth }> = [
  { label: "Descoberta",        value: "discovery"        },
  { label: "Primeiro item",     value: "first_item"       },
  { label: "Food expansion",    value: "food_expansion"   },
  { label: "Gatilho checkout",  value: "checkout_trigger" },
  { label: "Fluxo completo",    value: "full_checkout"    },
];

export function AISimulatorClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("standard");

  // ── standard tab state ──────────────────────────────────────
  const [state,         setState]         = useState<RunState>("idle");
  const [progress,      setProgress]      = useState<ProgressInfo | null>(null);
  const [results,       setResults]       = useState<ScenarioResult[]>([]);
  const [report,        setReport]        = useState<SimulationReport | null>(null);
  const [errMsg,        setErrMsg]        = useState<string>("");
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set());
  const [scenarioCount, setScenarioCount] = useState<number>(10);
  const [testDepth,     setTestDepth]     = useState<TestDepth>("full_checkout");

  const runSimulations = useCallback(async () => {
    setState("running");
    setProgress(null);
    setResults([]);
    setReport(null);
    setErrMsg("");
    setExpanded(new Set());

    try {
      const response = await fetch("/api/ai-simulator/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ scenarioCount, testDepth }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (event.type === "progress") {
              setProgress(event as unknown as ProgressInfo);
            } else if (event.type === "scenario_result") {
              setResults((prev) => [...prev, event.result as ScenarioResult]);
            } else if (event.type === "report") {
              setReport(event.report as SimulationReport);
              setState("done");
            } else if (event.type === "error") {
              setErrMsg(String(event.message));
              setState("error");
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch (err) {
      setErrMsg(String(err));
      setState("error");
    }
  }, [scenarioCount, testDepth]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">Simulador da IA de Vendas</h1>
            <p className="text-sm text-muted mt-1">
              Testa automaticamente a IA com perfis de clientes usando o cardápio e configuração reais.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-paper border border-line2 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab("standard")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "standard"
                ? "bg-blue-600 text-white"
                : "text-ink2 hover:text-ink hover:bg-[#FAFAF8]"
            }`}
          >
            Simulação Padrão
          </button>
          <button
            onClick={() => setActiveTab("lab")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === "lab"
                ? "bg-blue-600 text-white"
                : "text-ink2 hover:text-ink hover:bg-[#FAFAF8]"
            }`}
          >
            <span>⚗</span> Prompt Lab
          </button>
          <button
            onClick={() => setActiveTab("auto")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === "auto"
                ? "bg-blue-600 text-white"
                : "text-ink2 hover:text-ink hover:bg-[#FAFAF8]"
            }`}
          >
            <span>⏱</span> Auto
          </button>
          <button
            onClick={() => setActiveTab("real")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === "real"
                ? "bg-green-600 text-white"
                : "text-ink2 hover:text-ink hover:bg-[#FAFAF8]"
            }`}
          >
            <span>📊</span> Dados Reais
          </button>
        </div>

        {/* ─── Standard tab ──────────────────────────────────────── */}
        {activeTab === "standard" && (
          <>
            {/* Controls */}
            <div className="flex items-center justify-end gap-2">
              <div className="flex flex-col items-start gap-0.5">
                <label className="text-xs text-muted px-1">Profundidade</label>
                <select
                  value={testDepth}
                  onChange={(e) => setTestDepth(e.target.value as TestDepth)}
                  disabled={state === "running"}
                  className="px-3 py-2 bg-paper border border-line2 text-ink2 text-sm rounded-lg
                             hover:border-line2 disabled:opacity-50 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  {TEST_DEPTH_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <label className="text-xs text-muted px-1">Cenários</label>
                <select
                  value={scenarioCount}
                  onChange={(e) => setScenarioCount(Number(e.target.value))}
                  disabled={state === "running"}
                  className="px-3 py-2 bg-paper border border-line2 text-ink2 text-sm rounded-lg
                             hover:border-line2 disabled:opacity-50 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {SCENARIO_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {state === "done" && report && (
                <>
                  <button onClick={() => downloadJSON(report)} title="Baixar relatório completo (JSON)"
                    className="px-3 py-2 bg-paper border border-line2 text-ink2 text-xs font-medium rounded-lg
                               hover:bg-[#FAFAF8] hover:border-line2 transition-colors flex items-center gap-1.5">
                    ⬇ JSON
                  </button>
                  <button onClick={() => downloadSummary(report)} title="Baixar resumo legível (TXT)"
                    className="px-3 py-2 bg-paper border border-line2 text-ink2 text-xs font-medium rounded-lg
                               hover:bg-[#FAFAF8] hover:border-line2 transition-colors flex items-center gap-1.5">
                    ⬇ Resumo
                  </button>
                  <button onClick={() => downloadCSV(report)} title="Baixar tabela de resultados (CSV)"
                    className="px-3 py-2 bg-paper border border-line2 text-ink2 text-xs font-medium rounded-lg
                               hover:bg-[#FAFAF8] hover:border-line2 transition-colors flex items-center gap-1.5">
                    ⬇ CSV
                  </button>
                </>
              )}
              <button
                onClick={runSimulations}
                disabled={state === "running"}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg
                           hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors flex items-center gap-2"
              >
                {state === "running" ? (
                  <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Executando...</>
                ) : state === "done" ? "↺ Rodar novamente" : "▶ Rodar simulações"}
              </button>
            </div>

            <SimulationResultsPanel
              state={state}
              progress={progress}
              results={results}
              report={report}
              errMsg={errMsg}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              emptyLabel="Nenhuma simulação executada ainda"
              emptyHint='Clique em "Rodar simulações" para começar.'
            />
          </>
        )}

        {/* ─── Prompt Lab tab ────────────────────────────────────── */}
        {activeTab === "lab" && (
          <PromptLabPanel />
        )}

        {/* ─── Auto Simulator tab ─────────────────────────────────── */}
        {activeTab === "auto" && (
          <AutoSimulatorPanel />
        )}

        {/* ─── Real Data tab ──────────────────────────────────────── */}
        {activeTab === "real" && (
          <RealDataPanel />
        )}
      </div>
    </div>
  );
}

// ─── real data panel ─────────────────────────────────────────

const CLASS_CONFIG: Record<ConversationClass, { label: string; color: string; bg: string }> = {
  high_conversion: { label: "Alta conversão",  color: "text-green-700",  bg: "bg-green-50 border-green-200"  },
  low_conversion:  { label: "Baixa conversão", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  abandoned:       { label: "Abandonada",      color: "text-red-700",    bg: "bg-red-50 border-red-200"       },
  high_ticket:     { label: "Ticket alto",     color: "text-blue-700",   bg: "bg-blue-50 border-blue-200"     },
  low_ticket:      { label: "Ticket baixo",    color: "text-brand-700", bg: "bg-brand-50 border-brand-200" },
};

const PATTERN_ICON: Record<string, string> = {
  positive: "↑",
  negative: "↓",
  neutral:  "→",
};

function RealDataPanel() {
  const [loadState, setLoadState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [report,    setReport]    = useState<RealConversationReport | null>(null);
  const [errMsg,    setErrMsg]    = useState<string>("");
  const [limit,     setLimit]     = useState<number>(50);

  const load = useCallback(async () => {
    setLoadState("loading");
    setReport(null);
    setErrMsg("");
    try {
      const res = await fetch(`/api/ai-simulator/real-data?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as RealConversationReport;
      setReport(data);
      setLoadState("done");
    } catch (err) {
      setErrMsg(String(err));
      setLoadState("error");
    }
  }, [limit]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-end gap-3 justify-end">
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-muted px-1">Conversas analisadas</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            disabled={loadState === "loading"}
            className="px-3 py-2 bg-paper border border-line2 text-ink2 text-sm rounded-lg
                       hover:border-line2 disabled:opacity-50
                       focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            {[25, 50, 100, 200].map((v) => (
              <option key={v} value={v}>Últimas {v}</option>
            ))}
          </select>
        </div>
        <button
          onClick={load}
          disabled={loadState === "loading"}
          className="px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg
                     hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors flex items-center gap-2"
        >
          {loadState === "loading" ? (
            <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Analisando...</>
          ) : loadState === "done" ? "↺ Recarregar" : "📊 Analisar conversas reais"}
        </button>
      </div>

      {loadState === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Erro ao carregar:</strong> {errMsg}
        </div>
      )}

      {loadState === "idle" && (
        <div className="bg-paper rounded-xl border border-line2 p-10 text-center text-muted">
          <div className="text-4xl mb-3">📊</div>
          <p className="font-medium text-ink2">Análise de conversas reais</p>
          <p className="text-sm mt-1">
            Classifica conversas de clientes reais, extrai padrões e compara o desempenho da IA.
            Nenhum dado pessoal é exposto.
          </p>
        </div>
      )}

      {report && report.total === 0 && (
        <div className="bg-paper rounded-xl border border-line2 p-10 text-center text-muted">
          <div className="text-4xl mb-3">🔍</div>
          <p className="font-medium text-ink2">Nenhuma conversa real encontrada</p>
          <p className="text-sm mt-1">As conversas aparecerão aqui após clientes interagirem via WhatsApp.</p>
        </div>
      )}

      {report && report.total > 0 && (
        <>
          {/* Summary metrics */}
          <div className="bg-paper rounded-xl border border-line2 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Conversas analisadas</p>
                <p className="text-4xl font-bold text-ink">{report.total}</p>
              </div>
              <p className="text-xs text-muted">
                {new Date(report.generatedAt).toLocaleString("pt-BR")}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-line">
              {[
                { label: "Taxa de conversão",  value: `${(report.conversionRate   * 100).toFixed(0)}%`, warn: report.conversionRate < 0.5  },
                { label: "Ticket médio",        value: `R$ ${report.avgCartValue.toFixed(0)}`,            warn: report.avgCartValue < 30     },
                { label: "Turnos médios",       value: report.avgTurns.toFixed(1),                        warn: report.avgTurns > 10         },
                { label: "Cobertura de upsell", value: `${(report.upsellCoverageRate * 100).toFixed(0)}%`, warn: report.upsellCoverageRate < 0.5 },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-xs text-muted mb-0.5">{s.label}</p>
                  <p className={`text-xl font-bold ${s.warn ? "text-brand-600" : "text-ink"}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Class breakdown */}
            <div className="pt-3 border-t border-line">
              <p className="text-sm font-semibold text-ink2 mb-3">Distribuição de conversas</p>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(report.classBreakdown) as [ConversationClass, number][])
                  .filter(([, count]) => count > 0)
                  .map(([cls, count]) => {
                    const cfg = CLASS_CONFIG[cls];
                    return (
                      <span key={cls} className={`px-3 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}: <strong>{count}</strong>
                      </span>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Patterns */}
          {report.patterns.length > 0 && (
            <div className="bg-paper rounded-xl border border-line2 p-6 space-y-4">
              <p className="text-sm font-semibold text-ink2">Padrões identificados</p>
              <div className="space-y-3">
                {report.patterns.map((p, i) => (
                  <PatternRow key={i} pattern={p} total={report.total} />
                ))}
              </div>
            </div>
          )}

          {/* Top conversations */}
          {report.topConversations.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted uppercase tracking-wide">
                Melhores conversas
              </p>
              {report.topConversations.map((c) => (
                <ConversationRow key={c.id} conv={c} />
              ))}
            </div>
          )}

          {/* Bottom conversations */}
          {report.bottomConversations.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted uppercase tracking-wide">
                Piores conversas
              </p>
              {report.bottomConversations.map((c) => (
                <ConversationRow key={c.id} conv={c} variant="bottom" />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PatternRow({ pattern, total }: { pattern: ConversationPattern; total: number }) {
  const pct = Math.round(pattern.frequency * 100);
  const icon = PATTERN_ICON[pattern.impact];
  const textColor = pattern.impact === "positive"
    ? "text-green-700"
    : pattern.impact === "negative"
    ? "text-red-700"
    : "text-ink2";
  const barColor = pattern.impact === "positive"
    ? "bg-green-400"
    : pattern.impact === "negative"
    ? "bg-red-400"
    : "bg-line2";

  return (
    <div className="flex items-start gap-3">
      <span className={`text-base font-bold mt-0.5 ${textColor}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2 mb-1">
          <p className={`text-sm font-medium ${textColor}`}>{pattern.description}</p>
          <span className="text-xs text-muted shrink-0">{pattern.count} / {total}</span>
        </div>
        {pattern.metric && (
          <p className="text-xs text-muted mb-1">{pattern.metric}</p>
        )}
        <div className="w-full bg-[#F4F4F2] rounded-full h-1.5">
          <div className={`${barColor} h-1.5 rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>
      <span className="text-xs font-bold text-muted shrink-0">{pct}%</span>
    </div>
  );
}

function ConversationRow({
  conv,
  variant = "top",
}: {
  conv:    ClassifiedConversation;
  variant?: "top" | "bottom";
}) {
  const cfg = CLASS_CONFIG[conv.label];
  const scoreBg = conv.score >= 70
    ? "bg-green-100 text-green-700"
    : conv.score >= 50
    ? "bg-yellow-100 text-yellow-700"
    : "bg-red-100 text-red-700";

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${variant === "bottom" ? "bg-red-50 border-red-200" : "bg-paper border-line2"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
          <span className="text-xs text-muted truncate">{conv.customerLabel}</span>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${scoreBg}`}>
          {conv.score} / 100
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>Ticket: <strong className="text-ink2">R$ {conv.cartValue.toFixed(0)}</strong></span>
        <span>Turnos: <strong className="text-ink2">{conv.turns}</strong></span>
        <span>Upsell: <strong className="text-ink2">{conv.upsellAttempts} tentativa{conv.upsellAttempts !== 1 ? "s" : ""}, {conv.upsellAccepted} aceita{conv.upsellAccepted !== 1 ? "s" : ""}</strong></span>
        {conv.drinkAttempted   && <span className="text-blue-600">✓ bebida</span>}
        {conv.dessertAttempted && <span className="text-brand-500">✓ sobremesa</span>}
      </div>

      {conv.preview && (
        <p className="text-xs text-muted italic border-t border-line pt-2 line-clamp-2">
          &ldquo;{conv.preview}&rdquo;
        </p>
      )}
    </div>
  );
}

// ─── simulation results panel (shared) ───────────────────────

function SimulationResultsPanel({
  state,
  progress,
  results,
  report,
  errMsg,
  expanded,
  toggleExpanded,
  emptyLabel,
  emptyHint,
}: {
  state:          RunState;
  progress:       ProgressInfo | null;
  results:        ScenarioResult[];
  report:         SimulationReport | null;
  errMsg:         string;
  expanded:       Set<string>;
  toggleExpanded: (id: string) => void;
  emptyLabel:     string;
  emptyHint:      string;
}) {
  return (
    <>
      {state === "running" && progress && (
        <div className="bg-paper rounded-xl border border-line2 p-4">
          <div className="flex justify-between text-sm text-ink2 mb-2">
            <span>Executando: <strong>{progress.scenarioName}</strong></span>
            <span>{progress.current} / {progress.total} cenários</span>
          </div>
          <div className="w-full bg-[#F4F4F2] rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted mt-2">
            Isso pode levar ~60–90 segundos. As respostas aparecem à medida que cada cenário termina.
          </p>
        </div>
      )}

      {state === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Erro ao executar simulações:</strong> {errMsg}
        </div>
      )}

      {report && <SummaryCard report={report} />}

      {results.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            Resultados por cenário
          </h2>
          <div className="space-y-3">
            {results.map((r) => (
              <ScenarioCard
                key={r.id}
                result={r}
                isExpanded={expanded.has(r.id)}
                onToggle={() => toggleExpanded(r.id)}
              />
            ))}
          </div>
        </div>
      )}

      {state === "idle" && (
        <div className="bg-paper rounded-xl border border-line2 p-10 text-center text-muted">
          <div className="text-4xl mb-3">🤖</div>
          <p className="font-medium text-ink2">{emptyLabel}</p>
          <p className="text-sm mt-1">{emptyHint}</p>
        </div>
      )}
    </>
  );
}

// ─── prompt lab panel ─────────────────────────────────────────

const LAB_EXAMPLES = [
  "cliente quer algo barato",
  "cliente indeciso",
  "cliente quer fechar rápido",
  "cliente nunca comeu aqui",
  "cliente vegano com pressa",
  "casal curioso, orçamento alto",
  "cliente impaciente, só quer o básico",
  "família com restrição de lactose",
];

const VARIATION_PRESETS: Array<{ label: string; value: 1 | 5 | 10 }> = [
  { label: "1 cenário",    value: 1  },
  { label: "5 variações",  value: 5  },
  { label: "10 variações", value: 10 },
];

function PromptLabPanel() {
  const [labState,    setLabState]    = useState<RunState>("idle");
  const [labProgress, setLabProgress] = useState<ProgressInfo | null>(null);
  const [labResults,  setLabResults]  = useState<ScenarioResult[]>([]);
  const [labReport,   setLabReport]   = useState<SimulationReport | null>(null);
  const [labErr,      setLabErr]      = useState<string>("");
  const [labExpanded, setLabExpanded] = useState<Set<string>>(new Set());
  const [parsedInfo,  setParsedInfo]  = useState<ParsedPrompt | null>(null);
  const [prompt,      setPrompt]      = useState<string>("");
  const [varCount,    setVarCount]    = useState<1 | 5 | 10>(1);
  const runLab = useCallback(async (count: 1 | 5 | 10) => {
    if (!prompt.trim()) return;
    setVarCount(count);
    setLabState("running");
    setLabProgress(null);
    setLabResults([]);
    setLabReport(null);
    setLabErr("");
    setLabExpanded(new Set());
    setParsedInfo(null);

    try {
      const response = await fetch("/api/ai-simulator/prompt-lab", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userPrompt: prompt, variationCount: count }),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (event.type === "parsed") {
              setParsedInfo(event.parsed as ParsedPrompt);
            } else if (event.type === "progress") {
              setLabProgress(event as unknown as ProgressInfo);
            } else if (event.type === "scenario_result") {
              setLabResults((prev) => [...prev, event.result as ScenarioResult]);
            } else if (event.type === "report") {
              setLabReport(event.report as SimulationReport);
              setLabState("done");
            } else if (event.type === "error") {
              setLabErr(String(event.message));
              setLabState("error");
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch (err) {
      setLabErr(String(err));
      setLabState("error");
    }
  }, [prompt]);

  const toggleExpanded = (id: string) => {
    setLabExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isRunning = labState === "running";

  return (
    <div className="space-y-4">
      {/* Input card */}
      <div className="bg-paper rounded-xl border border-line2 p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-ink2 mb-1">
            Descreva o cenário de teste
          </label>
          <p className="text-xs text-muted mb-2">
            Escreva em linguagem natural — o parser extrai intenção, orçamento, comportamento e restrições.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isRunning}
            placeholder='Ex: "cliente indeciso que nunca comeu aqui" ou "cliente com pressa, quer algo barato"'
            rows={3}
            className="w-full px-3 py-2.5 border border-line2 rounded-lg text-sm text-ink
                       placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500
                       focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          />
        </div>

        {/* Example chips */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted self-center mr-1">Exemplos:</span>
          {LAB_EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              disabled={isRunning}
              className="px-2.5 py-1 text-xs bg-[#F4F4F2] text-ink2 rounded-full
                         hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Run buttons */}
        <div className="flex items-center gap-2 pt-1 border-t border-line">
          <span className="text-xs text-muted mr-1">Rodar:</span>
          {VARIATION_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => runLab(p.value)}
              disabled={isRunning || !prompt.trim()}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors
                         flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                           labState === "running" && varCount === p.value
                             ? "bg-blue-600 text-white"
                             : "bg-blue-600 text-white hover:bg-blue-700"
                         }`}
            >
              {isRunning && varCount === p.value ? (
                <><span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />{p.label}</>
              ) : (
                <>▶ {p.label}</>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Parse preview — shown after first run */}
      {parsedInfo && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            Interpretação do prompt
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Intenção",     value: parsedInfo.intent },
              { label: "Orçamento",    value: parsedInfo.budget },
              { label: "Grupo",        value: parsedInfo.groupSize },
              { label: "Comportamento", value: parsedInfo.behavior },
              { label: "Paciência",    value: parsedInfo.patience },
              { label: "Abertura",     value: parsedInfo.upsellOpenness },
              ...(parsedInfo.dietary ? [{ label: "Restrição", value: parsedInfo.dietary }] : []),
            ].map(({ label, value }) => (
              <span key={label} className="inline-flex items-center gap-1 px-2.5 py-1 bg-paper border border-blue-100 rounded-full text-xs text-ink2">
                <span className="text-blue-500 font-medium">{label}:</span> {value}
              </span>
            ))}
          </div>
          <p className="text-xs text-blue-600">
            Sinais: {parsedInfo.signals.join(" · ")}
          </p>
        </div>
      )}

      {/* Results */}
      <SimulationResultsPanel
        state={labState}
        progress={labProgress}
        results={labResults}
        report={labReport}
        errMsg={labErr}
        expanded={labExpanded}
        toggleExpanded={toggleExpanded}
        emptyLabel="Nenhum teste executado ainda"
        emptyHint="Escreva um cenário e clique em Rodar."
      />
    </div>
  );
}

// ─── summary card ─────────────────────────────────────────────

function SummaryCard({ report }: { report: SimulationReport }) {
  const scoreColor = report.overallScore >= 70
    ? "text-green-600" : report.overallScore >= 50
    ? "text-yellow-600" : "text-red-600";

  const safeBadge = report.safeToTest
    ? { bg: "bg-green-100 text-green-700 border-green-200", label: "SIM — pronto para teste com cliente real" }
    : { bg: "bg-red-100 text-red-700 border-red-200",       label: "NÃO — corrija os problemas antes" };

  const stats: Array<{ label: string; value: string; warn?: boolean }> = [
    {
      label: "Ticket médio",
      value: report.avgTicket > 0 ? `R$ ${report.avgTicket.toFixed(2)}` : "—",
    },
    {
      label: "Itens médios",
      value: report.avgItems > 0 ? report.avgItems.toFixed(1) : "—",
    },
    {
      label: "Taxa de conversão",
      value: `${(report.conversionRate * 100).toFixed(0)}%`,
      warn: report.conversionRate < 0.4,
    },
    {
      label: "Turnos médios",
      value: report.avgTurns > 0 ? report.avgTurns.toFixed(1) : "—",
      warn: report.avgTurns > 8,
    },
    {
      label: "Taxa de abandono",
      value: `${(report.abandonmentRate * 100).toFixed(0)}%`,
      warn: report.abandonmentRate > 0.5,
    },
    {
      label: "Aceitação upsell",
      value: report.upsellAcceptanceRate > 0
        ? `${(report.upsellAcceptanceRate * 100).toFixed(0)}%`
        : "—",
      warn: report.upsellAcceptanceRate > 0 && report.upsellAcceptanceRate < 0.3,
    },
    {
      label: "Receita real",
      value: report.realRevenue > 0 ? `R$ ${report.realRevenue.toFixed(2)}` : "—",
    },
    {
      label: "Flow score",
      value: `${(report.flowScore * 100).toFixed(0)}%`,
      warn: report.flowScore < 0.5,
    },
    {
      label: "Erros totais",
      value: String(report.errorCount),
      warn: report.errorCount > 5,
    },
    {
      label: "Pós-checkout ok",
      value: report.testDepth === "full_checkout"
        ? `${(report.checkoutCompletionRate * 100).toFixed(0)}%`
        : "N/A",
      warn: report.testDepth === "full_checkout" && report.checkoutCompletionRate < 0.5,
    },
  ];

  return (
    <div className="bg-paper rounded-xl border border-line2 p-6 space-y-5">
      {/* Score + safe badge */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted uppercase tracking-wide">Score geral</p>
          <p className={`text-4xl font-bold ${scoreColor}`}>
            {report.overallScore.toFixed(0)}<span className="text-xl text-muted"> / 100</span>
          </p>
        </div>
        <div className={`px-4 py-2 rounded-lg border text-sm font-semibold flex items-center gap-2 ${safeBadge.bg}`}>
          <span className="text-base">{report.safeToTest ? "✅" : "❌"}</span>
          <span>Pronto para teste real: <strong>{report.safeToTest ? "SIM" : "NÃO"}</strong></span>
        </div>
      </div>

      {/* 6-stat grid */}
      <div className="grid grid-cols-3 gap-3 pt-1 border-t border-line">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-xs text-muted mb-0.5">{s.label}</p>
            <p className={`text-lg font-bold ${s.warn ? "text-brand-600" : "text-ink"}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Top fixes */}
      {report.topFixes.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-ink2 mb-2">Correções recomendadas:</p>
          <ol className="space-y-1">
            {report.topFixes.map((fix, i) => (
              <li key={i} className="text-sm text-ink2 flex gap-2">
                <span className="font-bold text-muted">{i + 1}.</span>
                {fix}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Critical bugs */}
      {report.criticalBugs.length > 0 && (
        <details>
          <summary className="text-sm font-semibold text-red-600 cursor-pointer select-none">
            🐛 {report.criticalBugs.length} falha{report.criticalBugs.length > 1 ? "s" : ""} crítica{report.criticalBugs.length > 1 ? "s" : ""} detectada{report.criticalBugs.length > 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-1">
            {report.criticalBugs.map((bug, i) => (
              <li key={i} className="text-xs text-red-600 bg-red-50 rounded px-3 py-1.5">
                {bug}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Stage breakdown */}
      {report.stageScores && <StageBreakdownChart scores={report.stageScores} testDepth={report.testDepth} />}

      <p className="text-xs text-muted">
        {report.restaurantName} · Executado em {new Date(report.ranAt).toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

// ─── stage breakdown chart ────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  discovery:          "Descoberta",
  foodExpansion:      "Food expansion",
  upsellExecution:    "Upsell executado",
  checkoutTransition: "Checkout ativado",
  checkoutCompletion: "Checkout completo",
};

// Ordered list of stageScores keys — used to determine which are in scope
const STAGE_SCORE_ORDER = [
  "discovery",
  "foodExpansion",
  "upsellExecution",
  "checkoutTransition",
  "checkoutCompletion",
] as const;

// Deepest stageScores key that is within each testDepth
const DEPTH_MAX_SCORE_KEY: Record<TestDepth, string> = {
  discovery:        "discovery",
  first_item:       "discovery",
  food_expansion:   "foodExpansion",
  checkout_trigger: "checkoutTransition",
  full_checkout:    "checkoutCompletion",
};

function StageBreakdownChart({
  scores,
  testDepth,
}: {
  scores:    SimulationReport["stageScores"];
  testDepth: TestDepth;
}) {
  const maxInScopeKey  = DEPTH_MAX_SCORE_KEY[testDepth];
  const maxInScopeIdx  = STAGE_SCORE_ORDER.indexOf(maxInScopeKey as typeof STAGE_SCORE_ORDER[number]);
  const isInScope = (key: string) =>
    STAGE_SCORE_ORDER.indexOf(key as typeof STAGE_SCORE_ORDER[number]) <= maxInScopeIdx;

  const entries    = Object.entries(scores) as [string, number][];
  const inScope    = entries.filter(([k]) => isInScope(k));
  const weakestKey = inScope.length > 0
    ? inScope.reduce((a, b) => (b[1] < a[1] ? b : a))[0]
    : null;

  return (
    <div className="pt-3 border-t border-line">
      <p className="text-sm font-semibold text-ink2 mb-3">Breakdown por etapa</p>
      <div className="space-y-2">
        {entries.map(([key, value]) => {
          const inScopeEntry = isInScope(key);
          const isDepthTarget = key === maxInScopeKey && testDepth !== "full_checkout";

          if (!inScopeEntry) {
            return (
              <div key={key}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="font-medium text-muted">
                    {STAGE_LABELS[key] ?? key}
                    <span className="ml-1 text-muted italic">— não avaliado</span>
                  </span>
                  <span className="text-muted">N/A</span>
                </div>
                <div className="w-full bg-[#FAFAF8] rounded-full h-1.5" />
              </div>
            );
          }

          const pct      = Math.round(value * 100);
          const isWeak   = key === weakestKey && value < 0.8;
          const barColor = isWeak ? "bg-red-400" : pct >= 80 ? "bg-green-400" : "bg-yellow-400";
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className={`font-medium ${isWeak ? "text-red-600" : "text-ink2"}`}>
                  {STAGE_LABELS[key] ?? key}
                  {isWeak       && " ⚠ mais fraca"}
                  {isDepthTarget && " ← profundidade alvo"}
                </span>
                <span className={`font-bold ${isWeak ? "text-red-600" : "text-ink2"}`}>{pct}%</span>
              </div>
              <div className="w-full bg-[#F4F4F2] rounded-full h-1.5">
                <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── scenario card ────────────────────────────────────────────

const FAILURE_STAGE_LABELS: Record<SimStage, string> = {
  discovery:          "Descoberta",
  first_item_added:   "Primeiro item",
  food_expansion:     "Food expansion",
  upsell_execution:   "Upsell",
  checkout_trigger:   "Checkout ativado",
  checkout_completion: "Pós-checkout",
};

function ScenarioCard({
  result,
  isExpanded,
  onToggle,
}: {
  result:     ScenarioResult;
  isExpanded: boolean;
  onToggle:   () => void;
}) {
  const statusConfig = {
    passed:  { bg: "bg-green-50 border-green-200",  badge: "bg-green-100 text-green-700",  icon: "✅" },
    warning: { bg: "bg-yellow-50 border-yellow-200", badge: "bg-yellow-100 text-yellow-700", icon: "⚠️" },
    failed:  { bg: "bg-red-50 border-red-200",      badge: "bg-red-100 text-red-700",      icon: "❌" },
  }[result.status];

  return (
    <div className={`rounded-xl border ${statusConfig.bg} overflow-hidden`}>
      {/* Card header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:brightness-95 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{statusConfig.icon}</span>
          <div>
            <p className="font-semibold text-ink text-sm">{result.name}</p>
            <p className="text-xs text-muted">{result.description}</p>
            {result.failureStage && (
              <p className="text-xs text-red-500 mt-0.5 font-medium">
                Falhou em: {FAILURE_STAGE_LABELS[result.failureStage] ?? result.failureStage}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusConfig.badge}`}>
            {result.score.toFixed(0)} / 100
          </span>
          <span className="text-muted text-sm">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-inherit px-4 pb-4 space-y-4">

          {/* Sales metrics strip */}
          <SalesMetricsRow metrics={result.salesMetrics} totalTurns={result.totalTurns} abandoned={result.abandoned} />

          {/* Cart evolution */}
          {result.cartEvolution.length > 0 && (
            <CartEvolutionTable evolution={result.cartEvolution} />
          )}

          {/* Sales weaknesses */}
          {result.salesWeaknesses.length > 0 && (
            <div>
              <p className="text-xs text-muted font-medium mb-2">Pontos fracos de vendas</p>
              <ul className="space-y-1">
                {result.salesWeaknesses.map((w, i) => (
                  <li key={i} className="text-xs text-brand-700 bg-brand-50 rounded px-2 py-1.5">
                    ↘ {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Expected behavior */}
          <div>
            <p className="text-xs text-muted font-medium mb-1">Comportamento esperado</p>
            <p className="text-sm text-ink2">{result.expectedBehavior}</p>
          </div>

          {/* Checks */}
          <div>
            <p className="text-xs text-muted font-medium mb-2">Verificações</p>
            <div className="space-y-1.5">
              {result.checks.map((check, i) => (
                <CheckRow key={i} check={check} />
              ))}
            </div>
          </div>

          {/* Issues */}
          {result.issues.length > 0 && (
            <div>
              <p className="text-xs text-muted font-medium mb-2">Falhas detectadas</p>
              <ul className="space-y-1">
                {result.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">
                    ⚠ {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Full transcript */}
          {result.transcript.length > 0 && (
            <div>
              <p className="text-xs text-muted font-medium mb-2">
                Transcrição completa ({result.totalTurns} turnos)
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {result.transcript.map((turn, i) => {
                  const prevPhase = result.transcript[i - 1]?.phase;
                  const showDivider = turn.phase === "post_checkout" && prevPhase !== "post_checkout";
                  return (
                    <div key={i}>
                      {showDivider && (
                        <div className="flex items-center gap-2 py-1">
                          <div className="flex-1 h-px bg-amber-200" />
                          <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            Pós-checkout
                          </span>
                          <div className="flex-1 h-px bg-amber-200" />
                        </div>
                      )}
                      <TranscriptBubble turn={turn} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={check.passed ? "text-green-500" : "text-red-500"}>
        {check.passed ? "✓" : "✗"}
      </span>
      <div>
        <span className={`font-medium ${check.passed ? "text-ink2" : "text-red-700"}`}>
          {check.label}
        </span>
        <span className="text-muted ml-1">— {check.detail}</span>
      </div>
    </div>
  );
}

// ─── sales metrics row ────────────────────────────────────────

function SalesMetricsRow({
  metrics,
  totalTurns,
  abandoned,
}: {
  metrics:    SalesMetrics;
  totalTurns: number;
  abandoned:  boolean;
}) {
  const acceptRate = metrics.upsellAttempts > 0
    ? ((metrics.acceptedUpsellsOnly / metrics.upsellAttempts) * 100).toFixed(0) + "%"
    : "—";

  const items: Array<{ label: string; value: string; color?: string }> = [
    {
      label: "Ticket final",
      value: metrics.finalCartValue > 0 ? `R$ ${metrics.finalCartValue.toFixed(2)}` : "—",
    },
    {
      label: "Itens",
      value: metrics.totalItems > 0 ? String(metrics.totalItems) : "—",
    },
    {
      label: "Turnos",
      value: String(totalTurns),
      color: totalTurns >= 10 ? "text-brand-600" : undefined,
    },
    {
      label: "Conversão",
      value: abandoned ? "Abandonou" : "Converteu",
      color: abandoned ? "text-red-500" : "text-green-600",
    },
    {
      label: "Upsells aceitos",
      value: metrics.upsellAttempts > 0
        ? `${metrics.acceptedUpsellsOnly}/${metrics.upsellAttempts} (${acceptRate})`
        : "—",
    },
    {
      label: "Receita upsell",
      value: metrics.upsellValueGenerated > 0
        ? `R$ ${metrics.upsellValueGenerated.toFixed(2)}`
        : "—",
      color: metrics.upsellValueGenerated > 0 ? "text-green-600" : undefined,
    },
    {
      label: "Pós-checkout",
      value: metrics.postCheckoutCompleted
        ? "Completo"
        : metrics.postCheckoutDropPhase === "not_reached"
        ? "—"
        : `Drop: ${metrics.postCheckoutDropPhase}`,
      color: metrics.postCheckoutCompleted
        ? "text-green-600"
        : metrics.postCheckoutDropPhase !== "not_reached"
        ? "text-brand-600"
        : undefined,
    },
  ];

  return (
    <div className="pt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="bg-[#FAFAF8] rounded-lg px-2 py-2 text-center">
          <p className="text-[10px] text-muted uppercase tracking-wide mb-0.5 leading-tight">{item.label}</p>
          <p className={`text-xs font-semibold ${item.color ?? "text-ink2"}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── cart evolution table ─────────────────────────────────────

function CartEvolutionTable({ evolution }: { evolution: CartSnapshot[] }) {
  return (
    <div>
      <p className="text-xs text-muted font-medium mb-2">Evolução do carrinho por turno</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-muted border-b border-line">
              <th className="text-left py-1 pr-3 font-medium">Turno</th>
              <th className="text-right py-1 pr-3 font-medium">Valor</th>
              <th className="text-right py-1 pr-3 font-medium">Itens</th>
              <th className="text-right py-1 font-medium">Δ Valor</th>
            </tr>
          </thead>
          <tbody>
            {evolution.map((snap, i) => {
              const prev   = evolution[i - 1];
              const delta  = snap.value - (prev?.value ?? 0);
              const added  = delta > 0;
              return (
                <tr key={snap.turn} className="border-b border-line">
                  <td className="py-1 pr-3 text-muted">#{snap.turn}</td>
                  <td className="py-1 pr-3 text-right font-medium text-ink">
                    {snap.value > 0 ? `R$ ${snap.value.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right text-ink2">{snap.items}</td>
                  <td className={`py-1 text-right font-medium ${added ? "text-green-600" : "text-muted"}`}>
                    {added ? `+R$ ${delta.toFixed(2)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── export helpers ───────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function fileTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 19).replace(/:/g, "-");
  return `${date}-${time}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(report: SimulationReport): void {
  const ts   = fileTimestamp(report.ranAt);
  const name = slugify(report.restaurantName);
  triggerDownload(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    `simulation-report-${ts}-${name}.json`,
  );
}

function downloadSummary(report: SimulationReport): void {
  const ts      = fileTimestamp(report.ranAt);
  const name    = slugify(report.restaurantName);
  const dateStr = new Date(report.ranAt).toLocaleString("pt-BR");

  const passed  = report.scenarios.filter((s) => s.status === "passed").length;
  const warned  = report.scenarios.filter((s) => s.status === "warning").length;
  const failed  = report.scenarios.filter((s) => s.status === "failed").length;

  const sorted  = [...report.scenarios].sort((a, b) => a.score - b.score);
  const worst   = sorted.slice(0, 3);
  const best    = sorted.slice(-3).reverse();

  // Collect up to 5 most impactful failures across all scenarios
  const allFailures: string[] = [];
  for (const s of report.scenarios) {
    for (const c of s.checks) {
      if (!c.passed) allFailures.push(`[${s.name}] ${c.detail}`);
    }
  }
  const top5Failures = allFailures.slice(0, 5);

  const lines: string[] = [
    "═══════════════════════════════════════════════════════",
    "       RELATÓRIO DO SIMULADOR DE IA DE VENDAS",
    "═══════════════════════════════════════════════════════",
    `Restaurante : ${report.restaurantName}`,
    `Executado em: ${dateStr}`,
    "",
    "┌─────────────────────────────────────────────────────┐",
    `│  PRONTO PARA TESTE REAL: ${report.safeToTest ? "SIM ✓" : "NÃO ✗"}                        │`,
    "└─────────────────────────────────────────────────────┘",
    "",
    "─── MÉTRICAS GERAIS ──────────────────────────────────",
    `  Score geral       : ${report.overallScore.toFixed(0)} / 100`,
    `  Cenários aprovados: ${passed} / ${report.scenarios.length}`,
    `  Cenários atenção  : ${warned}`,
    `  Cenários com falha: ${failed}`,
    `  Taxa de conversão : ${(report.conversionRate * 100).toFixed(0)}%`,
    `  Taxa de abandono  : ${(report.abandonmentRate * 100).toFixed(0)}%`,
    `  Ticket médio      : R$ ${report.avgTicket.toFixed(2)}`,
    `  Itens médios      : ${report.avgItems.toFixed(1)}`,
    `  Turnos médios     : ${report.avgTurns.toFixed(1)}`,
    `  Aceitação upsell  : ${(report.upsellAcceptanceRate * 100).toFixed(0)}%`,
    "",
    "─── PÓS-CHECKOUT ──────────────────────────────────────",
    `  Fluxo completo    : ${(report.checkoutCompletionRate * 100).toFixed(0)}%`,
    `  Drop no endereço  : ${(report.dropDuringAddress * 100).toFixed(0)}%`,
    `  Drop no pagamento : ${(report.dropDuringPayment * 100).toFixed(0)}%`,
    "",
  ];

  if (top5Failures.length > 0) {
    lines.push("─── TOP 5 FALHAS ─────────────────────────────────────");
    top5Failures.forEach((f, i) => lines.push(`  ${i + 1}. ${f}`));
    lines.push("");
  }

  lines.push("─── PIORES CENÁRIOS ──────────────────────────────────");
  worst.forEach((s, i) => {
    const icon = s.status === "failed" ? "✗" : "⚠";
    lines.push(`  ${i + 1}. ${icon} [${s.score.toFixed(0)}/100] ${s.name}`);
    if (s.salesWeaknesses.length > 0) {
      lines.push(`       → ${s.salesWeaknesses[0]}`);
    }
  });
  lines.push("");

  lines.push("─── MELHORES CENÁRIOS ────────────────────────────────");
  best.forEach((s, i) => {
    lines.push(`  ${i + 1}. ✓ [${s.score.toFixed(0)}/100] ${s.name}`);
    if (s.salesMetrics.conversionSuccess) {
      lines.push(`       → Pedido confirmado em ${s.totalTurns} turnos — R$ ${s.salesMetrics.finalCartValue.toFixed(2)}`);
    }
  });
  lines.push("");

  if (report.topFixes.length > 0) {
    lines.push("─── CORREÇÕES RECOMENDADAS ───────────────────────────");
    report.topFixes.forEach((fix, i) => lines.push(`  ${i + 1}. ${fix}`));
    lines.push("");
  }

  lines.push("─── DETALHES POR CENÁRIO ─────────────────────────────");
  report.scenarios.forEach((s) => {
    const icon = s.status === "passed" ? "✓" : s.status === "warning" ? "⚠" : "✗";
    lines.push(`${icon} [${s.score.toFixed(0)}/100] ${s.name}`);
    lines.push(`   ${s.description}`);
    lines.push(`   Turnos: ${s.totalTurns} | Ticket: R$ ${s.salesMetrics.finalCartValue.toFixed(2)} | ${s.abandoned ? "Abandonou" : "Converteu"}`);
    if (s.issues.length > 0) {
      s.issues.forEach((issue) => lines.push(`   ⚠ ${issue}`));
    }
    if (s.salesWeaknesses.length > 0) {
      s.salesWeaknesses.forEach((w) => lines.push(`   ↘ ${w}`));
    }
    lines.push("");
  });

  triggerDownload(
    new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
    `simulation-summary-${ts}-${name}.txt`,
  );
}

function downloadCSV(report: SimulationReport): void {
  const ts   = fileTimestamp(report.ranAt);
  const name = slugify(report.restaurantName);

  // Exact columns per spec
  const headers = [
    "scenarioId",
    "score",
    "status",
    "finalCartValue",
    "totalItems",
    "totalTurns",
    "conversionSuccess",
    "upsellAttempts",
    "acceptedUpsells",
    "acceptanceRate",
    "abandonment",
    "loopDetected",
    "postCheckoutCompleted",
    "postCheckoutDropPhase",
  ];

  const rows = report.scenarios.map((s) => {
    const m          = s.salesMetrics;
    const acceptRate = m.upsellAttempts > 0
      ? (m.acceptedUpsellsOnly / m.upsellAttempts).toFixed(4)
      : "0";
    const loopCheck    = s.checks.find((c) => c.type === "no_loop");
    const loopDetected = loopCheck ? (!loopCheck.passed ? "true" : "false") : "false";

    return [
      s.id,
      s.score.toFixed(2),
      s.status,
      m.finalCartValue.toFixed(2),
      String(m.totalItems),
      String(s.totalTurns),
      m.conversionSuccess ? "true" : "false",
      String(m.upsellAttempts),
      String(m.acceptedUpsellsOnly),
      acceptRate,
      s.abandoned ? "true" : "false",
      loopDetected,
      m.postCheckoutCompleted ? "true" : "false",
      m.postCheckoutDropPhase ?? "not_reached",
    ];
  });

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");

  // BOM prefix so Excel opens with correct UTF-8 encoding
  triggerDownload(
    new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
    `simulation-${ts}-${name}.csv`,
  );
}

// ─── transcript bubble ────────────────────────────────────────

function TranscriptBubble({
  turn,
}: {
  turn: { role: "customer" | "ai"; content: string; toolCalls: Array<{ name: string; success: boolean; detail: string }>; phase?: string };
}) {
  const isAI = turn.role === "ai";
  return (
    <div className={`flex ${isAI ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
          isAI
            ? "bg-paper border border-line2 text-ink"
            : "bg-blue-600 text-white"
        }`}
      >
        <p className={`text-[10px] font-semibold mb-0.5 ${isAI ? "text-muted" : "text-blue-200"}`}>
          {isAI ? "🤖 IA" : "👤 Cliente"}
        </p>
        <p className="whitespace-pre-wrap leading-relaxed">{turn.content || <em className="opacity-50">sem resposta</em>}</p>
        {turn.toolCalls.length > 0 && (
          <div className="mt-1 pt-1 border-t border-line space-y-0.5">
            {turn.toolCalls.map((tc, i) => (
              <p key={i} className={`text-[10px] ${tc.success ? "text-green-600" : "text-red-500"}`}>
                ⚙ {tc.name}: {tc.detail}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
