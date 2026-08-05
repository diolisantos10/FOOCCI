import { describe, it, expect } from "vitest";
import { orderListQuerySchema } from "@/validators/order";
import {
  ORDERS_PAGE_LIMIT,
  applyDateInputs,
  brazilDayStart,
  formatPeriodTotal,
  ordersListUrl,
  parseOrdersListResponse,
  periodTotalFromResponse,
  periodTotalLabel,
  todayCountUrl,
  todayPeriod,
  type OrdersListResponse,
} from "./orders-panel-period";

// 05/08/2026, 10:00 BRT = 13:00 UTC
const NOW = new Date("2026-08-05T13:00:00.000Z");
// 05/08/2026, 00:30 BRT = 03:30 UTC (madrugada: o dia civil ainda é 05)
const MADRUGADA = new Date("2026-08-05T03:30:00.000Z");
// 04/08/2026, 23:50 BRT = 05/08 02:50 UTC (ainda é dia 04 em Brasília)
const ANTES_DA_VIRADA = new Date("2026-08-05T02:50:00.000Z");

describe("dia civil de Brasília", () => {
  it("meia-noite de hoje é 03:00 UTC do mesmo dia", () => {
    expect(brazilDayStart(NOW).toISOString()).toBe("2026-08-05T03:00:00.000Z");
  });

  it("às 23:50 BRT o dia ainda é o anterior (não vira à meia-noite UTC)", () => {
    // A METADE QUE PROVA QUE O CORTE INGÊNUO ERRA: usar o dia UTC diria 05/08,
    // e o pedido das 23:50 sairia do "hoje" do lojista três horas antes da hora.
    expect(brazilDayStart(ANTES_DA_VIRADA).toISOString()).toBe("2026-08-04T03:00:00.000Z");
    expect(ANTES_DA_VIRADA.toISOString().slice(0, 10)).toBe("2026-08-05"); // o corte UTC erraria
  });

  it("o período de hoje cobre o dia inteiro, inclusive a madrugada", () => {
    const p = todayPeriod(MADRUGADA);
    expect(p.from.toISOString()).toBe("2026-08-05T03:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-08-06T02:59:59.999Z");
    expect(p.label).toBe("05/08");
  });
});

describe("KPI de total — vem do servidor, nunca da página carregada", () => {
  // A cena exata do defeito: 100 pedidos carregados (o teto da página),
  // 137 pedidos no dia.
  const RESPOSTA: OrdersListResponse = {
    data:  Array.from({ length: 100 }, (_, i) => ({ id: `o${i}` })),
    total: 137,
    page:  1,
    limit: 100,
  };

  it("mostra a contagem do servidor", () => {
    expect(periodTotalFromResponse(RESPOSTA)).toBe(137);
  });

  it("NÃO mostra o tamanho da página — que era o número errado de antes", () => {
    // A metade que prova que antes errava: o cálculo antigo era `orders.length`.
    const calculoAntigo = RESPOSTA.data.length;
    expect(calculoAntigo).toBe(100);
    expect(periodTotalFromResponse(RESPOSTA)).not.toBe(calculoAntigo);
  });

  it("sem resposta ainda, o KPI é '—' e nunca 0", () => {
    // 0 é um número: exibi-lo enquanto carrega afirma 'nenhum pedido hoje'.
    expect(periodTotalFromResponse(null)).toBeNull();
    expect(formatPeriodTotal(null)).toBe("—");
    expect(formatPeriodTotal(0)).toBe("0");
  });

  it("resposta malformada não vira número inventado", () => {
    expect(periodTotalFromResponse({ data: [], total: NaN, page: 1, limit: 100 })).toBeNull();
    expect(periodTotalFromResponse({ data: [] } as unknown as OrdersListResponse)).toBeNull();
  });

  it("o rótulo diz que período o número cobre", () => {
    expect(periodTotalLabel(null)).toBe("Total hoje");
    const r = applyDateInputs({ from: "2026-08-04", to: "2026-08-04" });
    if (!r.ok) throw new Error("período válido recusado");
    expect(periodTotalLabel(r.period)).toBe("Total · 04/08");
  });
});

describe("parseOrdersListResponse", () => {
  it("entrega lista e total juntos — a mesma resposta alimenta os dois", () => {
    const page = parseOrdersListResponse<{ id: string }>({
      success: true,
      data: { data: [{ id: "a" }], total: 42, page: 1, limit: 100 },
    });
    expect(page?.data).toHaveLength(1);
    expect(page?.total).toBe(42);
  });

  it("recusa resposta de erro ou fora do formato", () => {
    expect(parseOrdersListResponse({ success: false, error: "x" })).toBeNull();
    expect(parseOrdersListResponse({ success: true, data: { data: "nope", total: 1 } })).toBeNull();
    expect(parseOrdersListResponse(null)).toBeNull();
  });
});

describe("o botão Filtrar manda de verdade no que é consultado", () => {
  it("sem datas, a consulta é a lista operacional — sem recorte", () => {
    const r = applyDateInputs({ from: "", to: "" });
    if (!r.ok) throw new Error("vazio deveria ser aceito");
    expect(r.period).toBeNull();
    expect(ordersListUrl(null, 100)).toBe("/api/orders?limit=100");
  });

  it("com datas, a URL muda — from/to vão ao servidor", () => {
    const r = applyDateInputs({ from: "2026-08-01", to: "2026-08-04" });
    if (!r.ok) throw new Error("período válido recusado");
    const url = ordersListUrl(r.period, 100);

    // A metade que prova que antes errava: o clique não mudava consulta nenhuma,
    // então a URL do estado 'filtrado' era idêntica à do estado 'sem filtro'.
    expect(url).not.toBe(ordersListUrl(null, 100));
    expect(url).toContain("from=2026-08-01T03%3A00%3A00.000Z");
    expect(url).toContain("to=2026-08-05T02%3A59%3A59.999Z"); // 04/08 inclusivo, até o fim do dia BRT
  });

  it("o dia final é inclusivo — filtrar 04 a 04 pega o dia 04 inteiro", () => {
    const r = applyDateInputs({ from: "2026-08-04", to: "2026-08-04" });
    if (!r.ok) throw new Error("período válido recusado");
    expect(r.period!.from.toISOString()).toBe("2026-08-04T03:00:00.000Z");
    expect(r.period!.to.toISOString()).toBe("2026-08-05T02:59:59.999Z");
    expect(r.period!.label).toBe("04/08");

    // Se `to` fosse a meia-noite do 04 (o erro fácil), o jantar do dia — o
    // faturamento inteiro da noite — ficaria de fora.
    const meiaNoiteDoDia = new Date("2026-08-04T03:00:00.000Z");
    expect(r.period!.to.getTime()).toBeGreaterThan(meiaNoiteDoDia.getTime());
  });

  it("só data inicial: filtro aberto à direita, sem parâmetro 'to'", () => {
    const r = applyDateInputs({ from: "2026-08-01", to: "" });
    if (!r.ok) throw new Error("período válido recusado");
    const url = ordersListUrl(r.period, 100);
    expect(url).toContain("from=");
    expect(url).not.toContain("to=");
    expect(r.period!.label).toBe("a partir de 01/08");
  });

  it("só data final: filtro aberto à esquerda, sem parâmetro 'from'", () => {
    const r = applyDateInputs({ from: "", to: "2026-08-04" });
    if (!r.ok) throw new Error("período válido recusado");
    const url = ordersListUrl(r.period, 100);
    expect(url).not.toContain("from=");
    expect(url).toContain("to=");
    expect(r.period!.label).toBe("até 04/08");
  });

  it("data final anterior à inicial é ERRO, não lista vazia", () => {
    const r = applyDateInputs({ from: "2026-08-10", to: "2026-08-01" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("deveria recusar");
    expect(r.error).toMatch(/anterior/i);
  });

  it("data ilegível é ERRO, não filtro silencioso", () => {
    expect(applyDateInputs({ from: "05/08/2026", to: "" }).ok).toBe(false);
    expect(applyDateInputs({ from: "", to: "2026-13-45" }).ok).toBe(false);
  });

  it("o que a tela envia é o que a API aceita — contrato, não torcida", () => {
    // Se o formato de `from`/`to` não passar no schema, a API devolve 400 e a
    // lista fica vazia: o lojista filtraria e leria 'nenhum pedido'.
    const r = applyDateInputs({ from: "2026-08-01", to: "2026-08-04" });
    if (!r.ok) throw new Error("período válido recusado");
    const url    = new URL(ordersListUrl(r.period, ORDERS_PAGE_LIMIT), "http://x");
    const parsed = orderListQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.limit).toBe(ORDERS_PAGE_LIMIT); // 100 é o teto do schema
    expect(parsed.data.from).toBeDefined();
    expect(parsed.data.to).toBeDefined();
  });

  it("a contagem do dia pede só o total, não uma página inteira", () => {
    const url = todayCountUrl(NOW);
    expect(url).toContain("limit=1");
    expect(url).toContain("from=2026-08-05T03%3A00%3A00.000Z");
    expect(url).toContain("to=2026-08-06T02%3A59%3A59.999Z");
  });
});
