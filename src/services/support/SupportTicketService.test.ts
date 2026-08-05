/**
 * Prova da lição do SiteLeadService aplicada ao chamado: PERSISTE PRIMEIRO,
 * NOTIFICA DEPOIS. As duas metades estão aqui — o caminho feliz (e-mail sai com
 * a evidência) e o caminho ruim (e-mail cai e o chamado continua de pé).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  supportTicket: { create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { SupportTicketService, formatTicketCode } from "./SupportTicketService";

const ORIGINAL_ENV = { ...process.env };

function input(over: Record<string, unknown> = {}) {
  return {
    restaurantId: "r1",
    restaurantName: "Pizzaria do Zé",
    userId: "u1",
    threadId: "t1",
    subject: "a impressora não imprime",
    reason: "runbook não resolveu; subsistema printing",
    transcript: [
      { role: "USER", content: "a impressora não imprime" },
      { role: "ASSISTANT", content: "Confere se a impressora aparece como online." },
      { role: "USER", content: "aparece online e não sai nada" },
    ],
    diagnosticNote: "subsistema suspeito: printing",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: "re_test", SUPPORT_NOTIFY_EMAIL: "suporte@foocci.com.br" };
  db.supportTicket.create.mockResolvedValue({ id: "tk1", number: 42 });
  db.supportTicket.update.mockResolvedValue({});
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("formatTicketCode", () => {
  it("vira um código legível pro lojista", () => {
    expect(formatTicketCode(42)).toBe("CHM-0042");
    expect(formatTicketCode(12345)).toBe("CHM-12345");
  });
});

describe("(c) escalar cria o chamado E dispara a notificação", () => {
  it("persiste primeiro, depois notifica — e devolve o número", async () => {
    const out = await SupportTicketService.open(input());

    expect(db.supportTicket.create).toHaveBeenCalledTimes(1);
    expect(out.code).toBe("CHM-0042");
    expect(out.notified).toBe(true);
    expect(out.notifyError).toBeNull();

    // A ordem importa: o create aconteceu antes do fetch.
    const createOrder = db.supportTicket.create.mock.invocationCallOrder[0]!;
    const fetchOrder = (globalThis.fetch as unknown as { mock: { invocationCallOrder: number[] } })
      .mock.invocationCallOrder[0]!;
    expect(createOrder).toBeLessThan(fetchOrder);

    expect(db.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tk1" },
        data: expect.objectContaining({ notifyError: null }),
      }),
    );
  });

  it("o e-mail carrega a EVIDÊNCIA (guardrail 6), não só 'abriram um chamado'", async () => {
    await SupportTicketService.open(input());

    const [url, init] = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]! as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");

    const payload = JSON.parse(init.body) as { to: string[]; subject: string; text: string };
    expect(payload.to).toEqual(["suporte@foocci.com.br"]);
    expect(payload.subject).toContain("CHM-0042");
    expect(payload.subject).toContain("Pizzaria do Zé");
    // Quem é, o que perguntou, o que o agente tentou, e por que escalou.
    expect(payload.text).toContain("Pizzaria do Zé");
    expect(payload.text).toContain("a impressora não imprime");
    expect(payload.text).toContain("Confere se a impressora aparece como online.");
    expect(payload.text).toContain("runbook não resolveu");
    expect(payload.text).toContain("subsistema suspeito: printing");
  });

  it("a evidência gravada no chamado é a mesma que o time recebe", async () => {
    await SupportTicketService.open(input());
    const data = db.supportTicket.create.mock.calls[0]![0].data as { evidence: string };
    expect(data.evidence).toContain("Motivo da escalada: runbook não resolveu");
    expect(data.evidence).toContain("Lojista: a impressora não imprime");
    expect(data.evidence).toContain("Agente: Confere se a impressora aparece");
  });
});

describe("(d) se o e-mail falhar, o chamado persiste mesmo assim", () => {
  it("Resend indisponível: chamado salvo, motivo registrado, nada lançado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));

    const out = await SupportTicketService.open(input());

    expect(out.code).toBe("CHM-0042");
    expect(out.notified).toBe(false);
    expect(out.notifyError).toContain("ECONNRESET");
    expect(db.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notifyError: expect.stringContaining("ECONNRESET") } }),
    );
  });

  it("Resend responde erro HTTP: o corpo vira o motivo, o chamado fica", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("domain not verified", { status: 422 })));

    const out = await SupportTicketService.open(input());

    expect(out.notified).toBe(false);
    expect(out.notifyError).toContain("Resend 422");
    expect(out.notifyError).toContain("domain not verified");
  });

  it("sem RESEND_API_KEY: o chamado existe e diz exatamente o que falta", async () => {
    delete process.env.RESEND_API_KEY;

    const out = await SupportTicketService.open(input());

    expect(db.supportTicket.create).toHaveBeenCalledTimes(1);
    expect(out.notified).toBe(false);
    expect(out.notifyError).toContain("RESEND_API_KEY ausente");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("sem destinatário nenhum: o chamado existe e nomeia a variável que falta", async () => {
    delete process.env.SUPPORT_NOTIFY_EMAIL;
    delete process.env.LEADS_NOTIFY_EMAIL;

    const out = await SupportTicketService.open(input());

    expect(out.notified).toBe(false);
    expect(out.notifyError).toContain("SUPPORT_NOTIFY_EMAIL");
  });

  it("sem SUPPORT_NOTIFY_EMAIL cai no LEADS_NOTIFY_EMAIL — chamado nenhum fica sem aviso", async () => {
    delete process.env.SUPPORT_NOTIFY_EMAIL;
    process.env.LEADS_NOTIFY_EMAIL = "leads@foocci.com.br";

    const out = await SupportTicketService.open(input());

    expect(out.notified).toBe(true);
    const init = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![1] as {
      body: string;
    };
    const payload = JSON.parse(init.body) as { to: string[]; text: string };
    expect(payload.to).toEqual(["leads@foocci.com.br"]);
    // O e-mail declara por qual variável saiu — evidência de configuração.
    expect(payload.text).toContain("LEADS_NOTIFY_EMAIL (fallback)");
  });
});
