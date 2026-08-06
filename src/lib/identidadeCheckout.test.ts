/**
 * Trava do laço da vitrine — caso real, padaria de demonstração, 05/08 23:49.
 *
 * O CEO abriu a `foocci-bakery` (a loja que o cliente em potencial usa para
 * decidir se compra), informou o WhatsApp, foi cumprimentado pelo nome — e ao
 * clicar em "Finalizar pedido" leu, em balões repetidos:
 *
 *   "Pra fechar o pedido preciso do seu WhatsApp — é por ele que o restaurante
 *    confirma e avisa quando fica pronto. Seu carrinho está guardado. 📱"
 *
 * A frase é emitida de UM lugar só (`PedidoClient.tsx`, dentro de
 * `handleFinalizeClick`). Não houve disparo duplo nem re-render: houve LAÇO.
 * Quem se identificava durante a navegação não passava a "ter telefone", porque
 *
 *   · `POST /api/qr/[slug]/identify` nunca devolve `customerId` (decisão de
 *     segurança escrita na própria rota), e
 *   · o telefone era lido do `sessionStorage` num inicializador de `useState`,
 *     ou seja, UMA vez, no mount — antes de a tela de identificação gravar lá.
 *
 * Reproduzido em Chromium com o `PedidoClient` real: 3 voltas, 3 balões
 * idênticos, e o laço não tem fim. Na loja de cliente (identificação
 * obrigatória) o mesmo defeito fechava pedido com `customerPhone: undefined`.
 *
 * METADE destes testes prova que o LEGÍTIMO passa: o portão precisa continuar
 * disparando para quem realmente pulou a identificação, e precisa continuar
 * mudo em loja de cliente. Detector que só sabe reprovar vira carimbo.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  telefoneEfetivoDoCliente,
  precisaPedirWhatsAppParaFechar,
} from "./identidadeCheckout";

const CHAT = "src/app/pedido/[slug]/PedidoClient.tsx";
const ler = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/** O que a rota de identificação devolve HOJE para um cliente existente. */
const RESPOSTA_REAL_DO_IDENTIFY = { found: true, name: "Diego" } as const;

describe("identidade no fechamento — o laço da vitrine (05/08, foocci-bakery)", () => {
  it("o telefone informado AGORA conta como telefone", () => {
    expect(telefoneEfetivoDoCliente({ sessionPhone: "11987654321" })).toBe("11987654321");
  });

  it("REGRESSÃO: quem acabou de informar o WhatsApp não é perguntado de novo", () => {
    // O caso do print: vitrine, cliente reconhecido pelo nome, e a rota de
    // identificação — por decisão de segurança — não devolveu customerId.
    expect(RESPOSTA_REAL_DO_IDENTIFY).not.toHaveProperty("customerId");

    const depoisDeSeIdentificar = {
      identificacaoOpcional: true,
      knownPhone:   null,          // não veio de link do WhatsApp
      storedPhone:  null,          // sessionStorage lido no mount: ainda vazio
      sessionPhone: "11987654321", // ← o que ele acabou de digitar
      customerId:   null,          // a rota não devolve, e não vai devolver
    };
    expect(precisaPedirWhatsAppParaFechar(depoisDeSeIdentificar)).toBe(false);
  });

  it("REGRESSÃO: o portão não pode disparar duas vezes seguidas para a mesma pessoa", () => {
    // Volta 1 — anônimo: o portão dispara (correto).
    const anonimo = { identificacaoOpcional: true, sessionPhone: null, customerId: null };
    expect(precisaPedirWhatsAppParaFechar(anonimo)).toBe(true);
    // Volta 2 — a pessoa respondeu. Perguntar de novo é o laço.
    const respondeu = { ...anonimo, sessionPhone: "11987654321" };
    expect(precisaPedirWhatsAppParaFechar(respondeu)).toBe(false);
  });

  // ── A metade que prova que o legítimo passa ───────────────────────────────

  it("LEGÍTIMO: quem pulou a identificação e vai fechar É perguntado, uma vez", () => {
    expect(precisaPedirWhatsAppParaFechar({
      identificacaoOpcional: true,
      knownPhone: null, storedPhone: null, sessionPhone: null, customerId: null,
    })).toBe(true);
  });

  it("LEGÍTIMO: em loja de cliente o portão é mudo — a entrada já é obrigatória", () => {
    expect(precisaPedirWhatsAppParaFechar({
      identificacaoOpcional: false,
      knownPhone: null, storedPhone: null, sessionPhone: null, customerId: null,
    })).toBe(false);
  });

  it("LEGÍTIMO: quem chegou pelo link do WhatsApp nunca é parado", () => {
    expect(precisaPedirWhatsAppParaFechar({
      identificacaoOpcional: true, knownPhone: "5511987654321",
    })).toBe(false);
    expect(telefoneEfetivoDoCliente({ knownPhone: "5511987654321", sessionPhone: "119999" }))
      .toBe("5511987654321"); // o servidor vence o digitado
  });

  it("LEGÍTIMO: quem já se identificou numa visita anterior da aba não é parado", () => {
    expect(precisaPedirWhatsAppParaFechar({
      identificacaoOpcional: true, storedPhone: "11987654321",
    })).toBe(false);
  });

  it("LEGÍTIMO: customerId sozinho também é prova de contato", () => {
    expect(precisaPedirWhatsAppParaFechar({
      identificacaoOpcional: true, customerId: "cus_1",
    })).toBe(false);
  });
});

describe("contrato do PedidoClient — o telefone informado precisa ser guardado", () => {
  it("a identificação grava o telefone em estado, não só no sessionStorage", () => {
    const fonte = ler(CHAT);
    expect(
      /function handlePhoneIdentified\([\s\S]{0,600}?setSessionCustomerPhone\(phone\)/.test(fonte),
      "`handlePhoneIdentified` precisa gravar o telefone informado em estado. " +
        "Sem isso ele só existe no sessionStorage, que é lido uma única vez no " +
        "mount — e nesta carga da página o cliente segue 'sem telefone'.",
    ).toBe(true);
  });

  it("o telefone efetivo considera as TRÊS origens, pelo helper compartilhado", () => {
    const fonte = ler(CHAT);
    expect(
      /const effectiveCustomerPhone = telefoneEfetivoDoCliente\(\{[\s\S]{0,240}?sessionPhone:\s*sessionCustomerPhone/.test(fonte),
      "`effectiveCustomerPhone` precisa vir de `telefoneEfetivoDoCliente` e " +
        "incluir `sessionCustomerPhone`. Reescrever a cadeia `??` inline devolve " +
        "o bug: era exatamente uma cadeia dessas que esquecia o telefone digitado.",
    ).toBe(true);
  });

  it("o portão do fechamento usa a regra testável, não uma condição solta", () => {
    const fonte = ler(CHAT);
    expect(
      /precisaPedirWhatsAppParaFechar\(\{/.test(fonte),
      "O `handleFinalizeClick` precisa perguntar pelo helper. Condição inline " +
        "não é testável neste runner (vitest em `environment: node`, sem DOM) — " +
        "e foi assim que o laço passou despercebido.",
    ).toBe(true);
    expect(
      /identificacaoOpcional && !effectiveCustomerPhone && !resolvedCustomerId/.test(fonte),
      "A condição antiga voltou ao arquivo. Ela ignora o telefone informado " +
        "nesta carga da página.",
    ).toBe(false);
  });

  it("'Trocar' apaga TODAS as origens do telefone, inclusive as de memória", () => {
    const fonte = ler(CHAT);
    const corpo = fonte.match(/function handleResetIdentity\(\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(corpo, "`handleResetIdentity` não foi encontrado.").not.toBe("");
    for (const limpeza of ["setStoredCustomer(null)", "setSessionCustomerPhone(null)"]) {
      expect(
        corpo.includes(limpeza),
        `"Trocar" precisa chamar \`${limpeza}\`. Apagar só o sessionStorage deixa ` +
          "a cópia em memória de pé, e a pessoa continua identificada com o " +
          "número que ela pediu para trocar.",
      ).toBe(true);
    }
  });

  it("a frase do portão continua saindo de UM lugar só", () => {
    const fonte = ler(CHAT);
    const ocorrencias = fonte.split("Pra fechar o pedido preciso do seu WhatsApp").length - 1;
    expect(
      ocorrencias,
      "Se esta frase passar a ser emitida de dois lugares, o balão repetido volta " +
        "— dessa vez por duplicação de verdade, e a investigação recomeça do zero.",
    ).toBe(1);
  });
});
