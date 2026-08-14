/**
 * A trava que separa "mantém o número no celular" de "arranca o número do celular".
 *
 * O CONTEXTO, que é o que torna estes testes necessários: a MESMA configuração da Meta
 * (`1571394541276497`) serve os dois fluxos. Com `featureType=whatsapp_business_app_onboarding`
 * ela abre a coexistência; sem ele, abre o cadastro padrão, que oferece MIGRAR o número
 * — e migrar tira o WhatsApp do aparelho onde o restaurante atende cliente.
 *
 * Quando `META_COEXISTENCE_CONFIG_ID == META_CONFIG_ID`, a proteção antiga (recusar
 * quando falta config id dedicada) não cobre mais nada: o id existe. A única coisa que
 * resta separando as duas operações é uma string dentro de `extras` — então ela vira
 * trava de código, não comentário.
 */

import { describe, it, expect } from "vitest";
import { buildEmbeddedSignupParams, COEXISTENCE_FEATURE_TYPE } from "./embeddedSignup";

const CONFIG = "1571394541276497";

describe("buildEmbeddedSignupParams", () => {
  it("coexistência leva o featureType, mesmo usando a configuração comum", () => {
    const p = buildEmbeddedSignupParams({ configId: CONFIG, flow: "coexistencia" });
    expect(p.config_id).toBe(CONFIG);
    expect(p.extras.featureType).toBe(COEXISTENCE_FEATURE_TYPE);
  });

  it("A METADE QUE REPRODUZ O RISCO: featureType errado no fluxo de coexistência é ERRO, não descuido", () => {
    // Sem a trava, isto abriria o cadastro padrão com o rótulo de coexistência —
    // e o número sairia do celular do restaurante, sem aviso e sem volta.
    expect(() =>
      buildEmbeddedSignupParams({ configId: CONFIG, flow: "coexistencia", featureType: "" }),
    ).toThrow(/tira o número do celular/);

    expect(() =>
      buildEmbeddedSignupParams({ configId: CONFIG, flow: "coexistencia", featureType: "app_only_install" }),
    ).toThrow(/featureType=whatsapp_business_app_onboarding/);
  });

  it("o fluxo padrão NÃO leva featureType — ele é o cadastro normal, e isso é intencional", () => {
    const p = buildEmbeddedSignupParams({ configId: CONFIG, flow: "padrao" });
    expect(p.extras.featureType).toBeUndefined();
  });

  it("os dois fluxos podem compartilhar o MESMO config id sem se confundirem", () => {
    const padrao = buildEmbeddedSignupParams({ configId: CONFIG, flow: "padrao" });
    const coex   = buildEmbeddedSignupParams({ configId: CONFIG, flow: "coexistencia" });
    expect(padrao.config_id).toBe(coex.config_id);
    expect(padrao.extras.featureType).toBeUndefined();
    expect(coex.extras.featureType).toBe(COEXISTENCE_FEATURE_TYPE);
  });

  it("sem config id não abre nada", () => {
    expect(() => buildEmbeddedSignupParams({ configId: "", flow: "padrao" })).toThrow(/config_id/);
  });

  it("o contrato do FB.login é preservado nos dois casos", () => {
    for (const flow of ["padrao", "coexistencia"] as const) {
      const p = buildEmbeddedSignupParams({ configId: CONFIG, flow });
      expect(p.response_type).toBe("code");
      expect(p.override_default_response_type).toBe(true);
      expect(p.extras.setup).toEqual({});
    }
  });
});
