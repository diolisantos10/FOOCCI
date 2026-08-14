/**
 * O canal de vendas da Foocci — as travas, e a costura do provedor.
 *
 * NENHUMA MENSAGEM REAL SAI DAQUI: o `fetch` é substituído e conta as tentativas.
 * O que este arquivo prova é o contrário do envio — que ele NÃO acontece quando
 * não deve, e que quando não acontece o motivo vem escrito.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  enviarTextoDeVendas,
  isFoocciSalesChannelConfigured,
  isFoocciSalesPhoneNumberId,
  isFoocciSdrSendEnabled,
  canalDeVendasPronto,
  describeFoocciSalesChannel,
  resolverProvedorDeVendas,
} from "../FoocciSalesChannel";
import type { LeadSafetyDecision } from "../LeadContactSafety";

const APROVADO: LeadSafetyDecision = { sendable: true, reason: null, detail: "Liberado." };
const REPROVADO: LeadSafetyDecision = { sendable: false, reason: "LEAD_OPT_OUT", detail: "Pediu silêncio." };

let chamadasDeRede = 0;

function ligarCanal() {
  process.env.FOOCCI_SALES_PHONE_NUMBER_ID = "222222222222222";
  process.env.FOOCCI_SALES_ACCESS_TOKEN = "token-de-teste-nao-real";
}

beforeEach(() => {
  chamadasDeRede = 0;
  delete process.env.FOOCCI_SALES_PHONE_NUMBER_ID;
  delete process.env.FOOCCI_SALES_ACCESS_TOKEN;
  delete process.env.FOOCCI_SDR_SEND_ENABLED;
  delete process.env.FOOCCI_SALES_PROVIDER;
  vi.stubGlobal("fetch", vi.fn(async () => {
    chamadasDeRede++;
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FOOCCI_SALES_PHONE_NUMBER_ID;
  delete process.env.FOOCCI_SALES_ACCESS_TOKEN;
  delete process.env.FOOCCI_SDR_SEND_ENABLED;
  delete process.env.FOOCCI_SALES_PROVIDER;
});

describe("desligado por construção — o estado de HOJE", () => {
  it("sem credencial, o canal não existe: não reconhece o número e não envia", async () => {
    expect(isFoocciSalesChannelConfigured()).toBe(false);
    expect(isFoocciSalesPhoneNumberId("222222222222222")).toBe(false);

    const r = await enviarTextoDeVendas(APROVADO, "5511999990000", "oi");
    expect(r.ok).toBe(false);
    expect(chamadasDeRede).toBe(0);
  });

  it("meio configurado é desligado — só o número, sem token", () => {
    process.env.FOOCCI_SALES_PHONE_NUMBER_ID = "222222222222222";
    expect(isFoocciSalesChannelConfigured()).toBe(false);
  });

  it("CONFIGURADO ainda não é LIGADO — receber e enviar são chaves separadas", async () => {
    ligarCanal();
    expect(isFoocciSalesChannelConfigured()).toBe(true);   // recebe
    expect(isFoocciSdrSendEnabled()).toBe(false);          // mas não fala
    expect(canalDeVendasPronto()).toBe(false);

    const r = await enviarTextoDeVendas(APROVADO, "5511999990000", "oi");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("FOOCCI_SDR_SEND_ENABLED");
    expect(chamadasDeRede).toBe(0);
  });
});

describe("o portão é o primeiro parâmetro — não dá para enviar sem avaliar", () => {
  it("decisão reprovada não vira envio, mesmo com tudo ligado", async () => {
    ligarCanal();
    process.env.FOOCCI_SDR_SEND_ENABLED = "true";

    const r = await enviarTextoDeVendas(REPROVADO, "5511999990000", "oi");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("LEAD_OPT_OUT");
    expect(chamadasDeRede).toBe(0);
  });

  it("a outra metade: com decisão aprovada e envio ligado, a mensagem sai", async () => {
    ligarCanal();
    process.env.FOOCCI_SDR_SEND_ENABLED = "true";

    const r = await enviarTextoDeVendas(APROVADO, "5511999990000", "oi");
    expect(r.ok).toBe(true);
    expect(chamadasDeRede).toBe(1);
  });

  it("telefone inválido não vira chamada de rede", async () => {
    ligarCanal();
    process.env.FOOCCI_SDR_SEND_ENABLED = "true";
    const r = await enviarTextoDeVendas(APROVADO, "123", "oi");
    expect(r.error).toBe("telefone inválido");
    expect(chamadasDeRede).toBe(0);
  });
});

describe("a costura do provedor — trocar é configuração, e o desconhecido FALHA", () => {
  it("o padrão é a Meta homologada", () => {
    expect(resolverProvedorDeVendas()).toBe("META_CLOUD_API");
  });

  it("provedor não implementado NÃO cai na Meta em silêncio — recusa declarada", async () => {
    ligarCanal();
    process.env.FOOCCI_SDR_SEND_ENABLED = "true";
    process.env.FOOCCI_SALES_PROVIDER = "ALGUM_OUTRO";

    expect(resolverProvedorDeVendas()).toBe("NAO_SUPORTADO");
    expect(isFoocciSalesChannelConfigured()).toBe(false);

    const r = await enviarTextoDeVendas(APROVADO, "5511999990000", "oi");
    expect(r.ok).toBe(false);
    expect(chamadasDeRede).toBe(0);
  });
});

describe("diagnóstico — presença, nunca segredo", () => {
  it("não devolve o token, e o phone_number_id sai mascarado", () => {
    ligarCanal();
    const d = describeFoocciSalesChannel();
    expect(d.accessTokenSet).toBe(true);
    expect(d.phoneNumberIdMasked).toBe("…2222");
    // O segredo não aparece em campo nenhum, com nome nenhum.
    expect(JSON.stringify(d)).not.toContain("token-de-teste-nao-real");
  });
});
