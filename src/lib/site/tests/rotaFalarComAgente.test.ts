/**
 * A porta única do agente — e a promessa que ela não pode quebrar.
 *
 * Reprova contra o código antigo: a rota não existia e todo botão apontava para
 * o formulário. O que se prova aqui é a regra que evita o pior defeito possível
 * desta mudança — um botão verde de WhatsApp levando a um número que não atende.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/site/(gated)/falar-com-agente/route";
import { NUMERO_DE_VENDAS } from "../canalDeVendas";
import { DEMO_URL } from "@/components/marketing/config";

const original = process.env.FOOCCI_SALES_WHATSAPP_ATIVO;

beforeEach(() => { delete process.env.FOOCCI_SALES_WHATSAPP_ATIVO; });
afterEach(() => {
  if (original === undefined) delete process.env.FOOCCI_SALES_WHATSAPP_ATIVO;
  else process.env.FOOCCI_SALES_WHATSAPP_ATIVO = original;
});

describe("com o canal fora do ar", () => {
  it("leva ao FORMULÁRIO — nunca a um WhatsApp que ninguém atende", async () => {
    const res = await GET();
    const destino = res.headers.get("location") ?? "";
    expect(destino).toContain(DEMO_URL);
    expect(destino).not.toContain("wa.me");
  });
});

describe("com o canal no ar", () => {
  it("leva ao WhatsApp de vendas, com a mensagem já escrita", async () => {
    process.env.FOOCCI_SALES_WHATSAPP_ATIVO = "true";
    const res = await GET();
    const destino = new URL(res.headers.get("location") ?? "");
    expect(destino.host).toBe("wa.me");
    expect(destino.pathname).toBe(`/${NUMERO_DE_VENDAS}`);
    expect(destino.searchParams.get("text")).toBeTruthy();
  });
});

describe("o desvio em si", () => {
  it("é TEMPORÁRIO (307) — 308 ficaria guardado no navegador e no buscador", async () => {
    expect((await GET()).status).toBe(307);
  });

  it("não é guardado em cache — o destino muda no dia em que o canal acender", async () => {
    expect((await GET()).headers.get("cache-control")).toContain("no-store");
  });

  it("a decisão é por requisição: a mesma rota responde diferente sem reiniciar nada", async () => {
    const antes = (await GET()).headers.get("location") ?? "";
    process.env.FOOCCI_SALES_WHATSAPP_ATIVO = "true";
    const depois = (await GET()).headers.get("location") ?? "";
    expect(antes).not.toBe(depois);
  });
});
