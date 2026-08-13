/**
 * O canal de socorro do login — as duas metades.
 *
 * Metade 1: com número/e-mail configurado, a tela mostra link CLICÁVEL de verdade.
 * Metade 2: sem nada configurado, `hasChannel` é falso e a tela cai no plano B
 * honesto — nunca um "fale com o suporte" que não diz com quem.
 *
 * SABOTAGEM CONFERIDA (13/08): fazer `hasChannel` devolver `true` fixo faz o caso
 * "nada configurado" reprovar; aceitar e-mail sem validar faz o caso do `?bcc=`
 * reprovar.
 */

import { describe, it, expect } from "vitest";
import {
  buildSupportContact,
  normalizeWhatsapp,
  normalizeEmail,
  formatWhatsapp,
} from "./support-contact";

describe("canal configurado", () => {
  it("monta o wa.me com a mensagem já escrita e o número legível", () => {
    const c = buildSupportContact({ whatsapp: "+55 (11) 99999-8888" });
    expect(c.whatsappUrl).toBe(
      "https://wa.me/5511999998888?text=" +
        encodeURIComponent("Olá! Não estou conseguindo entrar no painel do Foocci."),
    );
    expect(c.whatsappLabel).toBe("+55 (11) 99999-8888");
    expect(c.hasChannel).toBe(true);
  });

  it("monta o mailto com assunto", () => {
    const c = buildSupportContact({ email: "suporte@foocci.com.br" });
    expect(c.emailUrl).toContain("mailto:suporte@foocci.com.br?subject=");
    expect(c.hasChannel).toBe(true);
  });

  it("um canal só já acende a porta", () => {
    expect(buildSupportContact({ whatsapp: "5511999998888" }).hasChannel).toBe(true);
    expect(buildSupportContact({ email: "ajuda@foocci.com.br" }).hasChannel).toBe(true);
  });
});

describe("canal ausente ou inválido — recusa, nunca link quebrado", () => {
  it("sem nada configurado, hasChannel é falso e não sobra link nenhum", () => {
    const c = buildSupportContact({});
    expect(c.hasChannel).toBe(false);
    expect(c.whatsappUrl).toBeNull();
    expect(c.emailUrl).toBeNull();
    expect(c.email).toBeNull();
  });

  it("string vazia, espaço ou número curto demais não viram canal", () => {
    for (const v of ["", "   ", "119999", "abc"]) {
      expect(normalizeWhatsapp(v), `whatsapp ${JSON.stringify(v)}`).toBeNull();
    }
    expect(buildSupportContact({ whatsapp: "119", email: "  " }).hasChannel).toBe(false);
  });

  it("e-mail malformado é recusado — inclusive o que tentaria embutir cópia oculta", () => {
    for (const v of [
      "sem-arroba",
      "a@b",
      "a@b.c d",
      "suporte@foocci.com.br?bcc=alguem@fora.com",
      "suporte@foocci.com.br, outro@fora.com",
      "a@b.com\nBcc: x@y.com",
    ]) {
      expect(normalizeEmail(v), `email ${JSON.stringify(v)}`).toBeNull();
    }
    expect(normalizeEmail("suporte@foocci.com.br")).toBe("suporte@foocci.com.br");
  });

  it("número fora do padrão brasileiro sai com + e sem máscara inventada", () => {
    expect(formatWhatsapp("351912345678")).toBe("+351912345678");
    expect(formatWhatsapp(null)).toBeNull();
  });
});
