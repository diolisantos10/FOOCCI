"use client";

/**
 * CrmAgenteEscadaPanel — a operação por campanha do Agente de CRM, dentro da
 * casa dele (/admin/agentes/crm).
 *
 * Estes controles moravam no painel do lojista e depois numa tela própria
 * (/admin/crm-agente). O motivo de estarem no admin é de produto: decidir se a
 * IA escreve a mensagem de uma campanha é operação do produto, não trabalho do
 * dono do restaurante. Ele quer saber se vendeu — não carregar o interruptor de
 * um agente que ainda está aprendendo.
 *
 * Consome as rotas ADMIN (`/api/admin/crm/agent/*` e `/api/admin/crm/automations`),
 * que chamam os MESMOS serviços da visão do lojista. A tela antiga apontava para
 * as rotas tenant e quebrava com cookie de admin puro — o middleware de NextAuth
 * barrava antes de a rota decidir. O restaurante chega por prop do seletor
 * único da casa.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui";

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
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 ${on ? "bg-brand-500" : "bg-line2"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-paper shadow transition-transform ${on ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function Stat({ n, label }: { n: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas px-4 py-3">
      <div className="text-xl font-semibold tabular-nums text-ink">{n}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

export function CrmAgenteEscadaPanel({ restaurantId }: { restaurantId: string }) {
  const [data, setData] = useState<AgentData | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [armedPanic, setArmedPanic] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setMsg("");
    const q = `restaurantId=${encodeURIComponent(restaurantId)}`;
    const [activation, shadow, champions, autos] = await Promise.all([
      fetch(`/api/admin/crm/agent/activation?${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch(`/api/admin/crm/agent/shadow?${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch(`/api/admin/crm/agent/champions?${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch(`/api/admin/crm/automations?${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    if (activation?.ok) {
      const rows: Activation[] = Array.isArray(activation.campaigns) ? activation.campaigns : [];
      const champs: Champion[] = Array.isArray(champions?.champions) ? champions.champions : [];
      const activeCampaigns = Number(activation.activeCount ?? rows.filter((r) => r.agentActive).length);
      setData({
        ok: true,
        globallyEnabled: activation.globallyEnabled !== false,
        status: {
          mode: activation.globallyEnabled === false ? "DESLIGADO" : activeCampaigns > 0 ? "ATIVO" : "APRENDIZ",
          activeCampaigns,
          totalCampaigns: rows.length,
          championsFound: champs.length,
        },
        champions: champs,
        shadowCampaigns: Array.isArray(shadow?.campaigns) ? shadow.campaigns : [],
        activation: rows,
        ocultas: Number(activation.ocultas ?? 0),
      });
    } else {
      setData(null);
      setMsg("Falha ao carregar a operação por campanha deste restaurante.");
    }
    setAutomations(Array.isArray(autos?.data) ? (autos.data as Automation[]) : []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { setArmedPanic(false); void load(); }, [load]);

  const post = async (body: Record<string, unknown>, id: string) => {
    setBusyId(id);
    try {
      await fetch("/api/admin/crm/agent/activation", {
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
      await fetch("/api/admin/crm/automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, trigger, isEnabled }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const liftBy = new Map((data?.shadowCampaigns ?? []).map((s) => [s.campaignId, s]));

  if (loading && !data) {
    return (
      <Card className="p-5">
        <SectionTitle>Campanhas e automações</SectionTitle>
        <div className="space-y-2.5">
          <div className="h-4 w-full animate-pulse rounded-xl bg-line2" />
          <div className="h-4 w-2/3 animate-pulse rounded-xl bg-line2" />
          <div className="h-4 w-full animate-pulse rounded-xl bg-line2" />
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-5">
        <SectionTitle>Campanhas e automações</SectionTitle>
        <p className="text-sm text-ink2">{msg || "Escolha um restaurante para ver a operação por campanha."}</p>
        {msg && (
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-xl border border-line2 bg-paper px-4 py-2 text-[13.5px] font-semibold text-ink hover:bg-[#FAFAF8]"
          >
            Tentar de novo
          </button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* A inteligência inteira do CRM (frases campeãs / sorteio) */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Inteligência do CRM</h2>
            <p className="mt-0.5 text-xs text-muted">
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
      </Card>

      {/* Campanha por campanha */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Agente por campanha</h2>
            <p className="mt-0.5 text-xs text-muted">
              Desligado = aprendiz: ele só observa e mede. A lista esconde registros <code>auto:</code> e campanhas
              já encerradas — interruptor nelas não liga nada.
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
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                armedPanic
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
              }`}
            >
              {armedPanic ? "Confirmar: desligar em todas" : "🛑 Voltar tudo ao seguro"}
            </button>
          )}
        </div>

        <div className="mt-3 divide-y divide-line">
          {data.activation.length === 0 && (
            <p className="py-3 text-sm text-muted">
              Nenhuma campanha ativa neste restaurante.
              {data.ocultas > 0 && ` (${data.ocultas} oculta(s) por serem auto: ou já encerradas.)`}
            </p>
          )}
          {data.activation.map((a) => {
            const s = liftBy.get(a.campaignId);
            return (
              <div key={a.campaignId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{a.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {s?.projectedLiftPct != null
                      ? `ganho projetado: +${s.projectedLiftPct}%`
                      : s?.mode === "EXPLORING" ? "coletando dados…" : "sem dados ainda"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${a.agentActive ? "text-brand-600" : "text-muted"}`}>
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
      </Card>

      {/* Automações */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Automações</h2>
        <p className="mt-0.5 text-xs text-muted">
          Disparos automáticos deste restaurante. Ligadas, o cron envia sozinho — por isso o interruptor mora
          aqui, e não na tela de quem só quer ver o resultado.
        </p>
        <div className="mt-3 divide-y divide-line">
          {automations.length === 0 && (
            <p className="py-3 text-sm text-muted">Nenhuma automação configurada neste restaurante.</p>
          )}
          {automations.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {TRIGGER_LABEL[a.trigger] ?? a.trigger}
                </p>
                <p className="mt-0.5 text-xs text-muted">
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
      </Card>

      {/* Evidência — por que ligar (ou não) */}
      {data.champions.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Frases campeãs</h2>
          <p className="mt-0.5 text-xs text-muted">A evidência que justifica subir um degrau.</p>
          <div className="mt-3 space-y-2">
            {data.champions.slice(0, 8).map((c) => (
              <div key={c.campaignId} className="rounded-xl border border-line bg-canvas px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">{c.campaignName}</span>
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    {c.liftVsAvg}× a média
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink2">“{c.phrase}”</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
