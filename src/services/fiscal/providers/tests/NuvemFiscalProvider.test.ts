/**
 * Nuvem Fiscal adapter — o mapeamento vendor-neutro → layout SEFAZ (infNFe) e o
 * cadastro da empresa. É o layout "cru", então travamos os campos que a SEFAZ
 * exige (mod 65, cUF, CSOSN×CST, tPag, totais).
 */

import { describe, it, expect } from "vitest";
import { mapPayloadToNuvem, buildEmpresaNuvem, mapNuvemStatus, UF_TO_CUF } from "../NuvemFiscalProvider";
import type { FiscalNFCePayload, FiscalCompanyRegistration } from "../types";

function payload(over: Partial<FiscalNFCePayload> = {}): FiscalNFCePayload {
  return {
    ambiente: "HOMOLOGACAO",
    serie: 1,
    numero: 42,
    emitente: {
      cnpj: "07.504.505/0001-32",
      inscricaoEstadual: "123.456.789",
      razaoSocial: "Restaurante Teste LTDA",
      nomeFantasia: "Foocci Sushi",
      regime: "SIMPLES_NACIONAL",
      endereco: {
        logradouro: "Rua X",
        numero: "100",
        bairro: "Centro",
        municipio: "São Paulo",
        municipioIbge: "3550308",
        uf: "SP",
        cep: "01000-000",
      },
      csc: { id: "000001", token: "CSC" },
    },
    destinatario: null,
    itens: [
      {
        codigo: "SKU1",
        descricao: "Hot Roll",
        quantidade: 2,
        valorUnitario: 10,
        valorTotal: 20,
        imposto: { origem: "0", ncm: "21069090", cfop: "5102", unidade: "UN", csosn: "102" },
      },
    ],
    valorFrete: 0,
    valorDesconto: 0,
    valorProdutos: 20,
    valorTotal: 20,
    pagamentos: [{ tipo: "PIX", valor: 20 }],
    ...over,
  };
}

describe("mapPayloadToNuvem — layout infNFe", () => {
  it("monta ide/emit e o item no padrão da SEFAZ (Simples/CSOSN)", () => {
    const inf = mapPayloadToNuvem(payload()) as any;
    expect(inf.ide.mod).toBe(65);
    expect(inf.ide.serie).toBe(1);
    expect(inf.ide.nNF).toBe(42);
    expect(inf.ide.cUF).toBe(35); // SP
    expect(inf.ide.tpAmb).toBe(2); // homologação
    expect(inf.emit.CNPJ).toBe("07504505000132"); // só dígitos
    expect(inf.emit.CRT).toBe(1); // Simples
    const item = inf.det[0];
    expect(item.prod.NCM).toBe("21069090");
    expect(item.prod.CFOP).toBe("5102");
    expect(item.imposto.ICMS.ICMSSN102.CSOSN).toBe("102");
    expect(inf.pag.detPag[0].tPag).toBe("17"); // PIX
    expect(inf.total.ICMSTot.vNF).toBe(20);
  });

  it("regime normal usa CST e pICMS", () => {
    const inf = mapPayloadToNuvem(
      payload({
        emitente: { ...payload().emitente, regime: "REGIME_NORMAL" },
        itens: [
          {
            codigo: "S2",
            descricao: "Refri",
            quantidade: 1,
            valorUnitario: 100,
            valorTotal: 100,
            imposto: { origem: "0", ncm: "22021000", cfop: "5405", unidade: "UN", cst: "00", icmsAliquota: 18 },
          },
        ],
        valorProdutos: 100,
        valorTotal: 100,
      }),
    ) as any;
    expect(inf.emit.CRT).toBe(3);
    expect(inf.det[0].imposto.ICMS.ICMS00.CST).toBe("00");
    expect(inf.det[0].imposto.ICMS.ICMS00.pICMS).toBe(18);
  });

  it("inclui CPF do destinatário quando informado", () => {
    const inf = mapPayloadToNuvem(payload({ destinatario: { cpf: "123.456.789-09" } })) as any;
    expect(inf.dest.CPF).toBe("12345678909");
  });
});

describe("buildEmpresaNuvem", () => {
  it("normaliza CNPJ/IE/CEP e mapa de regime + endereço", () => {
    const reg: FiscalCompanyRegistration = {
      cnpj: "07.504.505/0001-32",
      inscricaoEstadual: "123",
      razaoSocial: "Rest LTDA",
      regime: "SIMPLES_NACIONAL",
      endereco: { logradouro: "R X", numero: "1", bairro: "Centro", municipio: "SP", municipioIbge: "3550308", uf: "SP", cep: "01000-000" },
      certificadoBase64: "x",
      certificadoSenha: "y",
    };
    const b = buildEmpresaNuvem(reg) as any;
    expect(b.cpf_cnpj).toBe("07504505000132");
    expect(b.regime_tributario).toBe(1);
    expect(b.endereco.codigo_municipio).toBe("3550308");
    expect(b.endereco.cep).toBe("01000000");
  });
});

describe("mapNuvemStatus / UF_TO_CUF", () => {
  it("normaliza status e resolve cUF", () => {
    expect(mapNuvemStatus("autorizado")).toBe("AUTORIZADA");
    expect(mapNuvemStatus("processando")).toBe("PROCESSANDO");
    expect(mapNuvemStatus("rejeitado")).toBe("REJEITADA");
    expect(mapNuvemStatus("cancelado")).toBe("CANCELADA");
    expect(mapNuvemStatus("xpto")).toBe("ERRO");
    expect(UF_TO_CUF.SP).toBe(35);
    expect(UF_TO_CUF.RJ).toBe(33);
  });
});
