/**
 * A saúde da recuperação de carrinho — o alarme que faltava.
 *
 * O CASO QUE ORIGINOU ESTE ARQUIVO (05/08/2026)
 * A tela de Campanhas mostrava "🛒 Carrinho abandonado · Ativa" com todos os
 * números em traço. Os logs de produção do cron mostraram por quê: entre 19/05
 * e 05/08, 792 execuções lidas, **4 mensagens enviadas no total** — 3 no dia da
 * estreia e 1 em 12/07 — e 1.248 declarações de "elegível" que não viraram nem
 * envio nem falha. A tela dizia "Ativa" o tempo inteiro.
 *
 * A trava aqui não é sobre enviar mais; é sobre a máquina não conseguir mais
 * ficar calada bonita. Guardrail 2: quem não registrou resultado não passa por
 * saudável.
 *
 * A METADE QUE REPRODUZ O COMPORTAMENTO ANTIGO
 * `describe("o silêncio de antes")` recria o estado exato de produção em 05/08
 * — ativa, sem nenhum envio, 51 carrinhos vencidos sem tentativa — e exige que
 * o veredito seja SILENCIOSA. Se alguém "consertar" isso para SAUDAVEL ou
 * OCIOSA, o teste cai. Daqui a três meses é este teste que responde se voltou.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  orderDraft:           { findFirst: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  campaign:             { findFirst: vi.fn() },
  restaurantCRMProfile: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { CartRecoveryHealthService } from "../CartRecoveryHealthService";

const REST = "rest-1";
const DIA  = 86_400_000;

/**
 * As seis contagens saem na ordem em que o serviço as pede — e é a ORDEM que
 * este helper fixa, porque trocar duas delas de lugar (vencidos ↔ elegíveis)
 * inverteria o veredito sem quebrar tipo nenhum.
 */
function contagens(v: {
  enviadasTotal?: number;
  enviadasNaJanela?: number;
  elegiveisAgora?: number;
  vencidosSemTentativa?: number;
  vencidosNaJanela?: number;
}) {
  const fila = [
    v.enviadasTotal ?? 0,
    v.enviadasNaJanela ?? 0,
    v.elegiveisAgora ?? 0,
    v.vencidosSemTentativa ?? 0,
    v.vencidosNaJanela ?? 0,
  ];
  let i = 0;
  db.orderDraft.count.mockImplementation(async () => fila[i++] ?? 0);
}

function ultimoEnvio(quandoMs: number | null) {
  db.orderDraft.findFirst.mockResolvedValue(
    quandoMs === null ? null : { lastRecoveryAt: new Date(quandoMs) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ultimoEnvio(null);
  contagens({});
});

describe("o silêncio de antes — o estado real da produção em 05/08/2026", () => {
  it("ativa, nunca enviou, e 51 carrinhos venceram sem tentativa → SILENCIOSA", async () => {
    ultimoEnvio(null);
    contagens({ vencidosSemTentativa: 51, vencidosNaJanela: 4, elegiveisAgora: 0 });

    const h = await CartRecoveryHealthService.get(REST, true);

    expect(h.veredito, "'Ativa' sem um único envio não pode passar por saudável").toBe("SILENCIOSA");
    expect(CartRecoveryHealthService.precisaGritar(h)).toBe(true);
  });

  it("o alarme carrega a evidência: desde quando, quantos venceram e quantos esperam agora", async () => {
    ultimoEnvio(null);
    contagens({ vencidosSemTentativa: 51, vencidosNaJanela: 4, elegiveisAgora: 2 });

    const { evidencia } = await CartRecoveryHealthService.get(REST, true);

    // Guardrail 6: alerta que diz "algo falhou" sem o caso concreto é ruído.
    expect(evidencia).toContain("nunca enviou");
    expect(evidencia).toContain("4 carrinho(s) venceram");
    expect(evidencia).toContain("51 no total");
    expect(evidencia).toContain("2 na janela cobrável");
  });

  it("enviou uma vez há muito tempo e continuou vencendo carrinho → ainda SILENCIOSA", async () => {
    ultimoEnvio(Date.now() - 24 * DIA); // 12/07, o último envio real da produção
    contagens({ enviadasTotal: 4, vencidosSemTentativa: 51, vencidosNaJanela: 4 });

    const h = await CartRecoveryHealthService.get(REST, true);

    expect(h.veredito).toBe("SILENCIOSA");
    expect(h.diasEmSilencio).toBe(24);
    expect(h.evidencia).toContain("sem enviar há 24 dia(s)");
  });
});

describe("o que NÃO pode virar alarme", () => {
  it("calada porque não passou carrinho nenhum é OCIOSA, não defeito", async () => {
    // Guardrail 1: ausência de informação não é informação. Sem carrinho vencido
    // não há prova de oportunidade perdida — e acusar aqui é o caminho para o
    // alarme que ninguém abre.
    ultimoEnvio(null);
    contagens({ vencidosNaJanela: 0, vencidosSemTentativa: 0 });

    const h = await CartRecoveryHealthService.get(REST, true);

    expect(h.veredito).toBe("OCIOSA");
    expect(CartRecoveryHealthService.precisaGritar(h)).toBe(false);
    expect(h.evidencia).toContain("não é defeito");
  });

  it("desligada pelo lojista não é defeito — é escolha", async () => {
    contagens({ vencidosNaJanela: 90, vencidosSemTentativa: 90 });

    const h = await CartRecoveryHealthService.get(REST, false);

    expect(h.veredito).toBe("DESLIGADA");
    expect(CartRecoveryHealthService.precisaGritar(h)).toBe(false);
  });

  it("enviou nos últimos 7 dias → SAUDAVEL mesmo com carrinho vencendo", async () => {
    // Carrinho vence o tempo todo por motivo legítimo (o cliente já pediu, a loja
    // estava fechada). O que separa saudável de silenciosa é a máquina ter dado
    // sinal de vida recente.
    ultimoEnvio(Date.now() - 2 * DIA);
    contagens({ enviadasTotal: 30, enviadasNaJanela: 11, vencidosNaJanela: 6, elegiveisAgora: 1 });

    const h = await CartRecoveryHealthService.get(REST, true);

    expect(h.veredito).toBe("SAUDAVEL");
    expect(h.evidencia).toContain("11 mensagem(ns)");
  });
});

describe("a régua do alarme", () => {
  it("6 dias em silêncio ainda é saudável; 7 já acusa", async () => {
    ultimoEnvio(Date.now() - 6 * DIA);
    contagens({ vencidosNaJanela: 5 });
    expect((await CartRecoveryHealthService.get(REST, true)).veredito).toBe("SAUDAVEL");

    vi.clearAllMocks();
    ultimoEnvio(Date.now() - 7 * DIA);
    contagens({ vencidosNaJanela: 5 });
    expect((await CartRecoveryHealthService.get(REST, true)).veredito).toBe("SILENCIOSA");
  });

  it("a validade e a janela viajam no resultado — número sem régua é número errado", async () => {
    const h = await CartRecoveryHealthService.get(REST, true);
    expect(h.validadeHoras).toBe(6);
    expect(h.janelaDias).toBe(30);
  });
});

describe("o interruptor lido é o mesmo que o motor de envio obedece", () => {
  it("a linha de Campanha manda quando existe", async () => {
    db.campaign.findFirst.mockResolvedValue({ status: "PAUSED" });
    db.restaurantCRMProfile.findUnique.mockResolvedValue({ readyMadeConfig: { cartRecoveryEnabled: true } });

    expect(await CartRecoveryHealthService.estaAtiva(REST)).toBe(false);
  });

  it("sem linha de Campanha vale a bandeira antiga, que é ligada por omissão", async () => {
    db.campaign.findFirst.mockResolvedValue(null);
    db.restaurantCRMProfile.findUnique.mockResolvedValue(null);

    expect(await CartRecoveryHealthService.estaAtiva(REST)).toBe(true);
  });
});

describe("a varredura só olha quem teve o que cobrar", () => {
  it("agrupa por loja pelos carrinhos VENCIDOS sem tentativa, não por carrinho qualquer", async () => {
    db.orderDraft.groupBy.mockResolvedValue([{ restaurantId: REST, _count: { _all: 4 } }]);
    db.campaign.findFirst.mockResolvedValue(null);
    db.restaurantCRMProfile.findUnique.mockResolvedValue(null);
    ultimoEnvio(null);
    contagens({ vencidosSemTentativa: 51, vencidosNaJanela: 4 });

    const lista = await CartRecoveryHealthService.varredura();

    const w = db.orderDraft.groupBy.mock.calls[0][0].where as {
      status: string; recoveryAttempts: number; updatedAt: { lt: Date; gte: Date };
    };
    expect(w.status).toBe("OPEN");
    expect(w.recoveryAttempts, "quem já recebeu tentativa não é oportunidade perdida").toBe(0);
    expect(w.updatedAt.lt.getTime(), "só o que já venceu").toBeLessThan(Date.now());
    expect(lista[0]!.veredito).toBe("SILENCIOSA");
  });
});
