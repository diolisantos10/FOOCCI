/**
 * O teto de contatos — a leitura que as telas mostram.
 *
 * Existe por causa do Sushi Cazza: 3.727 pessoas barradas por dias enquanto a
 * tela de Campanhas exibia o limite DIÁRIO de mensagens e calava este aqui.
 * A conta do estado passou a morar num lugar só; estes testes seguram a régua.
 */
import { describe, it, expect } from "vitest";
import { describeContactBudget, parseContactBudgetTotal } from "./crm-contact-budget";

describe("describeContactBudget", () => {
  it("fica DESLIGADO com total 0 — sem teto, sem poluir a tela", () => {
    const v = describeContactBudget({ used: 500, total: 0 });
    expect(v.on).toBe(false);
    expect(v.status).toBe("OFF");
    expect(v.remaining).toBeNull();
  });

  it("com folga, mostra restantes de total", () => {
    const v = describeContactBudget({ used: 200, total: 1000 });
    expect(v.status).toBe("OK");
    expect(v.remaining).toBe(800);
    expect(v.pct).toBe(20);
    expect(v.low).toBe(false);
  });

  it("avisa saldo curto a partir de 10% restante", () => {
    expect(describeContactBudget({ used: 900, total: 1000 }).status).toBe("LOW");
    expect(describeContactBudget({ used: 899, total: 1000 }).status).toBe("OK");
  });

  it("ESGOTADO quando não resta ninguém — inclusive com uso acima do teto", () => {
    const v = describeContactBudget({ used: 3727, total: 3000 });
    expect(v.status).toBe("EXHAUSTED");
    expect(v.exhausted).toBe(true);
    expect(v.remaining).toBe(0);
    expect(v.pct).toBe(100);
    expect(v.low).toBe(false); // esgotado não é "pouco": é parado
  });

  it("aceita dado ausente sem quebrar a tela", () => {
    expect(describeContactBudget({}).status).toBe("OFF");
    expect(describeContactBudget({ used: null, total: null }).on).toBe(false);
  });
});

describe("parseContactBudgetTotal segue valendo", () => {
  it("aceita 0 e recusa negativo", () => {
    expect(parseContactBudgetTotal(0)).toEqual({ ok: true, value: 0 });
    expect(parseContactBudgetTotal(-1).ok).toBe(false);
  });
});
