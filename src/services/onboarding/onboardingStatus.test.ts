/**
 * O guia de configuração — o portão que impede a tela de voltar a ficar órfã.
 *
 * O DEFEITO QUE ESTE TESTE EXISTE PARA NÃO DEIXAR VOLTAR (13/08/2026)
 * `/onboarding` estava pronta, lia o banco de verdade, tinha as 7 etapas e o
 * link "Configurar" em cada uma — e **nenhum arquivo de `src/` apontava para
 * ela**. Só chegava quem digitava a URL. Enquanto isso a página de contratação
 * prometia ao cliente que "o próprio painel te guia no primeiro cardápio".
 * Nenhum teste pegou, porque nenhum teste perguntava se a tela era ALCANÇÁVEL.
 *
 * AS DUAS METADES — e nenhuma sozinha basta:
 *   1. Com etapa pendente, o caminho APARECE (menu + convite no painel). Sem
 *      isso, a tela órfã volta em silêncio.
 *   2. Sem etapa pendente, o caminho SOME. Sem isso, nasce um menu que nunca
 *      desaparece — decoração que o lojista aprende a ignorar, e aí o aviso não
 *      vale nada no dia em que importar.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// O menu lê a rota atual pelo router do Next, que não existe fora do navegador.
// No produto ela sempre existe; aqui basta uma rota qualquer que não seja a do guia.
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

import {
  contarEtapasPendentes,
  guiaConcluido,
  resumoDoGuia,
  deveAbrirOGuia,
  type OnboardingStatusData,
  type StepResult,
} from "./onboardingStatus";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";

// ─── Fábrica ──────────────────────────────────────────────────────────────────

const feito = (m = "ok"): StepResult    => ({ status: "COMPLETE", message: m });
const pendente = (m = "falta"): StepResult => ({ status: "PENDING",  message: m });
const aviso = (m = "atenção"): StepResult  => ({ status: "WARNING",  message: m });

function makeStatus(over: Partial<OnboardingStatusData> = {}): OnboardingStatusData {
  return {
    restaurantId:   "r1",
    restaurantName: "Pizzaria Demo",
    slug:           "pizzaria-demo",
    readiness:      "EM_CONFIGURACAO",
    steps: {
      loja:          feito(),
      funcionamento: feito(),
      entrega:       feito(),
      pagamentos:    feito(),
      cardapio:      pendente(),
      canais:        aviso(),
      teste:         pendente(),
    },
    counts:  { categories: 0, activeProducts: 0, totalProducts: 0, productsWithImage: 0 },
    links:   { delivery: "", qr: "" },
    payment: { acceptCash: true, acceptPix: false, acceptCard: false, hasOnlineProvider: false },
    whatsapp:{ hasPhone: true, hasWhatsApp: false, agentMode: "RECEPTIONIST_ONLY" },
    finalTestCompletedAt: null,
    ...over,
  };
}

/** O restaurante que terminou: prontidão de piloto e as 7 etapas verdes. */
function statusConcluido(): OnboardingStatusData {
  return makeStatus({
    readiness: "PRONTO_PARA_PILOTO",
    steps: {
      loja: feito(), funcionamento: feito(), entrega: feito(), pagamentos: feito(),
      cardapio: feito(), canais: feito(), teste: feito(),
    },
    counts: { categories: 4, activeProducts: 11, totalProducts: 11, productsWithImage: 3 },
    finalTestCompletedAt: "2026-08-13T12:00:00.000Z",
  });
}

// ─── A régua ──────────────────────────────────────────────────────────────────

describe("resumo do guia", () => {
  it("conta as etapas que ainda não estão concluídas", () => {
    // cardapio, canais e teste — três das sete
    expect(contarEtapasPendentes(makeStatus().steps)).toBe(3);
    expect(contarEtapasPendentes(statusConcluido().steps)).toBe(0);
  });

  it("só chama de concluído quem está pronto para o piloto", () => {
    expect(guiaConcluido({ readiness: "PRONTO_PARA_PILOTO" })).toBe(true);
    for (const r of ["NAO_INICIADO", "EM_CONFIGURACAO", "PRONTO_PARA_TESTE", "BLOQUEADO"] as const) {
      expect(guiaConcluido({ readiness: r })).toBe(false);
    }
  });

  it("marca cardápio vazio por produto ATIVO, não por produto cadastrado", () => {
    // 11 produtos, todos desativados: a loja no ar não tem o que vender.
    const s = makeStatus({ counts: { categories: 4, activeProducts: 0, totalProducts: 11, productsWithImage: 0 } });
    expect(resumoDoGuia(s).cardapioVazio).toBe(true);
  });

  it("quando não está concluído, sempre há pelo menos uma pendência para mostrar", () => {
    // Sem isso o menu apareceria com o número zero — aviso que se contradiz.
    const r = resumoDoGuia(makeStatus());
    expect(r.concluido).toBe(false);
    expect(r.pendentes).toBeGreaterThan(0);
  });
});

describe("deveAbrirOGuia — o painel dá lugar ao guia", () => {
  it("primeiro acesso sem cardápio: abre o guia", () => {
    expect(deveAbrirOGuia({ cardapioVazio: true, pediuPainel: false })).toBe(true);
  });

  it("com cardápio no ar: nunca sequestra o painel", () => {
    // O restaurante que já vende abre o painel todo dia. Um redirecionamento
    // aqui seria o pior defeito possível em produção.
    expect(deveAbrirOGuia({ cardapioVazio: false, pediuPainel: false })).toBe(false);
  });

  it("quem pediu o painel de propósito recebe o painel", () => {
    // `?painel=1` é a saída do vaivém guia ↔ painel.
    expect(deveAbrirOGuia({ cardapioVazio: true, pediuPainel: true })).toBe(false);
  });
});

// ─── A tela: o caminho existe, e some quando deve ─────────────────────────────

function renderSidebar(guia: { pendentes: number; concluido: boolean; cardapioVazio: boolean } | null): string {
  return renderToStaticMarkup(
    React.createElement(
      SidebarProvider,
      { guia, children: React.createElement(Sidebar) },
    ),
  );
}

describe("o menu lateral leva ao guia", () => {
  it("com etapa pendente, o item aparece com o número do que falta", () => {
    const html = renderSidebar(resumoDoGuia(makeStatus()));
    expect(html).toContain('href="/onboarding"');
    expect(html).toContain("Começar aqui");
    expect(html).toContain(">3<"); // as três etapas que faltam
  });

  it("com o guia concluído, o item some do menu", () => {
    const html = renderSidebar(resumoDoGuia(statusConcluido()));
    expect(html).not.toContain('href="/onboarding"');
    expect(html).not.toContain("Começar aqui");
  });

  it("sem informação sobre o guia, não afirma nada — nem que falta, nem que acabou", () => {
    // Banco fora do ar ⇒ resumo null. Ausência de informação não é informação.
    const html = renderSidebar(null);
    expect(html).not.toContain('href="/onboarding"');
  });

  it("o menu não oferece mais 'Fotos do Cardápio' (ordem do CEO, 13/08)", () => {
    const html = renderSidebar(null);
    expect(html).not.toContain("/menu-enhancement");
    expect(html).not.toContain("Fotos do Cardápio");
  });
});
