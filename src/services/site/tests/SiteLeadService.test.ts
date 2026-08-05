/**
 * The one thing this service must never do: lose a lead because the notification
 * failed. These tests are the trava — "prompt é aviso; código é trava".
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  siteLead: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  siteLeadInteraction: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { SiteLeadService } from "../SiteLeadService";

const LEAD = {
  nome: "Ana",
  whatsapp: "11999998888",
  restaurante: "Cantina da Ana",
  cidade: "São Paulo",
  tipo: "Pizzaria",
  desafio: "Clientes que não voltam",
  origem: "/site/demonstracao",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.siteLead.create.mockResolvedValue({ id: "lead1" });
  db.siteLead.update.mockResolvedValue({});
  db.siteLead.findFirst.mockResolvedValue(null);
  db.siteLeadInteraction.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SiteLeadService.capture", () => {
  it("stores the lead even when no e-mail provider is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "");

    const r = await SiteLeadService.capture(LEAD);

    expect(db.siteLead.create).toHaveBeenCalledOnce();
    expect(r.id).toBe("lead1");
    expect(r.notified).toBe(false);
    // The reason is recorded, not swallowed — guardrail 6.
    expect(r.notifyError).toContain("RESEND_API_KEY");
    expect(db.siteLead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notifyError: expect.any(String) }) }),
    );
  });

  it("stores the lead even when the e-mail provider returns an error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "dono@exemplo.com");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "domain not verified",
    });

    const r = await SiteLeadService.capture(LEAD);

    expect(db.siteLead.create).toHaveBeenCalledOnce();
    expect(r.notified).toBe(false);
    expect(r.notifyError).toContain("422");
  });

  it("stores the lead even when the e-mail call throws", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "dono@exemplo.com");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("timeout"));

    const r = await SiteLeadService.capture(LEAD);

    expect(db.siteLead.create).toHaveBeenCalledOnce();
    expect(r.notified).toBe(false);
    expect(r.notifyError).toContain("timeout");
  });

  it("persists BEFORE notifying — the write never depends on the alert", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "dono@exemplo.com");

    const order: string[] = [];
    db.siteLead.create.mockImplementation(async () => {
      order.push("create");
      return { id: "lead1" };
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("notify");
      return { ok: true, status: 200, text: async () => "" };
    });

    await SiteLeadService.capture(LEAD);

    expect(order).toEqual(["create", "notify"]);
  });

  it("marks the lead as notified when the e-mail goes out", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "dono@exemplo.com");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });

    const r = await SiteLeadService.capture(LEAD);

    expect(r.notified).toBe(true);
    expect(r.notifyError).toBeNull();
    expect(db.siteLead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notifiedAt: expect.any(Date), notifyError: null }),
      }),
    );
  });

  it("never puts the visitor's data in the alert subject line beyond their name", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "dono@exemplo.com");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });

    await SiteLeadService.capture(LEAD);

    const body = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    ) as { subject: string; text: string };

    expect(body.subject).toContain("Ana");
    expect(body.subject).not.toContain(LEAD.whatsapp);
    expect(body.text).toContain(LEAD.whatsapp);
  });
});

/**
 * O contato entra na base do CRM da Foocci já com origem e já com linha do
 * tempo. Se qualquer uma das duas coisas falhar em silêncio, o CEO perde a
 * resposta de "qual anúncio funciona" e o SDR recebe um contato sem histórico.
 */
describe("SiteLeadService.capture — entrada no CRM da Foocci", () => {
  const COM_ORIGEM = {
    ...LEAD,
    utmSource: "facebook",
    utmMedium: "cpc",
    utmCampaign: "Restaurantes-SP",
    utmContent: "video-30s",
    clickId: "fbclid-abc",
    landingPath: "/site?utm_source=facebook",
    referrer: "l.facebook.com",
  };

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "");
  });

  it("grava a origem do primeiro toque, não só a página do formulário", async () => {
    await SiteLeadService.capture(COM_ORIGEM);

    const dados = db.siteLead.create.mock.calls[0]![0].data;
    expect(dados.utmSource).toBe("facebook");
    expect(dados.utmCampaign).toBe("Restaurantes-SP");
    expect(dados.utmContent).toBe("video-30s");
    expect(dados.clickId).toBe("fbclid-abc");
    expect(dados.landingPath).toBe("/site?utm_source=facebook");
    // O legado continua: é "de qual página ele enviou", que nunca foi atribuição.
    expect(dados.origem).toBe("/site/demonstracao");
  });

  it("normaliza o WhatsApp para a chave da base", async () => {
    await SiteLeadService.capture({ ...LEAD, whatsapp: "(11) 99999-8888" });
    expect(db.siteLead.create.mock.calls[0]![0].data.whatsappDigits).toBe("5511999998888");
  });

  it("abre a linha do tempo com o evento de captura", async () => {
    await SiteLeadService.capture(LEAD);

    const interacao = db.siteLeadInteraction.create.mock.calls[0]![0].data;
    expect(interacao.tipo).toBe("CAPTURA");
    expect(interacao.toStage).toBe("NOVO");
    expect(interacao.actor).toBe("sistema");
  });

  it("falha ao registrar a interação NÃO derruba a captura", async () => {
    // O contato já está salvo quando a linha do tempo é escrita. Perder o lead
    // por causa de um evento de histórico seria a proteção sendo pior que o
    // problema que ela evita.
    db.siteLeadInteraction.create.mockRejectedValueOnce(new Error("boom"));
    const r = await SiteLeadService.capture(LEAD);
    expect(r.id).toBe("lead1");
  });

  it("campo em branco vira null, não string vazia", async () => {
    await SiteLeadService.capture({ ...LEAD, cidade: "", utmCampaign: "" } as typeof COM_ORIGEM);
    const dados = db.siteLead.create.mock.calls[0]![0].data;
    expect(dados.cidade).toBeNull();
    expect(dados.utmCampaign).toBeNull();
  });
});

describe("SiteLeadService.capture — a mesma pessoa não vira dois contatos", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "");
  });

  it("reenvio do mesmo WhatsApp vira interação, não contato novo", async () => {
    // Base com a mesma pessoa três vezes faz o SDR abordá-la três vezes.
    db.siteLead.findFirst.mockResolvedValue({
      id: "lead-existente", nome: "Ana", restaurante: "Cantina da Ana",
      cidade: null, tipo: null, desafio: null,
      utmSource: "facebook", utmMedium: null, utmCampaign: "Campanha-de-junho",
      utmContent: null, utmTerm: null, clickId: null, landingPath: null, referrer: null,
    });

    const r = await SiteLeadService.capture({ ...LEAD, whatsapp: "+55 11 99999-8888" });

    expect(r.duplicado).toBe(true);
    expect(r.id).toBe("lead-existente");
    expect(db.siteLead.create).not.toHaveBeenCalled();

    const interacao = db.siteLeadInteraction.create.mock.calls[0]![0].data;
    expect(interacao.tipo).toBe("REENVIO_FORMULARIO");
    expect(interacao.leadId).toBe("lead-existente");
  });

  it("o reenvio COMPLETA campos vazios sem sobrescrever os que já existiam", async () => {
    db.siteLead.findFirst.mockResolvedValue({
      id: "lead-existente", nome: "Ana", restaurante: "Cantina da Ana",
      cidade: null, tipo: null, desafio: null,
      utmSource: "facebook", utmMedium: null, utmCampaign: "Campanha-de-junho",
      utmContent: null, utmTerm: null, clickId: null, landingPath: null, referrer: null,
    });

    await SiteLeadService.capture({
      ...LEAD, restaurante: "Outro nome", cidade: "Campinas",
      utmCampaign: "Campanha-de-agosto",
    } as never);

    const dados = db.siteLead.update.mock.calls[0]![0].data;
    expect(dados.restaurante).toBe("Cantina da Ana"); // o que já havia vence
    expect(dados.cidade).toBe("Campinas");            // o que faltava é preenchido
    expect(dados.utmCampaign).toBe("Campanha-de-junho"); // primeiro toque manda
    expect(dados.submissions).toEqual({ increment: 1 });
  });

  it("se a busca por duplicata falhar, CRIA — perder contato é pior que duplicar", async () => {
    db.siteLead.findFirst.mockRejectedValue(new Error("banco tossiu"));
    const r = await SiteLeadService.capture(LEAD);
    expect(r.duplicado).toBe(false);
    expect(db.siteLead.create).toHaveBeenCalledOnce();
  });

  it("WhatsApp impossível de normalizar não deduplica com ninguém", async () => {
    await SiteLeadService.capture({ ...LEAD, whatsapp: "não tenho" });
    expect(db.siteLead.findFirst).not.toHaveBeenCalled();
    expect(db.siteLead.create).toHaveBeenCalledOnce();
    expect(db.siteLead.create.mock.calls[0]![0].data.whatsappDigits).toBeNull();
  });
});
