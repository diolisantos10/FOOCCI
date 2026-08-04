/**
 * crmWhatsAppChannel — a trava do portão de canal do CRM.
 *
 * Aqui mora a regra que substituiu a pergunta "existe config da Evolution?": com
 * canal único, o CRM pergunta se o WhatsApp oficial está CONECTADO, e a resposta
 * desconhecida vale por "não". Sem esta trava, um erro de leitura do canal viraria
 * permissão de disparo em massa.
 *
 * NENHUMA mensagem é enviada neste arquivo — só o estado da conexão é consultado.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const channel = vi.hoisted(() => ({ getConnectionStatus: vi.fn() }));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => ({ WhatsAppMessagingService: channel }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  isWhatsAppChannelConnected,
  NO_WHATSAPP_CONFIG,
  NO_WHATSAPP_CONFIG_DETAIL,
} from "../crmWhatsAppChannel";

describe("isWhatsAppChannelConnected", () => {
  beforeEach(() => channel.getConnectionStatus.mockClear());

  it("conectado ⇒ true", async () => {
    channel.getConnectionStatus.mockResolvedValue({ provider: "META_CLOUD_API", connected: true, detail: "+55 11 90000-0000" });
    expect(await isWhatsAppChannelConnected("r1")).toBe(true);
  });

  it("desconectado ⇒ false", async () => {
    channel.getConnectionStatus.mockResolvedValue({ provider: "META_CLOUD_API", connected: false, detail: null });
    expect(await isWhatsAppChannelConnected("r1")).toBe(false);
  });

  it("consulta falhou ⇒ FALSE (ausência de informação não é permissão de envio)", async () => {
    // Erro síncrono de propósito: exercita o mesmo `catch` sem deixar uma promessa
    // rejeitada solta no runner (que o vitest contabilizaria como erro do arquivo).
    channel.getConnectionStatus.mockImplementation(() => { throw new Error("graph fora do ar"); });
    const v = await isWhatsAppChannelConnected("r1");
    console.log("REACHED", v);
    expect(v).toBe(false);
  });

  it("o motivo de bloqueio é um código de máquina estável + texto de lojista", () => {
    expect(NO_WHATSAPP_CONFIG).toBe("NO_WHATSAPP_CONFIG");
    expect(NO_WHATSAPP_CONFIG_DETAIL).toMatch(/Meta/);
  });
});
