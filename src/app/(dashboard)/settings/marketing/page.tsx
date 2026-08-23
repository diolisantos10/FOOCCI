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
  const [warmup, setWarmup] = useState<{ ageDays: number; safeDailyLimit: number }>({ ageDays: 0, safeDailyLimit: 20 });

  useEffect(() => {
    apiFetch("/api/settings/crm-safety").then(({ ok, data }) => {
      if (ok && data) {
        setCfg(data as CRMWhatsAppSafetyConfig);
        const w = (data as { warmup?: { ageDays: number; safeDailyLimit: number } }).warmup;
        if (w) setWarmup(w);
      }
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

      {/* ── Controle das regras de segurança (travado por padrão) ── */}
      <PageCard>
        <SectionHeading title="Regras de Segurança" />
        <p className="mt-1 text-sm text-muted">
          Por padrão, as regras que protegem o número (limite diário, horários, intervalos)
          ficam <strong>travadas em valores seguros</strong> e o sistema ajusta o limite diário
          sozinho conforme o número amadurece. Só ligue o controle manual se quiser enviar mais —
          <strong> você passa a ser responsável pelo risco de bloqueio</strong>.
        </p>

        <div className="mt-4">
          <Toggle
            label="Assumir controle manual (eu me responsabilizo)"
            desc="Destrava todos os limites abaixo para você definir os valores. Desligue para voltar ao modo seguro."
            checked={cfg.manualOverride}
            onChange={(v) => set("manualOverride", v)}
          />
        </div>

        {!cfg.manualOverride ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-emerald-800">🔒 Modo seguro ativo</span>
              <span className="text-lg font-bold text-emerald-700">
                {warmup.safeDailyLimit} <span className="text-sm font-normal text-emerald-800/70">msgs/dia</span>
              </span>
            </div>
            <p className="mt-1.5 text-xs text-emerald-800/80">
              Limite diário seguro para hoje (número com {warmup.ageDays} dia{warmup.ageDays === 1 ? "" : "s"} de idade).
              Sobe automaticamente: 20 → 40 → 80 → 150 → 250/dia conforme o número amadurece (até 30 dias).
              Cooldown 24 h · máx. 5/cliente por semana · horário quieto 21h–8h · delay 5–45 s — tudo fixo e travado.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5">
            <p className="text-sm font-semibold text-amber-800">⚠️ Controle manual ativo</p>
            <p className="mt-1 text-xs text-amber-800/80">
              Os limites abaixo estão sob sua responsabilidade. Valores altos num número novo
              aumentam muito o risco de bloqueio do WhatsApp — o que derruba a operação. Desligue
              o controle manual para voltar aos valores seguros.
            </p>
          </div>
        )}
      </PageCard>

      {cfg.manualOverride && (<>

      {/* ── Orçamento global de envio (proteções do número) ── */}
      <PageCard>
        <SectionHeading title="Orçamento de envio WhatsApp" />
        <p className="mt-1 text-sm text-gray-500">
          Estes limites protegem o seu número: horário de silêncio, teto diário e descanso por cliente.
          Eles continuam valendo no WhatsApp oficial da Meta — o número aquecido é o seu ativo mais caro.
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Um ciclo é cada execução do robô de campanhas. O limite por ciclo é compartilhado entre
          todas as campanhas, para o número nunca disparar em rajada.
        </p>

        <div className="mt-4 space-y-4">
          <Toggle
            label="Modo seguro de envio"
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
                    : budget.distributionMode === "AUDIENCE"
                    ? "Por audiência: divide o orçamento do dia proporcional ao tamanho do público de cada campanha — usa todo o limite disponível."
                    : "Como o orçamento diário é dividido entre as campanhas ativas."}
                >
                  <select
                    value={budget.distributionMode}
                    onChange={(e) => setBudget("distributionMode", e.target.value as CRMWhatsAppBudgetConfig["distributionMode"])}
                    className={INPUT}
                  >
                    <option value="AUDIENCE">Por audiência (recomendado)</option>
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

      </>)}

      {/* ── Limite de contatos ── */}
      <PageCard>
        <SectionHeading title="Limite de Contatos" />
        <p className="mt-1 text-sm text-muted">
          Máximo de <strong>contatos únicos</strong> que o CRM pode abordar. Cada pessoa conta 1 vez,
          mesmo recebendo várias campanhas. Use 0 para sem limite. Quando o teto acaba, o CRM <strong>para de
          abordar pessoas novas</strong> — quem já está na conta continua recebendo. <span className="text-muted/80">(Aqui é
          o limite de PESSOAS; o custo por conversa é cobrado pela Meta, fora desta tela.)</span>
        </p>

        {(() => {
          const used  = (cfg as unknown as { contactBudgetUsed?: number }).contactBudgetUsed ?? 0;
          const total = cfg.contactBudgetTotal || 0;
          const on    = total > 0;
          const remaining = on ? Math.max(0, total - used) : null;
          const pct   = on ? Math.min(100, Math.round((used / total) * 100)) : 0;
          const low   = on && remaining !== null && remaining <= Math.max(1, Math.round(total * 0.1));
          return (
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {/* Fora do "Assumir controle manual" desde 23/08/2026 (decisão do
                  CEO): teto de contatos é limite de GASTO, e não a regra
                  anti-banimento que aquele cadeado protege. Ver o comentário
                  longo no mesmo campo em CRMClient.tsx. */}
              <Field
                label="Limite total de contatos"
                hint="Você mexe neste número quando quiser — é limite de gasto, não regra de proteção do número. 0 = sem limite."
              >
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={numStr(total)}
                  onChange={(e) => set("contactBudgetTotal", parseNum(e.target.value, 0))}
                  className={INPUT}
                />
              </Field>

              <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3">
                {on ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted">Contatos restantes</span>
                      <span className={`text-lg font-bold ${low ? "text-amber-600" : "text-emerald-600"}`}>
                        {remaining} <span className="text-sm font-normal text-muted">de {total}</span>
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={`h-full rounded-full ${low ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {remaining !== null && remaining <= 0 ? (
                      <p className="mt-2 text-xs text-amber-800">
                        <strong>O CRM está parado para gente nova.</strong> Já foram abordadas <strong>{used}</strong> pessoas
                        {used > total ? <> — <strong>{used - total} a mais que o teto</strong>, de quando ele ainda não travava nada</> : null}.
                        Quem já está nessa conta continua recebendo; para falar com clientes novos, aumente o limite ao lado
                        (ou use <strong>0 = sem limite</strong>).
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-muted">{used} contatos já abordados{low ? " · pouco restante, aumente o limite se precisar." : "."}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted">
                    Sem limite ativo. Já foram abordados <strong>{used}</strong> contatos.
                    Defina um valor ao lado para limitar.
                  </p>
                )}
              </div>
            </div>
          );
        })()}
      </PageCard>

      {cfg.manualOverride && (<>

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

      </>)}

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
