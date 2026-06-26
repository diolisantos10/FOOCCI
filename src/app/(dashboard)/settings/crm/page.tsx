"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  apiFetch, Field, INPUT, Feedback, SaveButton, PageCard, Toggle,
} from "../_shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SegmentConfig {
  hotMaxDays:  number;
  warmMaxDays: number;
  lostMinDays: number;
}

interface SafetyConfig {
  dailyGlobalCap:        number;
  weeklyGlobalCap:       number;
  customerCooldownHours: number;
  quietHoursEnabled:     boolean;
  quietHoursStart:       string;
  quietHoursEnd:         string;
  sendOnWeekends:        boolean;
  maxPerWeekPerCustomer: number;
  randomDelayEnabled:    boolean;
  randomDelayMinSec:     number;
  randomDelayMaxSec:     number;
  todaySent?:            number;
  weekSent?:             number;
}

// ─── Segment Section ─────────────────────────────────────────────────────────

function SegmentSection() {
  const [cfg,    setCfg]    = useState<SegmentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [ok,     setOk]     = useState<string | null>(null);
  const [err,    setErr]    = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/crm-segments")
      .then(r => { if (r.ok) setCfg(r.data as SegmentConfig); })
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cfg) return;
    setSaving(true); setOk(null); setErr(null);
    const res = await apiFetch("/api/settings/crm-segments", "PATCH", cfg);
    setSaving(false);
    if (res.ok) { setCfg(res.data as SegmentConfig); setOk("Segmentação salva!"); }
    else setErr("Erro ao salvar. Tente novamente.");
  }

  if (!cfg) return <div className="py-8 text-center text-sm text-muted">Carregando…</div>;

  return (
    <PageCard>
      <h3 className="mb-4 text-sm font-semibold text-ink">Regras de segmentação por recência</h3>
      <p className="mb-4 text-xs text-muted">
        Define em quantos dias sem pedido um cliente passa de Ativo → Morno → Em Risco (Frio). Usado pelo CRM para segmentar e priorizar campanhas.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Ativo até (dias)" hint="Clientes que pediram até este número de dias atrás">
            <input
              type="number" min={1} max={cfg.warmMaxDays - 1} required
              value={cfg.hotMaxDays}
              onChange={e => setCfg(c => c ? { ...c, hotMaxDays: +e.target.value } : c)}
              className={INPUT}
            />
          </Field>
          <Field label="Morno até (dias)" hint="Entre Ativo e Em Risco">
            <input
              type="number" min={cfg.hotMaxDays + 1} max={cfg.lostMinDays - 1} required
              value={cfg.warmMaxDays}
              onChange={e => setCfg(c => c ? { ...c, warmMaxDays: +e.target.value } : c)}
              className={INPUT}
            />
          </Field>
          <Field label="Perdido após (dias)" hint="Cliente inativo a partir deste número de dias">
            <input
              type="number" min={cfg.warmMaxDays + 1} required
              value={cfg.lostMinDays}
              onChange={e => setCfg(c => c ? { ...c, lostMinDays: +e.target.value } : c)}
              className={INPUT}
            />
          </Field>
        </div>
        <div className="rounded-xl bg-[#FAFAF8] px-4 py-3 text-xs text-ink2">
          <span className="mr-2">🔥 Ativo:</span> 0–{cfg.hotMaxDays}d
          <span className="mx-3 text-muted">|</span>
          <span className="mr-2">☀️ Morno:</span> {cfg.hotMaxDays + 1}–{cfg.warmMaxDays}d
          <span className="mx-3 text-muted">|</span>
          <span className="mr-2">❄️ Em Risco:</span> {cfg.warmMaxDays + 1}–{cfg.lostMinDays - 1}d
          <span className="mx-3 text-muted">|</span>
          <span className="mr-2">💀 Perdido:</span> {cfg.lostMinDays}d+
        </div>
        <Feedback success={ok} error={err} onDismiss={() => { setOk(null); setErr(null); }} />
        <SaveButton saving={saving} />
      </form>
    </PageCard>
  );
}

// ─── Safety Section ───────────────────────────────────────────────────────────

// ─── Capacity forecast (read-only) ───────────────────────────────────────────

interface CapacityForecast {
  budget: { dailyCap: number; dailyConsumed: number; dailyRemaining: number; weeklyCap: number; weeklyConsumed: number; weeklyRemaining: number; maxPerWeekPerCustomer: number };
  activeCampaigns: number;
  allocation: {
    budgetToday: number; totalEligible: number; totalAllocatedToday: number; topConsumer: string | null; atRisk: string[];
    campaigns: Array<{ campaignId: string; campaignName: string; priority: string; eligibleNow: number; allocatedToday: number; blockedByGlobalCap: number; blockedByCampaignLimit: number; riskLevel: string; explanation: string }>;
  };
}

const RISK_META: Record<string, { label: string; cls: string }> = {
  HEALTHY:          { label: "Saudável",            cls: "bg-green-50 text-green-700" },
  ATTENTION:        { label: "Atenção",             cls: "bg-amber-50 text-amber-700" },
  BLOCKED_BY_LIMIT: { label: "Travada por limite",  cls: "bg-brand-50 text-brand-700" },
  COMPETING:        { label: "Competindo",          cls: "bg-red-50 text-red-600" },
};
const PRIO_LABEL: Record<string, string> = { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta", CRITICAL: "Crítica" };

function CapacityForecastBlock() {
  const [data, setData] = useState<CapacityForecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/crm/capacity")
      .then(r => { if (r.ok) setData(r.data as CapacityForecast); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="rounded-xl border border-line bg-[#FAFAF8] p-4 text-xs text-muted">Calculando previsão de capacidade…</div>;
  if (!data) return null;

  const b = data.budget;
  const a = data.allocation;
  const dailyRemainingText = b.dailyRemaining < 0 ? "ilimitado" : String(b.dailyRemaining);

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Previsão de capacidade</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Limite 24h" value={b.dailyCap === 0 ? "sem limite" : String(b.dailyCap)} />
        <Stat label="Já enviados (24h)" value={String(b.dailyConsumed)} />
        <Stat label="Capacidade restante" value={dailyRemainingText} />
        <Stat label="Campanhas ativas" value={String(data.activeCampaigns)} />
        {b.weeklyCap > 0 && <Stat label="Limite semanal" value={String(b.weeklyCap)} />}
        {b.weeklyCap > 0 && <Stat label="Enviados (semana)" value={String(b.weeklyConsumed)} />}
        <Stat label="Contatos/cliente/sem" value={b.maxPerWeekPerCustomer === 0 ? "sem limite" : String(b.maxPerWeekPerCustomer)} />
        <Stat label="Previsto hoje" value={String(a.totalAllocatedToday)} />
      </div>

      {a.atRisk.length > 0 && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-600">
          ⚠️ Risco de competição: <strong>{a.atRisk.join(", ")}</strong> podem ficar sem capacidade hoje.
          {a.topConsumer && <> Maior consumidor: <strong>{a.topConsumer}</strong>.</>}
        </p>
      )}

      <div className="mt-3 space-y-1.5">
        {a.campaigns.length === 0 && <p className="text-[11px] text-muted">Nenhuma campanha recorrente ativa.</p>}
        {a.campaigns.map(c => {
          const risk = RISK_META[c.riskLevel] ?? RISK_META.HEALTHY!;
          return (
            <div key={c.campaignId} className="rounded-lg border border-line bg-paper px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink">{c.campaignName}</span>
                <span className="rounded bg-[#F4F4F2] px-1.5 py-0.5 text-[10px] font-semibold text-ink2">{PRIO_LABEL[c.priority] ?? c.priority}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${risk.cls}`}>{risk.label}</span>
                <span className="ml-auto text-[10px] text-muted">Elegíveis: {c.eligibleNow} · Previsto hoje: {c.allocatedToday}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted">{c.explanation}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-paper px-2 py-1.5 text-center">
      <p className="text-sm font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-[9px] text-muted">{label}</p>
    </div>
  );
}

function SafetySection() {
  const [cfg,    setCfg]    = useState<SafetyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [ok,     setOk]     = useState<string | null>(null);
  const [err,    setErr]    = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/crm-safety")
      .then(r => { if (r.ok) setCfg(r.data as SafetyConfig); })
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cfg) return;
    const { todaySent: _, ...payload } = cfg;
    setSaving(true); setOk(null); setErr(null);
    const res = await apiFetch("/api/settings/crm-safety", "PATCH", payload);
    setSaving(false);
    if (res.ok) { setCfg(prev => ({ ...(res.data as SafetyConfig), todaySent: prev?.todaySent })); setOk("Segurança salva!"); }
    else setErr("Erro ao salvar. Tente novamente.");
  }

  if (!cfg) return <div className="py-8 text-center text-sm text-muted">Carregando…</div>;

  return (
    <PageCard>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Segurança de envio WhatsApp</h3>
          <p className="mt-0.5 text-xs text-muted">
            Limites globais que protegem sua conta WhatsApp de bloqueios por envio excessivo.
          </p>
        </div>
        {cfg.todaySent !== undefined && (
          <div className="shrink-0 rounded-xl bg-brand-50 px-3 py-1.5 text-center">
            <p className="text-[11px] text-muted">Hoje enviados</p>
            <p className="text-lg font-bold text-brand-700">{cfg.todaySent}</p>
            {cfg.dailyGlobalCap > 0 && (
              <p className="text-[10px] text-muted">de {cfg.dailyGlobalCap}</p>
            )}
          </div>
        )}
      </div>
      <form onSubmit={onSubmit} className="space-y-5">
        {/* ── Orçamento de envio (protege o WhatsApp) ── */}
        <div className="space-y-3 rounded-xl border border-line p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Orçamento de envio</p>
          <p className="-mt-1 text-[11px] text-muted">Volume máximo de mensagens de CRM, somando todas as campanhas e automações, para proteger o WhatsApp.</p>

          <Toggle
            label="Limitar mensagens por 24h"
            desc="Máximo de mensagens CRM por dia (todas as campanhas juntas)"
            checked={cfg.dailyGlobalCap > 0}
            onChange={v => setCfg(c => c ? { ...c, dailyGlobalCap: v ? (c.dailyGlobalCap > 0 ? c.dailyGlobalCap : 200) : 0 } : c)}
          />
          {cfg.dailyGlobalCap > 0 && (
            <div className="pl-12">
              <Field label="Máximo por 24h">
                <input type="number" min={1} value={cfg.dailyGlobalCap}
                  onChange={e => setCfg(c => c ? { ...c, dailyGlobalCap: Math.max(1, +e.target.value) } : c)}
                  className={INPUT} />
              </Field>
            </div>
          )}

          <Toggle
            label="Usar limite semanal do restaurante"
            desc="Limite total de mensagens CRM por semana (opcional)"
            checked={cfg.weeklyGlobalCap > 0}
            onChange={v => setCfg(c => c ? { ...c, weeklyGlobalCap: v ? (c.weeklyGlobalCap > 0 ? c.weeklyGlobalCap : 700) : 0 } : c)}
          />
          {cfg.weeklyGlobalCap > 0 && (
            <div className="pl-12">
              <Field label="Máximo por semana">
                <input type="number" min={1} value={cfg.weeklyGlobalCap}
                  onChange={e => setCfg(c => c ? { ...c, weeklyGlobalCap: Math.max(1, +e.target.value) } : c)}
                  className={INPUT} />
              </Field>
            </div>
          )}
        </div>

        {/* ── Limites por cliente ── */}
        <div className="space-y-3 rounded-xl border border-line p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Limites por cliente</p>
          <p className="-mt-1 text-[11px] text-muted">Evita que o mesmo cliente receba mensagens demais. Vale somando <strong>todas</strong> as campanhas.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Máximo de contatos por cliente / semana" hint="0 = sem limite">
              <input type="number" min={0} value={cfg.maxPerWeekPerCustomer}
                onChange={e => setCfg(c => c ? { ...c, maxPerWeekPerCustomer: +e.target.value } : c)}
                className={INPUT} />
            </Field>
            <Field label="Cooldown por cliente (horas)" hint="Mínimo entre mensagens ao mesmo cliente">
              <input type="number" min={1} value={cfg.customerCooldownHours}
                onChange={e => setCfg(c => c ? { ...c, customerCooldownHours: +e.target.value } : c)}
                className={INPUT} />
            </Field>
          </div>
          {cfg.maxPerWeekPerCustomer === 1 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
              ⚠️ Com <strong>1 contato por semana</strong>, uma campanha (ex.: almoço) pode consumir o limite e <strong>impedir</strong> campanhas de recuperação para o mesmo cliente na mesma semana.
            </p>
          )}
        </div>

        {/* ── Política de distribuição ── */}
        <div className="rounded-xl border border-line p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Distribuição entre campanhas</p>
          <p className="mt-1 text-[11px] text-muted">Define como o Foocci divide a capacidade de envio quando várias campanhas estão ativas ao mesmo tempo.</p>
          <p className="mt-2 text-[11px] text-ink2">
            <strong>Hoje (runtime real):</strong> a primeira campanha do ciclo consome o orçamento — pode travar outras.
            <br /><strong>Previsão abaixo:</strong> mostra como uma distribuição <strong>equilibrada por prioridade</strong> dividiria a capacidade e onde há risco de competição.
          </p>
        </div>

        {/* ── Previsão de capacidade ── */}
        <CapacityForecastBlock />

        <div className="space-y-3 rounded-xl border border-line p-4">
          <Toggle
            label="Horário silencioso"
            desc="Não enviar mensagens CRM fora do horário comercial"
            checked={cfg.quietHoursEnabled}
            onChange={v => setCfg(c => c ? { ...c, quietHoursEnabled: v } : c)}
          />
          {cfg.quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-3 pl-12">
              <Field label="Início do silêncio">
                <input type="time" value={cfg.quietHoursStart}
                  onChange={e => setCfg(c => c ? { ...c, quietHoursStart: e.target.value } : c)}
                  className={INPUT} />
              </Field>
              <Field label="Fim do silêncio">
                <input type="time" value={cfg.quietHoursEnd}
                  onChange={e => setCfg(c => c ? { ...c, quietHoursEnd: e.target.value } : c)}
                  className={INPUT} />
              </Field>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-line p-4">
          <Toggle
            label="Enviar nos fins de semana"
            desc="Permite envios CRM também em sábado e domingo"
            checked={cfg.sendOnWeekends}
            onChange={v => setCfg(c => c ? { ...c, sendOnWeekends: v } : c)}
          />
          <Toggle
            label="Delay aleatório entre envios"
            desc="Insere uma pausa aleatória entre mensagens no mesmo lote para parecer mais humano"
            checked={cfg.randomDelayEnabled}
            onChange={v => setCfg(c => c ? { ...c, randomDelayEnabled: v } : c)}
          />
          {cfg.randomDelayEnabled && (
            <div className="grid grid-cols-2 gap-3 pl-12">
              <Field label="Delay mínimo (seg)">
                <input type="number" min={0} value={cfg.randomDelayMinSec}
                  onChange={e => setCfg(c => c ? { ...c, randomDelayMinSec: +e.target.value } : c)}
                  className={INPUT} />
              </Field>
              <Field label="Delay máximo (seg)">
                <input type="number" min={cfg.randomDelayMinSec} value={cfg.randomDelayMaxSec}
                  onChange={e => setCfg(c => c ? { ...c, randomDelayMaxSec: +e.target.value } : c)}
                  className={INPUT} />
              </Field>
            </div>
          )}
        </div>

        <Feedback success={ok} error={err} onDismiss={() => { setOk(null); setErr(null); }} />
        <SaveButton saving={saving} />
      </form>
    </PageCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CrmSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ink">CRM</h2>
        <p className="mt-0.5 text-sm text-muted">
          Configurações de segmentação de clientes e segurança de envio WhatsApp.
        </p>
      </div>
      <SegmentSection />
      <SafetySection />
    </div>
  );
}
