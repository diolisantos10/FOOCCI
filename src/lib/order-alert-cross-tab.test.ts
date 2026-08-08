/**
 * PORTÃO — "o pedido já foi aceito mas o som continua" (CEO, 08/08/2026).
 *
 * O defeito não estava DENTRO de uma aba: estava ENTRE abas. A memória de
 * "pedido já tratado" vivia num `Set` dentro de uma aba (GlobalAlertEngine) e
 * era alimentada por um evento de navegador que só chega na aba onde a pessoa
 * clicou — enquanto quem apita é eleito por Web Locks e pode ser OUTRA aba.
 * Aceitar move PENDING→CONFIRMED, que continua no conjunto que toca, então a
 * aba que não recebeu o evento seguia apitando pelos 3 minutos da janela.
 *
 * Estes testes simulam DUAS abas (ou dois aparelhos) contra UM servidor, cada
 * uma com sua própria memória local. Nenhum teste aqui vale se rodar dentro de
 * uma aba só — é exatamente esse o ponto cego que deixou o defeito passar.
 *
 * As três propriedades exigidas:
 *   1. pedido aceito em OUTRO contexto (sem o evento local) não toca;
 *   2. pedido não aceito CONTINUA tocando dentro da janela;
 *   3. servidor indisponível → TOCA (fail-safe; alarme mudo é pior).
 */

import { describe, it, expect } from "vitest";
import { pendingActionOrderIds, ringIdsFromOrdersResponse } from "@/lib/order-alert";

const NOW = 1_800_000_000_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

/** Corpo do GET /api/orders como o servidor o devolve. */
function serverBody(rows: Record<string, unknown>[]) {
  return { success: true, data: { data: rows, total: rows.length, page: 1, limit: 50, totalPages: 1 } };
}

/**
 * Uma aba do navegador rodando o GlobalAlertEngine: memória local própria
 * (o `resolvedOrderIds` do motor) + o mesmo cálculo de ring-set do poll.
 * `ringing` é o que essa aba mandaria o AlertLoopController tocar.
 */
class Tab {
  private resolved = new Set<string>();
  ringing: string[] = [];

  /** O evento de navegador `foocci:order-resolved` — só na aba que clicou. */
  localResolve(id: string) {
    this.resolved.add(id);
    this.ringing = this.ringing.filter((x) => x !== id);
  }

  /** Um ciclo de poll. `payload` undefined/erro = servidor indisponível. */
  poll(payload: unknown) {
    const ids = ringIdsFromOrdersResponse(payload, { now: NOW });
    if (ids === null) return; // "não sei" → mantém o estado atual (fail-safe)
    this.ringing = ids.filter((id) => !this.resolved.has(id));
  }
}

describe("som do pedido — a memória de 'já tratado' é do SERVIDOR, não da aba", () => {
  it("1. aceito em OUTRA aba/aparelho: a aba que não recebeu o evento local para de tocar", () => {
    const tabPainel  = new Tab(); // o dono, na tela de Atendimento
    const tabCozinha = new Tab(); // outro aparelho — nunca recebe o evento local

    // Pedido novo chega: as duas tocam.
    let body = serverBody([{ id: "o1", status: "PENDING", createdAt: iso(30_000) }]);
    tabPainel.poll(body);
    tabCozinha.poll(body);
    expect(tabPainel.ringing).toEqual(["o1"]);
    expect(tabCozinha.ringing).toEqual(["o1"]);

    // A cozinha aceita: PENDING→CONFIRMED **e** o servidor carimba quem agiu.
    tabCozinha.localResolve("o1");
    body = serverBody([
      { id: "o1", status: "CONFIRMED", createdAt: iso(30_000), alarmAckAt: iso(1_000), alarmAckByUserId: "user-cozinha" },
    ]);

    // A aba do painel NUNCA recebeu o evento local — e mesmo assim cala.
    tabPainel.poll(body);
    expect(tabPainel.ringing).toEqual([]);
    expect(tabCozinha.ringing).toEqual([]);
  });

  it("1b. recarregar a página (memória local zerada) não ressuscita o som", () => {
    const body = serverBody([
      { id: "o1", status: "CONFIRMED", createdAt: iso(30_000), alarmAckAt: iso(1_000), alarmAckByUserId: "user-1" },
    ]);
    const abaNova = new Tab(); // F5: `resolvedOrderIds` nasce vazio
    abaNova.poll(body);
    expect(abaNova.ringing).toEqual([]);
  });

  it("2. pedido NÃO aceito continua tocando em todas as abas dentro da janela", () => {
    const body = serverBody([
      { id: "aceito",     status: "CONFIRMED", createdAt: iso(30_000), alarmAckAt: iso(1_000) },
      { id: "sem-acao-p", status: "PENDING",   createdAt: iso(30_000), alarmAckAt: null },
      { id: "sem-acao-c", status: "CONFIRMED", createdAt: iso(30_000) }, // campo ausente
    ]);
    const tabA = new Tab();
    const tabB = new Tab();
    tabA.poll(body);
    tabB.poll(body);
    expect(tabA.ringing).toEqual(["sem-acao-p", "sem-acao-c"]);
    expect(tabB.ringing).toEqual(["sem-acao-p", "sem-acao-c"]);
  });

  it("3. servidor indisponível → o alarme que já tocava CONTINUA tocando", () => {
    const tab = new Tab();
    tab.poll(serverBody([{ id: "o1", status: "PENDING", createdAt: iso(30_000) }]));
    expect(tab.ringing).toEqual(["o1"]);

    // Todas as formas de "o servidor não respondeu de forma utilizável".
    for (const bad of [undefined, null, "", 0, { error: "500" }, { success: false, data: null }, { data: {} }, { data: { data: "x" } }]) {
      tab.poll(bad);
      expect(tab.ringing).toEqual(["o1"]); // nunca cala por incerteza
    }
  });

  it("3b. carimbo de aceite ilegível NÃO cala o alarme (falha para o lado do som)", () => {
    const tab = new Tab();
    tab.poll(serverBody([{ id: "o1", status: "PENDING", createdAt: iso(30_000), alarmAckAt: "não-é-data" }]));
    expect(tab.ringing).toEqual(["o1"]);
  });
});

describe("pendingActionOrderIds honra o carimbo do servidor", () => {
  it("pedido com alarmAckAt sai do conjunto que toca, em qualquer status da janela", () => {
    const orders = [
      { id: "p-ack",  status: "PENDING",   createdAt: iso(30_000), alarmAckAt: iso(1_000) },
      { id: "c-ack",  status: "CONFIRMED", createdAt: iso(30_000), alarmAckAt: new Date(NOW - 1_000) },
      { id: "p-open", status: "PENDING",   createdAt: iso(30_000) },
    ];
    expect(pendingActionOrderIds(orders, { now: NOW })).toEqual(["p-open"]);
  });

  it("carimbo ausente/nulo/inválido nunca silencia", () => {
    const orders = [
      { id: "a", status: "PENDING",   createdAt: iso(30_000), alarmAckAt: null },
      { id: "b", status: "CONFIRMED", createdAt: iso(30_000), alarmAckAt: undefined },
      { id: "c", status: "PENDING",   createdAt: iso(30_000), alarmAckAt: "lixo" },
    ];
    expect(pendingActionOrderIds(orders, { now: NOW })).toEqual(["a", "b", "c"]);
  });
});
