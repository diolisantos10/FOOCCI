/**
 * A coexistência NÃO pode cair na configuração comum.
 *
 * O RISCO CONCRETO, que é o motivo deste arquivo existir:
 * o botão "Conectar número que está no celular" promete que o número CONTINUA no
 * aparelho. Ele só cumpre isso quando a configuração de Cadastro Incorporado foi criada
 * com a feature "WhatsApp Business App Onboarding" (`docs/whatsapp-coexistence-setup.md`
 * §3.1). Com a configuração PADRÃO, o que abre é o cadastro normal — e o cadastro normal
 * oferece MIGRAR o número para a Cloud API, que é a operação que TIRA o número do
 * celular do restaurante.
 *
 * O `coexistence: true` protege só o NOSSO `/register`; ele não desfaz uma migração
 * feita dentro do fluxo da própria Meta. Logo o fallback tinha de morrer, e morrer
 * travado por teste — guardrail 4: prompt é aviso, código é trava.
 *
 * Cada caso tem as duas metades: o comportamento novo e a reprodução do antigo.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { metaCoexistenceConfigId } from "./metaFlag";

const CHAVES = ["META_COEXISTENCE_CONFIG_ID", "META_CONFIG_ID"];
const original: Record<string, string | undefined> = {};

describe("metaCoexistenceConfigId — fail-closed", () => {
  beforeEach(() => { for (const k of CHAVES) { original[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => {
    for (const k of CHAVES) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it("A METADE QUE REPRODUZ O ERRO ANTIGO: com só o config comum, NÃO devolve nada", () => {
    process.env.META_CONFIG_ID = "1571394541276497";
    // Antes isto devolvia o config comum — e o botão abria o cadastro padrão, que
    // migraria o número e o tiraria do celular do atendente.
    expect(metaCoexistenceConfigId()).toBeUndefined();
  });

  it("com a configuração dedicada, devolve ela", () => {
    process.env.META_COEXISTENCE_CONFIG_ID = "config-de-coexistencia";
    process.env.META_CONFIG_ID = "config-comum";
    expect(metaCoexistenceConfigId()).toBe("config-de-coexistencia");
  });

  it("sem nada configurado, devolve undefined — quem chama tem de recusar", () => {
    expect(metaCoexistenceConfigId()).toBeUndefined();
  });

  it("string vazia não conta como configurado", () => {
    process.env.META_COEXISTENCE_CONFIG_ID = "";
    process.env.META_CONFIG_ID = "config-comum";
    expect(metaCoexistenceConfigId()).toBeUndefined();
  });
});
