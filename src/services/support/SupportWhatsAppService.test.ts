import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const reasonSupportIncident = vi.hoisted(() => vi.fn());
vi.mock("@/services/support/SupportIncidentReasoner", () => ({ reasonSupportIncident }));
// Helpers da Meta: comportamento simples e determinístico para o teste.
vi.mock("@/services/whatsapp/metaFlag", () => ({ metaGraphUrl: (p: string) => `https://graph.test/${p}` }));
vi.mock("@/services/whatsapp/providers/metaPayload", () => ({
  toMetaRecipient: (p: string | null) => (p && p.length >= 8 ? p.replace(/\D/g, "") : null),
  buildMetaTextPayload: (to: string, body: string) => ({ to, body }),
  maskGraphResponse: (r: unknown) => String(r),
}));

import {
  isSupportWhatsAppEnabled, isSupportPhoneNumberId, resolveRestaurantForSender,
  formatSupportReply, handleInboundSupport,
} from "./SupportWhatsAppService";

const ENV = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPPORT_META_PHONE_NUMBER_ID = "SUP123";
  process.env.SUPPORT_META_ACCESS_TOKEN = "tok";
  process.env.SUPPORT_PILOT_RESTAURANT_ID = "r-pilot";
  delete process.env.SUPPORT_PHONE_RESTAURANT_MAP;
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { process.env = { ...ENV }; vi.unstubAllGlobals(); });

describe("SupportWhatsAppService — canal dedicado do agente de TI", () => {
  it("gating: só liga com número + token; roteia só o phone_number_id do suporte", () => {
    expect(isSupportWhatsAppEnabled()).toBe(true);
    expect(isSupportPhoneNumberId("SUP123")).toBe(true);
    expect(isSupportPhoneNumberId("OUTRO")).toBe(false);
    delete process.env.SUPPORT_META_ACCESS_TOKEN;
    expect(isSupportWhatsAppEnabled()).toBe(false);
    expect(isSupportPhoneNumberId("SUP123")).toBe(false); // sem token, não desvia
  });

  it("resolve restaurante: mapa por telefone tem prioridade, senão cai no piloto", () => {
    expect(resolveRestaurantForSender("5511999998888")).toBe("r-pilot");
    process.env.SUPPORT_PHONE_RESTAURANT_MAP = JSON.stringify({ "5511988887777": "r-outro" });
    expect(resolveRestaurantForSender("5511988887777")).toBe("r-outro");   // casa pelo tail
    expect(resolveRestaurantForSender("5511000009999")).toBe("r-pilot");   // não casa → piloto
  });

  it("texto → diagnostica e RESPONDE pelo número de suporte (shadow-safe)", async () => {
    reasonSupportIncident.mockResolvedValue({
      explanation: "Parece a impressão de comandas — veja o Carteiro.",
      runbook: ["Abra Configurações → Impressoras", "Confirme 'Carteiro conectado'"],
      escalate: true, executed: false,
    });
    const r = await handleInboundSupport({ fromPhone: "5511999998888", text: "a impressora não imprime", isText: true });
    expect(reasonSupportIncident).toHaveBeenCalledWith(expect.objectContaining({ restaurantId: "r-pilot", report: "a impressora não imprime" }));
    expect(r.handled).toBe(true);
    expect(r.replied).toBe(true);
    // enviou pro graph com o phone_number_id do suporte
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("SUP123/messages");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.body).toContain("Carteiro");
    expect(body.body).toContain("Passo a passo");
  });

  it("mídia/foto → pede texto (visão é fase futura), não chama o reasoner", async () => {
    const r = await handleInboundSupport({ fromPhone: "5511999998888", text: null, isText: false });
    expect(reasonSupportIncident).not.toHaveBeenCalled();
    expect(r.replied).toBe(true);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.body).toMatch(/texto/i);
  });

  it("remetente não mapeado → pede identificação, não adivinha", async () => {
    delete process.env.SUPPORT_PILOT_RESTAURANT_ID;
    const r = await handleInboundSupport({ fromPhone: "5511999998888", text: "deu erro", isText: true });
    expect(reasonSupportIncident).not.toHaveBeenCalled();
    expect(r.replied).toBe(true);
  });

  it("canal desligado → não faz nada", async () => {
    delete process.env.SUPPORT_META_PHONE_NUMBER_ID;
    const r = await handleInboundSupport({ fromPhone: "5511999998888", text: "oi", isText: true });
    expect(r.handled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("formatSupportReply monta resposta com assinatura", () => {
    const txt = formatSupportReply({ explanation: "X", runbook: [], escalate: false } as never);
    expect(txt).toContain("Suporte técnico Foocci");
  });
});
