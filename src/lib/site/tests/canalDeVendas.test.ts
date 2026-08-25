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
import {
  AGENTE_CTA_LABEL,
  AGENTE_URL,
  CONTATO_NOTE,
  DEMO_CTA_LABEL,
  WHATSAPP_SALES_NUMBER,
} from "@/components/marketing/config";

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
    // E não promete conversa com IA, que é o que o canal ligado oferece.
    expect(c.note).not.toMatch(/tira as dúvidas/i);
  });

  /**
   * ── DOIS INTERRUPTORES, E ELES NÃO ANDAM JUNTOS ────────────────────────────
   *
   * O caso acima afirmava, até 25/08/2026, que com o canal desligado a frase
   * dizia **"uma pessoa do Foocci chama você"**. Era verdade quando foi escrito,
   * e deixou de ser no dia em que o número de vendas passou a existir.
   *
   * São dois interruptores, e o teste antigo tratava como um só:
   *
   *   `FOOCCI_SALES_WHATSAPP_ATIVO` → o agente responde? (hoje: **não**)
   *   `WHATSAPP_SALES_NUMBER`       → existe número para onde mandar a pessoa?
   *                                   (hoje: **sim**, fixo no repositório)
   *
   * Com número aceso e agente desligado — o estado de hoje — o percurso real é:
   * a pessoa deixa o contato e **é levada ao WhatsApp para mandar o "oi"**.
   * Ninguém liga para ela. Manter "chama você" seria a pior espécie de promessa
   * errada: o visitante fecha a aba e espera um telefonema que não vem.
   *
   * O teste velho travava a frase antiga e reprovava a correção — ele reprovou
   * o PR #145 por três dias. Este põe o portão onde a regra de verdade mora: a
   * frase acompanha o NÚMERO, não o interruptor do agente.
   */
  it("a frase acompanha o NÚMERO, não o interruptor do agente", () => {
    const c = chamadaComercial();
    expect(c.ativo, "o agente continua desligado neste caso").toBe(false);

    expect(WHATSAPP_SALES_NUMBER, "o número está aceso desde 25/08").toBeTruthy();
    expect(c.note).toBe(CONTATO_NOTE);
    expect(c.note).toMatch(/abre a conversa/i);
    // E NÃO promete telefonema: quem manda o "oi" é ela.
    expect(c.note).not.toMatch(/chama você/i);
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
