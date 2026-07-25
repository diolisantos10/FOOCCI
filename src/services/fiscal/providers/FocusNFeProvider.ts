/**
 * Focus NFe adapter — first concrete FiscalProvider.
 *
 * Focus NFe is a homologated gateway: you upload the A1 certificate THERE, and
 * we POST a plain JSON note over REST. It signs the XML, transmits to the SEFAZ,
 * and hands back the authorization (chave, protocolo, DANFCE, QR). This keeps
 * Foocci out of SOAP / XML-signing / 27-state-webservice hell.
 *
 * API (v2):
 *   emit    POST   /v2/nfce?ref=REF        body = nota JSON
 *   status  GET    /v2/nfce/REF?completa=1
 *   cancel  DELETE /v2/nfce/REF            body = { justificativa }
 * Auth: HTTP Basic, token as username, empty password.
 * Envs: homologação → homologacao.focusnfe.com.br · produção → api.focusnfe.com.br
 *
 * The `mapPayloadToFocus` / `mapFocusStatus` helpers are pure and exported so the
 * fiscal-critical mapping is unit-tested without touching the network.
 */

import type {
  FiscalProvider,
  FiscalNFCePayload,
  FiscalEmitResult,
  FiscalStatusResult,
  FiscalCancelResult,
  FiscalConnectionResult,
  FiscalStatus,
  FiscalEnvironment,
  FiscalPagamentoTipo,
  FiscalCompanyRegistration,
  FiscalCompanyResult,
  FiscalRegime,
} from "./types";

const BASE_URLS: Record<FiscalEnvironment, string> = {
  HOMOLOGACAO: "https://homologacao.focusnfe.com.br",
  PRODUCAO: "https://api.focusnfe.com.br",
};

/** Foocci tipo → Focus/SEFAZ `forma_pagamento` (tPag). */
const PAGAMENTO_FOCUS: Record<FiscalPagamentoTipo, string> = {
  DINHEIRO: "01",
  CREDITO: "03",
  DEBITO: "04",
  PIX: "17",
  OUTRO: "99",
};

/** Round to 2 decimals as a number (Focus accepts JSON numbers). */
function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Vendor-neutral payload → Focus NFe nota JSON. Pure — unit-tested.
 * ICMS: Simples fills `icms_situacao_tributaria` with the CSOSN; regime normal
 * uses the CST plus alíquota/base fields.
 */
export function mapPayloadToFocus(p: FiscalNFCePayload): Record<string, unknown> {
  const items = p.itens.map((it, i) => {
    const imp = it.imposto;
    const base: Record<string, unknown> = {
      numero_item: String(i + 1),
      codigo_produto: it.codigo,
      descricao: it.descricao,
      cfop: imp.cfop,
      unidade_comercial: imp.unidade,
      quantidade_comercial: it.quantidade,
      valor_unitario_comercial: money(it.valorUnitario),
      valor_bruto_produtos: money(it.valorTotal),
      unidade_tributavel: imp.unidade,
      quantidade_tributavel: it.quantidade,
      valor_unitario_tributacao: money(it.valorUnitario),
      ncm: imp.ncm,
      icms_origem: imp.origem,
      // Simples → CSOSN; Normal → CST. Focus reads both from this field.
      icms_situacao_tributaria: imp.csosn ?? imp.cst ?? "102",
    };
    if (imp.cest) base.cest = imp.cest;
    // Regime normal: destaque de ICMS.
    if (!imp.csosn && imp.cst && imp.icmsAliquota != null) {
      base.icms_modalidade_base_calculo = "3";
      base.icms_base_calculo = money(it.valorTotal);
      base.icms_aliquota = imp.icmsAliquota;
      base.icms_valor = money((it.valorTotal * imp.icmsAliquota) / 100);
    }
    return base;
  });

  const nota: Record<string, unknown> = {
    cnpj_emitente: p.emitente.cnpj,
    natureza_operacao: "VENDA AO CONSUMIDOR",
    presenca_comprador: "1", // operação presencial
    modalidade_frete: "9", // sem frete (NFC-e)
    local_destino: "1", // operação interna
    valor_frete: money(p.valorFrete),
    valor_desconto: money(p.valorDesconto),
    valor_produtos: money(p.valorProdutos),
    valor_total: money(p.valorTotal),
    items,
    formas_pagamento: p.pagamentos.map((pg) => ({
      forma_pagamento: PAGAMENTO_FOCUS[pg.tipo],
      valor_pagamento: money(pg.valor),
      ...(pg.bandeira ? { bandeira_operadora: pg.bandeira } : {}),
    })),
  };

  if (p.destinatario?.cpf) nota.cpf_destinatario = p.destinatario.cpf;
  if (p.destinatario?.nome) nota.nome_destinatario = p.destinatario.nome;
  if (p.informacoesAdicionais) nota.informacoes_adicionais_contribuinte = p.informacoesAdicionais;

  return nota;
}

/** CRT → código de regime tributário do Focus (1=Simples, 2=excesso, 3=Normal). */
const REGIME_FOCUS: Record<FiscalRegime, number> = {
  SIMPLES_NACIONAL: 1,
  SIMPLES_EXCESSO: 2,
  REGIME_NORMAL: 3,
};

/** Vendor-neutral company registration → Focus /v2/empresas body. Pure — testado. */
export function buildEmpresaPayload(reg: FiscalCompanyRegistration): Record<string, unknown> {
  const body: Record<string, unknown> = {
    nome: reg.razaoSocial,
    nome_fantasia: reg.nomeFantasia,
    inscricao_estadual: reg.inscricaoEstadual,
    cnpj: reg.cnpj,
    regime_tributario: REGIME_FOCUS[reg.regime] ?? 1,
    email: reg.email,
    logradouro: reg.endereco.logradouro,
    numero: reg.endereco.numero,
    complemento: reg.endereco.complemento,
    bairro: reg.endereco.bairro,
    municipio: reg.endereco.municipio,
    cep: reg.endereco.cep,
    uf: reg.endereco.uf,
    codigo_municipio: reg.endereco.municipioIbge,
    arquivo_certificado_base64: reg.certificadoBase64,
    senha_certificado: reg.certificadoSenha,
    habilita_nfce: reg.habilitaNfce ?? true,
  };
  if (reg.csc) {
    body.csc_nfce = reg.csc.token;
    body.id_csc_nfce = reg.csc.id;
  }
  return body;
}

/** Focus status string → normalized FiscalStatus. */
export function mapFocusStatus(s: string | undefined | null): FiscalStatus {
  switch ((s ?? "").toLowerCase()) {
    case "autorizado":
      return "AUTORIZADA";
    case "processando_autorizacao":
    case "enviada":
      return "PROCESSANDO";
    case "cancelado":
      return "CANCELADA";
    case "erro_autorizacao":
    case "denegado":
      return "REJEITADA";
    default:
      return "ERRO";
  }
}

/** Shape of the fields we read from a Focus NFC-e response. */
interface FocusResponse {
  status?: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string | number;
  serie?: string | number;
  protocolo?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  qrcode_url?: string;
  url_consulta_nf?: string;
  erros?: Array<{ codigo?: string; mensagem?: string }>;
  codigo?: string;
  mensagem?: string;
}

export class FocusNFeProvider implements FiscalProvider {
  readonly name = "FOCUS_NFE";

  constructor(
    private readonly token: string,
    private readonly ambiente: FiscalEnvironment,
  ) {}

  private base(): string {
    return BASE_URLS[this.ambiente];
  }

  private authHeader(): string {
    // Basic auth: token as username, empty password.
    return "Basic " + Buffer.from(`${this.token}:`).toString("base64");
  }

  private absolutize(path?: string): string | undefined {
    if (!path) return undefined;
    return path.startsWith("http") ? path : `${this.base()}${path}`;
  }

  private toResult(providerRef: string, json: FocusResponse): FiscalEmitResult {
    const status = mapFocusStatus(json.status);
    const rejErr = json.erros?.[0];
    return {
      providerName: this.name,
      providerRef,
      status,
      chave: json.chave_nfe,
      protocolo: json.protocolo,
      numero: json.numero != null ? Number(json.numero) : undefined,
      serie: json.serie != null ? Number(json.serie) : undefined,
      xmlUrl: this.absolutize(json.caminho_xml_nota_fiscal),
      danfceUrl: this.absolutize(json.caminho_danfe),
      qrCodeData: json.qrcode_url,
      urlConsulta: json.url_consulta_nf,
      rejeicao:
        status === "REJEITADA" || status === "ERRO"
          ? {
              codigo: json.status_sefaz ?? rejErr?.codigo ?? json.codigo,
              motivo: json.mensagem_sefaz ?? rejErr?.mensagem ?? json.mensagem,
            }
          : undefined,
      raw: json,
    };
  }

  async emitNFCe(referenceId: string, payload: FiscalNFCePayload): Promise<FiscalEmitResult> {
    const body = mapPayloadToFocus(payload);
    const res = await fetch(`${this.base()}/v2/nfce?ref=${encodeURIComponent(referenceId)}`, {
      method: "POST",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as FocusResponse;
    // 422/400 with an error body → surface as rejection, not a throw (the engine
    // records it on the FiscalDocument so the owner sees WHY it failed).
    if (!res.ok && !json.status) {
      return {
        providerName: this.name,
        providerRef: referenceId,
        status: res.status >= 500 ? "ERRO" : "REJEITADA",
        rejeicao: { codigo: json.codigo ?? String(res.status), motivo: json.mensagem ?? "Falha ao emitir" },
        raw: json,
      };
    }
    return this.toResult(referenceId, json);
  }

  async getStatus(referenceId: string): Promise<FiscalStatusResult> {
    const res = await fetch(`${this.base()}/v2/nfce/${encodeURIComponent(referenceId)}?completa=1`, {
      method: "GET",
      headers: { Authorization: this.authHeader() },
    });
    const json = (await res.json().catch(() => ({}))) as FocusResponse;
    return this.toResult(referenceId, json);
  }

  async cancel(referenceId: string, justificativa: string): Promise<FiscalCancelResult> {
    const res = await fetch(`${this.base()}/v2/nfce/${encodeURIComponent(referenceId)}`, {
      method: "DELETE",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ justificativa }),
    });
    const json = (await res.json().catch(() => ({}))) as FocusResponse;
    const ok = res.ok && mapFocusStatus(json.status) === "CANCELADA";
    return {
      providerName: this.name,
      status: ok ? "CANCELADA" : "ERRO",
      protocolo: json.protocolo,
      rejeicao: ok ? undefined : { codigo: json.status_sefaz ?? json.codigo, motivo: json.mensagem_sefaz ?? json.mensagem },
      raw: json,
    };
  }

  async testConnection(): Promise<FiscalConnectionResult> {
    try {
      // A GET on an unknown ref returns 404 with a JSON error when the token is
      // valid, or 401/403 when it isn't — enough to validate credentials.
      const res = await fetch(`${this.base()}/v2/nfce/foocci-conn-test?completa=1`, {
        method: "GET",
        headers: { Authorization: this.authHeader() },
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: "Token do gateway inválido ou sem permissão." };
      }
      return { ok: true, message: `Conexão com o Focus NFe (${this.ambiente.toLowerCase()}) OK.` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Falha de conexão: ${msg}` };
    }
  }

  async registerCompany(reg: FiscalCompanyRegistration): Promise<FiscalCompanyResult> {
    const body = buildEmpresaPayload(reg);
    let res: Response;
    try {
      res = await fetch(`${this.base()}/v2/empresas`, {
        method: "POST",
        headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return { ok: false, message: `Falha de conexão com o gateway: ${err instanceof Error ? err.message : String(err)}` };
    }
    const json = (await res.json().catch(() => ({}))) as FocusResponse & {
      id?: string | number;
      certificado_valido_ate?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        message: json.mensagem ?? json.erros?.[0]?.mensagem ?? `Falha ao registrar empresa (HTTP ${res.status}).`,
        raw: json,
      };
    }
    return {
      ok: true,
      companyRef: json.id != null ? String(json.id) : reg.cnpj,
      certificadoValidadeAte: json.certificado_valido_ate,
      message: "Certificado registrado no gateway.",
      raw: json,
    };
  }
}
