"use client";

/**
 * WaiterSimulationLab — apresentado ao operador como o "Centro de Treinamento do
 * Waiter". A complexidade técnica (Simulation Engine, Quality, Library, Runtime
 * Merge) continua intacta por baixo; esta tela só TRADUZ tudo para linguagem de
 * marketing/vendas/operação e organiza a decisão humana:
 *
 *   1. Status do treinamento  2. Fontes de aprendizado (Biblioteca · Casos reais ·
 *   Simulador)  3. Sugestões de treinamento (o coração)  4. Treinamentos aprovados
 *   5. Casos reais  6. Próxima versão de teste.
 *
 * Nada aqui muda o atendimento real: aprovar registra a decisão como treinamento;
 * só vira mudança real numa versão de teste aprovada no Quality Gate.
 */

import { useCallback, useEffect, useState } from "react";
import {
  severityLabel,
  opportunityTypeLabel,
  scenarioTypeLabel,
  trainingActionLabel,
  exampleStatusLabel,
  buildTrainingSuggestion,
  APPROVAL_DISCLAIMER,
  TRAINING_ACTION_MICROCOPY,
} from "@/services/simulation/waiterTrainingDisplayLabels";

interface TrainingSuggestionRow {
  id: string; title: string; situationSummary: string; whatHappened: string;
  problemDetected: string; idealResponse: string; trainingRule: string; expectedImpact: string;
  suggestedActionType: string; riskLevel: string; status: string;
  sanitizedCustomerExcerpt: string | null; sanitizedWaiterExcerpt: string | null; createdAt: string;
}
interface SuggestionStats { total: number; pending: number; approved: number; rejected: number }

const BASE = "/api/admin/agents/waiter/simulation";

interface RunMini {
  id: string; mode: string; status: string; createdAt: string;
  scenariosTotal: number; scenariosPassed: number; scenariosWarning: number; scenariosFailed: number;
  p0Count: number; p1Count: number; p2Count: number; opportunityCount: number;
}
interface OppRow {
  id: string; type: string; severity: string; title: string; summary: string;
  recommendation: string; expectedImpact: string | null; status: string;
  scenario?: { scenarioType: string; persona: string; initialMessage: string } | null;
  run?: { mode: string } | null;
}
interface ScenarioRow {
  id: string; scenarioType: string; persona: string; initialMessage: string;
  status: string; severity: string; score: number; summary: string; transcript: string | null;
}
interface ExampleStats { total: number; approved: number; pending: number; rejected: number }
interface ExampleRow { id: string; intent: string; scenarioType: string; channel: string; summary: string; status: string }
interface RealIntake { lastIntakeAt: string | null; collectedToday: number; nextIntakeEstimate: string; scheduleLabel: string }
interface Cockpit {
  automation: { isAutomated: boolean; scheduleLabel: string; nextScheduledRunEstimate: string };
  latestRun: RunMini | null;
  latestManualRun: RunMini | null;
  latestCronRun: RunMini | null;
  pendingOpportunities: OppRow[];
  pendingOpportunityCount: number;
  opportunitiesByStatus: Record<string, number>;
  latestScenarios: ScenarioRow[];
  exampleStats: ExampleStats;
  realIntake?: RealIntake;
  runtimeSafety: { label: string };
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const map: Record<string, string> = {
    green: "bg-green-100 text-green-800", gray: "bg-gray-100 text-gray-700",
    amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${map[tone] ?? map.gray}`}>{children}</span>;
}
const sevTone = (s: string) => (s === "P0" ? "red" : s === "P1" ? "amber" : s === "P2" ? "violet" : "gray");
const statusTone = (s: string) => (s === "PASS" ? "green" : s === "WARNING" ? "amber" : s === "FAIL" ? "red" : "gray");
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

export function WaiterSimulationLab() {
  const [ck, setCk] = useState<Cockpit | null>(null);
  const [history, setHistory] = useState<RunMini[]>([]);
  const [examples, setExamples] = useState<ExampleRow[]>([]);
  const [suggestions, setSuggestions] = useState<TrainingSuggestionRow[]>([]);
  const [suggStats, setSuggStats] = useState<SuggestionStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [scenarioCount, setScenarioCount] = useState(12);
  const [seed, setSeed] = useState("");

  const load = useCallback(async () => {
    const [c, h, e, s] = await Promise.all([
      fetch(`${BASE}/cockpit`).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch(`${BASE}?limit=15`).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch(`${BASE}/examples?limit=20`).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch(`/api/admin/agents/waiter/training-suggestions?status=PENDING_REVIEW&limit=30`).then((r) => r.json()).catch(() => ({ ok: false })),
    ]);
    if (c.ok) setCk(c.cockpit);
    if (h.ok) setHistory(h.runs ?? []);
    if (e.ok) setExamples(e.examples ?? []);
    if (s.ok) { setSuggestions(s.items ?? []); setSuggStats(s.stats ?? null); }
  }, []);

  const reviewSuggestion = useCallback(async (id: string, status: string) => {
    await fetch(`/api/admin/agents/waiter/training-suggestions/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    await load();
  }, [load]);

  useEffect(() => { void load(); }, [load]);

  const runNow = useCallback(async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`${BASE}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioCount, seed: seed.trim() || undefined }),
      });
      const json = await res.json();
      setMsg(json.ok ? `Pronto: ${json.summary.passed}/${json.summary.scenariosTotal} OK · ${json.summary.p0} crítico(s) · ${json.summary.opportunities} sugestão(ões) de treinamento.` : (json.error ?? "Falha."));
      await load();
    } finally { setBusy(false); }
  }, [scenarioCount, seed, load]);

  const reviewOpp = useCallback(async (id: string, status: string) => {
    await fetch(`${BASE}/opportunities/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
  }, [load]);

  const extractExamples = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/examples/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 50, days: 30 }) });
      const json = await res.json();
      setMsg(json.ok ? `Extraídos ${json.created} caso(s) real(is) — aguardando sua revisão.` : (json.error ?? "Falha."));
      await load();
    } finally { setBusy(false); }
  }, [load]);

  const reviewExample = useCallback(async (id: string, status: string) => {
    await fetch(`${BASE}/examples/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
  }, [load]);

  const parseTranscript = (t: string | null): Array<{ role: string; content: string }> => {
    if (!t) return [];
    try { return JSON.parse(t); } catch { return []; }
  };

  return (
    <div className="space-y-4">
      {/* ── 1. STATUS DO TREINAMENTO ─────────────────────────────────────── */}
      <section className="rounded-xl border border-orange-200 bg-orange-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900">🎓 Centro de Treinamento do Waiter</h3>
            <p className="text-[11px] text-gray-700">O Waiter aprende com materiais, conversas reais e simulações. Você aprova o que vira treinamento.</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Pill tone={ck?.automation.isAutomated ? "green" : "gray"}>{ck?.automation.isAutomated ? "Treinamento automático ativo" : "Treinamento automático inativo"}</Pill>
            <Pill tone="green">Seguro: não muda o atendimento real sozinho</Pill>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-600">O Waiter está sendo testado em ambiente seguro — sem criar pedido, gerar Pix ou enviar WhatsApp.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Última simulação" value={fmt(ck?.latestRun?.createdAt)} tone="violet" />
          <Stat label="Próxima simulação" value={fmt(ck?.automation.nextScheduledRunEstimate)} tone="blue" />
          <Stat label="Problemas críticos encontrados" value={String(ck?.latestRun?.p0Count ?? 0)} tone={(ck?.latestRun?.p0Count ?? 0) > 0 ? "red" : "green"} />
          <Stat label="Esperando sua decisão" value={String(ck?.pendingOpportunityCount ?? 0)} tone={(ck?.pendingOpportunityCount ?? 0) > 0 ? "amber" : "gray"} />
        </div>
      </section>

      {/* ── 2. FONTES DE APRENDIZADO ─────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SourceCard emoji="📚" title="Biblioteca" text="Materiais enviados por você. A IA extrai técnicas e transforma em aprendizado para o Waiter." />
        <SourceCard emoji="💬" title="Casos reais" text="Conversas reais sanitizadas. Ajudam o simulador a criar situações parecidas com clientes reais." />
        <SourceCard emoji="🧪" title="Simulador" text="Clientes artificiais testam o Waiter todos os dias e encontram oportunidades de melhoria." />
      </section>

      {/* ── 3. SUGESTÕES DE TREINAMENTO (o coração) ──────────────────────── */}
      <section className="rounded-xl border-2 border-amber-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">✨ Sugestões de treinamento</h3>
        <p className="mt-0.5 text-[11px] text-gray-600">O que o Waiter pode aprender, por que foi sugerido e qual o impacto esperado. Você decide.</p>
        <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[11px] text-blue-800">
          ℹ️ {APPROVAL_DISCLAIMER}
        </div>
        <div className="mt-3 space-y-2">
          {(ck?.pendingOpportunities.length ?? 0) === 0 && (
            <p className="text-[12px] text-gray-500">Nenhuma sugestão pendente agora. O simulador continua testando o Waiter automaticamente.</p>
          )}
          {ck?.pendingOpportunities.map((o) => {
            const v = buildTrainingSuggestion(o);
            return (
              <div key={o.id} className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={sevTone(o.severity)}>{severityLabel(o.severity)}</Pill>
                  <Pill tone="blue">{opportunityTypeLabel(o.type)}</Pill>
                  <span className="text-xs font-bold text-gray-900">{v.title}</span>
                </div>

                <dl className="mt-2 space-y-1 text-[11px] leading-snug">
                  <Row label="Problema" value={v.problem} />
                  {v.customerExample && <Row label="O cliente disse" value={`“${v.customerExample}”`} />}
                  <Row label="Solução sugerida" value={v.solution} strong />
                  <Row label="Impacto esperado" value={v.expectedImpact} />
                  <Row label="Origem" value={v.origin} />
                </dl>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Btn tone="green" title={TRAINING_ACTION_MICROCOPY.APPROVED} onClick={() => void reviewOpp(o.id, "APPROVED")}>
                    {trainingActionLabel("APPROVED")}
                  </Btn>
                  <Btn tone="red" title={TRAINING_ACTION_MICROCOPY.REJECTED} onClick={() => void reviewOpp(o.id, "REJECTED")}>
                    {trainingActionLabel("REJECTED")}
                  </Btn>
                  <Btn title={TRAINING_ACTION_MICROCOPY.BACKLOGGED} onClick={() => void reviewOpp(o.id, "BACKLOGGED")}>
                    {trainingActionLabel("BACKLOGGED")}
                  </Btn>
                </div>

                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[10px] text-gray-400">Detalhe técnico</summary>
                  <p className="mt-0.5 text-[10px] text-gray-400">{v.technicalDetail}</p>
                </details>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 4. TREINAMENTOS APROVADOS ────────────────────────────────────── */}
      <section className="rounded-xl border border-green-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">✅ Treinamentos aprovados</h3>
        <p className="mt-0.5 text-[11px] text-gray-600">
          Essas melhorias foram aprovadas por você e podem virar técnica, regra ou ajuste em uma <strong>versão de teste</strong> do Waiter.
        </p>
        {ck && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Stat label="Aprovados por você" value={String(ck.opportunitiesByStatus.APPROVED ?? 0)} tone="green" />
            <Stat label="Guardados para depois" value={String(ck.opportunitiesByStatus.BACKLOGGED ?? 0)} tone="violet" />
            <Stat label="Rejeitados" value={String(ck.opportunitiesByStatus.REJECTED ?? 0)} tone="gray" />
          </div>
        )}
      </section>

      {/* ── Rodar simulação agora (operacional) ──────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Testar o Waiter agora</h3>
        <p className="mt-0.5 text-[11px] text-gray-500">Roda uma rodada de clientes artificiais em ambiente seguro e gera novas sugestões de treinamento.</p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-600">Quantos clientes testar
            <input type="number" min={1} max={24} value={scenarioCount}
              onChange={(e) => setScenarioCount(Math.max(1, Math.min(24, Number(e.target.value) || 12)))}
              className="mt-0.5 block w-20 rounded border border-gray-300 px-2 py-1 text-sm" />
          </label>
          <button type="button" disabled={busy} onClick={() => void runNow()}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Testando…" : "Testar o Waiter agora"}
          </button>
          <details className="text-[10px] text-gray-400">
            <summary className="cursor-pointer">Opções avançadas</summary>
            <label className="mt-1 block text-xs text-gray-600">Semente (reprodutível)
              <input type="text" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="ex: 2026-06-10"
                className="mt-0.5 block w-44 rounded border border-gray-300 px-2 py-1 text-sm" />
            </label>
          </details>
        </div>
        {msg && <p className="mt-2 text-[11px] text-gray-700">{msg}</p>}
      </section>

      {/* ── Últimas conversas simuladas ──────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Últimas conversas simuladas</h3>
        <div className="mt-2 space-y-1.5">
          {(ck?.latestScenarios.length ?? 0) === 0 && <p className="text-[11px] text-gray-500">Teste o Waiter para ver as conversas.</p>}
          {ck?.latestScenarios.map((s) => {
            const turns = parseTranscript(s.transcript);
            const customer = turns.find((t) => t.role === "customer")?.content ?? s.initialMessage;
            const agent = turns.find((t) => t.role === "agent")?.content ?? "";
            return (
              <div key={s.id} className="rounded-lg border border-gray-100 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={statusTone(s.status)}>{s.status === "PASS" ? "OK" : s.status === "WARNING" ? "Atenção" : s.status === "FAIL" ? "Falhou" : s.status}</Pill>
                  <Pill tone={sevTone(s.severity)}>{severityLabel(s.severity)}</Pill>
                  <span className="text-xs font-semibold text-gray-800">{scenarioTypeLabel(s.scenarioType)}</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-600">🙋 {customer}</p>
                {agent && <p className="text-[11px] text-gray-700">🤖 {agent}</p>}
                <p className="mt-0.5 text-[10px] text-gray-400">{s.summary}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 4.5 CASOS REAIS PARA REVISAR (propostas de treinamento) ───────── */}
      <section className="rounded-xl border-2 border-sky-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">📝 Casos reais para revisar</h3>
        <p className="mt-0.5 text-[11px] text-gray-600">Cada conversa real vira uma proposta clara: o problema, a resposta ideal e o que o Waiter aprenderia. Você decide.</p>
        <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[11px] text-blue-800">
          ℹ️ Aprovar não muda o atendimento real agora. Isso apenas registra o aprendizado para uma futura versão de teste do Waiter.
        </div>
        {suggStats && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Stat label="Para revisar" value={String(suggStats.pending)} tone="amber" />
            <Stat label="Aprovados" value={String(suggStats.approved)} tone="green" />
            <Stat label="Total" value={String(suggStats.total)} tone="gray" />
          </div>
        )}
        <div className="mt-3 space-y-2">
          {suggestions.length === 0 && (
            <p className="text-[12px] text-gray-500">Nenhum caso real para revisar agora. A coleta automática traz novos casos todos os dias.</p>
          )}
          {suggestions.map((s) => (
            <div key={s.id} className="rounded-lg border border-sky-100 bg-sky-50/40 p-3">
              <p className="text-xs font-bold text-gray-900">{s.title}</p>
              <dl className="mt-2 space-y-1 text-[11px] leading-snug">
                <Row label="Situação real" value={s.situationSummary} />
                <Row label="O que aconteceu" value={s.whatHappened} />
                <Row label="Problema" value={s.problemDetected} />
                <Row label="Resposta ideal sugerida" value={`“${s.idealResponse}”`} strong />
                <Row label="Treinamento que o Waiter aprenderia" value={s.trainingRule} />
                <Row label="Impacto esperado" value={s.expectedImpact} />
              </dl>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Btn tone="green" title={TRAINING_ACTION_MICROCOPY.APPROVED} onClick={() => void reviewSuggestion(s.id, "APPROVED")}>{trainingActionLabel("APPROVED")}</Btn>
                <Btn tone="red" title={TRAINING_ACTION_MICROCOPY.REJECTED} onClick={() => void reviewSuggestion(s.id, "REJECTED")}>{trainingActionLabel("REJECTED")}</Btn>
                <Btn title={TRAINING_ACTION_MICROCOPY.BACKLOGGED} onClick={() => void reviewSuggestion(s.id, "BACKLOG")}>{trainingActionLabel("BACKLOGGED")}</Btn>
              </div>
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[10px] text-gray-400">Detalhe técnico</summary>
                <p className="mt-0.5 text-[10px] text-gray-400">{s.suggestedActionType} · risco {s.riskLevel} · origem {fmt(s.createdAt)}</p>
              </details>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. CASOS REAIS (coleta bruta classificada) ───────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">💬 Casos reais</h3>
          <button type="button" disabled={busy} onClick={() => void extractExamples()}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Coletar casos reais agora</button>
        </div>
        <p className="mt-1 text-[11px] text-gray-600">Conversas reais com clientes, com dados sensíveis removidos. Elas ajudam o simulador a criar testes mais parecidos com a realidade.</p>
        <p className="mt-1 text-[11px] font-medium text-emerald-700">🔒 Dados sensíveis são removidos antes de qualquer uso. A coleta também roda automaticamente todos os dias.</p>
        {ck && (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Coletados hoje" value={String(ck.realIntake?.collectedToday ?? 0)} tone="blue" />
            <Stat label="Última coleta" value={fmt(ck.realIntake?.lastIntakeAt)} tone="violet" />
            <Stat label="Próxima coleta automática" value={fmt(ck.realIntake?.nextIntakeEstimate)} tone="blue" />
            <Stat label="Aguardando revisão" value={String(ck.exampleStats.pending)} tone="amber" />
            <Stat label="Total" value={String(ck.exampleStats.total)} tone="gray" />
            <Stat label="Usados como exemplo" value={String(ck.exampleStats.approved)} tone="green" />
            <Stat label="Não usar" value={String(ck.exampleStats.rejected)} tone="gray" />
          </div>
        )}
        <div className="mt-2 space-y-1.5">
          {examples.length === 0 && <p className="text-[11px] text-gray-500">Nenhum caso real ainda. Use “Buscar conversas reais” (sanitizadas) acima.</p>}
          {examples.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
              <Pill tone={e.status === "APPROVED" ? "green" : e.status === "REJECTED" ? "red" : e.status === "BACKLOGGED" ? "violet" : "amber"}>{exampleStatusLabel(e.status)}</Pill>
              <span className="text-xs font-semibold text-gray-800">{scenarioTypeLabel(e.scenarioType)}</span>
              <span className="text-[11px] text-gray-600">{e.intent}</span>
              <div className="ml-auto flex gap-1">
                <Btn tone="green" title="Quero usar este caso como exemplo." onClick={() => void reviewExample(e.id, "APPROVED")}>Usar como exemplo</Btn>
                <Btn tone="red" title="Não usar este caso." onClick={() => void reviewExample(e.id, "REJECTED")}>Não usar</Btn>
                <Btn title="Revisar depois." onClick={() => void reviewExample(e.id, "BACKLOGGED")}>Revisar depois</Btn>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 6. PRÓXIMA VERSÃO DE TESTE ───────────────────────────────────── */}
      <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
        <h3 className="text-sm font-bold text-gray-900">🧬 Próxima versão de teste do Waiter</h3>
        <p className="mt-1 text-[11px] text-gray-700">
          Quando houver treinamentos suficientes, você pode criar uma <strong>versão de teste do Waiter</strong> com essas
          melhorias. Ela passa pelo <strong>Quality Gate</strong> (segurança) antes de qualquer ativação — e só você ativa,
          manualmente. Abra a aba <strong>“Versão de teste”</strong> para montar.
        </p>
      </section>

      {/* ── Histórico ────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Histórico de simulações</h3>
        <div className="mt-2 space-y-1">
          {history.length === 0 && <p className="text-[11px] text-gray-500">Nenhuma simulação ainda.</p>}
          {history.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
              <span className="font-mono text-[10px] text-gray-400">{fmt(r.createdAt)}</span>
              <Pill tone={r.mode === "CRON" ? "violet" : "blue"}>{r.mode === "CRON" ? "Automática" : "Manual"}</Pill>
              <span className="text-[11px] text-gray-600">{r.scenariosTotal} clientes · {r.scenariosPassed} OK · {r.scenariosWarning} atenção · {r.scenariosFailed} falha</span>
              {r.p0Count > 0 && <Pill tone="red">{r.p0Count} crítico(s)</Pill>}
              <Pill tone="violet">{r.opportunityCount} sugestão(ões)</Pill>
              <Pill tone="green">atendimento real intocado</Pill>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-0.5"><Pill tone={tone}>{value}</Pill></div>
    </div>
  );
}
function SourceCard({ emoji, title, text }: { emoji: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-sm font-bold text-gray-900">{emoji} {title}</p>
      <p className="mt-1 text-[11px] leading-snug text-gray-600">{text}</p>
    </div>
  );
}
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="inline font-semibold text-gray-400">{label}: </dt>
      <dd className={`inline ${strong ? "font-semibold text-gray-900" : "text-gray-700"}`}>{value}</dd>
    </div>
  );
}
function Btn({ children, onClick, tone, title }: { children: React.ReactNode; onClick: () => void; tone?: string; title?: string }) {
  const cls = tone === "red" ? "border-red-300 text-red-700 hover:bg-red-50"
    : tone === "green" ? "border-green-300 text-green-700 hover:bg-green-50"
    : "border-gray-300 text-gray-700 hover:bg-gray-100";
  return <button type="button" title={title} onClick={onClick} className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</button>;
}
