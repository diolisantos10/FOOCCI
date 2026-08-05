/**
 * A trava de "salvar ANTES de redirecionar" mora aqui.
 *
 * A tela só consegue montar a mensagem do WhatsApp com um `codigo`, e o `codigo`
 * só sai desta rota. Logo: se a gravação não aconteceu, não há resposta com
 * código e não há como levar ninguém ao WhatsApp. A ordem não depende de o
 * cliente se comportar — depende do que a rota devolve.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@/services/site/SiteLeadService", () => ({ SiteLeadService: { capture } }));
// Rate limit sempre liberado: aqui o assunto é a ordem, não o limite.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit:         () => ({ limited: false, retryAfter: 0 }),
  getClientIp:       () => "1.2.3.4",
  rateLimitResponse: () => new Response("limited", { status: 429 }),
}));

import { POST } from "../route";

function req(body: unknown) {
  return new Request("http://localhost/api/site/leads", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  }) as never;
}

const CORPO = { nome: "João", whatsapp: "11999998888", restaurante: "Pizzaria Nonna" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/site/leads", () => {
  it("devolve o código SÓ depois de o lead ter sido gravado", async () => {
    const ordem: string[] = [];
    capture.mockImplementation(async () => {
      ordem.push("gravou");
      return { id: "lead1", codigo: "A7K2M", notified: true, notifyError: null };
    });

    const res = await POST(req(CORPO));
    ordem.push("respondeu");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, codigo: "A7K2M" });
    expect(ordem).toEqual(["gravou", "respondeu"]);
  });

  it("gravação falhou: 500, NENHUM código — a tela não tem como mandar ninguém ao WhatsApp", async () => {
    capture.mockRejectedValue(new Error("banco fora"));

    const res = await POST(req(CORPO));
    const body = (await res.json()) as { codigo?: unknown; error?: string };

    expect(res.status).toBe(500);
    expect(body.codigo).toBeUndefined();
    expect(body.error).toContain("Tente de novo");
  });

  it("dados inválidos: 400 antes de tocar no banco", async () => {
    const res = await POST(req({ nome: "J", whatsapp: "1" }));

    expect(res.status).toBe(400);
    expect(capture).not.toHaveBeenCalled();
  });

  it("lead salvo sem código continua sendo sucesso — o contato é o que importa", async () => {
    capture.mockResolvedValue({ id: "lead1", codigo: null, notified: false, notifyError: "x" });

    const res = await POST(req(CORPO));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, codigo: null });
  });

  it("não vaza para o visitante que o aviso por e-mail falhou", async () => {
    capture.mockResolvedValue({
      id: "lead1", codigo: "A7K2M", notified: false, notifyError: "RESEND_API_KEY ausente",
    });

    const res = await POST(req(CORPO));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("RESEND");
    expect(body.notified).toBeUndefined();
  });
});
