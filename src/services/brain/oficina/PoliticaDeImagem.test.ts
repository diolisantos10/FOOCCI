import { describe, it, expect } from "vitest";

import {
  autorizacaoCobre,
  decidirImagem,
  VALIDADE_DA_AUTORIZACAO_DIAS,
  type AutorizacaoDoLojista,
} from "./PoliticaDeImagem";

const AGORA = new Date("2026-07-25T12:00:00Z");

function autorizacao(over: Partial<AutorizacaoDoLojista> = {}): AutorizacaoDoLojista {
  return {
    por: "Zé (dono)",
    em: "2026-07-20T10:00:00Z",
    escopo: "gerar imagem ilustrativa do Burger do Chef",
    ...over,
  };
}

// ── O caminho padrão: o insumo do cliente ganha ─────────────────────────────

describe("decidirImagem — o insumo do cliente", () => {
  it("tendo foto do prato, realça — nunca substitui", () => {
    const d = decidirImagem({ categoria: "prato", temMidiaPropria: true, escopoPedido: "Burger do Chef", agora: AGORA });
    expect(d.caminho).toBe("realce");
    expect(d.exigeSelo).toBe(false);
  });

  it("foto própria ganha até de uma autorização pra gerar", () => {
    const d = decidirImagem({
      categoria: "prato", temMidiaPropria: true, escopoPedido: "Burger do Chef",
      autorizacao: autorizacao(), agora: AGORA,
    });
    expect(d.caminho).toBe("realce");
  });

  it("ambiente com foto também vai pro realce", () => {
    const d = decidirImagem({ categoria: "ambiente", temMidiaPropria: true, escopoPedido: "salão", agora: AGORA });
    expect(d.caminho).toBe("realce");
  });
});

// ── O bloqueio padrão ───────────────────────────────────────────────────────

describe("decidirImagem — sem mídia e sem pedido do lojista", () => {
  it("prato sem foto e sem autorização é BLOQUEADO", () => {
    const d = decidirImagem({ categoria: "prato", temMidiaPropria: false, escopoPedido: "Burger do Chef", agora: AGORA });
    expect(d.caminho).toBe("bloqueado");
    expect(d.permitido).toBe(false);
  });

  it("bloqueio sempre explica a saída — nunca deixa o lojista sem caminho", () => {
    const d = decidirImagem({ categoria: "prato", temMidiaPropria: false, escopoPedido: "Burger do Chef", agora: AGORA });
    expect(d.saida).toMatch(/envie uma foto/i);
    expect(d.saida).toContain("Burger do Chef");
  });

  it("ambiente sem foto e sem autorização também é bloqueado", () => {
    const d = decidirImagem({ categoria: "ambiente", temMidiaPropria: false, escopoPedido: "fachada", agora: AGORA });
    expect(d.caminho).toBe("bloqueado");
  });
});

// ── A exceção que só o lojista abre ─────────────────────────────────────────

describe("decidirImagem — a exceção do lojista", () => {
  it("sem foto + pedido explícito do lojista libera a geração", () => {
    const d = decidirImagem({
      categoria: "prato", temMidiaPropria: false, escopoPedido: "Burger do Chef",
      autorizacao: autorizacao(), agora: AGORA,
    });
    expect(d.caminho).toBe("geracao");
    expect(d.permitido).toBe(true);
  });

  it("toda imagem gerada de prato SAI COM SELO de ilustrativa", () => {
    const d = decidirImagem({
      categoria: "prato", temMidiaPropria: false, escopoPedido: "Burger do Chef",
      autorizacao: autorizacao(), agora: AGORA,
    });
    expect(d.exigeSelo).toBe(true);
  });

  it("o motivo registra QUEM autorizou — a decisão fica auditável", () => {
    const d = decidirImagem({
      categoria: "prato", temMidiaPropria: false, escopoPedido: "Burger do Chef",
      autorizacao: autorizacao(), agora: AGORA,
    });
    expect(d.motivo).toContain("Zé (dono)");
  });
});

// ── A autorização é por item, não em bloco ──────────────────────────────────

describe("autorizacaoCobre", () => {
  it("autorizar um prato NÃO libera outro", () => {
    const r = autorizacaoCobre(autorizacao(), "Picanha na Chapa", AGORA);
    expect(r.vale).toBe(false);
    expect(r.motivo).toMatch(/não cobre/i);
  });

  it("ignora acento e caixa ao comparar o escopo", () => {
    const r = autorizacaoCobre(autorizacao({ escopo: "GERAR IMAGEM DO BÚRGER DO CHEFE" }), "búrger do chefe", AGORA);
    expect(r.vale).toBe(true);
  });

  it("autorização vencida não vale", () => {
    const velha = autorizacao({ em: "2026-01-01T10:00:00Z" });
    const r = autorizacaoCobre(velha, "Burger do Chef", AGORA);
    expect(r.vale).toBe(false);
    expect(r.motivo).toMatch(/vencida/);
  });

  it("aceita autorização dentro do prazo", () => {
    const limite = new Date(AGORA.getTime() - (VALIDADE_DA_AUTORIZACAO_DIAS - 1) * 86_400_000);
    const r = autorizacaoCobre(autorizacao({ em: limite.toISOString() }), "Burger do Chef", AGORA);
    expect(r.vale).toBe(true);
  });

  it("data no futuro não vale — relógio adulterado não destrava", () => {
    const r = autorizacaoCobre(autorizacao({ em: "2027-01-01T00:00:00Z" }), "Burger do Chef", AGORA);
    expect(r.vale).toBe(false);
    expect(r.motivo).toMatch(/futuro/);
  });

  it("autorização sem autor não vale", () => {
    expect(autorizacaoCobre(autorizacao({ por: "  " }), "Burger do Chef", AGORA).vale).toBe(false);
  });

  it("autorização sem data válida não vale", () => {
    expect(autorizacaoCobre(autorizacao({ em: "ontem" }), "Burger do Chef", AGORA).vale).toBe(false);
  });

  it("autorização com escopo vazio não vale — genérica é como não ter", () => {
    expect(autorizacaoCobre(autorizacao({ escopo: "" }), "Burger do Chef", AGORA).vale).toBe(false);
  });

  it("ausência de autorização não vale", () => {
    expect(autorizacaoCobre(null, "Burger do Chef", AGORA).vale).toBe(false);
    expect(autorizacaoCobre(undefined, "Burger do Chef", AGORA).vale).toBe(false);
  });
});

// ── Grafismo e pessoa ───────────────────────────────────────────────────────

describe("decidirImagem — grafismo e pessoa", () => {
  it("grafismo é livre: não retrata prato nem lugar real", () => {
    const d = decidirImagem({ categoria: "grafismo", temMidiaPropria: false, escopoPedido: "fundo de dia dos pais", agora: AGORA });
    expect(d.caminho).toBe("geracao");
    expect(d.exigeSelo).toBe(false);
  });

  it("pessoa NUNCA é gerada — nem com autorização do lojista", () => {
    const d = decidirImagem({
      categoria: "pessoa", temMidiaPropria: false, escopoPedido: "cliente sorrindo",
      autorizacao: autorizacao({ escopo: "cliente sorrindo" }), agora: AGORA,
    });
    expect(d.caminho).toBe("bloqueado");
    expect(d.motivo).toMatch(/nem com autorização/i);
    expect(d.saida).toMatch(/cessão de imagem/i);
  });

  it("pessoa é barrada mesmo tendo mídia própria no pedido de geração", () => {
    // Ter foto de pessoa é caso de realce por outro caminho — a política de
    // GERAÇÃO nunca libera pessoa, e é isso que este teste tranca.
    const d = decidirImagem({ categoria: "pessoa", temMidiaPropria: true, escopoPedido: "equipe", agora: AGORA });
    expect(d.caminho).toBe("bloqueado");
  });
});
