/**
 * O WEBHOOK grava o rastro da mensagem sem dono — no nível da rota.
 *
 * Por que este arquivo existe além do teste do serviço: um serviço perfeito que
 * ninguém chama não protege nada. O defeito original era exatamente uma linha do
 * webhook (`console.warn` + `continue`), então a trava tem de ser verificada ONDE
 * ela mora. Sem isto, apagar a chamada no webhook não reprovaria teste nenhum.
 *
 * As duas metades: mensagem SEM dono vira rastro; mensagem COM dono segue o fluxo
 * normal e NÃO polui a tabela de diagnóstico.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const APP_SECRET = "segredo-de-teste";

const record = vi.hoisted(() => vi.fn(async () => true));
const getByPhoneNumberId = vi.hoisted(() => vi.fn());

vi.mock("@/services/whatsapp/MetaUnroutedInboundService", () => ({
  MetaUnroutedInboundService: { record },
}));
vi.mock("@/services/whatsapp/MetaConfigService", () => ({
  MetaConfigService: { getByPhoneNumberId },
}));
vi.mock("@/services/meta/MetaAppCredentialsService", () => ({
  MetaAppCredentialsService: { getResolved: async () => ({ appSecret: APP_SECRET, webhookVerifyToken: "v" }) },
}));

// Colaboradores pesados: neutros. O que está sob teste é o desvio da porta sem dono.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message:      { updateMany: vi.fn(), findUnique: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    conversation: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: "c1", customerId: "cli1" })), update: vi.fn() },
    customer:     { upsert: vi.fn(async () => ({ id: "cli1", name: "Cliente", phone: "5511987654321" })), findFirst: vi.fn() },
  },
}));
vi.mock("@/services/whatsapp/brain/WhatsAppBrainRuntimeService", () => ({
  WhatsAppBrainRuntimeService: { respond: vi.fn() },
  isWhatsAppBrainEnabled: () => false,
}));
vi.mock("@/services/support/SupportWhatsAppService", () => ({
  isSupportPhoneNumberId: () => false, handleInboundSupport: vi.fn(),
}));
vi.mock("@/services/buildos/BuildOsMetaChannel", () => ({ isBuildOsPhoneNumberId: () => false }));
vi.mock("@/services/whatsapp/inbound/InboundGuardsService", () => ({
  InboundGuardsService: { apply: vi.fn(async () => ({ aiMayRespond: false, reason: "teste" })) },
}));
vi.mock("@/services/whatsapp/inbound/InboundAgentDispatch", () => ({
  dispatchInboundAgent: vi.fn(async () => ({ handler: "nenhum", reason: "teste" })),
  interceptBuildOsCommand: vi.fn(async () => ({ intercepted: false })),
}));

import { POST } from "./route";

/** Um payload de mensagem de texto, no formato real da Meta. */
function payloadMensagem(phoneNumberId: string, displayPhoneNumber: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: phoneNumberId, display_phone_number: displayPhoneNumber },
          contacts: [{ wa_id: "5511987654321", profile: { name: "Cliente" } }],
          messages: [{ from: "5511987654321", id: "wamid.ABC", timestamp: "1755000000", type: "text", text: { body: "oi, tem mesa?" } }],
        },
      }],
    }],
  };
}

function postAssinado(body: unknown): NextRequest {
  const raw = JSON.stringify(body);
  const assinatura = createHmac("sha256", APP_SECRET).update(raw, "utf8").digest("hex");
  return new NextRequest("https://foocci.com.br/api/webhooks/meta/whatsapp", {
    method: "POST",
    body: raw,
    headers: { "x-hub-signature-256": `sha256=${assinatura}`, "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  record.mockResolvedValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("POST — porta sem dono", () => {
  it("GRAVA o rastro quando o phone_number_id não pertence a nenhum restaurante", async () => {
    getByPhoneNumberId.mockResolvedValue(null);

    const res = await POST(postAssinado(payloadMensagem("id_orfao", "+55 11 91896-4947")));

    // 200 sempre: a Meta desativa a inscrição de quem não responde.
    expect(res.status).toBe(200);
    expect(record).toHaveBeenCalledTimes(1);
    const evento = record.mock.calls[0][0];
    expect(evento.phoneNumberId).toBe("id_orfao");
    expect(evento.displayPhoneNumber).toBe("+55 11 91896-4947");
    expect(evento.fromPhone).toBe("5511987654321");
  });

  it("NÃO grava rastro quando a mensagem TEM dono — a tabela é de diagnóstico, não de tráfego", async () => {
    getByPhoneNumberId.mockResolvedValue({
      restaurantId: "r1", wabaId: "w", phoneNumberId: "id_conhecido", accessToken: "t",
      displayPhoneNumber: null, businessId: null, webhookVerifyToken: "v",
      connectionStatus: "CONNECTED", coexistence: false,
    });

    const res = await POST(postAssinado(payloadMensagem("id_conhecido", "+55 11 91896-4947")));

    expect(res.status).toBe(200);
    expect(record).not.toHaveBeenCalled();
  });

  it("gravar rastro NÃO impede a resposta 200, mesmo se o serviço reprovar", async () => {
    getByPhoneNumberId.mockResolvedValue(null);
    record.mockResolvedValue(false); // teto atingido, por exemplo

    const res = await POST(postAssinado(payloadMensagem("id_orfao", "+55 11 0000-0000")));

    expect(res.status).toBe(200);
  });

  it("assinatura inválida é rejeitada ANTES de qualquer gravação", async () => {
    getByPhoneNumberId.mockResolvedValue(null);
    const req = new NextRequest("https://foocci.com.br/api/webhooks/meta/whatsapp", {
      method: "POST",
      body: JSON.stringify(payloadMensagem("id_orfao", "+55 11 0000-0000")),
      headers: { "x-hub-signature-256": "sha256=falsificada", "content-type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });
});
