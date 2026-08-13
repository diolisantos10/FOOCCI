"use client";

/**
 * ActionCenterBanner — a faixa de impedimentos no topo da Visão Geral do CRM.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * O `CrmActionCenterService` calcula, a cada carga da página, POR QUE o CRM não
 * está enviando nada — e o mais caro deles é "WhatsApp não conectado". Esse aviso
 * viajava do servidor até a `OverviewTab` como prop `actions` e **nunca era
 * renderizado**. Resultado medido em produção: o lojista via "0 mensagens
 * enviadas" com 12 campanhas ativas e nenhuma explicação, enquanto o sistema
 * sabia a resposta e a jogava fora.
 *
 * O QUE ENTRA E O QUE NÃO ENTRA
 * Só **impedimento** — o que trava o CRM. As oportunidades comerciais
 * (recuperar frios, aniversariantes, VIP…) foram removidas da Visão Geral de
 * propósito (ver comentário no fim de `OverviewTab.tsx`): as campanhas fixas já
 * rodam sozinhas, então sugerir "criar campanha" para o que é automático é ruído.
 * Este arquivo não desfaz aquela decisão — ele resgata o que foi junto por
 * engano: os avisos de configuração, que não são oportunidade, são obstáculo.
 *
 * REGRAS QUE VALEM AQUI
 * - Lista vazia ⇒ **não desenha nada**. Nunca "está tudo bem": ausência de alerta
 *   não é prova de saúde (guardrail 1 do CLAUDE.md).
 * - Falha ao calcular ⇒ desenha a nota honesta, NÃO o silêncio. Silêncio depois
 *   de erro é exatamente ausência virando informação.
 * - Severidade em FORMA, não só em cor: rótulo escrito ("Urgente"/"Atenção"/
 *   "Aviso") + silhueta do ícone (triângulo × círculo) + espessura da barra
 *   lateral. Quem não distingue cor distingue os três.
 * - Todo aviso termina num **próximo passo clicável**. Sem destino conhecido, o
 *   passo aparece escrito — nunca um botão que não leva a lugar nenhum.
 */

import Link from "next/link";
import type { CrmAction, ActionPriority } from "@/services/crm/CrmActionCenterService";

// ── Modelo ────────────────────────────────────────────────────────────────────

/** Aba interna do CRM para onde um aviso pode levar. */
export type CrmAlertTab = "campanhas";

export type CrmAlertCta =
  | { label: string; href: string; tab?: undefined }
  | { label: string; tab: CrmAlertTab; href?: undefined };

export interface CrmAlert {
  id: string;
  priority: ActionPriority;
  /** O que está acontecendo, em uma linha. */
  title: string;
  /** O que está acontecendo, com detalhe. */
  body: string;
  /** Consequência concreta, quando existe número honesto para ela. */
  meta: string | null;
  /** O próximo passo, como o serviço o escreveu. */
  nextStep: string;
  /** Para onde o próximo passo leva. `null` ⇒ o passo é mostrado como texto. */
  cta: CrmAlertCta | null;
}

// ── Seleção: o que é impedimento ──────────────────────────────────────────────

/**
 * Converte a lista bruta do Action Center nos avisos que a faixa mostra.
 *
 * Pura e exportada de propósito: é o que o teste prende. A ordem de entrada é
 * preservada — o serviço já ordena por prioridade (HIGH primeiro).
 */
export function selectCrmAlerts(actions: CrmAction[]): CrmAlert[] {
  const alerts: CrmAlert[] = [];

  for (const a of actions) {
    if (a.type === "SAFETY_ISSUE_ALERT") {
      alerts.push({
        id: a.id,
        priority: a.priority,
        title: a.title,
        body: a.description,
        meta:
          a.blockedCount > 0
            ? `${a.blockedCount.toLocaleString("pt-BR")} ${a.blockedCount === 1 ? "cliente da sua base fica" : "clientes da sua base ficam"} sem receber nada enquanto isso.`
            : null,
        nextStep: a.suggestedNextStep,
        cta: { label: "Conectar o WhatsApp", href: "/integracoes/whatsapp" },
      });
      continue;
    }

    if (a.type === "CAMPAIGN_PERFORMANCE_ALERT") {
      alerts.push({
        id: a.id,
        priority: a.priority,
        title: a.title,
        body: a.description,
        meta: null,
        nextStep: a.suggestedNextStep,
        cta: { label: "Revisar as campanhas", tab: "campanhas" },
      });
      continue;
    }

    // Pedido de avaliação sem link cadastrado. O serviço marca esse caso zerando
    // `recommendedCampaignType` — o título dele descreve a OPORTUNIDADE ("pedir
    // avaliação de N clientes"), então aqui o título é reescrito para descrever
    // o IMPEDIMENTO, que é o que esta faixa mostra.
    if (a.type === "REVIEW_REQUEST" && a.recommendedCampaignType === null) {
      alerts.push({
        id: a.id,
        priority: a.priority,
        title: "Falta o link para pedir avaliação",
        body: a.description,
        meta: null,
        nextStep: a.suggestedNextStep,
        cta: { label: "Cadastrar o link", href: "/marca" },
      });
    }
  }

  return alerts;
}

// ── Severidade: cor é o último dos três sinais ────────────────────────────────

type Severity = {
  label: string;
  rail: string;
  railWidth: string;
  border: string;
  pill: string;
  iconTone: string;
  shape: "triangle" | "circle";
};

const SEVERITY: Record<ActionPriority, Severity> = {
  HIGH: {
    label: "Urgente",
    rail: "bg-red-500",
    railWidth: "w-1.5",
    border: "border-red-100",
    pill: "bg-red-50 text-red-600",
    iconTone: "text-red-500",
    shape: "triangle",
  },
  MEDIUM: {
    label: "Atenção",
    rail: "bg-amber-400",
    railWidth: "w-1",
    border: "border-amber-100",
    pill: "bg-amber-50 text-amber-700",
    iconTone: "text-amber-500",
    shape: "circle",
  },
  LOW: {
    label: "Aviso",
    rail: "bg-line2",
    railWidth: "w-0.5",
    border: "border-line",
    pill: "bg-[#F4F4F2] text-ink2",
    iconTone: "text-muted",
    shape: "circle",
  },
};

/** Triângulo (urgente) × círculo (demais): silhuetas distintas sem depender de cor. */
function SeverityIcon({ shape, className }: { shape: Severity["shape"]; className?: string }) {
  if (shape === "triangle") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} width="20" height="20">
        <path
          d="M11.13 3.6a1 1 0 0 1 1.74 0l8.62 15.1a1 1 0 0 1-.87 1.5H3.38a1 1 0 0 1-.87-1.5l8.62-15.1Z"
          fill="currentColor"
        />
        <rect x="11.15" y="8.6" width="1.7" height="5.4" rx=".85" fill="#fff" />
        <circle cx="12" cy="16.7" r="1.05" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} width="20" height="20">
      <circle cx="12" cy="12" r="9.2" fill="currentColor" />
      <rect x="11.15" y="7" width="1.7" height="6" rx=".85" fill="#fff" />
      <circle cx="12" cy="16.1" r="1.05" fill="#fff" />
    </svg>
  );
}

// ── A faixa ───────────────────────────────────────────────────────────────────

const CARD =
  "relative overflow-hidden rounded-2xl border bg-paper shadow-[0_1px_2px_rgba(11,11,11,.03)]";

const CTA_PRIMARY =
  "inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand-500 bg-brand-500 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 sm:w-auto";

const CTA_SECONDARY =
  "inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-line2 bg-paper px-4 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:bg-[#FAFAF8] sm:w-auto";

export function ActionCenterBanner({
  actions = [],
  failed = false,
  onNavigateToTab,
}: {
  actions?: CrmAction[];
  /** O cálculo do Action Center falhou nesta carga. */
  failed?: boolean;
  onNavigateToTab?: (tab: CrmAlertTab) => void;
}) {
  // Erro primeiro: se não deu para calcular, não se pode afirmar que está tudo bem.
  if (failed) {
    return (
      <section aria-label="Avisos do CRM" data-testid="crm-action-center">
        <div className={`${CARD} ${SEVERITY.LOW.border}`} data-testid="crm-alert-error">
          <span aria-hidden="true" className={`absolute inset-y-0 left-0 ${SEVERITY.LOW.railWidth} ${SEVERITY.LOW.rail}`} />
          <div className="flex gap-3 py-4 pl-4 pr-4 sm:pl-5 sm:pr-5">
            <SeverityIcon shape="circle" className={`mt-0.5 shrink-0 ${SEVERITY.LOW.iconTone}`} />
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold leading-snug text-ink">
                Não consegui conferir os avisos do CRM agora
              </h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
                Isso não quer dizer que está tudo certo — quer dizer que eu ainda não sei.
                Atualize a página para eu tentar de novo.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className={`mt-3 ${CTA_SECONDARY}`}
              >
                Tentar de novo
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const alerts = selectCrmAlerts(actions);

  // Nada travando ⇒ nada na tela. A ausência de aviso não vira selo de saúde.
  if (alerts.length === 0) return <p>Tudo em ordem por aqui</p>;

  return (
    <section aria-label="Avisos do CRM" data-testid="crm-action-center" className="space-y-2">
      {alerts.map((alert) => {
        const sev = SEVERITY[alert.priority];
        const ctaClass = alert.priority === "HIGH" ? CTA_PRIMARY : CTA_SECONDARY;

        return (
          <div key={alert.id} className={`${CARD} ${sev.border}`} data-testid="crm-alert">
            <span aria-hidden="true" className={`absolute inset-y-0 left-0 ${sev.railWidth} ${sev.rail}`} />
            <div className="flex gap-3 py-4 pl-4 pr-4 sm:gap-3.5 sm:pl-5 sm:pr-5">
              <SeverityIcon shape={sev.shape} className={`mt-0.5 shrink-0 ${sev.iconTone}`} />

              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="text-[14px] font-semibold leading-snug text-ink">{alert.title}</h3>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.04em] ${sev.pill}`}
                    >
                      {sev.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">{alert.body}</p>
                  {alert.meta && <p className="mt-1 text-[12px] leading-relaxed text-muted">{alert.meta}</p>}
                  {!alert.cta && (
                    <p className="mt-2 text-[12.5px] font-semibold leading-relaxed text-ink2">
                      Próximo passo: {alert.nextStep}
                    </p>
                  )}
                </div>

                {alert.cta?.href && (
                  <Link href={alert.cta.href} title={alert.nextStep} className={`shrink-0 ${ctaClass}`}>
                    {alert.cta.label} <span aria-hidden="true">→</span>
                  </Link>
                )}
                {alert.cta?.tab && onNavigateToTab && (
                  <button
                    type="button"
                    title={alert.nextStep}
                    onClick={() => onNavigateToTab(alert.cta!.tab!)}
                    className={`shrink-0 ${ctaClass}`}
                  >
                    {alert.cta.label} <span aria-hidden="true">→</span>
                  </button>
                )}
                {alert.cta?.tab && !onNavigateToTab && (
                  <p className="shrink-0 text-[12.5px] font-semibold leading-relaxed text-ink2">
                    Próximo passo: {alert.nextStep}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
