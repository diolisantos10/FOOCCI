/**
 * The one thing this service must never do: lose a lead because the notification
 * failed. These tests are the trava — "prompt é aviso; código é trava".
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  siteLead: {
    create: vi.fn(),
    update: vi.fn(),
  },
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

  /* ── O código curto: o elo entre o formulário e o "oi" do WhatsApp ───────── */

  it("gera e GRAVA um código curto junto com o lead", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "");

    const r = await SiteLeadService.capture(LEAD);

    expect(r.codigo).toMatch(/^[A-Z2-9]{5}$/);
    // Não basta devolver: tem que estar na linha gravada, senão o "oi" que chegar
    // no WhatsApp não tem para onde apontar.
    const data = db.siteLead.create.mock.calls[0][0].data as { codigo: string };
    expect(data.codigo).toBe(r.codigo);
  });

  it("o código nasce ANTES do aviso — chega no e-mail que o time lê", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "dono@exemplo.com");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, text: async () => "",
    });

    const r = await SiteLeadService.capture(LEAD);

    const body = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    ) as { text: string };
    expect(body.text).toContain(`#${r.codigo}`);
  });

  it("tenta outro código quando o banco acusa colisão", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "");

    const colisao = Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["codigo"] } });
    db.siteLead.create
      .mockRejectedValueOnce(colisao)
      .mockResolvedValueOnce({ id: "lead1" });

    const r = await SiteLeadService.capture(LEAD);

    expect(db.siteLead.create).toHaveBeenCalledTimes(2);
    expect(r.id).toBe("lead1");
    expect(r.codigo).toMatch(/^[A-Z2-9]{5}$/);
    // E o segundo código é outro — não insistiu no mesmo.
    const primeiro = (db.siteLead.create.mock.calls[0][0].data as { codigo: string }).codigo;
    const segundo = (db.siteLead.create.mock.calls[1][0].data as { codigo: string }).codigo;
    expect(segundo).not.toBe(primeiro);
  });

  it("colidiu todas as vezes: grava o lead SEM código — perder o lead nunca é opção", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "");

    const colisao = Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["codigo"] } });
    // Só a gravação SEM código passa — é a última linha de defesa do serviço.
    db.siteLead.create.mockImplementation(async (args: { data: { codigo: string | null } }) => {
      if (args.data.codigo !== null) throw colisao;
      return { id: "lead-sem-codigo" };
    });

    const r = await SiteLeadService.capture(LEAD);

    expect(r.id).toBe("lead-sem-codigo");
    expect(r.codigo).toBeNull();
  });

  it("erro que NÃO é colisão sobe na hora — não fica insistindo em banco caído", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("LEADS_NOTIFY_EMAIL", "");

    db.siteLead.create.mockRejectedValue(new Error("connection refused"));

    await expect(SiteLeadService.capture(LEAD)).rejects.toThrow("connection refused");
    expect(db.siteLead.create).toHaveBeenCalledOnce();
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
