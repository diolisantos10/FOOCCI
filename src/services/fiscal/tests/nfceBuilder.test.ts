/**
 * NFC-e builder — the correctness core. Locks the tax-resolution cascade
 * (item → categoria → default global → fallback), the CSOSN-vs-CST choice by
 * regime, the payment-method mapping, and the pre-flight validation.
 */

import { describe, it, expect } from "vitest";
import {
  buildNFCePayload,
  buildEmitente,
  resolveItemImposto,
  mapPaymentMethodToFiscal,
  parseRegime,
  validateForEmit,
  type FiscalConfigLike,
  type NFCeBuildItem,
} from "../nfceBuilder";

function simplesConfig(over: Partial<FiscalConfigLike> = {}): FiscalConfigLike {
  return {
    cnpj: "07504505000132",
    inscricaoEstadual: "123456789",
    razaoSocial: "Restaurante Teste LTDA",
    nomeFantasia: "Foocci Sushi",
    regimeTributario: "SIMPLES_NACIONAL",
    fiscalLogradouro: "Rua X",
    fiscalNumero: "100",
    fiscalBairro: "Centro",
    fiscalMunicipio: "São Paulo",
    fiscalMunicipioIbge: "3550308",
    fiscalUf: "SP",
    fiscalCep: "01000000",
    defaultNcm: "21069090",
    defaultCfop: "5102",
    defaultCsosn: "102",
    defaultCst: null,
    defaultOrigem: "0",
    defaultUnidade: "UN",
    ...over,
  };
}

const item = (over: Partial<NFCeBuildItem> = {}): NFCeBuildItem => ({
  codigo: "SKU1",
  descricao: "Hot Roll",
  quantidade: 2,
  valorUnitario: 10,
  valorTotal: 20,
  ...over,
});

describe("mapPaymentMethodToFiscal", () => {
  it("maps every PaymentMethod enum value", () => {
    expect(mapPaymentMethodToFiscal("CASH")).toBe("DINHEIRO");
    expect(mapPaymentMethodToFiscal("CREDIT_CARD")).toBe("CREDITO");
    expect(mapPaymentMethodToFiscal("DEBIT_CARD")).toBe("DEBITO");
    expect(mapPaymentMethodToFiscal("PIX")).toBe("PIX");
    expect(mapPaymentMethodToFiscal("PIX_IN_PERSON")).toBe("PIX");
    expect(mapPaymentMethodToFiscal("CARD_MACHINE")).toBe("OUTRO");
    expect(mapPaymentMethodToFiscal("ONLINE")).toBe("OUTRO");
    expect(mapPaymentMethodToFiscal("anything-else")).toBe("OUTRO");
  });
});

describe("parseRegime", () => {
  it("defaults unknown/blank to Simples", () => {
    expect(parseRegime("REGIME_NORMAL")).toBe("REGIME_NORMAL");
    expect(parseRegime("SIMPLES_EXCESSO")).toBe("SIMPLES_EXCESSO");
    expect(parseRegime("SIMPLES_NACIONAL")).toBe("SIMPLES_NACIONAL");
    expect(parseRegime(null)).toBe("SIMPLES_NACIONAL");
    expect(parseRegime("garbage")).toBe("SIMPLES_NACIONAL");
  });
});

describe("resolveItemImposto — cascade item → categoria → default → fallback", () => {
  it("prefers the item value over category and default", () => {
    const imp = resolveItemImposto(
      item({ item: { ncm: "11111111" }, categoria: { ncm: "22222222" } }),
      simplesConfig({ defaultNcm: "33333333" }),
      "SIMPLES_NACIONAL",
    );
    expect(imp.ncm).toBe("11111111");
  });

  it("falls to category when the item has none", () => {
    const imp = resolveItemImposto(
      item({ categoria: { ncm: "22222222" } }),
      simplesConfig({ defaultNcm: "33333333" }),
      "SIMPLES_NACIONAL",
    );
    expect(imp.ncm).toBe("22222222");
  });

  it("falls to the config default when neither item nor category define it", () => {
    const imp = resolveItemImposto(item(), simplesConfig({ defaultNcm: "33333333" }), "SIMPLES_NACIONAL");
    expect(imp.ncm).toBe("33333333");
    expect(imp.cfop).toBe("5102");
    expect(imp.unidade).toBe("UN");
    expect(imp.origem).toBe("0");
  });

  it("uses the hard fallback when even the config default is blank", () => {
    const imp = resolveItemImposto(
      item(),
      simplesConfig({ defaultNcm: null, defaultCfop: "  " }),
      "SIMPLES_NACIONAL",
    );
    expect(imp.ncm).toBe("21069090");
    expect(imp.cfop).toBe("5102");
  });

  it("Simples → CSOSN set, CST absent", () => {
    const imp = resolveItemImposto(item(), simplesConfig(), "SIMPLES_NACIONAL");
    expect(imp.csosn).toBe("102");
    expect(imp.cst).toBeUndefined();
    expect(imp.icmsAliquota).toBeUndefined();
  });

  it("Regime normal → CST + item ICMS alíquota, CSOSN absent", () => {
    const imp = resolveItemImposto(
      item({ item: { cst: "00", icmsAliquota: 18 } }),
      simplesConfig({ regimeTributario: "REGIME_NORMAL", defaultCst: "00" }),
      "REGIME_NORMAL",
    );
    expect(imp.cst).toBe("00");
    expect(imp.icmsAliquota).toBe(18);
    expect(imp.csosn).toBeUndefined();
  });

  it("passes CEST through when present", () => {
    const imp = resolveItemImposto(item({ item: { cest: "0300100" } }), simplesConfig(), "SIMPLES_NACIONAL");
    expect(imp.cest).toBe("0300100");
  });
});

describe("buildEmitente", () => {
  it("maps identity + address + CSC from config", () => {
    const em = buildEmitente(simplesConfig(), { id: "1", token: "CSC" });
    expect(em.cnpj).toBe("07504505000132");
    expect(em.regime).toBe("SIMPLES_NACIONAL");
    expect(em.endereco.municipioIbge).toBe("3550308");
    expect(em.csc).toEqual({ id: "1", token: "CSC" });
  });
});

describe("buildNFCePayload", () => {
  const base = {
    config: simplesConfig(),
    csc: { id: "1", token: "CSC" },
    serie: 1,
    numero: 42,
    ambiente: "HOMOLOGACAO" as const,
    items: [item(), item({ codigo: "SKU2", descricao: "Temaki", quantidade: 1, valorUnitario: 15, valorTotal: 15 })],
    valorFrete: 5,
    valorDesconto: 0,
    valorTotal: 40,
    pagamentos: [{ method: "PIX", valor: 40 }],
  };

  it("sums item totals into valorProdutos and carries the order total", () => {
    const p = buildNFCePayload(base);
    expect(p.valorProdutos).toBe(35); // 20 + 15
    expect(p.valorTotal).toBe(40);
    expect(p.valorFrete).toBe(5);
    expect(p.itens).toHaveLength(2);
  });

  it("maps the payment method", () => {
    const p = buildNFCePayload(base);
    expect(p.pagamentos).toEqual([{ tipo: "PIX", valor: 40, bandeira: undefined }]);
  });

  it("omits destinatário without a CPF, includes it with one", () => {
    expect(buildNFCePayload(base).destinatario).toBeNull();
    const withCpf = buildNFCePayload({ ...base, destinatarioCpf: "12345678909" });
    expect(withCpf.destinatario).toEqual({ cpf: "12345678909", nome: undefined });
  });

  it("rounds money to 2 decimals", () => {
    const p = buildNFCePayload({
      ...base,
      items: [item({ valorUnitario: 3.333, quantidade: 3, valorTotal: 9.999 })],
      valorTotal: 9.999,
      valorFrete: 0,
      pagamentos: [{ method: "CASH", valor: 9.999 }],
    });
    expect(p.valorProdutos).toBe(10);
    expect(p.valorTotal).toBe(10);
    expect(p.pagamentos[0]!.valor).toBe(10);
  });

  it("supports split payments", () => {
    const p = buildNFCePayload({
      ...base,
      pagamentos: [
        { method: "CASH", valor: 20 },
        { method: "CREDIT_CARD", valor: 20, bandeira: "visa" },
      ],
    });
    expect(p.pagamentos.map((x) => x.tipo)).toEqual(["DINHEIRO", "CREDITO"]);
    expect(p.pagamentos[1]!.bandeira).toBe("visa");
  });
});

describe("validateForEmit", () => {
  it("is empty (ready) for a complete Simples config", () => {
    expect(validateForEmit(simplesConfig())).toEqual([]);
  });

  it("lists every missing identity/address requirement", () => {
    const missing = validateForEmit({ regimeTributario: "SIMPLES_NACIONAL", defaultCsosn: "102" } as FiscalConfigLike);
    expect(missing).toContain("CNPJ");
    expect(missing).toContain("Inscrição Estadual");
    expect(missing).toContain("Endereço: código IBGE do município");
    expect(missing).toContain("Endereço: UF");
  });

  it("requires CSOSN for Simples and CST for regime normal", () => {
    expect(validateForEmit(simplesConfig({ defaultCsosn: null }))).toContain("CSOSN padrão (Simples Nacional)");
    expect(
      validateForEmit(simplesConfig({ regimeTributario: "REGIME_NORMAL", defaultCsosn: null, defaultCst: null })),
    ).toContain("CST padrão (regime normal)");
  });
});
