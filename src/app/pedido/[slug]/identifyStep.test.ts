import { describe, it, expect } from "vitest";
import { decidirIdentify } from "./identifyStep";

describe("Loja — resposta do identify", () => {
  it("cliente que veio pelo link da campanha NÃO perde o id (cupom e atribuição dependem dele)", () => {
    // O identify nunca devolve customerId.
    const d = decidirIdentify({ found: true, name: "Ana" }, "cust-da-campanha", "");
    expect(d).toEqual({ acao: "seguir", custId: "cust-da-campanha", nome: "Ana" });
  });

  it("cadastro encontrado sem nome legível pede o nome", () => {
    expect(decidirIdentify({ found: true }, "c1", "")).toEqual({ acao: "pedirNome" });
  });

  it("cliente novo que digitou o nome segue para o pagamento (não fica preso)", () => {
    const d = decidirIdentify({ found: false, name: "Bruno" }, null, "Bruno Lima");
    expect(d).toEqual({ acao: "seguir", custId: null, nome: "Bruno Lima" });
  });

  it("telefone sem cadastro e sem nome pede o nome", () => {
    expect(decidirIdentify({ found: false }, null, "")).toEqual({ acao: "pedirNome" });
  });
});
