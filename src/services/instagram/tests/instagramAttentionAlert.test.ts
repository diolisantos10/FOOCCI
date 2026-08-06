/**
 * O aviso do Instagram — porque falhar no Actions não é avisar.
 *
 * A varredura diária já falhava com o motivo anexado, e falhou em 03, 04, 05 e 06 de
 * agosto. Ninguém viu: o alarme tocava dentro do GitHub Actions. Em 06/08 o aviso ganhou
 * uma PRIMEIRA VIA por e-mail, porque a via de WhatsApp exigia três variáveis — duas
 * delas dependentes de registrar um número dentro do aplicativo único da Meta, que serve
 * WhatsApp e Instagram ao mesmo tempo. Alerta não pode custar um ato de risco no
 * aplicativo que está no ar.
 *
 * Estes testes travam o que não pode regredir:
 *   1. o e-mail SAI, e sai sozinho — sem depender de nenhuma variável do WhatsApp;
 *   2. cair no destinatário que já existe é comportamento, não acidente;
 *   3. quando NADA sai, o motivo das DUAS vias volta — silêncio nunca vira sucesso;
 *   4. o aviso nunca lança e nunca derruba a renovação de token.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const buildos = vi.hoisted(() => ({
  isBuildOsMetaChannelEnabled: vi.fn(() => true),
  sendBuildOsMetaText: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/services/buildos/BuildOsMetaChannel", () => buildos);

import {
  alertInstagramAttention,
  buildAttentionMessage,
  instagramAlertPhone,
  instagramAlertEmail,
} from "../instagramAttentionAlert";

const VARS = [
  "INSTAGRAM_ALERT_PHONE", "RESEND_API_KEY", "INSTAGRAM_ALERT_EMAIL",
  "SUPPORT_NOTIFY_EMAIL", "LEADS_NOTIFY_EMAIL",
] as const;
const ANTES: Record<string, string | undefined> = {};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  for (const v of VARS) { ANTES[v] = process.env[v]; delete process.env[v]; }
  buildos.isBuildOsMetaChannelEnabled.mockReturnValue(true);
  buildos.sendBuildOsMetaText.mockResolvedValue({ ok: true });
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  for (const v of VARS) {
    if (ANTES[v] === undefined) delete process.env[v];
    else process.env[v] = ANTES[v]!;
  }
  vi.unstubAllGlobals();
});

describe("alertInstagramAttention — a via de e-mail", () => {
  it("manda o aviso por e-mail SEM nenhuma variável de WhatsApp configurada", async () => {
    process.env.RESEND_API_KEY = "re_teste";
    process.env.INSTAGRAM_ALERT_EMAIL = "dono@foocci.com.br";

    const r = await alertInstagramAttention(["Instagram do restaurante r1 está LIGADO e MUDO há 13 dias."]);

    expect(r.sent).toBe(true);
    expect(r.channel).toBe("email");
    // O WhatsApp continua desligado e isso NÃO impede o aviso de sair.
    expect(buildos.sendBuildOsMetaText).not.toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(["dono@foocci.com.br"]);
    // Guardrail 6: o alerta carrega o caso concreto, não "algo falhou".
    expect(body.text).toContain("13 dias");
    expect(body.text).toContain("r1");
  });

  it("cai no destinatário que JÁ existe — é o que faz o aviso funcionar sem variável nova", async () => {
    process.env.RESEND_API_KEY = "re_teste";
    process.env.LEADS_NOTIFY_EMAIL = "time@foocci.com.br";

    expect(instagramAlertEmail()).toEqual({ to: "time@foocci.com.br", via: "LEADS_NOTIFY_EMAIL (fallback)" });

    const r = await alertInstagramAttention(["algo"]);
    expect(r.sent).toBe(true);
    expect(r.channel).toBe("email");
  });

  it("respeita a ordem: a variável dedicada vence as caixas de fallback", () => {
    process.env.INSTAGRAM_ALERT_EMAIL = "dedicada@foocci.com.br";
    process.env.SUPPORT_NOTIFY_EMAIL = "suporte@foocci.com.br";
    process.env.LEADS_NOTIFY_EMAIL = "leads@foocci.com.br";
    expect(instagramAlertEmail().to).toBe("dedicada@foocci.com.br");
  });

  it("🔒 PORTÃO: se o e-mail deixar de sair, isto reprova — Resend recusando não vira sucesso", async () => {
    process.env.RESEND_API_KEY = "re_teste";
    process.env.INSTAGRAM_ALERT_EMAIL = "dono@foocci.com.br";
    fetchMock.mockResolvedValue(new Response("dominio nao verificado", { status: 403 }));

    const r = await alertInstagramAttention(["algo"]);

    expect(r.sent).toBe(false);
    expect(r.detail.email).toContain("403");
    expect(r.detail.email).toContain("dominio nao verificado");
  });

  it("🔒 PORTÃO: sem RESEND_API_KEY o motivo é nomeado, não engolido", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.INSTAGRAM_ALERT_EMAIL = "dono@foocci.com.br";
    const r = await alertInstagramAttention(["algo"]);
    expect(r.sent).toBe(false);
    expect(r.detail.email).toContain("RESEND_API_KEY ausente");
  });

  it("🔒 PORTÃO: com a chave mas sem destinatário, diz QUAIS variáveis faltam", async () => {
    process.env.RESEND_API_KEY = "re_teste";
    const r = await alertInstagramAttention(["algo"]);
    expect(r.sent).toBe(false);
    expect(r.detail.email).toContain("INSTAGRAM_ALERT_EMAIL");
    expect(r.detail.email).toContain("LEADS_NOTIFY_EMAIL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uma via basta: e-mail quebrado + WhatsApp ligado ainda avisa alguém", async () => {
    process.env.RESEND_API_KEY = "re_teste";
    process.env.INSTAGRAM_ALERT_EMAIL = "dono@foocci.com.br";
    fetchMock.mockResolvedValue(new Response("erro", { status: 500 }));
    process.env.INSTAGRAM_ALERT_PHONE = "+5511999998888";

    const r = await alertInstagramAttention(["algo"]);

    expect(r.sent).toBe(true);
    expect(r.channel).toBe("whatsapp");
    // ...mas a via quebrada continua visível. Saber que metade do aviso está morta é
    // exatamente o que ninguém soube durante treze dias.
    expect(r.detail.email).toContain("500");
  });
});

describe("alertInstagramAttention — regras que não mudaram", () => {
  it("fica calado quando não há nada a avisar", async () => {
    process.env.RESEND_API_KEY = "re_teste";
    process.env.INSTAGRAM_ALERT_EMAIL = "dono@foocci.com.br";
    const r = await alertInstagramAttention([]);
    expect(r.sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(buildos.sendBuildOsMetaText).not.toHaveBeenCalled();
  });

  it("🔒 PORTÃO: nada configurado = nada sai, e o motivo das DUAS vias volta", async () => {
    const r = await alertInstagramAttention(["Instagram do restaurante r1 está LIGADO e MUDO há 13 dias."]);
    expect(r.sent).toBe(false);
    expect(r.channel).toBeNull();
    expect(r.reason).toContain("RESEND_API_KEY ausente");
    expect(r.reason).toContain("INSTAGRAM_ALERT_PHONE não definido");
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
    expect(r.detail.whatsapp).toContain("não configurado");
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
    process.env.RESEND_API_KEY = "re_teste";
    process.env.INSTAGRAM_ALERT_EMAIL = "dono@foocci.com.br";
    fetchMock.mockRejectedValue(new Error("rede caiu"));
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

  it("não despeja uma lista infinita no aviso", () => {
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
