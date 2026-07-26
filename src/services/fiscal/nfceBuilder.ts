/**
 * NFC-e builder — the pure heart of fiscal correctness.
 *
 * Turns an order (+ items + payment + the restaurant's FiscalConfig) into the
 * vendor-neutral `FiscalNFCePayload` the provider adapter transmits. Everything
 * here is a pure function of its inputs — no Prisma, no fetch — so the tax
 * resolution (item → categoria → default global), the CSOSN-vs-CST choice by
 * regime, and the payment-method mapping are all locked by unit tests. If a real
 * note ever comes out wrong, the bug is reproducible here first.
 */

import type {
  FiscalNFCePayload,
  FiscalEmitente,
  FiscalItem,
  FiscalItemImposto,
  FiscalRegime,
  FiscalEnvironment,
  FiscalPagamentoTipo,
} from "./providers/types";

/** A set of fiscal overrides at one level (item OR categoria). */
export interface FiscalFieldSet {
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  csosn?: string | null;
  cst?: string | null;
  origem?: string | null;
  unidade?: string | null;
  icmsAliquota?: number | null;
}

/** Structural subset of Prisma's FiscalConfig — passing the real row just works. */
export interface FiscalConfigLike {
  cnpj?: string | null;
  inscricaoEstadual?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  regimeTributario: string;
  fiscalLogradouro?: string | null;
  fiscalNumero?: string | null;
  fiscalComplemento?: string | null;
  fiscalBairro?: string | null;
  fiscalMunicipio?: string | null;
  fiscalMunicipioIbge?: string | null;
  fiscalUf?: string | null;
  fiscalCep?: string | null;
  defaultNcm?: string | null;
  defaultCfop?: string | null;
  defaultCsosn?: string | null;
  defaultCst?: string | null;
  defaultOrigem?: string | null;
  defaultUnidade?: string | null;
}

export interface NFCeBuildItem {
  codigo: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  item?: FiscalFieldSet | null; // item-level overrides
  categoria?: FiscalFieldSet | null; // category-level overrides
}

export interface NFCeBuildPayment {
  method: string; // Prisma PaymentMethod
  valor: number;
  bandeira?: string;
}

export interface NFCeBuildInput {
  config: FiscalConfigLike;
  csc: { id: string; token: string } | null;
  serie: number;
  numero: number;
  ambiente: FiscalEnvironment;
  items: NFCeBuildItem[];
  valorFrete: number;
  valorDesconto: number;
  valorTotal: number;
  pagamentos: NFCeBuildPayment[];
  destinatarioCpf?: string | null;
  destinatarioNome?: string | null;
  informacoesAdicionais?: string;
}

/** Fallbacks used only when neither product, category, nor config define a value. */
const HARD_DEFAULTS = {
  ncm: "21069090", // preparações alimentícias diversas
  cfop: "5102", // venda de mercadoria adquirida/recebida de terceiros
  csosn: "102", // Simples sem permissão de crédito
  cst: "00", // tributada integralmente (regime normal)
  origem: "0", // nacional
  unidade: "UN",
} as const;

export function parseRegime(s: string | null | undefined): FiscalRegime {
  switch (s) {
    case "REGIME_NORMAL":
      return "REGIME_NORMAL";
    case "SIMPLES_EXCESSO":
      return "SIMPLES_EXCESSO";
    default:
      return "SIMPLES_NACIONAL";
  }
}

/** Prisma PaymentMethod → NFC-e payment kind (tPag family). */
export function mapPaymentMethodToFiscal(method: string): FiscalPagamentoTipo {
  switch (method) {
    case "CASH":
      return "DINHEIRO";
    case "CREDIT_CARD":
      return "CREDITO";
    case "DEBIT_CARD":
      return "DEBITO";
    case "PIX":
    case "PIX_IN_PERSON":
      return "PIX";
    // CARD_MACHINE (tipo do cartão desconhecido) e ONLINE genérico → outros.
    default:
      return "OUTRO";
  }
}

const clean = (v: string | null | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/**
 * Resolve one item's imposto with the cascade item → categoria → default global
 * → hard fallback, choosing CSOSN (Simples) or CST (Normal) by the regime.
 */
export function resolveItemImposto(
  item: NFCeBuildItem,
  config: FiscalConfigLike,
  regime: FiscalRegime,
): FiscalItemImposto {
  const lv = item.item ?? {};
  const cat = item.categoria ?? {};
  const pick = (k: keyof FiscalFieldSet): string | undefined =>
    clean(lv[k] as string | null | undefined) ?? clean(cat[k] as string | null | undefined);

  const ncm = pick("ncm") ?? clean(config.defaultNcm) ?? HARD_DEFAULTS.ncm;
  const cfop = pick("cfop") ?? clean(config.defaultCfop) ?? HARD_DEFAULTS.cfop;
  const origem = pick("origem") ?? clean(config.defaultOrigem) ?? HARD_DEFAULTS.origem;
  const unidade = pick("unidade") ?? clean(config.defaultUnidade) ?? HARD_DEFAULTS.unidade;
  const cest = pick("cest");

  const imposto: FiscalItemImposto = { origem, ncm, cfop, unidade };
  if (cest) imposto.cest = cest;

  if (regime === "REGIME_NORMAL") {
    imposto.cst = pick("cst") ?? clean(config.defaultCst) ?? HARD_DEFAULTS.cst;
    const aliq = lv.icmsAliquota;
    if (aliq != null && Number.isFinite(aliq)) imposto.icmsAliquota = aliq;
  } else {
    imposto.csosn = pick("csosn") ?? clean(config.defaultCsosn) ?? HARD_DEFAULTS.csosn;
  }
  return imposto;
}

/** Build the emitente block from the restaurant's fiscal config. */
export function buildEmitente(
  config: FiscalConfigLike,
  csc: { id: string; token: string } | null,
): FiscalEmitente {
  return {
    cnpj: clean(config.cnpj) ?? "",
    inscricaoEstadual: clean(config.inscricaoEstadual) ?? "",
    razaoSocial: clean(config.razaoSocial) ?? "",
    nomeFantasia: clean(config.nomeFantasia),
    regime: parseRegime(config.regimeTributario),
    endereco: {
      logradouro: clean(config.fiscalLogradouro) ?? "",
      numero: clean(config.fiscalNumero) ?? "",
      complemento: clean(config.fiscalComplemento),
      bairro: clean(config.fiscalBairro) ?? "",
      municipio: clean(config.fiscalMunicipio) ?? "",
      municipioIbge: clean(config.fiscalMunicipioIbge) ?? "",
      uf: clean(config.fiscalUf) ?? "",
      cep: clean(config.fiscalCep) ?? "",
    },
    csc: csc ?? undefined,
  };
}

/** Assemble the full vendor-neutral NFC-e payload. Pure. */
export function buildNFCePayload(input: NFCeBuildInput): FiscalNFCePayload {
  const regime = parseRegime(input.config.regimeTributario);
  const itens: FiscalItem[] = input.items.map((it) => ({
    codigo: it.codigo,
    descricao: it.descricao,
    quantidade: it.quantidade,
    valorUnitario: it.valorUnitario,
    valorTotal: it.valorTotal,
    imposto: resolveItemImposto(it, input.config, regime),
  }));

  const valorProdutos = round2(itens.reduce((s, it) => s + it.valorTotal, 0));

  return {
    ambiente: input.ambiente,
    serie: input.serie,
    numero: input.numero,
    emitente: buildEmitente(input.config, input.csc),
    destinatario: input.destinatarioCpf
      ? { cpf: input.destinatarioCpf, nome: input.destinatarioNome ?? undefined }
      : null,
    itens,
    valorFrete: round2(input.valorFrete),
    valorDesconto: round2(input.valorDesconto),
    valorProdutos,
    valorTotal: round2(input.valorTotal),
    pagamentos: input.pagamentos.map((p) => ({
      tipo: mapPaymentMethodToFiscal(p.method),
      valor: round2(p.valor),
      bandeira: p.bandeira,
    })),
    informacoesAdicionais: input.informacoesAdicionais,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Pre-flight check: the identity/defaults a valid NFC-e needs. Returns the list
 * of MISSING requirements (empty = ready). The engine blocks emission with this,
 * and the painel shows it so the owner knows exactly what to fill.
 */
export function validateForEmit(config: FiscalConfigLike): string[] {
  const missing: string[] = [];
  const need = (v: string | null | undefined, label: string) => {
    if (!clean(v)) missing.push(label);
  };
  need(config.cnpj, "CNPJ");
  need(config.inscricaoEstadual, "Inscrição Estadual");
  need(config.razaoSocial, "Razão social");
  need(config.fiscalLogradouro, "Endereço: logradouro");
  need(config.fiscalNumero, "Endereço: número");
  need(config.fiscalBairro, "Endereço: bairro");
  need(config.fiscalMunicipio, "Endereço: município");
  need(config.fiscalMunicipioIbge, "Endereço: código IBGE do município");
  need(config.fiscalUf, "Endereço: UF");
  need(config.fiscalCep, "Endereço: CEP");
  const regime = parseRegime(config.regimeTributario);
  if (regime === "REGIME_NORMAL") {
    if (!clean(config.defaultCst)) missing.push("CST padrão (regime normal)");
  } else {
    if (!clean(config.defaultCsosn)) missing.push("CSOSN padrão (Simples Nacional)");
  }
  return missing;
}
