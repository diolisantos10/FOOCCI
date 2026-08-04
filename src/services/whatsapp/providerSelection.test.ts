/**
 * Canal ÚNICO de envio — o que este arquivo trava.
 *
 * Este teste nasceu como `selectProvider` / `shouldAttemptFallback` (Evolution ×
 * Meta, com fallback opcional). Em 04/08/2026 a Evolution saiu do Foocci e o
 * teste foi INVERTIDO: em vez de provar que a escolha estava certa, ele agora
 * prova que **não existe escolha nem caminho alternativo**.
 *
 * É o guardrail 4 aplicado: a regra "toda mensagem sai pelo app homologado" não
 * pode viver só no comentário — um caminho de envio não homologado é o risco de
 * banimento que a homologação eliminou.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SendResult } from "./providers/types";

const sendText     = vi.fn(async (): Promise<SendResult> => ({ ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid.1" }));
const sendTemplate = vi.fn(async (): Promise<SendResult> => ({ ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid.2" }));
const getConnectionStatus = vi.fn(async () => ({ provider: "META_CLOUD_API" as const, connected: true, detail: "+55 11 90000-0000" }));

vi.mock("./providers/MetaWhatsAppCloudProvider", () => ({
  MetaWhatsAppCloudProvider: class {
    readonly id = "META_CLOUD_API" as const;
    sendText = sendText;
    sendTemplate = sendTemplate;
    getConnectionStatus = getConnectionStatus;
  },
}));

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { findFirst: (...a: unknown[]) => findFirst(...a) },
  },
}));

import * as MessagingModule from "./WhatsAppMessagingService";
import { WhatsAppMessagingService } from "./WhatsAppMessagingService";

const INSIDE_WINDOW  = () => new Date(Date.now() - 60 * 60 * 1000);        // 1h atrás
const OUTSIDE_WINDOW = () => new Date(Date.now() - 48 * 60 * 60 * 1000);   // 48h atrás

beforeEach(() => {
  sendText.mockClear();
  sendTemplate.mockClear();
  getConnectionStatus.mockClear();
  findFirst.mockReset();
});

describe("não existe segundo provedor", () => {
  it("o módulo não exporta mais seleção nem fallback de provedor", () => {
    const surface = MessagingModule as unknown as Record<string, unknown>;
    expect(surface.selectProvider).toBeUndefined();
    expect(surface.resolveProviderId).toBeUndefined();
    expect(surface.shouldAttemptFallback).toBeUndefined();
  });

  it("o serviço não expõe mais um mapa de provedores", () => {
    expect((WhatsAppMessagingService as unknown as Record<string, unknown>).providers).toBeUndefined();
  });
});

describe("sendText — um envio, um caminho", () => {
  it("dentro da janela de 24h, envia pela Meta exatamente uma vez", async () => {
    findFirst.mockResolvedValue({ sentAt: INSIDE_WINDOW() });
    const r = await WhatsAppMessagingService.sendText({ restaurantId: "r1", to: "5511990000000", text: "oi" });
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("META_CLOUD_API");
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it("falha de envio da Meta é REPORTADA, não desviada para outro canal", async () => {
    findFirst.mockResolvedValue({ sentAt: INSIDE_WINDOW() });
    sendText.mockResolvedValueOnce({ ok: false, provider: "META_CLOUD_API", status: "FAILED", providerMessageId: null, error: "HTTP 500", retryable: true });
    const r = await WhatsAppMessagingService.sendText({ restaurantId: "r1", to: "5511990000000", text: "oi" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("FAILED");
    expect(r.provider).toBe("META_CLOUD_API");
    // uma única tentativa: nenhuma retentativa por outro provedor
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("falha de BANCO não abre caminho alternativo: falha declarada, sem envio", async () => {
    findFirst.mockRejectedValue(new Error("db down"));
    const r = await WhatsAppMessagingService.sendText({ restaurantId: "r1", to: "5511990000000", text: "oi" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("WINDOW_LOOKUP_FAILED");
    expect(r.retryable).toBe(true);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("fora da janela de 24h, BLOQUEIA com META_TEMPLATE_REQUIRED e não envia nada", async () => {
    findFirst.mockResolvedValue({ sentAt: OUTSIDE_WINDOW() });
    const r = await WhatsAppMessagingService.sendText({ restaurantId: "r1", to: "5511990000000", text: "oi" });
    expect(r.status).toBe("BLOCKED");
    expect(r.blockReason).toBe("META_TEMPLATE_REQUIRED");
    expect(sendText).not.toHaveBeenCalled();
  });

  it("telefone inválido bloqueia antes de qualquer envio", async () => {
    findFirst.mockResolvedValue({ sentAt: INSIDE_WINDOW() });
    const r = await WhatsAppMessagingService.sendText({ restaurantId: "r1", to: "123", text: "oi" });
    expect(r.status).toBe("BLOCKED");
    expect(r.blockReason).toBe("INVALID_PHONE");
    expect(sendText).not.toHaveBeenCalled();
  });
});

describe("sendTemplate — o caminho oficial fora da janela", () => {
  it("envia o modelo mesmo sem inbound recente (é para isso que ele existe)", async () => {
    findFirst.mockResolvedValue(null);
    const r = await WhatsAppMessagingService.sendTemplate({
      restaurantId: "r1", to: "5511990000000", templateName: "reativar_frios", language: "pt_BR", bodyParams: ["João"],
    });
    expect(r.ok).toBe(true);
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("não existe mais o ramo 'provedor sem template' que renderizava texto livre", async () => {
    findFirst.mockResolvedValue(null);
    await WhatsAppMessagingService.sendTemplate({
      restaurantId: "r1", to: "5511990000000", templateName: "reativar_frios", language: "pt_BR", bodyParams: ["João", "10%"],
    });
    // o antigo fallback juntava os params num texto solto; hoje isso não pode existir
    expect(sendText).not.toHaveBeenCalled();
    expect(sendTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateName: "reativar_frios" }));
  });
});

describe("getConnectionStatus", () => {
  it("responde pela Meta e ignora o parâmetro legado de provedor", async () => {
    const a = await WhatsAppMessagingService.getConnectionStatus("r1");
    const b = await WhatsAppMessagingService.getConnectionStatus("r1", "META_CLOUD_API");
    expect(a.provider).toBe("META_CLOUD_API");
    expect(b.provider).toBe("META_CLOUD_API");
    expect(getConnectionStatus).toHaveBeenCalledTimes(2);
  });
});
