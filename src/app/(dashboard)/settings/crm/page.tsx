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

  if (!cfg) return <div className="py-8 text-center text-sm text-gray-400">Carregando…</div>;

  return (
    <PageCard>
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Regras de segmentação por recência</h3>
      <p className="mb-4 text-xs text-gray-500">
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
        <div className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
          <span className="mr-2">🔥 Ativo:</span> 0–{cfg.hotMaxDays}d
          <span className="mx-3 text-gray-300">|</span>
          <span className="mr-2">☀️ Morno:</span> {cfg.hotMaxDays + 1}–{cfg.warmMaxDays}d
          <span className="mx-3 text-gray-300">|</span>
          <span className="mr-2">❄️ Em Risco:</span> {cfg.warmMaxDays + 1}–{cfg.lostMinDays - 1}d
          <span className="mx-3 text-gray-300">|</span>
          <span className="mr-2">💀 Perdido:</span> {cfg.lostMinDays}d+
        </div>
        <Feedback success={ok} error={err} onDismiss={() => { setOk(null); setErr(null); }} />
        <SaveButton saving={saving} />
      </form>
    </PageCard>
  );
}

// ─── Safety Section ───────────────────────────────────────────────────────────

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

  if (!cfg) return <div className="py-8 text-center text-sm text-gray-400">Carregando…</div>;

  return (
    <PageCard>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Segurança de envio WhatsApp</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Limites globais que protegem sua conta WhatsApp de bloqueios por envio excessivo.
          </p>
        </div>
        {cfg.todaySent !== undefined && (
          <div className="shrink-0 rounded-xl bg-orange-50 px-3 py-1.5 text-center">
            <p className="text-[11px] text-gray-500">Hoje enviados</p>
            <p className="text-lg font-bold text-orange-700">{cfg.todaySent}</p>
            {cfg.dailyGlobalCap > 0 && (
              <p className="text-[10px] text-gray-400">de {cfg.dailyGlobalCap}</p>
            )}
          </div>
        )}
      </div>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Cap diário global" hint="Máx. mensagens CRM por dia (0 = ilimitado)">
            <input type="number" min={0} value={cfg.dailyGlobalCap}
              onChange={e => setCfg(c => c ? { ...c, dailyGlobalCap: +e.target.value } : c)}
              className={INPUT} />
          </Field>
          <Field label="Cooldown por cliente (horas)" hint="Mínimo entre mensagens ao mesmo cliente">
            <input type="number" min={1} value={cfg.customerCooldownHours}
              onChange={e => setCfg(c => c ? { ...c, customerCooldownHours: +e.target.value } : c)}
              className={INPUT} />
          </Field>
          <Field label="Máx. por cliente / semana" hint="0 = sem limite">
            <input type="number" min={0} value={cfg.maxPerWeekPerCustomer}
              onChange={e => setCfg(c => c ? { ...c, maxPerWeekPerCustomer: +e.target.value } : c)}
              className={INPUT} />
          </Field>
        </div>

        <div className="space-y-3 rounded-xl border border-gray-100 p-4">
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

        <div className="space-y-3 rounded-xl border border-gray-100 p-4">
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
        <h2 className="text-base font-semibold text-gray-900">CRM</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Configurações de segmentação de clientes e segurança de envio WhatsApp.
        </p>
      </div>
      <SegmentSection />
      <SafetySection />
    </div>
  );
}
