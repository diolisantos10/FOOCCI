"use client";

/**
 * BrainFreeFormPanel — o painel operacional da escada do raciocínio livre.
 *
 * Consome GET /api/admin/brain/free-form?restaurantId=… e mostra: modo atual,
 * gates (diagnóstico, completude da verdade, evidência de sombra), estatísticas
 * de sombra e as últimas amostras. As três transições (allowlist / restaurante
 * inteiro / rollback) exigem confirmação dupla no UI — a confirm string exata
 * é enviada automaticamente após o segundo clique. Os gates reais rodam no
 * servidor; este painel nunca pula degrau.
 */

import { useCallback, useEffect, useState } from "react";

const BASE = "/api/admin/brain/free-form";

// Confirm strings do freeFormGovernance (server valida; duplicadas aqui porque
// o módulo do servidor puxa prisma e não pode entrar no bundle do client).
const PROMOTE_ALLOWLIST_CONFIRM = "PROMOTE_BRAIN_FREEFORM_ALLOWLIST";
const PROMOTE_WIDE_CONFIRM = "PROMOTE_BRAIN_FREEFORM_RESTAURANT_WIDE";
const ROLLBACK_FREEFORM_CONFIRM = "ROLLBACK_BRAIN_FREEFORM";

interface RestaurantOption { id: string; name: string; slug: string }

interface FreeFormConfig {
  restaurantId: string; mode: "SHADOW_ONLY" | "ALLOWLIST" | "RESTAURANT_WIDE";
  paused: boolean; minConfidence: number; allowlistCount: number; notes: string | null;
}
interface FreeFormGates {
  diagnosticPass: boolean; knowledgeComplete: boolean; completenessScore: number;
  shadowEvidence: boolean; shadowSamples: number; shadowPassRate: number;
  allPass: boolean; notes: string[];
}
interface ShadowStats {
  samples: number; llmSamples: number; coherencePassRate: number;
  avgConfidence: number; escalationRate: number; sinceDays: number;
}
interface ShadowSample {
  createdAt: string; intent: string; reasoningMode: string; engine: string;
  confidence: number; coherence: string; wouldEscalate: boolean; wouldReply: string;
}
interface PanelData {
  config: FreeFormConfig; gates: FreeFormGates; shadowStats: ShadowStats; recentSamples: ShadowSample[];
  /** Saude do TOPO — a medicao de quem ja subiu (null quando nao deu para ler). */
  topo?: {
    saude: "SAUDAVEL" | "DEGRADADO" | "SEM_AMOSTRA";
    derruba: boolean; amostras: number; acertos: number; taxa: number | null;
    piso: number; minimoAmostras: number; motivo: string;
  } | null;
}
interface TransitionResult {
  success: boolean; previousMode: string; newMode: string;
  gates: FreeFormGates | null; changeRequestId: string | null; error: string | null;
}

const MODE_LABELS: Record<string, string> = {
  SHADOW_ONLY: "Shadow (só observa)", ALLOWLIST: "Allowlist (time)", RESTAURANT_WIDE: "Restaurante inteiro",
};
const MODE_TONES: Record<string, string> = { SHADOW_ONLY: "gray", ALLOWLIST: "amber", RESTAURANT_WIDE: "red" };

type ActionKey = "promote-allowlist" | "promote-wide" | "rollback";

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const map: Record<string, string> = {
    green: "bg-green-100 text-green-800", gray: "bg-gray-100 text-gray-700",
    amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${map[tone] ?? map.gray}`}>{children}</span>;
}

function GateRow({ pass, label, detail }: { pass: boolean; label: string; detail: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-b border-gray-100 pb-1.5 text-sm last:border-0">
      <Pill tone={pass ? "green" : "red"}>{pass ? "PASS" : "FAIL"}</Pill>
      <span className="font-semibold text-gray-900">{label}</span>
      <span className="text-xs text-gray-500">{detail}</span>
    </div>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export function BrainFreeFormPanel() {
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<TransitionResult | null>(null);

  // Inputs das transições
  const [phonesInput, setPhonesInput] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [armed, setArmed] = useState<ActionKey | null>(null); // confirmação dupla: 1º clique arma, 2º executa
  const [busy, setBusy] = useState(false);

  // Seletor de restaurante — mesmo padrão das outras páginas admin.
  useEffect(() => {
    fetch("/api/admin/restaurants")
      .then((r) => r.json())
      .then((d: unknown) => {
        const list: RestaurantOption[] = Array.isArray(d)
          ? (d as RestaurantOption[])
          : Array.isArray((d as { data?: unknown })?.data)
          ? ((d as { data: RestaurantOption[] }).data)
          : ((d as { restaurants?: RestaurantOption[] })?.restaurants ?? []);
        setRestaurants(list);
        if (list.length > 0) setRestaurantId((prev) => prev || list[0]!.id);
      })
      .catch(() => setMsg("Falha ao carregar restaurantes."));
  }, []);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setMsg("");
    const res = await fetch(`${BASE}?restaurantId=${encodeURIComponent(restaurantId)}`)
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "Falha de rede." }));
    if (res.ok) setData(res as PanelData);
    else { setData(null); setMsg(res.error ?? "Falha ao carregar."); }
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { setResult(null); setArmed(null); void load(); }, [load]);

  // Confirmação dupla: o 1º clique arma o botão; o 2º envia a confirm string exata.
  const runAction = useCallback(async (action: ActionKey) => {
    if (armed !== action) { setArmed(action); return; }
    setArmed(null);
    setBusy(true);
    setResult(null);
    setMsg("");
    const payload: Record<string, unknown> = { action, restaurantId };
    if (action === "promote-allowlist") {
      payload.phones = phonesInput.split(/[,\n;]/).map((p) => p.trim()).filter(Boolean);
      payload.confirm = PROMOTE_ALLOWLIST_CONFIRM;
    } else if (action === "promote-wide") {
      payload.confirm = PROMOTE_WIDE_CONFIRM;
      payload.acknowledgeRealCustomers = acknowledge;
    } else {
      payload.confirm = ROLLBACK_FREEFORM_CONFIRM;
    }
    const res = await fetch(BASE, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Falha de rede." }));
    if (res.result) setResult(res.result as TransitionResult);
    else setMsg(res.error ?? "Falha.");
    setBusy(false);
    await load();
  }, [armed, restaurantId, phonesInput, acknowledge, load]);

  // Botão de PÂNICO: um clique volta pro seguro (SHADOW_ONLY = menu + recepcionista,
  // Brain desligado pro público). Sem confirmação dupla de propósito — em
  // emergência velocidade importa, e reverter é inócuo (o menu continua atendendo).
  const panic = useCallback(async () => {
    setBusy(true);
    setResult(null);
    setMsg("");
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rollback", restaurantId, confirm: ROLLBACK_FREEFORM_CONFIRM }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Falha de rede." }));
    if (res.result) setResult(res.result as TransitionResult);
    else setMsg(res.error ?? "Falha.");
    setBusy(false);
    await load();
  }, [restaurantId, load]);

  const armedLabel = (action: ActionKey, label: string) =>
    armed === action ? "Clique de novo para confirmar" : label;

  const config = data?.config ?? null;
  const gates = data?.gates ?? null;
  const stats = data?.shadowStats ?? null;
  const topo = data?.topo ?? null;

  return (
    <section className="rounded-xl border-2 border-indigo-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">🪜 Escada do free-form — status e promoções</h2>
      <p className="mt-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[11px] text-blue-800">
        ℹ️ Promover roda os gates <strong>no servidor</strong> a cada transição — a escada não pula degrau.
        Tudo é config-only: nenhuma mensagem é enviada por este painel.
      </p>

      {/* BOTÃO DE PÂNICO — um clique volta pro seguro. Só aparece quando o Brain
          está ativo pro público/allowlist (nada a reverter em SHADOW). */}
      {config && config.mode !== "SHADOW_ONLY" && (
        <button
          type="button"
          onClick={() => void panic()}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-md transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          🛑 Voltar ao seguro agora — desliga o Brain pro público (menu continua)
        </button>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-[11px] font-semibold text-gray-500" htmlFor="ff-restaurant">Restaurante</label>
        <select
          id="ff-restaurant"
          value={restaurantId}
          onChange={(e) => setRestaurantId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-800"
        >
          {restaurants.length === 0 && <option value="">Carregando…</option>}
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>{r.name} ({r.slug})</option>
          ))}
        </select>
        <button type="button" onClick={() => void load()} disabled={loading || !restaurantId}
          className="rounded border border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50">
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {msg && <p className="mt-2 text-[11px] text-red-600">{msg}</p>}

      {result && (
        <div className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${result.success ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {result.success
            ? <>✅ Transição aplicada: <strong>{result.previousMode} → {result.newMode}</strong>{result.changeRequestId ? <> · CR registrado: <span className="font-mono">{result.changeRequestId}</span></> : null}</>
            : <>⛔ {result.error ?? "Transição recusada."}</>}
        </div>
      )}

      {data && config && gates && stats && (
        <>
          {/* Modo atual */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-100 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Modo atual</p>
              <p className="mt-0.5"><Pill tone={MODE_TONES[config.mode] ?? "gray"}>{MODE_LABELS[config.mode] ?? config.mode}</Pill></p>
            </div>
            <div className="rounded-lg border border-gray-100 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Pausado</p>
              <p className="mt-0.5"><Pill tone={config.paused ? "red" : "green"}>{config.paused ? "Sim" : "Não"}</Pill></p>
            </div>
            <div className="rounded-lg border border-gray-100 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Allowlist</p>
              <p className="mt-0.5"><Pill tone="blue">{config.allowlistCount} telefone(s)</Pill></p>
            </div>
            <div className="rounded-lg border border-gray-100 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Confiança mínima</p>
              <p className="mt-0.5"><Pill tone="violet">{config.minConfidence.toFixed(2)}</Pill></p>
            </div>
          </div>

          {/*
            SAUDE DO TOPO — a medicao que a escada nao tinha.

            Os gates abaixo dizem se o agente PODE subir, e medem isso com
            sombra, que so existe embaixo: quem sobe para o topo para de
            produzi-la e fica marcando zero para sempre. Este bloco responde a
            outra pergunta — ele esta se sustentando ONDE ESTA?

            SEM_AMOSTRA aparece em AMBAR, nunca em verde: restaurante pequeno
            nao cai por ser pequeno, mas "nao medi" jamais e exibido como "ok".
          */}
          {topo && (
            <div className={`mt-3 rounded-lg border p-3 ${
              topo.saude === "DEGRADADO" ? "border-red-300 bg-red-50"
              : topo.saude === "SEM_AMOSTRA" ? "border-amber-300 bg-amber-50"
              : "border-green-300 bg-green-50"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Saúde do topo (atendimento ao vivo)</h3>
                <Pill tone={topo.saude === "DEGRADADO" ? "red" : topo.saude === "SEM_AMOSTRA" ? "amber" : "green"}>
                  {topo.saude === "DEGRADADO" ? "Degradado — cai sozinho"
                    : topo.saude === "SEM_AMOSTRA" ? "Sem amostra suficiente para medir o topo"
                    : "Saudável"}
                </Pill>
              </div>
              <p className="mt-1.5 text-[11px] text-gray-700">{topo.motivo}</p>
              <p className="mt-1 text-[10px] text-gray-500">
                Régua: coerência ao vivo ≥ {Math.round(topo.piso * 100)}% nas últimas {topo.amostras || 0} de até 50 amostras,
                a partir de {topo.minimoAmostras} atendimentos. Abaixo disso a taxa não derruba ninguém — e também não aprova.
              </p>
            </div>
          )}

          {/* Gates */}
          <div className="mt-3 rounded-lg border border-gray-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Gates de promoção</h3>
              <Pill tone={gates.allPass ? "green" : "red"}>{gates.allPass ? "Todos PASS" : "Reprovado"}</Pill>
            </div>
            <div className="mt-2 space-y-1.5">
              <GateRow pass={gates.diagnosticPass} label="Diagnóstico (golden set p0=0)"
                detail="Gate de qualidade do whatsapp — zero falhas críticas." />
              <GateRow pass={gates.knowledgeComplete} label={`Completude da verdade: ${gates.completenessScore.toFixed(2)}`}
                detail="Snapshot da Knowledge Base ≥ 0.60 (horários, cardápio, pagamentos)." />
              <GateRow pass={gates.shadowEvidence}
                label={`Evidência de sombra: ${gates.shadowSamples} amostras LLM · coerência PASS ${pct(gates.shadowPassRate)}`}
                detail="Allowlist exige ≥ 20 amostras e ≥ 70%; restaurante inteiro exige ≥ 100 e ≥ 85%." />
            </div>
            {gates.notes.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {gates.notes.map((n) => <li key={n} className="text-[11px] text-amber-700">⚠️ {n}</li>)}
              </ul>
            )}
          </div>

          {/* Estatísticas de sombra */}
          <div className="mt-3 rounded-lg border border-gray-200 p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Estatísticas de sombra (últimos {stats.sinceDays} dias)
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: "Amostras", value: String(stats.samples) },
                { label: "Amostras LLM", value: String(stats.llmSamples) },
                { label: "Coerência PASS", value: pct(stats.coherencePassRate) },
                { label: "Confiança média", value: stats.avgConfidence.toFixed(2) },
                { label: "Taxa de escalada", value: pct(stats.escalationRate) },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-gray-100 px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">{k.label}</p>
                  <p className="mt-0.5 text-sm font-bold text-gray-900">{k.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Ações governadas */}
          <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <p className="text-xs font-bold text-gray-900">Promover para Allowlist</p>
              <p className="mt-1 text-[11px] text-gray-600">SHADOW_ONLY → ALLOWLIST. Só telefones do time recebem respostas do Brain.</p>
              <textarea
                value={phonesInput}
                onChange={(e) => setPhonesInput(e.target.value)}
                placeholder={"Telefones do time (um por linha ou separados por vírgula)\n+5511999990000"}
                rows={3}
                className="mt-2 w-full rounded border border-gray-300 px-2 py-1 font-mono text-[11px] text-gray-800"
              />
              <button type="button" onClick={() => void runAction("promote-allowlist")}
                disabled={busy || !phonesInput.trim() || config.mode !== "SHADOW_ONLY"}
                className={`mt-2 rounded border px-2 py-0.5 text-[11px] font-semibold disabled:opacity-50 ${armed === "promote-allowlist" ? "border-amber-500 bg-amber-100 text-amber-900" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}>
                {armedLabel("promote-allowlist", "Promover para Allowlist")}
              </button>
              {config.mode !== "SHADOW_ONLY" && <p className="mt-1 text-[10px] text-gray-400">Disponível apenas a partir de SHADOW_ONLY.</p>}
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
              <p className="text-xs font-bold text-gray-900">Promover para Restaurante inteiro</p>
              <p className="mt-1 text-[11px] text-gray-600">ALLOWLIST → RESTAURANT_WIDE. Registra Change Request CRITICAL na trilha do Director.</p>
              <label className="mt-2 flex items-start gap-1.5 text-[11px] text-red-800">
                <input type="checkbox" checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} className="mt-0.5" />
                <span>Reconheço que <strong>clientes REAIS</strong> passarão a receber respostas do Brain.</span>
              </label>
              <button type="button" onClick={() => void runAction("promote-wide")}
                disabled={busy || !acknowledge || config.mode !== "ALLOWLIST"}
                className={`mt-2 rounded border px-2 py-0.5 text-[11px] font-semibold disabled:opacity-50 ${armed === "promote-wide" ? "border-red-500 bg-red-100 text-red-900" : "border-red-300 text-red-700 hover:bg-red-50"}`}>
                {armedLabel("promote-wide", "Promover para Restaurante inteiro")}
              </button>
              {config.mode !== "ALLOWLIST" && <p className="mt-1 text-[10px] text-gray-400">Disponível apenas a partir de ALLOWLIST.</p>}
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-bold text-gray-900">Rollback 30s</p>
              <p className="mt-1 text-[11px] text-gray-600">Volta para SHADOW_ONLY imediatamente. Allowlist e histórico preservados; o shadow continua colhendo evidência.</p>
              <button type="button" onClick={() => void runAction("rollback")}
                disabled={busy || config.mode === "SHADOW_ONLY"}
                className={`mt-2 rounded border px-2 py-0.5 text-[11px] font-semibold disabled:opacity-50 ${armed === "rollback" ? "border-gray-500 bg-gray-100 text-gray-900" : "border-gray-300 text-gray-700 hover:bg-gray-100"}`}>
                {armedLabel("rollback", "Rollback 30s → SHADOW_ONLY")}
              </button>
              {config.mode === "SHADOW_ONLY" && <p className="mt-1 text-[10px] text-gray-400">Já está em SHADOW_ONLY.</p>}
            </div>
          </div>

          {/* Últimas amostras */}
          <details className="mt-3" open={data.recentSamples.length > 0}>
            <summary className="cursor-pointer text-[11px] font-semibold text-gray-400">
              Últimas amostras de sombra ({data.recentSamples.length})
            </summary>
            {data.recentSamples.length === 0 ? (
              <p className="mt-1.5 text-[12px] text-gray-500">Nenhuma amostra ainda — deixe o shadow colher tráfego real.</p>
            ) : (
              <div className="mt-1.5 space-y-1">
                {data.recentSamples.map((s, i) => (
                  <div key={`${s.createdAt}-${i}`} className="rounded border border-gray-100 px-2 py-1.5 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={s.coherence === "PASS" ? "green" : "red"}>{s.coherence}</Pill>
                      <Pill tone="blue">{s.intent}</Pill>
                      <Pill tone={s.reasoningMode === "LLM" ? "violet" : "gray"}>{s.reasoningMode}</Pill>
                      <span className="font-mono text-gray-400">{s.engine}</span>
                      <span className="text-gray-500">confiança {s.confidence.toFixed(2)}</span>
                      {s.wouldEscalate && <Pill tone="amber">Escalaria</Pill>}
                      <span className="text-gray-400">{new Date(s.createdAt).toLocaleString("pt-BR")}</span>
                    </div>
                    <p className="mt-1 text-gray-600">💬 {s.wouldReply || "(sem resposta)"}</p>
                  </div>
                ))}
              </div>
            )}
          </details>
        </>
      )}

      {!data && !msg && <p className="mt-3 text-[12px] text-gray-500">{loading ? "Carregando…" : "Selecione um restaurante."}</p>}
    </section>
  );
}
