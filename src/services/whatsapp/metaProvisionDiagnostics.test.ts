/**
 * metaProvisionDiagnostics — a tradução do que a Meta responde ao provisionar número.
 *
 * O caso que dá nome a este arquivo: `136024` chega com a mensagem *"aguarde 1 hora"*
 * e com `is_transient: false` no mesmo corpo. **A mensagem mente e o campo diz a
 * verdade.** Repetir de hora em hora já consumiu uma sessão inteira desta casa.
 *
 * A metade que reproduz o erro antigo está no primeiro teste: se alguém ler só a
 * mensagem, conclui "temporário" e repete. O portão aqui devolve `retryable: false`.
 */

import { describe, it, expect } from "vitest";
import { diagnoseProvisionError } from "./metaProvisionDiagnostics";

const erro136024 = {
  error: {
    message: "Our servers are temporarily unavailable. Please wait 1 hour and try again.",
    code: 136024,
    error_subcode: 2388091,
    is_transient: false,
  },
};

describe("diagnoseProvisionError", () => {
  it("136024: a mensagem diz temporário, o campo diz permanente — vale o campo", () => {
    const d = diagnoseProvisionError(erro136024);
    expect(d.code).toBe(136024);
    expect(d.subcode).toBe(2388091);
    expect(d.isTransient).toBe(false);
    expect(d.retryable).toBe(false);              // ← a metade que impede a repetição inútil
    expect(d.explicacao).toContain("PERMANENTE");
    expect(d.explicacao).toContain("conta de WhatsApp ativa");
    expect(d.explicacao).toContain("VOICE");      // a tentativa barata que nunca foi feita
  });

  it("não inventa causa quando não sabe — só repassa o que a Meta afirmou", () => {
    const d = diagnoseProvisionError({ error: { code: 999999, message: "algo novo" } });
    expect(d.code).toBe(999999);
    expect(d.isTransient).toBeNull();
    expect(d.retryable).toBeNull();               // guardrail 1: silêncio não vira veredito
    expect(d.explicacao).toBeNull();
  });

  it("erro genérico marcado como não transitório já é motivo para não repetir", () => {
    const d = diagnoseProvisionError({ error: { code: 100, is_transient: false } });
    expect(d.retryable).toBe(false);
    expect(d.explicacao).toContain("NÃO transitório");
  });

  it("erro marcado como transitório continua sendo repetível", () => {
    const d = diagnoseProvisionError({ error: { code: 2, is_transient: true } });
    expect(d.retryable).toBe(true);
  });

  it("número já registrado em outra conta: trocar de chip, não insistir", () => {
    const d = diagnoseProvisionError({ error: { code: 133005 } });
    expect(d.retryable).toBe(false);
    expect(d.explicacao).toContain("outra conta");
  });

  it("PIN errado avisa que insistir PIORA (bloqueio por tentativas)", () => {
    const d = diagnoseProvisionError({ error: { code: 133008 } });
    expect(d.retryable).toBe(false);
    expect(d.explicacao).toContain("bloqueio");
  });

  it("190 é credencial morta — não é problema de provisionamento", () => {
    const d = diagnoseProvisionError({ error: { code: 190 } });
    expect(d.explicacao).toContain("morta");
  });

  it("corpo sem erro, nulo ou de outro formato não produz diagnóstico algum", () => {
    for (const entrada of [null, undefined, {}, { success: true }, "texto", 42]) {
      const d = diagnoseProvisionError(entrada);
      expect(d.explicacao).toBeNull();
      expect(d.code).toBeNull();
    }
  });
});
