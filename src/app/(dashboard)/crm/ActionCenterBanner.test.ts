/**
 * A faixa de avisos do CRM — o portão que impede o aviso de sumir de novo.
 *
 * CONTEXTO (o defeito que este teste existe para não deixar voltar)
 * O `CrmActionCenterService` calculava "WhatsApp não conectado — nenhuma campanha
 * pode ser enviada" a cada carga da página do CRM. A prop `actions` atravessava
 * `page.tsx` → `CRMClient` → `OverviewTab` e **nunca era renderizada**: era
 * desestruturada e esquecida. O lojista via "0 mensagens enviadas" com 12
 * campanhas ativas e nenhuma explicação, enquanto o sistema sabia a resposta.
 * Nenhum teste pegou, porque não havia teste que olhasse a TELA.
 *
 * AS DUAS METADES, e nenhuma sozinha basta:
 *   1. Com ação, a faixa APARECE, com o texto, a severidade e o próximo passo
 *      clicável. Sem isso, o defeito original volta em silêncio.
 *   2. Com lista vazia, a faixa NÃO aparece — e não aparece NADA no lugar dela.
 *      Sem isso, alguém "melhora" a tela pondo um "está tudo em ordem", que é
 *      ausência de informação virando informação (guardrail 1 do CLAUDE.md).
 *
 * Aqui se renderiza o componente de verdade (`renderToStaticMarkup`) e se olha o
 * HTML. Asserção sobre constante — do tipo `expect("Urgente").toBe("Urgente")` —
 * não prova que alguma coisa foi desenhada.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ActionCenterBanner, selectCrmAlerts } from "./ActionCenterBanner";
import { OverviewTab } from "./OverviewTab";
import type { CrmAction, CrmActionType, ActionPriority } from "@/services/crm/CrmActionCenterService";
import { computeActions } from "@/services/crm/CrmActionCenterService";
import { DEFAULT_SEGMENT_CONFIG } from "@/lib/crm-segments";

// ─── Fábrica ──────────────────────────────────────────────────────────────────

function makeAction(over: Partial<CrmAction> & { type: CrmActionType; priority: ActionPriority }): CrmAction {
  return {
    id: over.id ?? `action-${over.type}`,
    type: over.type,
    title: over.title ?? "Título",
    description: over.description ?? "Descrição",
    priority: over.priority,
    estimatedAudienceCount: over.estimatedAudienceCount ?? 0,
    estimatedRevenueOpportunity: over.estimatedRevenueOpportunity ?? 0,
    safetyStatus: over.safetyStatus ?? "READY",
    eligibleCount: over.eligibleCount ?? 0,
    blockedCount: over.blockedCount ?? 0,
    blockerReasons: over.blockerReasons ?? [],
    suggestedNextStep: over.suggestedNextStep ?? "",
    recommendedCampaignType: over.recommendedCampaignType ?? null,
    linkedCustomerSample: over.linkedCustomerSample ?? [],
    reason: over.reason ?? "",
    computedAt: over.computedAt ?? "2026-08-13T12:00:00.000Z",
  };
}

/** O aviso real, como o serviço o produz (texto copiado do serviço, não inventado). */
const WHATSAPP_DOWN = makeAction({
  type: "SAFETY_ISSUE_ALERT",
  priority: "HIGH",
  title: "WhatsApp não conectado",
  description: "O WhatsApp oficial (Meta) não está conectado. Nenhuma campanha pode ser enviada.",
  suggestedNextStep: "Conectar o WhatsApp oficial em Integrações → WhatsApp.",
  estimatedAudienceCount: 1240,
  blockedCount: 1240,
  blockerReasons: ["sem-whatsapp"],
  safetyStatus: "BLOCKED",
});

function render(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

// ─── 1. Com ação, a faixa aparece ─────────────────────────────────────────────

describe("com ação, a faixa aparece", () => {
  it("desenha o aviso de WhatsApp desconectado com título, motivo e próximo passo clicável", () => {
    const html = render(React.createElement(ActionCenterBanner, { actions: [WHATSAPP_DOWN] }));

    // Alguma coisa foi desenhada.
    expect(html).toContain('data-testid="crm-action-center"');
    expect(html).toContain('data-testid="crm-alert"');

    // O que está acontecendo.
    expect(html).toContain("WhatsApp não conectado");
    expect(html).toContain("Nenhuma campanha pode ser enviada");

    // O próximo passo é um destino de verdade, não um texto solto.
    expect(html).toContain('href="/integracoes/whatsapp"');
    expect(html).toContain("Conectar o WhatsApp");

    // O passo escrito pelo serviço não se perde: vai no title do link.
    expect(html).toContain("Conectar o WhatsApp oficial em Integrações");
  });

  it("mostra a consequência em número: quantos clientes ficam sem receber nada", () => {
    const html = render(React.createElement(ActionCenterBanner, { actions: [WHATSAPP_DOWN] }));
    expect(html).toContain("1.240");
    expect(html).toContain("sem receber nada");
  });

  it("severidade tem FORMA, não só cor: rótulo escrito + triângulo + barra mais grossa", () => {
    const alta = render(React.createElement(ActionCenterBanner, { actions: [WHATSAPP_DOWN] }));
    const media = render(
      React.createElement(ActionCenterBanner, {
        actions: [
          makeAction({
            type: "CAMPAIGN_PERFORMANCE_ALERT",
            priority: "MEDIUM",
            title: "Campanhas com baixa conversão",
            suggestedNextStep: "Revisar templates de campanha e segmentação de audiência.",
          }),
        ],
        onNavigateToTab: () => {},
      }),
    );

    // (a) o rótulo escrito — o sinal que sobrevive a qualquer daltonismo
    expect(alta).toContain("Urgente");
    expect(media).toContain("Atenção");
    expect(media).not.toContain("Urgente");

    // (b) a silhueta do ícone: triângulo na urgente, círculo na de atenção
    expect(alta).toContain("<path");
    expect(alta).not.toContain("<circle cx=\"12\" cy=\"12\"");
    expect(media).toContain("<circle cx=\"12\" cy=\"12\"");

    // (c) a espessura da barra lateral
    expect(alta).toContain("w-1.5");
    expect(media).not.toContain("w-1.5");
  });

  it("aviso que leva a uma aba do próprio CRM vira botão, e nunca fica sem próximo passo", () => {
    const acao = makeAction({
      type: "CAMPAIGN_PERFORMANCE_ALERT",
      priority: "MEDIUM",
      title: "Campanhas com baixa conversão",
      suggestedNextStep: "Revisar templates de campanha e segmentação de audiência.",
    });

    const comHandler = render(
      React.createElement(ActionCenterBanner, { actions: [acao], onNavigateToTab: () => {} }),
    );
    expect(comHandler).toContain("Revisar as campanhas");

    // Sem quem leve para a aba, o botão NÃO é desenhado morto: o passo vira texto.
    const semHandler = render(React.createElement(ActionCenterBanner, { actions: [acao] }));
    expect(semHandler).toContain("Próximo passo:");
    expect(semHandler).toContain("Revisar templates de campanha");
  });

  it("falta de link de avaliação aparece como impedimento, com destino em Marca", () => {
    const html = render(
      React.createElement(ActionCenterBanner, {
        actions: [
          makeAction({
            type: "REVIEW_REQUEST",
            priority: "MEDIUM",
            title: "Pedir avaliação de 8 cliente(s)",
            description:
              "Clientes com pedido de 1–5 dias atrás — mas nenhum link de avaliação (Google/iFood) está configurado em Marca.",
            recommendedCampaignType: null,
            suggestedNextStep: "Configurar link de avaliação em Marca antes de pedir avaliações.",
          }),
        ],
      }),
    );
    expect(html).toContain("Falta o link para pedir avaliação");
    expect(html).toContain('href="/marca"');
  });

  it("a ordem do serviço é respeitada: o urgente vem antes do resto", () => {
    const html = render(
      React.createElement(ActionCenterBanner, {
        actions: [
          WHATSAPP_DOWN,
          makeAction({
            type: "CAMPAIGN_PERFORMANCE_ALERT",
            priority: "MEDIUM",
            title: "Campanhas com baixa conversão",
          }),
        ],
        onNavigateToTab: () => {},
      }),
    );
    expect(html.indexOf("WhatsApp não conectado")).toBeLessThan(html.indexOf("Campanhas com baixa conversão"));
  });
});

// ─── 2. Sem ação, a faixa não existe ──────────────────────────────────────────

describe("sem ação, a faixa não existe — e nada ocupa o lugar dela", () => {
  it("lista vazia não desenha absolutamente nada", () => {
    expect(render(React.createElement(ActionCenterBanner, { actions: [] }))).toBe("");
  });

  it("prop ausente não desenha absolutamente nada", () => {
    expect(render(React.createElement(ActionCenterBanner, {}))).toBe("");
  });

  it("nunca escreve que está tudo bem — ausência de alerta não é prova de saúde", () => {
    const html = render(React.createElement(ActionCenterBanner, { actions: [] }));
    for (const frase of ["tudo certo", "tudo bem", "tudo em ordem", "Nenhum aviso", "sem pendências"]) {
      expect(html.toLowerCase()).not.toContain(frase.toLowerCase());
    }
  });

  it("só oportunidade comercial (que roda sozinha) não vira faixa de impedimento", () => {
    const comerciais: CrmActionType[] = [
      "RECOVER_COLD_CUSTOMERS",
      "RECOVER_LOST_CUSTOMERS",
      "WARM_CUSTOMERS",
      "VIP_APPRECIATION",
      "BIRTHDAY_CAMPAIGN",
      "COUPON_OPPORTUNITY",
      "NO_ORDER_FIRST_PURCHASE",
      "HIGH_VALUE_CUSTOMER_ATTENTION",
    ];
    const html = render(
      React.createElement(ActionCenterBanner, {
        actions: comerciais.map((t) => makeAction({ type: t, priority: "HIGH" })),
      }),
    );
    expect(html).toBe("");

    // E o pedido de avaliação COM link também não é impedimento nenhum.
    const comLink = render(
      React.createElement(ActionCenterBanner, {
        actions: [
          makeAction({
            type: "REVIEW_REQUEST",
            priority: "MEDIUM",
            recommendedCampaignType: "solicitar-avaliacao",
          }),
        ],
      }),
    );
    expect(comLink).toBe("");
  });
});

// ─── 3. Erro não pode virar silêncio ──────────────────────────────────────────

describe("erro ao calcular não vira tela limpa", () => {
  it("quando o cálculo falha, a faixa diz que não sabe e oferece tentar de novo", () => {
    const html = render(React.createElement(ActionCenterBanner, { actions: [], failed: true }));
    expect(html).toContain("Não consegui conferir os avisos do CRM");
    expect(html).toContain("não quer dizer que está tudo certo");
    expect(html).toContain("Tentar de novo");
  });
});

// ─── 4. O elo com o serviço real ──────────────────────────────────────────────
//
// Os testes acima usam ações fabricadas. Este liga a ponta: roda o CÁLCULO de
// verdade e prova que o que ele produz chega na tela. Se alguém renomear o tipo
// SAFETY_ISSUE_ALERT ou mudar o gatilho, os testes de fábrica continuariam
// verdes e a tela ficaria muda de novo — este aqui reprova.

describe("o que o serviço calcula é o que a tela desenha", () => {
  const base = {
    customers: [
      {
        id: "c1",
        name: "Cliente",
        phone: "5511999999999",
        hasOptedOut: false,
        crmContactable: true,
        totalSpend: 100,
        totalOrders: 2,
        lastOrderAt: new Date("2026-08-10T12:00:00Z"),
        importedOrderCount: null,
        importedTotalSpent: null,
        importedLastOrderAt: null,
        averageTicket: 50,
        tier: "BRONZE",
        birthDate: null,
      },
    ],
    now: new Date("2026-08-13T12:00:00Z"),
    couponUserIds: new Set<string>(),
    segmentConfig: DEFAULT_SEGMENT_CONFIG,
    recentCampaignStats: null,
    restaurantAvgTicket: 50,
  };

  it("canal desconectado ⇒ o lojista LÊ o motivo no topo do CRM", () => {
    const actions = computeActions({ ...base, hasWhatsAppChannel: false });
    const html = render(React.createElement(ActionCenterBanner, { actions }));
    expect(html).toContain("WhatsApp não conectado");
    expect(html).toContain('href="/integracoes/whatsapp"');
  });

  it("canal conectado ⇒ nenhuma faixa (as oportunidades do serviço não são impedimento)", () => {
    const actions = computeActions({ ...base, hasWhatsAppChannel: true });
    expect(actions.length).toBeGreaterThan(0); // o serviço produziu coisa
    const html = render(React.createElement(ActionCenterBanner, { actions }));
    expect(html).toBe(""); // e mesmo assim a faixa fica calada
  });
});

// ─── 5. A faixa está MONTADA na Visão Geral, e antes dos números ──────────────
//
// ESTE É O TESTE QUE FALTAVA. Todos os anteriores passariam com o componente
// existindo e ninguém o chamando — que é EXATAMENTE o defeito original: a prop
// `actions` chegava na `OverviewTab` e morria na desestruturação. Aqui se
// renderiza a aba inteira e se procura a faixa dentro dela.

describe("a faixa está montada na Visão Geral", () => {
  const statsVazias = {
    totalCustomers: 0,
    ativoCustomers: 0,
    mornoCustomers: 0,
    frioCustomers: 0,
    perdidosCustomers: 0,
    naoCompraramCustomers: 0,
    newCustomers: 0,
    segments: [],
    deliveryOnlyCustomers: 0,
    dineInOnlyCustomers: 0,
    bothChannelsCustomers: 0,
    contactableCustomers: 0,
    withEmailCustomers: 0,
    uncontactableCustomers: 0,
    foocciAcquiredCustomers: 0,
    activatableCustomers: 0,
  };

  function renderOverview(props: Record<string, unknown>): string {
    return renderToStaticMarkup(
      React.createElement(OverviewTab, {
        stats: statsVazias,
        opportunitiesCount: 0,
        loading: false,
        datePreset: "month",
        customFrom: "",
        customTo: "",
        onDateChange: () => {},
        ...props,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    );
  }

  it("com o WhatsApp caído, a Visão Geral mostra o motivo ANTES do primeiro número", () => {
    const html = renderOverview({ actions: [WHATSAPP_DOWN] });

    expect(html).toContain('data-testid="crm-action-center"');
    expect(html).toContain("WhatsApp não conectado");

    // Antes dos números: a faixa precede o primeiro KPI da tela.
    const faixa = html.indexOf('data-testid="crm-action-center"');
    const primeiroKpi = html.indexOf("Clientes na base");
    expect(faixa).toBeGreaterThanOrEqual(0);
    expect(primeiroKpi).toBeGreaterThanOrEqual(0);
    expect(faixa).toBeLessThan(primeiroKpi);
  });

  it("sem impedimento, a Visão Geral abre direto nos números", () => {
    const html = renderOverview({ actions: [] });
    expect(html).not.toContain('data-testid="crm-action-center"');
    expect(html).toContain("Clientes na base");
  });

  it("com falha no cálculo, a Visão Geral avisa que não sabe", () => {
    const html = renderOverview({ actions: [], actionsFailed: true });
    expect(html).toContain("Não consegui conferir os avisos do CRM");
  });
});

// ─── 6. A seleção é pura ──────────────────────────────────────────────────────

describe("selectCrmAlerts é pura e determinística", () => {
  it("mesma entrada, mesma saída", () => {
    const input = [WHATSAPP_DOWN];
    expect(selectCrmAlerts(input)).toEqual(selectCrmAlerts(input));
  });

  it("todo aviso selecionado carrega título, corpo e próximo passo — nunca linha vazia", () => {
    const alerts = selectCrmAlerts([WHATSAPP_DOWN]);
    expect(alerts).toHaveLength(1);
    for (const a of alerts) {
      expect(a.title.trim().length).toBeGreaterThan(0);
      expect(a.body.trim().length).toBeGreaterThan(0);
      expect(a.nextStep.trim().length).toBeGreaterThan(0);
    }
  });
});
