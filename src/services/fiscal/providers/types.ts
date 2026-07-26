/**
 * Fiscal provider abstraction — the seam that lets Foocci emit NFC-e through a
 * homologated gateway (Focus NFe first) without hard-wiring one vendor.
 *
 * Mirrors the payment provider seam (src/services/payment/providers/types.ts):
 * a small, vendor-neutral interface + a normalized payload. The BUILDER
 * (Etapa 2) turns an Order into a `FiscalNFCePayload` that knows nothing about
 * any gateway; each adapter maps that payload to its vendor's API.
 *
 * NFC-e (modelo 65) is an async-ish flow, like a Pix charge: submit → get a
 * reference → the SEFAZ authorizes → we poll/receive the result.
 */

export type FiscalEnvironment = "HOMOLOGACAO" | "PRODUCAO";

/** CRT (Código de Regime Tributário) — drives CSOSN (Simples) vs CST (Normal). */
export type FiscalRegime = "SIMPLES_NACIONAL" | "SIMPLES_EXCESSO" | "REGIME_NORMAL";

export interface FiscalEndereco {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  municipioIbge: string; // código IBGE 7 díg — obrigatório na NFC-e
  uf: string;
  cep: string;
}

export interface FiscalEmitente {
  cnpj: string;
  inscricaoEstadual: string;
  razaoSocial: string;
  nomeFantasia?: string;
  regime: FiscalRegime;
  endereco: FiscalEndereco;
  /** CSC (Código de Segurança do Contribuinte) — obrigatório p/ o QR da NFC-e. */
  csc?: { id: string; token: string };
}

/** Tributação de um item já resolvida (item → categoria → default global). */
export interface FiscalItemImposto {
  origem: string; // 0 = nacional
  ncm: string; // 8 díg
  cfop: string; // ex.: 5102
  cest?: string;
  unidade: string; // ex.: UN
  /** Simples Nacional (CSOSN, ex.: 102, 500). Mutuamente exclusivo com `cst`. */
  csosn?: string;
  /** Regime normal (CST ICMS, ex.: 00, 60). */
  cst?: string;
  /** Alíquota ICMS % (regime normal). */
  icmsAliquota?: number;
}

export interface FiscalItem {
  codigo: string; // código do produto (id/código interno)
  descricao: string;
  quantidade: number;
  valorUnitario: number; // BRL
  valorTotal: number; // BRL (quantidade × unitário)
  imposto: FiscalItemImposto;
}

/** Formas de pagamento normalizadas — o adapter mapeia p/ o código do vendor. */
export type FiscalPagamentoTipo = "DINHEIRO" | "CREDITO" | "DEBITO" | "PIX" | "OUTRO";

export interface FiscalPagamento {
  tipo: FiscalPagamentoTipo;
  valor: number; // BRL
  bandeira?: string; // cartão (opcional)
}

/** Payload NFC-e vendor-neutro montado pelo builder (Etapa 2). */
export interface FiscalNFCePayload {
  ambiente: FiscalEnvironment;
  serie: number;
  numero: number;
  emitente: FiscalEmitente;
  /** "CPF na nota" — opcional. */
  destinatario?: { cpf?: string; nome?: string } | null;
  itens: FiscalItem[];
  valorFrete: number;
  valorDesconto: number;
  valorProdutos: number;
  valorTotal: number;
  pagamentos: FiscalPagamento[];
  informacoesAdicionais?: string;
}

/** Status normalizado entre gateways. */
export type FiscalStatus = "PROCESSANDO" | "AUTORIZADA" | "REJEITADA" | "CANCELADA" | "ERRO";

export interface FiscalRejeicao {
  codigo?: string;
  motivo?: string;
}

export interface FiscalEmitResult {
  providerName: string;
  providerRef: string; // referência no gateway p/ consultar depois
  status: FiscalStatus;
  // Presentes quando já autorizada:
  chave?: string; // 44 díg
  protocolo?: string;
  numero?: number;
  serie?: number;
  xmlUrl?: string;
  danfceUrl?: string;
  qrCodeData?: string;
  urlConsulta?: string;
  rejeicao?: FiscalRejeicao;
  /** Resposta bruta do gateway — só p/ logs/suporte. */
  raw?: unknown;
}

export type FiscalStatusResult = FiscalEmitResult;

export interface FiscalCancelResult {
  providerName: string;
  status: "CANCELADA" | "ERRO";
  protocolo?: string;
  rejeicao?: FiscalRejeicao;
  raw?: unknown;
}

export interface FiscalConnectionResult {
  ok: boolean;
  message: string;
}

/**
 * A fiscal gateway adapter. Vendor-neutral surface used by the emission engine
 * (Etapa 4) and the settings "testar conexão" (Etapa 3).
 */
export interface FiscalProvider {
  readonly name: string;
  /**
   * Submit an NFC-e for authorization. `referenceId` is our idempotency key
   * (the FiscalDocument id) — re-sending the same ref must NOT double-emit.
   */
  emitNFCe(referenceId: string, payload: FiscalNFCePayload): Promise<FiscalEmitResult>;
  /** Poll the authorization result by the reference used on emit. */
  getStatus(referenceId: string): Promise<FiscalStatusResult>;
  /** Cancel an authorized NFC-e (justificativa ≥ 15 chars, regra da SEFAZ). */
  cancel(referenceId: string, justificativa: string): Promise<FiscalCancelResult>;
  /** Cheap credential/connectivity check for the painel. */
  testConnection(): Promise<FiscalConnectionResult>;
  /**
   * Register/update the emitter company (+ A1 certificate) at the gateway.
   * Modelo conta-mãe: usado com o token-mestre da Foocci; cria a "empresa" do
   * lojista sob a conta parceiro da Foocci.
   */
  registerCompany(reg: FiscalCompanyRegistration): Promise<FiscalCompanyResult>;
}

/** Dados da empresa emitente + certificado A1 enviados ao gateway. */
export interface FiscalCompanyRegistration {
  cnpj: string;
  inscricaoEstadual: string;
  razaoSocial: string;
  nomeFantasia?: string;
  regime: FiscalRegime;
  endereco: FiscalEndereco;
  email?: string;
  /** Conteúdo do .pfx/.p12 em base64. */
  certificadoBase64: string;
  certificadoSenha: string;
  habilitaNfce?: boolean;
  csc?: { id: string; token: string };
}

export interface FiscalCompanyResult {
  ok: boolean;
  companyRef?: string; // referência da empresa no gateway
  certificadoNome?: string;
  certificadoValidadeAte?: string; // ISO-8601
  message: string;
  raw?: unknown;
}
