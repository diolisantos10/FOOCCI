/**
 * O interruptor do WhatsApp de vendas.
 *
 * Contra o código antigo TODOS estes reprovam: não existia interruptor, não
 * existia número no repositório, e o único caminho era uma variável
 * `NEXT_PUBLIC_*` congelada no build.
 *
 * O que se prova aqui é o que torna o botão seguro: ausência de configuração é
 * DESLIGADO, e texto e destino nunca se separam.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  NUMERO_DE_VENDAS,
  canalDeVendasAtivo,
  chamadaComercial,
  linkDoWhatsAppDeVendas,
  numeroLegivel,
} from "../canalDeVendas";
import { AGENTE_CTA_LABEL, AGENTE_URL, DEMO_CTA_LABEL } from "@/components/marketing/config";

const original = process.env.FOOCCI_SALES_WHATSAPP_ATIVO;

beforeEach(() => { delete process.env.FOOCCI_SALES_WHATSAPP_ATIVO; });
afterEach(() => {
  if (original === undefined) delete process.env.FOOCCI_SALES_WHATSAPP_ATIVO;
  else process.env.FOOCCI_SALES_WHATSAPP_ATIVO = original;
});

describe("o interruptor começa desligado", () => {
  it("sem variável nenhuma, o canal está fora do ar", () => {
    expect(canalDeVendasAtivo()).toBe(false);
  });

  it("qualquer valor que não seja 'true' mantém desligado — inclusive '1' e 'sim'", () => {
    for (const v of ["", " ", "1", "sim", "TRUE-ish", "false"]) {
      process.env.FOOCCI_SALES_WHATSAPP_ATIVO = v;
      expect(canalDeVendasAtivo(), `valor ${JSON.stringify(v)} não podia ligar`).toBe(false);
    }
  });

  it("'true' liga — e 'TRUE ' com espaço também, porque colar valor com espaço acontece", () => {
    process.env.FOOCCI_SALES_WHATSAPP_ATIVO = "true";
    expect(canalDeVendasAtivo()).toBe(true);
    process.env.FOOCCI_SALES_WHATSAPP_ATIVO = " TRUE ";
    expect(canalDeVendasAtivo()).toBe(true);
  });

  it("é lido A CADA chamada — trocar a variável vale sem build novo", () => {
    expect(canalDeVendasAtivo()).toBe(false);
    process.env.FOOCCI_SALES_WHATSAPP_ATIVO = "true";
    expect(canalDeVendasAtivo()).toBe(true);
    delete process.env.FOOCCI_SALES_WHATSAPP_ATIVO;
    expect(canalDeVendasAtivo()).toBe(false);
  });
});

describe("o número", () => {
  it("é o que o CEO decidiu, e vive no repositório — não numa variável de build", () => {
    expect(NUMERO_DE_VENDAS).toBe("5511943723316");
  });

  it("o link wa.me leva o número e a mensagem já escrita", () => {
    const url = new URL(linkDoWhatsAppDeVendas());
    expect(url.origin + url.pathname).toBe(`https://wa.me/${NUMERO_DE_VENDAS}`);
    expect(url.searchParams.get("text")).toContain("Foocci");
  });

  it("sai legível para quem precisar copiar", () => {
    expect(numeroLegivel()).toBe("+55 (11) 94372-3316");
  });
});

describe("texto e destino nunca se separam", () => {
  it("com o canal fora do ar, o botão NÃO diz 'fale com nosso agente'", () => {
    const c = chamadaComercial();
    expect(c.ativo).toBe(false);
    expect(c.label).toBe(DEMO_CTA_LABEL);
    expect(c.label).not.toContain("agente");
    // A frase de baixo descreve o que REALMENTE acontece com o canal desligado:
    // a pessoa deixa o contato e alguém liga para ela. Ela não fala com agente
    // nenhum agora.
    expect(c.note).toMatch(/chama você/i);
    expect(c.note).not.toMatch(/tira as dúvidas/i);
  });

  it("com o canal no ar, o botão convida para o WhatsApp", () => {
    process.env.FOOCCI_SALES_WHATSAPP_ATIVO = "true";
    const c = chamadaComercial();
    expect(c.ativo).toBe(true);
    expect(c.label).toBe(AGENTE_CTA_LABEL);
    expect(c.note).toMatch(/tira as dúvidas/i);
  });

  it("o destino é sempre o caminho INTERNO — nunca o wa.me assado na página", () => {
    expect(chamadaComercial().href).toBe(AGENTE_URL);
    process.env.FOOCCI_SALES_WHATSAPP_ATIVO = "true";
    expect(chamadaComercial().href).toBe(AGENTE_URL);
    expect(AGENTE_URL.startsWith("/")).toBe(true);
  });
});
