/**
 * Focus NFe adapter — the fiscal-critical mapping (payload → Focus JSON, status
 * normalization) and the HTTP surface (emit/status/cancel/test) with fetch mocked.
 * If any of this drifts, real notes come out wrong — so it is locked here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FocusNFeProvider, mapPayloadToFocus, mapFocusStatus } from "../FocusNFeProvider";
import type { FiscalNFCePayload, FiscalPagamentoTipo } from "../types";

function basePayload(overrides: Partial<FiscalNFCePayload> = {}): FiscalNFCePayload {
  return {
    ambiente: "HOMOLOGACAO",
    serie: 1,
    numero: 42,
    emitente: {
      cnpj: "07504505000132",
      inscricaoEstadual: "123456789",
      razaoSocial: "Restaurante Teste LTDA",
      regime: "SIMPLES_NACIONAL",
      endereco: {
        logradouro: "Rua X",
        numero: "100",
        bairro: "Centro",
        municipio: "São Paulo",
        municipioIbge: "3550308",
        uf: "SP",
        cep: "01000000",
      },
      csc: { id: "000001", token: "CSC-SECRET" },
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
    valorFrete: 5,
    valorDesconto: 0,
    valorProdutos: 20,
    valorTotal: 25,
    pagamentos: [{ tipo: "PIX", valor: 25 }],
    ...overrides,
  };
}

function mockRes(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("mapPayloadToFocus — item mapping (Simples/CSOSN)", () => {
  it("maps the item fields the SEFAZ requires", () => {
    const nota = mapPayloadToFocus(basePayload());
    const items = nota.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    const it = items[0]!;
    expect(it.numero_item).toBe("1");
    expect(it.codigo_produto).toBe("SKU1");
    expect(it.cfop).toBe("5102");
    expect(it.ncm).toBe("21069090");
    expect(it.icms_origem).toBe("0");
    expect(it.icms_situacao_tributaria).toBe("102"); // CSOSN
    expect(it.unidade_comercial).toBe("UN");
    expect(it.quantidade_comercial).toBe(2);
    expect(it.valor_unitario_comercial).toBe(10);
    expect(it.valor_bruto_produtos).toBe(20);
    // Simples 102 carries no ICMS destaque
    expect(it.icms_aliquota).toBeUndefined();
  });

  it("carries the totals and emitter CNPJ", () => {
    const nota = mapPayloadToFocus(basePayload());
    expect(nota.cnpj_emitente).toBe("07504505000132");
    expect(nota.valor_frete).toBe(5);
    expect(nota.valor_produtos).toBe(20);
    expect(nota.valor_total).toBe(25);
    expect(nota.presenca_comprador).toBe("1");
  });
});

describe("mapPayloadToFocus — pagamentos (tPag)", () => {
  const cases: Array<[FiscalPagamentoTipo, string]> = [
    ["DINHEIRO", "01"],
    ["CREDITO", "03"],
    ["DEBITO", "04"],
    ["PIX", "17"],
    ["OUTRO", "99"],
  ];
  for (const [tipo, code] of cases) {
    it(`${tipo} → forma_pagamento ${code}`, () => {
      const nota = mapPayloadToFocus(basePayload({ pagamentos: [{ tipo, valor: 25 }] }));
      const fp = nota.formas_pagamento as Array<Record<string, unknown>>;
      expect(fp[0]!.forma_pagamento).toBe(code);
      expect(fp[0]!.valor_pagamento).toBe(25);
    });
  }
});

describe("mapPayloadToFocus — destinatário (CPF na nota)", () => {
  it("omits CPF when there is no recipient", () => {
    const nota = mapPayloadToFocus(basePayload());
    expect(nota.cpf_destinatario).toBeUndefined();
  });
  it("includes CPF when informed", () => {
    const nota = mapPayloadToFocus(basePayload({ destinatario: { cpf: "12345678909" } }));
    expect(nota.cpf_destinatario).toBe("12345678909");
  });
});

describe("mapPayloadToFocus — regime normal (CST + ICMS destaque)", () => {
  it("emits CST and computes ICMS from the alíquota", () => {
    const nota = mapPayloadToFocus(
      basePayload({
        itens: [
          {
            codigo: "SKU2",
            descricao: "Refri",
            quantidade: 1,
            valorUnitario: 100,
            valorTotal: 100,
            imposto: { origem: "0", ncm: "22021000", cfop: "5405", unidade: "UN", cst: "00", icmsAliquota: 18 },
          },
        ],
      }),
    );
    const it = (nota.items as Array<Record<string, unknown>>)[0]!;
    expect(it.icms_situacao_tributaria).toBe("00"); // CST
    expect(it.icms_aliquota).toBe(18);
    expect(it.icms_valor).toBe(18); // 18% de 100
  });
});

describe("mapFocusStatus", () => {
  it("normalizes the gateway statuses", () => {
    expect(mapFocusStatus("autorizado")).toBe("AUTORIZADA");
    expect(mapFocusStatus("processando_autorizacao")).toBe("PROCESSANDO");
    expect(mapFocusStatus("erro_autorizacao")).toBe("REJEITADA");
    expect(mapFocusStatus("denegado")).toBe("REJEITADA");
    expect(mapFocusStatus("cancelado")).toBe("CANCELADA");
    expect(mapFocusStatus("whatever")).toBe("ERRO");
    expect(mapFocusStatus(undefined)).toBe("ERRO");
  });
});

describe("FocusNFeProvider — HTTP surface", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("emit posts to the homologação host with ?ref and Basic auth, and parses authorization", async () => {
    fetchMock.mockResolvedValue(
      mockRes(200, { status: "autorizado", chave_nfe: "3520".padEnd(44, "9"), protocolo: "135240000", numero: 42, serie: 1 }),
    );
    const p = new FocusNFeProvider("TESTTOKEN", "HOMOLOGACAO");
    const res = await p.emitNFCe("doc_1", basePayload());

    expect(res.status).toBe("AUTORIZADA");
    expect(res.chave).toHaveLength(44);
    expect(res.protocolo).toBe("135240000");
    expect(res.numero).toBe(42);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://homologacao.focusnfe.com.br/v2/nfce?ref=doc_1");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Basic " + Buffer.from("TESTTOKEN:").toString("base64"));
  });

  it("emit surfaces a 422 validation failure as REJEITADA (no throw)", async () => {
    fetchMock.mockResolvedValue(mockRes(422, { codigo: "erro", mensagem: "NCM inválido" }));
    const p = new FocusNFeProvider("T", "HOMOLOGACAO");
    const res = await p.emitNFCe("doc_2", basePayload());
    expect(res.status).toBe("REJEITADA");
    expect(res.rejeicao?.motivo).toBe("NCM inválido");
  });

  it("emit surfaces a 500 as retryable ERRO", async () => {
    fetchMock.mockResolvedValue(mockRes(500, { mensagem: "indisponível" }));
    const p = new FocusNFeProvider("T", "HOMOLOGACAO");
    const res = await p.emitNFCe("doc_3", basePayload());
    expect(res.status).toBe("ERRO");
  });

  it("getStatus reads from the production host when configured", async () => {
    fetchMock.mockResolvedValue(mockRes(200, { status: "autorizado", chave_nfe: "x".repeat(44) }));
    const p = new FocusNFeProvider("T", "PRODUCAO");
    const res = await p.getStatus("doc_4");
    expect(res.status).toBe("AUTORIZADA");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.focusnfe.com.br/v2/nfce/doc_4?completa=1");
    expect(init.method).toBe("GET");
  });

  it("cancel sends DELETE with the justificativa and reports CANCELADA", async () => {
    fetchMock.mockResolvedValue(mockRes(200, { status: "cancelado", protocolo: "999" }));
    const p = new FocusNFeProvider("T", "HOMOLOGACAO");
    const res = await p.cancel("doc_5", "Cancelamento por erro de digitação do pedido");
    expect(res.status).toBe("CANCELADA");
    expect(res.protocolo).toBe("999");
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ justificativa: "Cancelamento por erro de digitação do pedido" });
  });

  it("testConnection: 403 → invalid token, 404 → token OK", async () => {
    fetchMock.mockResolvedValueOnce(mockRes(403, {}));
    const bad = await new FocusNFeProvider("BAD", "HOMOLOGACAO").testConnection();
    expect(bad.ok).toBe(false);

    fetchMock.mockResolvedValueOnce(mockRes(404, { codigo: "nao_encontrado" }));
    const good = await new FocusNFeProvider("GOOD", "HOMOLOGACAO").testConnection();
    expect(good.ok).toBe(true);
  });
});
