"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  apiFetch,
  Field,
  INPUT,
  Feedback,
  SaveButton,
  Toggle,
  PageCard,
  SectionHeading,
} from "../_shared";
import type { CRMWhatsAppSafetyConfig, CRMWhatsAppBudgetConfig } from "@/lib/crm-safety";
import { DEFAULT_SAFETY_CONFIG, DEFAULT_BUDGET_CONFIG } from "@/lib/crm-safety";

// ── Helpers ────────────────────────────────────────────────────────────────────

const TIMEZONES = [
  { value: "America/Sao_Paulo",   label: "Brasília (GMT-3)" },
  { value: "America/Manaus",      label: "Manaus (GMT-4)"   },
  { value: "America/Belem",       label: "Belém (GMT-3)"    },
  { value: "America/Fortaleza",   label: "Fortaleza (GMT-3)" },
  { value: "America/Recife",      label: "Recife (GMT-3)"   },
  { value: "America/Bahia",       label: "Salvador (GMT-3)" },
  { value: "America/Cuiaba",      label: "Cuiabá (GMT-4)"   },
  { value: "America/Porto_Velho", label: "Porto Velho (GMT-4)" },
  { value: "America/Rio_Branco",  label: "Rio Branco (GMT-5)"  },
  { value: "America/Noronha",     label: "Fernando de Noronha (GMT-2)" },
];

function numStr(v: number): string { return String(v); }
function parseNum(s: string, fallback: number): number {
  const n = parseInt(s, 10);
  return isNaN(n) || n < 0 ? fallback : n;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MarketingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const [cfg, setCfg] = useState<CRMWhatsAppSafetyConfig>({ ...DEFAULT_SAFETY_CONFIG });

  useEffect(() => {
    apiFetch("/api/settings/crm-safety").then(({ ok, data }) => {
      if (ok && data) setCfg(data as CRMWhatsAppSafetyConfig);
    }).finally(() => setLoading(false));
  }, []);

  function set<K extends keyof CRMWhatsAppSafetyConfig>(key: K, val: CRMWhatsAppSafetyConfig[K]) {
    setCfg((prev) => ({ ...prev, [key]: val }));
  }

  const budget = cfg.crmWhatsAppSafety ?? DEFAULT_BUDGET_CONFIG;
  function setBudget<K extends keyof CRMWhatsAppBudgetConfig>(key: K, val: CRMWhatsAppBudgetConfig[K]) {
    setCfg((prev) => ({
      ...prev,
      crmWhatsAppSafety: { ...(prev.crmWhatsAppSafety ?? DEFAULT_BUDGET_CONFIG), [key]: val },
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    const { ok, data } = await apiFetch("/api/settings/crm-safety", "PATCH", cfg);
    setSaving(false);
    if (ok) {
      setCfg(data as CRMWhatsAppSafetyConfig);
      setSuccess("Configurações de segurança salvas com sucesso.");
    } else {
      setError("Erro ao salvar. Tente novamente.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-xl font-bold text-ink">Segurança de Envio WhatsApp</h1>
        <p className="mt-1 text-sm text-muted">
          Configure limites e proteções para os envios automáticos do CRM.
          Essas regras se aplicam a campanhas recorrentes e automações (reativação, aniversário, pós-pedido).
        </p>
      </div>

      <Feedback success={success} error={error} onDismiss={() => { setSuccess(null); setError(null); }} />

      {/* ── Orçamento global de envio (modo seguro WhatsApp Web) ── */}
      <PageCard>
        <SectionHeading title="Orçamento de envio WhatsApp" />
        <p className="mt-1 text-sm text-gray-500">
          Estes limites protegem o WhatsApp enquanto o envio ainda usa WhatsApp Web/Evolution.
          Quando o WhatsApp oficial da Meta estiver conectado, estes limites poderão ser ajustados.
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Um ciclo é cada execução do robô de campanhas. No modo WhatsApp Web, o limite por ciclo
          é compartilhado entre todas as campanhas para evitar travamentos.
        </p>

        <div className="mt-4 space-y-4">
          <Toggle
            label="Modo seguro WhatsApp Web"
            desc="Distribui um orçamento diário de envios entre as campanhas ativas e respeita o limite por ciclo. Desligue apenas quando estiver no WhatsApp oficial da Meta."
            checked={budget.enabled}
            onChange={(v) => setBudget("enabled", v)}
          />

          {budget.enabled && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Limite diário total"
                  hint="Máximo de mensagens CRM enviadas em 24 h, somando todas as campanhas. Use 0 para sem limite. Padrão seguro: 50."
                >
                  <input
                    type="number" min={0} max={10000}
                    value={numStr(budget.globalDailyLimit)}
                    onChange={(e) => setBudget("globalDailyLimit", parseNum(e.target.value, 50))}
                    className={INPUT}
                  />
                </Field>

                <Field
                  label="Limite por ciclo"
                  hint="Total de mensagens que TODO o CRM envia em cada execução do robô, somando todas as campanhas. Padrão seguro: 5."
                >
                  <input
                    type="number" min={1} max={100}
                    value={numStr(budget.globalCycleLimit)}
                    onChange={(e) => setBudget("globalCycleLimit", parseNum(e.target.value, 5))}
                    className={INPUT}
                  />
                </Field>

                <Field
                  label="Intervalo mínimo entre ciclos (minutos)"
                  hint="Tempo mínimo entre duas execuções do robô. Padrão: 10."
                >
                  <input
                    type="number" min={1} max={1440}
                    value={numStr(budget.minMinutesBetweenCycles)}
                    onChange={(e) => setBudget("minMinutesBetweenCycles", parseNum(e.target.value, 10))}
                    className={INPUT}
                  />
                </Field>

                <Field
                  label="Distribuição do limite"
                  hint={budget.distributionMode === "MANUAL"
                    ? "Manual: cada campanha usa o próprio limite diário configurado nela. Os limites globais continuam valendo."
                    : "Como o orçamento diário é dividido entre as campanhas ativas."}
                >
                  <select
                    value={budget.distributionMode}
                    onChange={(e) => setBudget("distributionMode", e.target.value as CRMWhatsAppBudgetConfig["distributionMode"])}
                    className={INPUT}
                  >
                    <option value="EQUAL">Igualitária entre campanhas</option>
                    <option value="PRIORITY">Por prioridade</option>
                    <option value="MANUAL">Manual (limite de cada campanha)</option>
                  </select>
                </Field>
              </div>

              <Toggle
                label="Pausar se WhatsApp desconectar"
                desc="Interrompe todos os envios imediatamente quando a instância do WhatsApp não está conectada."
                checked={budget.stopOnInstanceDisconnected}
                onChange={(v) => setBudget("stopOnInstanceDisconnected", v)}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Pausar se taxa de falha passar de (%)"
                  hint="Interrompe o restante do ciclo quando a taxa de falhas do provedor passa deste percentual. Use 0 para desligar."
                >
                  <input
                    type="number" min={0} max={100}
                    value={numStr(budget.pauseOnFailureRatePercent)}
                    onChange={(e) => setBudget("pauseOnFailureRatePercent", parseNum(e.target.value, 50))}
                    className={INPUT}
                  />
                </Field>

                <Field
                  label="Máximo de falhas consecutivas"
                  hint="Quantas falhas do provedor em um ciclo disparam a pausa de segurança. Use 0 para desligar."
                >
                  <input
                    type="number" min={0} max={100}
                    value={numStr(budget.maxConsecutiveProviderFailures)}
                    onChange={(e) => setBudget("maxConsecutiveProviderFailures", parseNum(e.target.value, 3))}
                    className={INPUT}
                  />
                </Field>
              </div>
            </>
          )}
        </div>
      </PageCard>

      {/* ── Limites diários ── */}
      <PageCard>
        <SectionHeading title="Limites de Envio" />

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field
            label="Cap global diário"
            hint="Máximo de mensagens CRM enviadas em 24 horas, somando todas as campanhas e automações. Use 0 para sem limite."
          >
            <input
              type="number"
              min={0}
              max={10000}
              value={numStr(cfg.dailyGlobalCap)}
              onChange={(e) => set("dailyGlobalCap", parseNum(e.target.value, 200))}
              className={INPUT}
            />
          </Field>

          <Field
            label="Cooldown por cliente (horas)"
            hint="Intervalo mínimo entre duas mensagens enviadas ao mesmo cliente, em qualquer campanha. Padrão: 24 h."
          >
            <input
              type="number"
              min={1}
              max={720}
              value={numStr(cfg.customerCooldownHours)}
              onChange={(e) => set("customerCooldownHours", parseNum(e.target.value, 24))}
              className={INPUT}
            />
          </Field>

          <Field
            label="Limite semanal por cliente"
            hint="Máximo de mensagens ao mesmo cliente em 7 dias. Use 0 para sem limite."
          >
            <input
              type="number"
              min={0}
              max={100}
              value={numStr(cfg.maxPerWeekPerCustomer)}
              onChange={(e) => set("maxPerWeekPerCustomer", parseNum(e.target.value, 5))}
              className={INPUT}
            />
          </Field>
        </div>
      </PageCard>

      {/* ── Horário quieto ── */}
      <PageCard>
        <SectionHeading title="Horário Quieto" />
        <p className="mt-1 text-sm text-muted">
          Nenhuma mensagem automática será enviada durante o horário quieto, independente da configuração individual de cada campanha.
        </p>

        <div className="mt-4 space-y-4">
          <Toggle
            label="Ativar horário quieto"
            desc="Bloqueia envios automáticos fora do expediente."
            checked={cfg.quietHoursEnabled}
            onChange={(v) => set("quietHoursEnabled", v)}
          />

          {cfg.quietHoursEnabled && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Início do horário quieto">
                <input
                  type="time"
                  value={cfg.quietHoursStart}
                  onChange={(e) => set("quietHoursStart", e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="Fim do horário quieto">
                <input
                  type="time"
                  value={cfg.quietHoursEnd}
                  onChange={(e) => set("quietHoursEnd", e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="Fuso horário">
                <select
                  value={cfg.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                  className={INPUT}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          <Toggle
            label="Permitir envios em fins de semana"
            desc="Quando desativado, campanhas e automações são bloqueadas no sábado e domingo."
            checked={cfg.sendOnWeekends}
            onChange={(v) => set("sendOnWeekends", v)}
          />
        </div>
      </PageCard>

      {/* ── Comportamento humano ── */}
      <PageCard>
        <SectionHeading title="Comportamento Gradual" />
        <p className="mt-1 text-sm text-muted">
          Delay aleatório entre envios consecutivos no mesmo lote. Reduz o risco de bloqueio de número pelo WhatsApp.
        </p>

        <div className="mt-4 space-y-4">
          <Toggle
            label="Delay aleatório entre envios"
            desc="Insere uma pausa de alguns segundos entre cada mensagem do lote, imitando comportamento humano."
            checked={cfg.randomDelayEnabled}
            onChange={(v) => set("randomDelayEnabled", v)}
          />

          {cfg.randomDelayEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Delay mínimo (segundos)"
                hint="Mínimo 1 s."
              >
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={numStr(cfg.randomDelayMinSec)}
                  onChange={(e) => set("randomDelayMinSec", parseNum(e.target.value, 5))}
                  className={INPUT}
                />
              </Field>
              <Field
                label="Delay máximo (segundos)"
                hint="Máximo 300 s."
              >
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={numStr(cfg.randomDelayMaxSec)}
                  onChange={(e) => set("randomDelayMaxSec", parseNum(e.target.value, 45))}
                  className={INPUT}
                />
              </Field>
            </div>
          )}
        </div>
      </PageCard>

      {/* ── Proteções fixas ── */}
      <PageCard>
        <SectionHeading title="Proteções Permanentes" />
        <p className="mt-1 text-sm text-muted">
          Estas regras estão sempre ativas e não podem ser desabilitadas, em conformidade com a LGPD e as políticas do WhatsApp Business.
        </p>

        <ul className="mt-4 space-y-2.5">
          {[
            { icon: "🚫", text: "Clientes com opt-out são sempre excluídos de qualquer envio CRM" },
            { icon: "📵", text: "Clientes sem telefone válido nunca recebem mensagens" },
            { icon: "🔄", text: "Deduplicação: mesmo cliente não recebe a mesma campanha duas vezes" },
            { icon: "⏱️", text: "Janela cruzada: cliente que recebeu qualquer campanha hoje aguarda cooldown antes de receber outra (exceto mensagens de aniversário)" },
            { icon: "✅", text: "Opt-out por palavra-chave é detectado automaticamente pelo WhatsApp Webhook" },
          ].map((item) => (
            <li key={item.text} className="flex items-start gap-2.5 text-sm text-ink2">
              <span className="shrink-0 text-base">{item.icon}</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </PageCard>

      <SaveButton saving={saving} label="Salvar configurações de segurança" />
    </form>
  );
}
