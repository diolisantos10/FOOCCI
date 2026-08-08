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

const CORPO = {
  nome: "João",
  whatsapp: "11999998888",
  email: "joao@pizzarianonna.com.br",
  restaurante: "Pizzaria Nonna",
};

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

  /*
    O WhatsApp impossível é o caso que mais custou: a regra antiga (`min(8)`)
    aceitava OITO CARACTERES QUAISQUER, o lead entrava e a tela confirmava
    "vamos chamar você no WhatsApp não tenho". Ninguém conseguia chamar, e a
    pessoa ficava esperando. A trava é aqui, no servidor — a checagem do
    formulário é conveniência e não vale para quem posta direto na API.
  */
  it.each([
    ["não tenho",  "texto no lugar do número"],
    ["1199999",    "número cortado no meio"],
    ["999998888",  "celular sem o DDD"],
    ["(00) 98765-4321", "DDD que não existe"],
  ])("WhatsApp impossível (%s) não vira lead: 400 e nada gravado", async (whatsapp) => {
    const res = await POST(req({ ...CORPO, whatsapp }));
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(capture).not.toHaveBeenCalled();
    // A recusa ensina o que fazer — mensagem sem exemplo devolve a pessoa ao
    // mesmo erro.
    expect(body.error).toContain("(11) 98765-4321");
  });

  /*
    ── O E-MAIL, NO SERVIDOR ────────────────────────────────────────────────────

    Três contatos da Dioli Digital ficaram 51, 29 e 28 dias sem resposta porque
    havia um caminho de volta só, e ele não alcançava ninguém. A trava é AQUI:
    campo que o cliente pode contornar não é campo validado, e o `type="email"`
    do navegador — que nem chega neste teste — aceita `a@b`.
  */
  it("SEM e-mail não vira lead: 400 e nada gravado", async () => {
    const semEmail: Record<string, unknown> = { ...CORPO };
    delete semEmail.email;

    const res = await POST(req(semEmail));
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(capture).not.toHaveBeenCalled();
    expect(body.error).toContain("e-mail");
  });

  it.each([
    ["a@b",            "domínio sem ponto — o que o navegador ACEITA"],
    ["sem-arroba",     "sem @"],
    ["joao@ tal.com",  "espaço no meio"],
    ["joao@tal",       "domínio sem ponto"],
    ["joao@tal.c",     "domínio de topo de uma letra"],
    ["@tal.com",       "sem nome antes do @"],
    ["   ",            "só espaço"],
  ])("e-mail impossível (%s) não vira lead: 400 e nada gravado", async (email) => {
    const res = await POST(req({ ...CORPO, email }));
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(capture).not.toHaveBeenCalled();
    // A recusa ensina o que fazer — mensagem sem exemplo devolve a pessoa ao
    // mesmo erro.
    expect(body.error).toMatch(/e-?mail/i);
  });

  it("os e-mails que gente de verdade digita CONTINUAM entrando", async () => {
    // A metade que impede o portão de virar parede: recusar quem está certo custa
    // mais que aceitar dado sujo, porque barra o dono que estava tentando comprar.
    capture.mockResolvedValue({ id: "lead1", codigo: "A7K2M", notified: true, notifyError: null });

    for (const email of [
      "contato@pizzarianonna.com.br",
      "  Contato@Nonna.COM.BR  ",       // colado com espaço e capitalizado pelo celular
      "joao+foocci@gmail.com",          // alias
      "joao.da.silva@tal.com.br",
      "financeiro@grupo.rede.nonna.com.br",
    ]) {
      capture.mockClear();
      const res = await POST(req({ ...CORPO, email }));
      expect(res.status, `"${email}" foi recusado e não deveria`).toBe(200);
      expect(capture).toHaveBeenCalledTimes(1);
    }
  });

  it("o e-mail chega ao serviço que grava — não morre na porta", async () => {
    capture.mockResolvedValue({ id: "lead1", codigo: "A7K2M", notified: true, notifyError: null });

    await POST(req({ ...CORPO, email: "contato@nonna.com.br" }));

    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ email: "contato@nonna.com.br" }),
    );
  });

  it("os formatos que gente de verdade digita CONTINUAM entrando", async () => {
    capture.mockResolvedValue({ id: "lead1", codigo: "A7K2M", notified: true, notifyError: null });

    for (const whatsapp of [
      "(11) 98765-4321",   // com máscara
      "+55 11 98765-4321", // com DDI
      "11 8765-4321",      // sem o nono dígito
      "(11) 3333-4444",    // fixo — WhatsApp Business roda em fixo
      "(55) 99999-8888",   // DDD 55, o que parece DDI
    ]) {
      capture.mockClear();
      const res = await POST(req({ ...CORPO, whatsapp }));
      expect(res.status, `"${whatsapp}" foi recusado e não deveria`).toBe(200);
      expect(capture).toHaveBeenCalledTimes(1);
    }
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
