/**
 * PORTÃO ESTRUTURAL + comportamento — "venda" tem UMA definição.
 *
 * O defeito que este arquivo trava (raio-x de 13/08/2026): existiam CINCO
 * cópias da lista de status de faturamento no repositório, e uma delas
 * (`DashboardCockpitService`) incluía `AWAITING_PAYMENT` — Pix que ninguém
 * pagou somava como venda na saúde do painel e na média dos 7 dias. E o alerta
 * "N pagamentos pendentes" oferecia "Ver pedidos", abrindo uma tela que exclui
 * `AWAITING_PAYMENT` por construção: o lojista clicava e não achava nada.
 *
 * Mesmo remédio de `src/lib/billing/pricing.ts` (04/08, quatro tabelas de
 * preço): fonte única + portão contra a segunda cópia.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import {
  REVENUE_ORDER_STATUSES,
  REVENUE_STATUS_LIST,
  isRevenueStatus,
  AWAITING_PAYMENT_STATUS,
  PENDING_PAYMENTS_HREF,
} from "./order-revenue";
import { buildAlerts, type CockpitRawData } from "@/services/dashboard/DashboardCockpitService";

// ── A decisão, travada ───────────────────────────────────────────────────────

describe("a definição de venda", () => {
  it("NÃO conta Pix não pago — dinheiro que não entrou não é receita", () => {
    expect(isRevenueStatus("AWAITING_PAYMENT")).toBe(false);
    expect(REVENUE_STATUS_LIST).not.toContain("AWAITING_PAYMENT");
  });

  it("também não conta PENDING nem CANCELLED", () => {
    expect(isRevenueStatus("PENDING")).toBe(false);
    expect(isRevenueStatus("CANCELLED")).toBe(false);
  });

  it("conta do CONFIRMED em diante", () => {
    for (const s of ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      expect(isRevenueStatus(s)).toBe(true);
    }
    expect(REVENUE_ORDER_STATUSES).toHaveLength(5);
  });
});

// ── O alerta × a tela que ele abre ───────────────────────────────────────────

describe("o alerta de pagamentos pendentes abre a tela onde eles APARECEM", () => {
  const base: CockpitRawData = {
    todayRevenue: 0, todayOrders: 0, cancelledToday: 0,
    avg7DayRevenue: 0, hasSevenDayData: false,
    pendingPayments: 0, delayedOrders: 0,
    crmFrio: 0, crmTotal: 0, vipCustomers: 0,
    pendingRecovery: 0, mpWebhookSecretMissing: false,
  };

  it("o destino carrega o recorte — sem ele a tela filtra AWAITING_PAYMENT fora", () => {
    const alerta = buildAlerts({ ...base, pendingPayments: 4 })
      .find((a) => a.id === "pending-payments");

    expect(alerta).toBeDefined();
    expect(alerta!.actionHref).toBe(PENDING_PAYMENTS_HREF);

    // A prova que importa: o href, lido como URL, pede exatamente o status que
    // a lista operacional esconde. "/orders" pelado — o valor antigo — falharia
    // esta asserção, que é o ponto.
    const url = new URL(alerta!.actionHref!, "https://foocci.com.br");
    expect(url.pathname).toBe("/orders");
    expect(url.searchParams.get("status")).toBe(AWAITING_PAYMENT_STATUS);
  });

  it("sem pagamento pendente, não existe alerta para lugar nenhum", () => {
    expect(buildAlerts(base).find((a) => a.id === "pending-payments")).toBeUndefined();
  });
});

// ── O portão contra a segunda cópia ──────────────────────────────────────────

const SRC = join(process.cwd(), "src");
const ARQUIVO_DONO = join("src", "lib", "order-revenue.ts");

/**
 * Uma lista literal de status de faturamento escrita à mão. É isto que não pode
 * voltar a existir fora do arquivo dono — foi assim que as cinco cópias
 * divergiram sem ninguém perceber.
 */
const COPIA_LITERAL = /(?:REVENUE_STATUS|REVENUE_STATUSES|revenueStatus(?:es)?)\s*(?::[^=]*)?=\s*\[[^\]]*["'](?:DELIVERED|CONFIRMED|OUT_FOR_DELIVERY)["'][^\]]*\]/s;

function listarArquivos(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const cheio = join(dir, nome);
    if (statSync(cheio).isDirectory()) listarArquivos(cheio, out);
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) out.push(cheio);
  }
  return out;
}

describe("portão: nenhuma segunda cópia da lista de faturamento", () => {
  it("ninguém reescreve a lista de status de venda à mão", () => {
    const culpados = listarArquivos(SRC)
      .filter((cheio) => relative(process.cwd(), cheio) !== ARQUIVO_DONO)
      .filter((cheio) => COPIA_LITERAL.test(readFileSync(cheio, "utf8")))
      .map((cheio) => relative(process.cwd(), cheio));

    expect(
      culpados,
      culpados.length === 0
        ? ""
        : `Estes arquivos escrevem a lista de status de FATURAMENTO à mão em vez de ` +
          `importar REVENUE_STATUS_LIST de @/lib/order-revenue. Foi exatamente assim ` +
          `que cinco cópias divergiram e o Pix não pago virou venda num painel e não ` +
          `no outro:\n\n` + culpados.map((c) => `  • ${c}`).join("\n"),
    ).toEqual([]);
  });

  it("o detector reconhece uma cópia literal quando vê uma", () => {
    // Metade que DEVE pegar — a forma exata das cinco cópias que existiam.
    expect(COPIA_LITERAL.test(
      `const REVENUE_STATUS: OrderStatus[] = ["DELIVERED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];`
    )).toBe(true);
    expect(COPIA_LITERAL.test(
      `const REVENUE_STATUS: OrderStatus[] = [\n  OrderStatus.CONFIRMED,\n  "DELIVERED",\n];`
    )).toBe(true);

    // Metade que NÃO pode pegar — o uso correto, importando a fonte única.
    expect(COPIA_LITERAL.test(
      `const REVENUE_STATUS: OrderStatus[] = REVENUE_STATUS_LIST;`
    )).toBe(false);
  });
});
