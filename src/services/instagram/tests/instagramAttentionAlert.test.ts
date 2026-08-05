/**
 * O aviso do Instagram — porque falhar no Actions não é avisar.
 *
 * A varredura diária já falhava com o motivo anexado, e falhou em 03, 04 e 05 de
 * agosto. Ninguém viu: o alarme tocava dentro do GitHub Actions. Estes testes travam
 * as três regras do aviso — desligado por padrão, nunca lança, e o motivo do fracasso
 * volta em vez de virar silêncio.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const buildos = vi.hoisted(() => ({
  isBuildOsMetaChannelEnabled: vi.fn(() => true),
  sendBuildOsMetaText: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/services/buildos/BuildOsMetaChannel", () => buildos);

import { alertInstagramAttention, buildAttentionMessage, instagramAlertPhone } from "../instagramAttentionAlert";

const ANTES = process.env.INSTAGRAM_ALERT_PHONE;
beforeEach(() => {
  vi.clearAllMocks();
  buildos.isBuildOsMetaChannelEnabled.mockReturnValue(true);
  buildos.sendBuildOsMetaText.mockResolvedValue({ ok: true });
});
afterEach(() => {
  if (ANTES === undefined) delete process.env.INSTAGRAM_ALERT_PHONE;
  else process.env.INSTAGRAM_ALERT_PHONE = ANTES;
});

describe("alertInstagramAttention", () => {
  it("fica calado quando não há nada a avisar", async () => {
    process.env.INSTAGRAM_ALERT_PHONE = "+5511999998888";
    const r = await alertInstagramAttention([]);
    expect(r.sent).toBe(false);
    expect(buildos.sendBuildOsMetaText).not.toHaveBeenCalled();
  });

  it("desligado por padrão: sem telefone configurado não envia, e diz que está desligado", async () => {
    delete process.env.INSTAGRAM_ALERT_PHONE;
    const r = await alertInstagramAttention(["Instagram do restaurante r1 está LIGADO e MUDO há 13 dias."]);
    expect(r.sent).toBe(false);
    expect(r.reason).toContain("desligado");
    expect(buildos.sendBuildOsMetaText).not.toHaveBeenCalled();
  });

  it("envia pelo canal MASTER — nunca pelo número do restaurante — e sem o '+'", async () => {
    process.env.INSTAGRAM_ALERT_PHONE = "+5511999998888";
    const r = await alertInstagramAttention(["Instagram do restaurante r1 está LIGADO e MUDO há 13 dias."]);
    expect(r.sent).toBe(true);
    expect(buildos.sendBuildOsMetaText).toHaveBeenCalledTimes(1);
    expect(buildos.sendBuildOsMetaText.mock.calls[0][0]).toBe("5511999998888");
  });

  it("meio-configurado é desligado: canal Master ausente não vira sucesso silencioso", async () => {
    process.env.INSTAGRAM_ALERT_PHONE = "+5511999998888";
    buildos.isBuildOsMetaChannelEnabled.mockReturnValue(false);
    const r = await alertInstagramAttention(["algo"]);
    expect(r.sent).toBe(false);
    expect(r.reason).toContain("não configurado");
  });

  it("quando a Meta recusa, devolve o motivo — o Actions precisa poder gritar 'nem avisei'", async () => {
    process.env.INSTAGRAM_ALERT_PHONE = "+5511999998888";
    buildos.sendBuildOsMetaText.mockResolvedValue({ ok: false, error: "(#131047) fora da janela de 24h" });
    const r = await alertInstagramAttention(["algo"]);
    expect(r.sent).toBe(false);
    expect(r.reason).toContain("janela de 24h");
  });

  it("nunca lança: uma falha de aviso não pode derrubar a renovação de token", async () => {
    process.env.INSTAGRAM_ALERT_PHONE = "+5511999998888";
    buildos.sendBuildOsMetaText.mockRejectedValue(new Error("rede caiu"));
    const r = await alertInstagramAttention(["algo"]);
    expect(r.sent).toBe(false);
    expect(r.reason).toContain("rede caiu");
  });
});

describe("buildAttentionMessage", () => {
  it("carrega o caso concreto e não vira 'algo falhou' (guardrail 6)", () => {
    const texto = buildAttentionMessage(
      ["Instagram do restaurante sushi-1 está LIGADO e MUDO desde 2026-07-23 (13 dias)."],
      new Date("2026-08-05T09:00:00Z"),
    );
    expect(texto).toContain("2026-08-05");
    expect(texto).toContain("sushi-1");
    expect(texto).toContain("13 dias");
    // A lição que custou treze dias: o selo verde não é evidência de saúde.
    expect(texto).toMatch(/Diagnóstico/);
  });

  it("não despeja uma lista infinita no WhatsApp", () => {
    const muitos = Array.from({ length: 9 }, (_, i) => `problema ${i}`);
    const texto = buildAttentionMessage(muitos);
    expect(texto).toContain("e mais 4 ponto(s)");
  });
});

describe("instagramAlertPhone", () => {
  it("ignora valor curto demais para ser telefone", () => {
    process.env.INSTAGRAM_ALERT_PHONE = "123";
    expect(instagramAlertPhone()).toBeNull();
  });
});
