"use client";

/**
 * CrmAgenteEscadaPanel — a escada do Agente de CRM, agora no admin.
 *
 * Estes controles moravam no painel do lojista. Saíram de lá por uma razão
 * simples: decidir se a IA escreve a mensagem de uma campanha é operação do
 * produto, não trabalho do dono do restaurante. Ele quer saber se vendeu — não
 * carregar o interruptor de um agente que ainda está aprendendo.
 *
 * Consome as MESMAS rotas do painel (`/api/crm/agent`, `/api/crm/agent/activation`,
 * `/api/crm/automations`), só que declarando o restaurante. Nada de mecânica
 * nova: se a regra mudar de um lado, muda dos dois.
 */

import { useCallback, useEffect, useState } from "react";

interface RestaurantOption { id: string; name: string; slug: string }
interface Activation { campaignId: string; name: string; agentActive: boolean }
interface ShadowCampaign { campaignId: string; mode: "EXPLORING" | "OPTIMIZING"; projectedLiftPct: number | null }
interface Champion { campaignId: string; campaignName: string; phrase: string; liftVsAvg: number }
interface AgentData {
  ok: boolean;
  globallyEnabled: boolean;
  status: { mode: "ATIVO" | "APRENDIZ" | "DESLIGADO"; activeCampaigns: number; totalCampaigns: number; championsFound: number };
  champions: Champion[];
  shadowCampaigns: ShadowCampaign[];
  activation: Activation[];
  ocultas: number;
}
interface Automation { id: string; trigger: string; isEnabled: boolean }

const TRIGGER_LABEL: Record<string, string> = {
  REACTIVATION: "Reativação — cliente sumiu",
  BIRTHDAY:     "Aniversário",
  POST_ORDER:   "Pós-pedido",
};

function Toggle({ on, onClick, busy }: { on: boolean; onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 ${on ? "bg-brand-500" : "bg-gray-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function Stat({ n, label }: { n: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="text-xl font-semibold tabular-nums text-gray-900">{n}</div>
      <div className="mt-0.5 text-xs text-gray-500">{label}</div>
    </div>
  );
}

export function CrmAgenteEscadaPanel() {
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [data, setData] = useState<AgentData | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [armedPanic, setArmedPanic] = useState(false);

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
      })
      .catch(() => setMsg("Falha ao carregar restaurantes."));
  }, []);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setMsg("");
    const q = `restaurantId=${encodeURIComponent(restaurantId)}`;
    const [agent, autos] = await Promise.all([
      fetch(`/api/crm/agent?${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch(`/api/crm/automations?${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    if (agent?.ok) setData(agent as AgentData);
    else { setData(null); setMsg("Falha ao carregar o agente deste restaurante."); }
    setAutomations(Array.isArray(autos?.data) ? (autos.data as Automation[]) : []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { setArmedPanic(false); void load(); }, [load]);

  const post = async (body: Record<string, unknown>, id: string) => {
    setBusyId(id);
    try {
      await fetch("/api/crm/agent/activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, restaurantId }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const toggleAutomation = async (trigger: string, isEnabled: boolean) => {
    setBusyId(`auto-${trigger}`);
    try {
      await fetch(`/api/crm/automations/${trigger}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, isEnabled }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const liftBy = new Map((data?.shadowCampaigns ?? []).map((s) => [s.campaignId, s]));

  return (
    <div className="space-y-4">
      {/* Seletor */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <label className="text-sm font-semibold text-gray-700">Restaurante</label>
        <select
          value={restaurantId}
          onChange={(e) => setRestaurantId(e.target.value)}
          className="min-w-[16rem] rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          {restaurants.length === 0 && <option value="">— nenhum —</option>}
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>{r.name} ({r.slug})</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !restaurantId}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Carregando…" : "Recarregar"}
        </button>
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>

      {loading && !data && <p className="text-sm text-gray-500">Carregando o agente…</p>}
      {!loading && !data && !msg && <p className="text-sm text-gray-500">Escolha um restaurante.</p>}

      {data && (
        <>
          {/* Degrau 0 — a inteligência inteira */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Inteligência do CRM</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {data.globallyEnabled
                    ? "Ligada — o agente trabalha nos bastidores deste restaurante."
                    : "Desligada — este restaurante roda o CRM na mão."}
                </p>
              </div>
              <Toggle
                on={data.globallyEnabled}
                busy={busyId === "master"}
                onClick={() => void post({ masterEnabled: !data.globallyEnabled }, "master")}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat n={data.status.mode} label="Modo agora" />
              <Stat n={`${data.status.activeCampaigns}/${data.status.totalCampaigns}`} label="Campanhas ativadas" />
              <Stat n={data.status.championsFound} label="Frases campeãs" />
              <Stat n={data.ocultas} label="Ocultas (auto/enviadas)" />
            </div>
          </section>

          {/* Degrau 1 — campanha por campanha */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Agente por campanha</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Desligado = ele só observa. A lista esconde registros <code>auto:</code> e campanhas já
                  encerradas — interruptor nelas não liga nada.
                </p>
              </div>
              {data.status.activeCampaigns > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!armedPanic) { setArmedPanic(true); return; }
                    setArmedPanic(false);
                    void post({ panic: true }, "panic");
                  }}
                  disabled={busyId === "panic"}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    armedPanic
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                  }`}
                >
                  {armedPanic ? "Confirmar: desligar em todas" : "🛑 Voltar tudo ao seguro"}
                </button>
              )}
            </div>

            <div className="mt-3 divide-y divide-gray-100">
              {data.activation.length === 0 && (
                <p className="py-3 text-sm text-gray-500">
                  Nenhuma campanha ativa neste restaurante.
                  {data.ocultas > 0 && ` (${data.ocultas} oculta(s) por serem auto: ou já encerradas.)`}
                </p>
              )}
              {data.activation.map((a) => {
                const s = liftBy.get(a.campaignId);
                return (
                  <div key={a.campaignId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{a.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {s?.projectedLiftPct != null
                          ? `ganho projetado: +${s.projectedLiftPct}%`
                          : s?.mode === "EXPLORING" ? "coletando dados…" : "sem dados ainda"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${a.agentActive ? "text-brand-600" : "text-gray-400"}`}>
                        {a.agentActive ? "Ativo" : "Aprendiz"}
                      </span>
                      <Toggle
                        on={a.agentActive}
                        busy={busyId === a.campaignId}
                        onClick={() => void post({ campaignId: a.campaignId, active: !a.agentActive }, a.campaignId)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Automações — o interruptor que faltava */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-bold text-gray-900">Automações</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Disparos automáticos deste restaurante. Ligadas, o cron envia sozinho — por isso o
              interruptor mora aqui, e não na tela de quem só quer ver o resultado.
            </p>
            <div className="mt-3 divide-y divide-gray-100">
              {automations.length === 0 && (
                <p className="py-3 text-sm text-gray-500">Nenhuma automação configurada neste restaurante.</p>
              )}
              {automations.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {TRIGGER_LABEL[a.trigger] ?? a.trigger}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {a.isEnabled ? "Ligada — o cron dispara sozinho." : "Desligada — não envia nada."}
                    </p>
                  </div>
                  <Toggle
                    on={a.isEnabled}
                    busy={busyId === `auto-${a.trigger}`}
                    onClick={() => void toggleAutomation(a.trigger, !a.isEnabled)}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Evidência — por que ligar (ou não) */}
          {data.champions.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-bold text-gray-900">Frases campeãs</h2>
              <p className="mt-0.5 text-xs text-gray-500">A evidência que justifica subir um degrau.</p>
              <div className="mt-3 space-y-2">
                {data.champions.slice(0, 8).map((c) => (
                  <div key={c.campaignId} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-900">{c.campaignName}</span>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                        {c.liftVsAvg}× a média
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">“{c.phrase}”</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
