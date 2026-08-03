"use client";

/**
 * CrmAgentHousePanel — a casa única do Agente de CRM no admin.
 *
 * Cinco blocos, respondidos à primeira olhada:
 *   1. Em que degrau ele está (SHADOW_ONLY → ALLOWLIST → RESTAURANT_WIDE) + desde quando
 *   2. O que ele está fazendo — últimas decisões (sombra e envio real, marca agent:crm)
 *   3. A prova A/B — números na frente e o veredito honesto do teste z
 *   4. Os controles — subir degrau com confirm DIGITADO e o botão de pânico (30s → sombra)
 *   5. Próximo passo — o que falta para o próximo degrau
 *
 * Dados: GET /api/admin/crm/agent/pilot-status (observação/A-B/gates) +
 * GET /api/admin/crm/agent/pilot (config, desde quando, decisões).
 * Ações: POST /api/admin/crm/agent/pilot → crmAgentGovernance (os gates rodam
 * no servidor; este painel nunca pula degrau).
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, Pill, SectionTitle } from "@/components/ui";
import { CrmAgenteEscadaPanel } from "./CrmAgenteEscadaPanel";

const STATUS_URL = "/api/admin/crm/agent/pilot-status";
const PILOT_URL = "/api/admin/crm/agent/pilot";

// Confirm strings do crmAgentGovernance (o servidor valida; duplicadas aqui
// porque o módulo do servidor puxa prisma e não pode entrar no bundle do client).
const PROMOTE_ALLOWLIST_CONFIRM = "PROMOTE_CRM_AGENT_ALLOWLIST";
const PROMOTE_WIDE_CONFIRM = "PROMOTE_CRM_AGENT_RESTAURANT_WIDE";
const ROLLBACK_CONFIRM = "ROLLBACK_CRM_AGENT";

// ── Tipos (espelham os serviços do servidor) ─────────────────────────────────

interface RestaurantOption { id: string; name: string; slug: string }

type Modo = "SHADOW_ONLY" | "ALLOWLIST" | "RESTAURANT_WIDE";

interface Braco { envios: number; conversoes: number; taxa: number }
interface ComparacaoAB {
  agente: Braco; controle: Braco;
  liftPct: number | null; z: number | null;
  veredito: "AGENTE_MELHOR" | "CONTROLE_MELHOR" | "EMPATE" | "AMOSTRA_INSUFICIENTE";
  leitura: string;
}
interface Gates {
  gatePass: boolean; gateReason: string;
  shadowEvidence: boolean; shadowSamples: number; shadowPassRate: number;
  allPass: boolean; notes: string[];
}
interface Observacao {
  modo: Modo; pausado: boolean; abTestPercent: number; telefonesNaAllowlist: number;
  proximoDegrau: "ALLOWLIST" | "RESTAURANT_WIDE" | null;
  gates: Gates | null; ab: ComparacaoAB;
  prontoParaPromover: boolean; bloqueios: string[]; veredito: string;
}
interface PilotConfig {
  mode: Modo; paused: boolean; abTestPercent: number; allowlistedPhones: string[];
}
interface Decisao {
  quando: string; origem: "SOMBRA" | "ENVIO_REAL"; situacao: string; mensagem: string;
  coerencia: string | null; confianca: number | null; status: string | null; converteu: boolean | null;
}
interface TransitionResult {
  success: boolean; previousMode: Modo; newMode: Modo; error: string | null;
}

// ── Rótulos ──────────────────────────────────────────────────────────────────

const DEGRAUS: Array<{ modo: Modo; titulo: string; detalhe: string }> = [
  { modo: "SHADOW_ONLY", titulo: "Sombra", detalhe: "Observa, decide e registra. Nada chega a cliente." },
  { modo: "ALLOWLIST", titulo: "Allowlist", detalhe: "Envia DE VERDADE — só para os telefones do time." },
  { modo: "RESTAURANT_WIDE", titulo: "Restaurante inteiro", detalhe: "Todos os clientes elegíveis recebem o agente." },
];

const VEREDITO_AB: Record<ComparacaoAB["veredito"], { rotulo: string; tone: string }> = {
  AGENTE_MELHOR: { rotulo: "Agente na frente", tone: "green" },
  CONTROLE_MELHOR: { rotulo: "Sorteio na frente — não promover", tone: "red" },
  EMPATE: { rotulo: "Empate técnico", tone: "neutral" },
  AMOSTRA_INSUFICIENTE: { rotulo: "Ainda não conclui", tone: "blue" },
};

const fmtData = (iso: string | Date) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// ── Peças pequenas ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-line2 ${className}`} />;
}

function BlocoCarregando({ titulo, linhas = 3 }: { titulo: string; linhas?: number }) {
  return (
    <Card className="p-5">
      <SectionTitle>{titulo}</SectionTitle>
      <div className="space-y-2.5">
        {Array.from({ length: linhas }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i % 2 ? "w-2/3" : "w-full"}`} />
        ))}
      </div>
    </Card>
  );
}

// ── O painel ─────────────────────────────────────────────────────────────────

export function CrmAgentHousePanel() {
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [obs, setObs] = useState<Observacao | null>(null);
  const [config, setConfig] = useState<PilotConfig | null>(null);
  const [configDesde, setConfigDesde] = useState<string | null>(null);
  const [decisoes, setDecisoes] = useState<Decisao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  // Controles
  const [phonesInput, setPhonesInput] = useState("");
  const [phonesTouched, setPhonesTouched] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [panicArmed, setPanicArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TransitionResult | null>(null);
  const [actionMsg, setActionMsg] = useState("");

  // Seletor de restaurante — mesmo padrão das outras páginas admin.
  useEffect(() => {
    fetch("/api/admin/restaurants")
      .then((r) => r.json())
      .then((d: unknown) => {
        const list: RestaurantOption[] = Array.isArray(d)
          ? (d as RestaurantOption[])
          : Array.isArray((d as { data?: unknown })?.data)
          ? (d as { data: RestaurantOption[] }).data
          : ((d as { restaurants?: RestaurantOption[] })?.restaurants ?? []);
        setRestaurants(list);
        if (list.length > 0) setRestaurantId((prev) => prev || list[0]!.id);
        else { setLoading(false); setErro("Nenhum restaurante cadastrado."); }
      })
      .catch(() => { setLoading(false); setErro("Falha ao carregar a lista de restaurantes. Confira a conexão e tente de novo."); });
  }, []);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setErro("");
    const q = `restaurantId=${encodeURIComponent(restaurantId)}`;
    const [statusRes, pilotRes] = await Promise.all([
      fetch(`${STATUS_URL}?${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch(`${PILOT_URL}?${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
    ]);
    if (statusRes?.ok && pilotRes?.ok) {
      setObs(statusRes as Observacao);
      setConfig(pilotRes.config as PilotConfig);
      setConfigDesde(pilotRes.configDesde ?? null);
      setDecisoes(Array.isArray(pilotRes.decisoes) ? (pilotRes.decisoes as Decisao[]) : []);
    } else {
      setObs(null); setConfig(null); setDecisoes([]);
      setErro(statusRes?.error ?? pilotRes?.error ?? "Falha ao carregar o agente deste restaurante.");
    }
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    setResult(null); setActionMsg(""); setPanicArmed(false);
    setConfirmInput(""); setAcknowledge(false); setPhonesTouched(false);
    void load();
  }, [load]);

  // Pré-preenche os telefones com o que já está salvo (sem sobrescrever digitação).
  useEffect(() => {
    if (config && !phonesTouched) setPhonesInput(config.allowlistedPhones.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const postAction = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true); setResult(null); setActionMsg("");
    const res = await fetch(PILOT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, restaurantId }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Falha de rede." }));
    if (res.result) setResult(res.result as TransitionResult);
    else setActionMsg(res.error ?? "Falha ao executar a ação.");
    setBusy(false);
    setConfirmInput(""); setAcknowledge(false); setPanicArmed(false);
    await load();
  }, [restaurantId, load]);

  const phones = phonesInput.split(/[,\n;]/).map((p) => p.trim()).filter(Boolean);

  // ── Estados globais ────────────────────────────────────────────────────────

  const seletor = (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="crm-house-restaurant" className="text-sm font-semibold text-ink">Restaurante</label>
        <select
          id="crm-house-restaurant"
          value={restaurantId}
          onChange={(e) => setRestaurantId(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:max-w-xs sm:flex-none"
        >
          {restaurants.length === 0 && <option value="">— nenhum —</option>}
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>{r.name} ({r.slug})</option>
          ))}
        </select>
        <Button onClick={() => void load()} disabled={loading || !restaurantId}>
          {loading ? "Carregando…" : "Atualizar"}
        </Button>
      </div>
    </Card>
  );

  if (erro && !loading && !obs) {
    return (
      <div className="space-y-4">
        {seletor}
        <Card className="p-5">
          <p className="text-sm font-semibold text-ink">Não deu para carregar o agente.</p>
          <p className="mt-1 text-sm text-ink2">{erro}</p>
          <Button className="mt-4" onClick={() => void load()} disabled={!restaurantId}>Tentar de novo</Button>
        </Card>
      </div>
    );
  }

  if (loading || !obs || !config) {
    return (
      <div className="space-y-4">
        {seletor}
        <BlocoCarregando titulo="O degrau" linhas={2} />
        <BlocoCarregando titulo="O que ele está fazendo" linhas={4} />
        <div className="grid gap-4 lg:grid-cols-2">
          <BlocoCarregando titulo="A prova A/B" />
          <BlocoCarregando titulo="Controles" />
        </div>
        <BlocoCarregando titulo="Próximo passo" linhas={2} />
      </div>
    );
  }

  const degrauAtual = DEGRAUS.findIndex((d) => d.modo === obs.modo);
  const vAB = VEREDITO_AB[obs.ab.veredito];
  const podePromoverAllowlist = obs.modo === "SHADOW_ONLY";
  const podePromoverWide = obs.modo === "ALLOWLIST";
  const confirmEsperado = podePromoverAllowlist ? PROMOTE_ALLOWLIST_CONFIRM : PROMOTE_WIDE_CONFIRM;
  const confirmOk = confirmInput.trim() === confirmEsperado;

  return (
    <div className="space-y-4">
      {seletor}

      {/* ── Bloco 1 · O degrau ──────────────────────────────────────────────── */}
      <Card className="p-5">
        <SectionTitle>O degrau</SectionTitle>
        <ol className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {DEGRAUS.map((d, i) => {
            const atual = i === degrauAtual;
            const passado = i < degrauAtual;
            return (
              <li
                key={d.modo}
                className={`flex-1 rounded-xl border p-3 ${
                  atual ? "border-brand-500 bg-brand-50" : "border-line bg-paper"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold ${
                      atual ? "bg-brand-500 text-white" : passado ? "bg-brand-50 text-brand-600" : "bg-[#F4F4F2] text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className={`text-sm font-semibold ${atual ? "text-brand-600" : passado ? "text-ink" : "text-muted"}`}>
                    {d.titulo}
                  </span>
                  {atual && <Pill tone="brand">agora</Pill>}
                </div>
                <p className={`mt-1.5 text-xs leading-relaxed ${atual ? "text-ink2" : "text-muted"}`}>{d.detalhe}</p>
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {obs.pausado && <Pill tone="red">PAUSADO — rollback ativo, nada do agente sai</Pill>}
          <Pill tone="neutral">
            {configDesde
              ? `neste degrau desde ${fmtData(configDesde)}`
              : "em sombra desde sempre — nunca configurado"}
          </Pill>
          <Pill tone="neutral">{obs.telefonesNaAllowlist} telefone(s) na allowlist</Pill>
          <Pill tone="neutral">fatia A/B: {obs.abTestPercent}% dos elegíveis</Pill>
        </div>
      </Card>

      {/* ── Bloco 2 · O que ele está fazendo ───────────────────────────────── */}
      <Card className="p-5">
        <SectionTitle meta="marca agent:crm">O que ele está fazendo</SectionTitle>
        {decisoes.length === 0 ? (
          <EmptyState
            icon="🕵️"
            title="Nenhuma decisão registrada ainda."
            sub="O agente entra em campo no próximo disparo real de campanha — em sombra ele registra o que enviaria sem enviar."
          />
        ) : (
          <ul className="divide-y divide-line">
            {decisoes.map((d, i) => (
              <li key={`${d.quando}-${i}`} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  {d.origem === "SOMBRA"
                    ? <Pill tone="neutral">sombra — só registrou</Pill>
                    : <Pill tone="green">enviou de verdade</Pill>}
                  <span className="text-xs font-semibold text-ink">{d.situacao}</span>
                  {d.coerencia && (
                    <Pill tone={d.coerencia === "PASS" ? "green" : d.coerencia === "FAIL" ? "red" : "amber"}>
                      coerência {d.coerencia}
                    </Pill>
                  )}
                  {d.status && <Pill tone="blue">{d.status}</Pill>}
                  {d.converteu === true && <Pill tone="green">converteu</Pill>}
                  <span className="ml-auto text-xs tabular-nums text-muted">{fmtData(d.quando)}</span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink2">
                  {d.origem === "SOMBRA" ? "Enviaria: " : "Enviou: "}
                  <span className="text-ink">“{d.mensagem || "(sem texto)"}”</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Blocos 3 e 4 lado a lado no desktop ────────────────────────────── */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Bloco 3 · A prova A/B */}
        <Card className="p-5">
          <SectionTitle meta="agente × sorteio (controle)">A prova A/B</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-brand-400 bg-brand-50 p-3">
              <p className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-brand-600">Agente</p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{pct(obs.ab.agente.taxa)}</p>
              <p className="mt-0.5 text-xs tabular-nums text-ink2">
                {obs.ab.agente.conversoes} conversões / {obs.ab.agente.envios} envios
              </p>
            </div>
            <div className="rounded-xl border border-line bg-paper p-3">
              <p className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted">Sorteio (controle)</p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{pct(obs.ab.controle.taxa)}</p>
              <p className="mt-0.5 text-xs tabular-nums text-ink2">
                {obs.ab.controle.conversoes} conversões / {obs.ab.controle.envios} envios
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill tone={vAB.tone}>{vAB.rotulo}</Pill>
            {obs.ab.z !== null && <Pill tone="neutral">z = {obs.ab.z}</Pill>}
            {obs.ab.liftPct !== null && (
              // Com amostra insuficiente o lift é só curiosidade — não ganha cor
              // de resultado (verde/vermelho seria vender conclusão que não existe).
              <Pill
                tone={
                  obs.ab.veredito === "AMOSTRA_INSUFICIENTE" || obs.ab.veredito === "EMPATE"
                    ? "neutral"
                    : obs.ab.liftPct >= 0 ? "green" : "red"
                }
              >
                lift {obs.ab.liftPct >= 0 ? "+" : ""}{obs.ab.liftPct}%
              </Pill>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink2">{obs.ab.leitura}</p>
        </Card>

        {/* Bloco 4 · Controles */}
        <Card className="p-5">
          <SectionTitle meta="promover exige confirmação digitada">Controles</SectionTitle>

          {result && (
            <div className={`mb-3 rounded-xl border px-3 py-2 text-sm ${
              result.success ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-600"
            }`}>
              {result.success
                ? <>Transição aplicada: <span className="font-semibold">{result.previousMode} → {result.newMode}</span></>
                : <>Transição recusada: {result.error ?? "erro desconhecido"}</>}
            </div>
          )}
          {actionMsg && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{actionMsg}</div>
          )}

          {podePromoverAllowlist && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
                <span className="font-semibold">⚠️ ALLOWLIST envia mensagem de verdade</span> para os telefones da
                lista. Por isso começa pelo time: erro aparece para vocês, não para cliente.
              </div>
              <div>
                <label htmlFor="crm-house-phones" className="text-xs font-semibold text-ink">
                  Telefones do time (um por linha ou separados por vírgula)
                </label>
                <textarea
                  id="crm-house-phones"
                  value={phonesInput}
                  onChange={(e) => { setPhonesTouched(true); setPhonesInput(e.target.value); }}
                  rows={3}
                  placeholder={"+5511999990000\n+5511988880000"}
                  className="mt-1 w-full rounded-xl border border-line2 bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                {phones.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    A allowlist está vazia — promover sem telefones não fará nada útil: o agente não terá para quem enviar.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="crm-house-confirm" className="text-xs font-semibold text-ink">
                  Para confirmar, digite <span className="font-mono text-brand-600">{PROMOTE_ALLOWLIST_CONFIRM}</span>
                </label>
                <input
                  id="crm-house-confirm"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={PROMOTE_ALLOWLIST_CONFIRM}
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-line2 bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <Button
                variant="primary"
                className="w-full"
                disabled={busy || !confirmOk || phones.length === 0}
                onClick={() => void postAction({ action: "promote-allowlist", phones, confirm: PROMOTE_ALLOWLIST_CONFIRM })}
              >
                {busy ? "Promovendo…" : "Subir para Allowlist — começa a enviar ao time"}
              </Button>
            </div>
          )}

          {podePromoverWide && (
            <div className="space-y-3">
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                <span className="font-semibold">Restaurante inteiro = clientes REAIS.</span> Todos os elegíveis passam
                a receber mensagens compostas pelo agente. Os gates rodam no servidor antes de abrir.
              </div>
              <label className="flex items-start gap-2 text-sm text-ink2">
                <input
                  type="checkbox"
                  checked={acknowledge}
                  onChange={(e) => setAcknowledge(e.target.checked)}
                  className="mt-0.5 accent-brand-500"
                />
                <span>Reconheço que <span className="font-semibold text-ink">clientes reais</span> receberão as mensagens do agente.</span>
              </label>
              <div>
                <label htmlFor="crm-house-confirm" className="text-xs font-semibold text-ink">
                  Para confirmar, digite <span className="font-mono text-red-600">{PROMOTE_WIDE_CONFIRM}</span>
                </label>
                <input
                  id="crm-house-confirm"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={PROMOTE_WIDE_CONFIRM}
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-line2 bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <button
                type="button"
                disabled={busy || !confirmOk || !acknowledge}
                onClick={() => void postAction({ action: "promote-wide", confirm: PROMOTE_WIDE_CONFIRM, acknowledgeRealCustomers: acknowledge })}
                className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Abrindo…" : "Abrir para o restaurante inteiro"}
              </button>
            </div>
          )}

          {obs.modo === "RESTAURANT_WIDE" && (
            <p className="text-sm text-ink2">
              O agente está no topo da escada. Não há degrau acima — o trabalho agora é vigiar a prova A/B e usar o
              botão de pânico se ela virar contra.
            </p>
          )}

          {/* Botão de pânico — rollback 30s → sombra. Dois cliques: arma e confirma. */}
          {obs.modo !== "SHADOW_ONLY" && (
            <div className="mt-4 border-t border-line pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!panicArmed) { setPanicArmed(true); return; }
                  void postAction({ action: "rollback", confirm: ROLLBACK_CONFIRM });
                }}
                className={`w-full rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-colors disabled:opacity-50 ${
                  panicArmed
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                }`}
              >
                {panicArmed ? "Confirmar: voltar para sombra AGORA" : "🛑 Botão de pânico — rollback 30s → sombra"}
              </button>
              <p className="mt-1.5 text-xs text-muted">
                Volta para SHADOW_ONLY na hora. O sorteio nunca para; allowlist e histórico ficam preservados.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Bloco 5 · Próximo passo ────────────────────────────────────────── */}
      <Card className="p-5">
        <SectionTitle>Próximo passo</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={obs.prontoParaPromover ? "green" : "amber"}>
            {obs.prontoParaPromover ? "Pronto para promover" : "Ainda não promover"}
          </Pill>
          <p className="text-sm font-semibold text-ink">{obs.veredito}</p>
        </div>
        {obs.bloqueios.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {obs.bloqueios.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-ink2">
                <span className="mt-0.5 text-amber-700">⚠</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        {obs.gates && (
          <div className="mt-4 space-y-1.5 border-t border-line pt-3">
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <Pill tone={obs.gates.gatePass ? "green" : "red"}>{obs.gates.gatePass ? "PASS" : "FAIL"}</Pill>
              <span className="font-semibold text-ink">Portão de qualidade</span>
              <span className="text-xs text-muted">{obs.gates.gateReason}</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <Pill tone={obs.gates.shadowEvidence ? "green" : "red"}>{obs.gates.shadowEvidence ? "PASS" : "FAIL"}</Pill>
              <span className="font-semibold text-ink">Evidência de sombra</span>
              <span className="text-xs tabular-nums text-muted">
                {obs.gates.shadowSamples} amostra(s) · coerência {pct(obs.gates.shadowPassRate)}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Operação por campanha (o que morava em /admin/crm-agente) ──────── */}
      <div className="pt-2">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-ink">Campanhas e automações</h2>
          <p className="mt-0.5 text-sm text-ink2">
            A outra alavanca do agente: frases campeãs campanha a campanha e os disparos automáticos do cron.
          </p>
        </div>
        <CrmAgenteEscadaPanel restaurantId={restaurantId} />
      </div>
    </div>
  );
}
