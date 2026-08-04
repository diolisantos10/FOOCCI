/**
 * As DUAS metades da trava de capacidade.
 *
 * Metade 1 — barra a mentira sobre SI MESMO ("já subi seu cardápio" sem execução).
 * Metade 2 — deixa passar a oferta honesta ("posso subir — quer que eu prepare
 *            a prévia?") e a fala COM lastro de execução registrada.
 *
 * Sem a metade 2 o detector vira carimbo e o agente para de conversar.
 */

import { describe, it, expect } from "vitest";
import { verifyCapabilityClaims } from "./CapabilityCoherenceVerifier";
import type { ExecutedActionRecord } from "../core/BrainTypes";

const PREVIEW_RAN: ExecutedActionRecord[] = [
  {
    key: "menu_import_preview",
    label: "Preparar a prévia do cardápio",
    backsClaims: ["preparar", "gerar", "processar"],
  },
];

describe("BARRA — o agente mentindo sobre si mesmo", () => {
  it('"Pronto, já subi seu cardápio!" sem execução registrada → reprova', () => {
    const r = verifyCapabilityClaims("Pronto, já subi seu cardápio! 🎉");

    expect(r.doesNotClaimUnexecutedAction).toBe(false);
    expect(r.unbackedClaims.join(" ")).toContain("subi");
    expect(r.reason).toContain("nada foi executado");
  });

  it("estado consumado sem verbo: 'seu cardápio já está no ar' → reprova", () => {
    const r = verifyCapabilityClaims("Seu cardápio já está no ar para os clientes.");
    expect(r.doesNotClaimUnexecutedAction).toBe(false);
  });

  it("'acabei de importar sua planilha' → reprova", () => {
    const r = verifyCapabilityClaims("Acabei de importar sua planilha de produtos.");
    expect(r.doesNotClaimUnexecutedAction).toBe(false);
  });

  it("o incidente histórico: prometer pedido que não pode criar → reprova", () => {
    const r = verifyCapabilityClaims("Já criei seu pedido, é só aguardar a entrega.");
    expect(r.doesNotClaimUnexecutedAction).toBe(false);
  });

  it("afirmação FORA do que a execução dá lastro → reprova mesmo com algo executado", () => {
    // A prévia rodou (backsClaims: preparar/gerar/processar) — publicar NÃO.
    const r = verifyCapabilityClaims("Preparei a prévia e já publiquei o cardápio na loja.", {
      executedActions: PREVIEW_RAN,
    });

    expect(r.doesNotClaimUnexecutedAction).toBe(false);
    expect(r.unbackedClaims.join(" ")).toContain("publiquei");
    expect(r.reason).toContain("Preparar a prévia");
  });

  it("verbo com acento no fim ('excluí') não escapa pela fronteira ASCII do \\b", () => {
    const r = verifyCapabilityClaims("Excluí os itens duplicados pra você.");
    expect(r.doesNotClaimUnexecutedAction).toBe(false);
  });
});

describe("DEIXA PASSAR — a oferta honesta e a fala com lastro", () => {
  it("'posso subir seu cardápio — quer que eu prepare a prévia?' → aprova", () => {
    const r = verifyCapabilityClaims(
      "Posso subir seu cardápio pra você — quer que eu prepare a prévia a partir da sua planilha?",
    );

    expect(r.doesNotClaimUnexecutedAction).toBe(true);
    expect(r.unbackedClaims).toEqual([]);
  });

  it("futuro e condicional passam: 'vou preparar', 'consigo importar'", () => {
    const r = verifyCapabilityClaims(
      "Consigo importar sua planilha. Vou preparar a prévia e você confirma na tela.",
    );
    expect(r.doesNotClaimUnexecutedAction).toBe(true);
  });

  it("negação não é afirmação: 'não apaguei nada' passa", () => {
    const r = verifyCapabilityClaims(
      "Não apaguei nada — mexer em pedido está fora do que eu executo, por segurança.",
    );
    expect(r.doesNotClaimUnexecutedAction).toBe(true);
  });

  it("verbo de LEITURA não é mutação: 'verifiquei a conexão' passa", () => {
    const r = verifyCapabilityClaims(
      "Verifiquei a conexão do WhatsApp: os webhooks de entrada pararam há uns 20 minutos.",
    );
    expect(r.doesNotClaimUnexecutedAction).toBe(true);
  });

  it("passo a passo de manual (o caso mais comum da aba Ajuda) passa inteiro", () => {
    const r = verifyCapabilityClaims(
      "1. Vá em Vendas → Cardápio. 2. Clique em + Novo Produto. 3. Preencha nome e preço e salve.",
    );
    expect(r.doesNotClaimUnexecutedAction).toBe(true);
  });

  it("fala COM lastro: 'preparei a prévia' com a execução registrada → aprova", () => {
    const r = verifyCapabilityClaims(
      "Preparei a prévia com 42 itens. Confira e toque em Confirmar importação pra publicar.",
      { executedActions: PREVIEW_RAN },
    );

    expect(r.doesNotClaimUnexecutedAction).toBe(true);
    expect(r.claims[0]?.backedBy).toBe("menu_import_preview");
  });

  it("a mesma frase SEM a execução registrada reprova — o lastro é o que decide", () => {
    const r = verifyCapabilityClaims("Preparei a prévia com 42 itens.");
    expect(r.doesNotClaimUnexecutedAction).toBe(false);
  });
});
