/**
 * "PERMANENTE" NÃO QUER DIZER "PERDIDO" — e o log dizia que sim.
 *
 * ── O ACHADO (05/09/2026, medido em produção) ───────────────────────────────
 *
 * Duas campanhas repetindo a cada 20 minutos:
 *
 *     [CampaignRunner] falhas permanentes fora da fila — não adianta tentar de
 *     novo { campaignId: '…', clientes: 2 }
 *
 * Cinco clientes ao todo, e **nenhuma pista do motivo**. Quem lesse concluiria
 * que estavam perdidos.
 *
 * Só que `saiDaFilaParaSempre` tira da fila AUTOMÁTICA tudo que não é
 * `RETRYABLE_LATER` — e isso inclui `RETRYABLE_AFTER_FIX`, cujo rótulo no
 * produto é literalmente **"Precisa corrigir"**: número recusado pela Meta,
 * erro de autenticação, mensagem vazia. Coisas que voltam a funcionar depois de
 * uma correção de um minuto.
 *
 * O log mandava o dono desistir de receita recuperável. Log que faz desistir é
 * pior que log nenhum: o silêncio deixa a dúvida viva, a frase errada mata.
 */

import { describe, it, expect } from "vitest";
import { classifyExecution, saiDaFilaParaSempre } from "../crmExecutionClassification";

describe("o que sai da fila automática não é tudo perdido", () => {
  it("⭐ mensagem vazia sai da fila MAS é recuperável com correção", () => {
    const t = { status: "FAILED", failedReason: "EMPTY_MESSAGE", errorMessage: null } as never;

    expect(saiDaFilaParaSempre(t), "deixou de sair da fila automática").toBe(true);

    const cls = classifyExecution(t);
    expect(cls.retryability, "virou perda definitiva").toBe("RETRYABLE_AFTER_FIX");
    expect(cls.badge).toBe("Mensagem vazia");
  });

  it("⭐ número recusado pela Meta também é recuperável", () => {
    const t = { status: "FAILED", failedReason: "EVOLUTION_BAD_REQUEST", errorMessage: null } as never;

    expect(saiDaFilaParaSempre(t)).toBe(true);
    expect(classifyExecution(t).retryability).toBe("RETRYABLE_AFTER_FIX");
  });

  it("⛔ opt-out sai da fila E é definitivo — a diferença que o log apagava", () => {
    // Aqui "não adianta tentar de novo" é VERDADE, e continua sendo. O defeito
    // era tratar os dois casos com a mesma frase.
    const t = { status: "BLOCKED", failedReason: "BLOCKED_OPT_OUT", errorMessage: null } as never;

    expect(saiDaFilaParaSempre(t)).toBe(true);
    expect(classifyExecution(t).retryability).toBe("NEVER_RETRY");
  });

  it("falha de provedor NÃO sai da fila — ela volta sozinha", () => {
    // A metade que impede o teste de passar por acidente: nem tudo que falha
    // sai da fila.
    const t = { status: "FAILED", failedReason: "FAILED_PROVIDER", errorMessage: null } as never;

    expect(saiDaFilaParaSempre(t)).toBe(false);
    expect(classifyExecution(t).retryability).toBe("RETRYABLE_LATER");
  });

  it("⭐ o rótulo de 'precisa corrigir' existe e é o que o dono lê", () => {
    // Se alguém renomear isto, o log volta a falar uma língua e a tela outra.
    const cls = classifyExecution(
      { status: "FAILED", failedReason: "WHATSAPP_AUTH_ERROR", errorMessage: null } as never,
    );
    expect(cls.retryability).toBe("RETRYABLE_AFTER_FIX");
  });
});
