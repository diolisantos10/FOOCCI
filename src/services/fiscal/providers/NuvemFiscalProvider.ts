/**
 * Nuvem Fiscal adapter — segundo FiscalProvider (conta-mãe, pago por documento).
 *
 * Diferenças pro Focus:
 *  • Auth OAuth2 client_credentials (client_id:client_secret → bearer, com cache).
 *  • Payload "cru" no layout da SEFAZ (infNFe: ide/emit/dest/det/total/transp/pag).
 *  • Cadastro da empresa em 3 passos: POST /empresas, PUT .../certificado, PUT .../nfce.
 *  • XML/PDF ficam atrás de endpoints autenticados — a DANFCE térmica (chave+QR)
 *    funciona igual; o link do PDF/arquivo no S3 p/ Nuvem é um refinamento à parte.
 *
 * A credencial chega como "client_id:client_secret" (o token-mestre da Foocci).
 * Nomes de alguns campos (certificado/CSC) são confirmados na homologação — a
 * ESTRUTURA (endpoints, fluxo, layout infNFe) é o que importa aqui.
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

const BASE = process.env.NUVEM_FISCAL_API_URL || "https://api.nuvemfiscal.com.br";
const TOKEN_URL = process.env.NUVEM_FISCAL_TOKEN_URL || "https://auth.nuvemfiscal.com.br/oauth/token";
const SCOPE = process.env.NUVEM_FISCAL_SCOPE || "empresa nfce";

/** Código UF (IBGE) por sigla — exigido no `ide.cUF` da NFC-e. */
export const UF_TO_CUF: Record<string, number> = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23,
  RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35,
  PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53,
};

const NUVEM_TPAG: Record<FiscalPagamentoTipo, string> = {
  DINHEIRO: "01",
  CREDITO: "03",
  DEBITO: "04",
  PIX: "17",
  OUTRO: "99",
};

const crtOf = (r: FiscalRegime): number => (r === "REGIME_NORMAL" ? 3 : r === "SIMPLES_EXCESSO" ? 2 : 1);
const digits = (s: string): string => (s || "").replace(/\D/g, "");
const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** ICMS + PIS/COFINS de um item (Simples: CSOSN; Normal: CST). Simplificado; refinado em homologação. */
function buildImposto(imp: FiscalNFCePayload["itens"][number]["imposto"], crt: number): Record<string, unknown> {
  const orig = imp.origem || "0";
  const icms =
    crt === 3
      ? { [`ICMS${imp.cst || "00"}`]: { orig, CST: imp.cst || "00", modBC: 3, vBC: 0, pICMS: imp.icmsAliquota ?? 0, vICMS: 0 } }
      : { [`ICMSSN${imp.csosn || "102"}`]: { orig, CSOSN: imp.csosn || "102" } };
  return {
    ICMS: icms,
    PIS: { PISOutr: { CST: "49", vBC: 0, pPIS: 0, vPIS: 0 } },
    COFINS: { COFINSOutr: { CST: "49", vBC: 0, pCOFINS: 0, vCOFINS: 0 } },
  };
}

/** Payload vendor-neutro → infNFe (layout SEFAZ 4.00). Pure — testado. */
export function mapPayloadToNuvem(p: FiscalNFCePayload): Record<string, unknown> {
  const em = p.emitente;
  const crt = crtOf(em.regime);
  const det = p.itens.map((it, i) => {
    const prod: Record<string, unknown> = {
      cProd: it.codigo,
      cEAN: "SEM GTIN",
      xProd: it.descricao,
      NCM: it.imposto.ncm,
      CFOP: it.imposto.cfop,
      uCom: it.imposto.unidade,
      qCom: it.quantidade,
      vUnCom: money(it.valorUnitario),
      vProd: money(it.valorTotal),
      cEANTrib: "SEM GTIN",
      uTrib: it.imposto.unidade,
      qTrib: it.quantidade,
      vUnTrib: money(it.valorUnitario),
      indTot: 1,
    };
    if (it.imposto.cest) prod.CEST = it.imposto.cest;
    return { nItem: i + 1, prod, imposto: buildImposto(it.imposto, crt) };
  });

  const infNFe: Record<string, unknown> = {
    versao: "4.00",
    ide: {
      cUF: UF_TO_CUF[(em.endereco.uf || "").toUpperCase()] ?? 35,
      natOp: "VENDA AO CONSUMIDOR",
      mod: 65,
      serie: p.serie,
      nNF: p.numero,
      tpNF: 1,
      idDest: 1,
      cMunFG: em.endereco.municipioIbge,
      tpImp: 4,
      tpEmis: 1,
      tpAmb: p.ambiente === "PRODUCAO" ? 1 : 2,
      finNFe: 1,
      indFinal: 1,
      indPres: 1,
    },
    emit: {
      CNPJ: digits(em.cnpj),
      xNome: em.razaoSocial,
      ...(em.nomeFantasia ? { xFant: em.nomeFantasia } : {}),
      enderEmit: {
        xLgr: em.endereco.logradouro,
        nro: em.endereco.numero,
        ...(em.endereco.complemento ? { xCpl: em.endereco.complemento } : {}),
        xBairro: em.endereco.bairro,
        cMun: em.endereco.municipioIbge,
        xMun: em.endereco.municipio,
        UF: em.endereco.uf,
        CEP: digits(em.endereco.cep),
        cPais: "1058",
        xPais: "BRASIL",
      },
      IE: digits(em.inscricaoEstadual),
      CRT: crt,
    },
    det,
    total: {
      ICMSTot: {
        vBC: 0, vICMS: 0, vBCST: 0, vST: 0,
        vProd: money(p.valorProdutos),
        vFrete: money(p.valorFrete), vSeg: 0,
        vDesc: money(p.valorDesconto),
        vII: 0, vIPI: 0, vPIS: 0, vCOFINS: 0, vOutro: 0,
        vNF: money(p.valorTotal),
      },
    },
    transp: { modFrete: 9 },
    pag: { detPag: p.pagamentos.map((pg) => ({ tPag: NUVEM_TPAG[pg.tipo], vPag: money(pg.valor) })) },
  };

  if (p.destinatario?.cpf) {
    infNFe.dest = { CPF: digits(p.destinatario.cpf), ...(p.destinatario.nome ? { xNome: p.destinatario.nome } : {}) };
  }
  if (p.informacoesAdicionais) infNFe.infAdic = { infCpl: p.informacoesAdicionais };
  return infNFe;
}

/** Registro da empresa → corpo do POST /empresas. Pure. */
export function buildEmpresaNuvem(reg: FiscalCompanyRegistration): Record<string, unknown> {
  return {
    cpf_cnpj: digits(reg.cnpj),
    nome_razao_social: reg.razaoSocial,
    nome_fantasia: reg.nomeFantasia,
    email: reg.email,
    inscricao_estadual: digits(reg.inscricaoEstadual),
    regime_tributario: crtOf(reg.regime),
    endereco: {
      logradouro: reg.endereco.logradouro,
      numero: reg.endereco.numero,
      complemento: reg.endereco.complemento,
      bairro: reg.endereco.bairro,
      codigo_municipio: reg.endereco.municipioIbge,
      cidade: reg.endereco.municipio,
      uf: reg.endereco.uf,
      cep: digits(reg.endereco.cep),
    },
  };
}

export function mapNuvemStatus(s: string | undefined | null): FiscalStatus {
  switch ((s ?? "").toLowerCase()) {
    case "autorizado":
      return "AUTORIZADA";
    case "pendente":
    case "processando":
      return "PROCESSANDO";
    case "cancelado":
      return "CANCELADA";
    case "rejeitado":
    case "denegado":
      return "REJEITADA";
    default:
      return "ERRO";
  }
}

interface NuvemResponse {
  id?: string;
  status?: string;
  chave?: string;
  numero?: string | number;
  serie?: string | number;
  autorizacao?: { protocolo?: string; digest_value?: string };
  url_consulta_nfce?: string;
  qrcode?: string;
  data?: NuvemResponse[];
  error?: { message?: string; code?: string };
  message?: string;
}

// Cache de token por client_id (reaproveitado entre requisições).
const tokenCache = new Map<string, { token: string; exp: number }>();

export class NuvemFiscalProvider implements FiscalProvider {
  readonly name = "NUVEM_FISCAL";
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    credential: string, // "client_id:client_secret"
    private readonly ambiente: FiscalEnvironment,
  ) {
    const idx = credential.indexOf(":");
    this.clientId = idx >= 0 ? credential.slice(0, idx) : credential;
    this.clientSecret = idx >= 0 ? credential.slice(idx + 1) : "";
  }

  private ambienteParam(): string {
    return this.ambiente === "PRODUCAO" ? "producao" : "homologacao";
  }

  private async getToken(): Promise<string> {
    const cached = tokenCache.get(this.clientId);
    if (cached && cached.exp > Date.now()) return cached.token;
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }).toString(),
    });
    if (!res.ok) throw new Error(`OAuth Nuvem Fiscal falhou (HTTP ${res.status}).`);
    const j = (await res.json()) as { access_token: string; expires_in?: number };
    tokenCache.set(this.clientId, { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000 });
    return j.access_token;
  }

  private async api(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; body: NuvemResponse }> {
    const token = await this.getToken();
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as NuvemResponse;
    return { ok: res.ok, status: res.status, body: json };
  }

  private toResult(referenceId: string, o: NuvemResponse): FiscalEmitResult {
    const status = mapNuvemStatus(o.status);
    return {
      providerName: this.name,
      providerRef: o.id ?? referenceId,
      status,
      chave: o.chave,
      protocolo: o.autorizacao?.protocolo,
      numero: o.numero != null ? Number(o.numero) : undefined,
      serie: o.serie != null ? Number(o.serie) : undefined,
      qrCodeData: o.qrcode,
      urlConsulta: o.url_consulta_nfce,
      rejeicao:
        status === "REJEITADA" || status === "ERRO"
          ? { codigo: o.error?.code, motivo: o.error?.message ?? o.message }
          : undefined,
      raw: o,
    };
  }

  async emitNFCe(referenceId: string, payload: FiscalNFCePayload): Promise<FiscalEmitResult> {
    const res = await this.api("POST", "/nfce", {
      ambiente: this.ambienteParam(),
      referencia: referenceId,
      infNFe: mapPayloadToNuvem(payload),
    });
    if (!res.ok && !res.body.status) {
      return {
        providerName: this.name,
        providerRef: referenceId,
        status: res.status >= 500 ? "ERRO" : "REJEITADA",
        rejeicao: { codigo: res.body.error?.code ?? String(res.status), motivo: res.body.error?.message ?? res.body.message ?? "Falha ao emitir" },
        raw: res.body,
      };
    }
    return this.toResult(referenceId, res.body);
  }

  async getStatus(referenceId: string): Promise<FiscalStatusResult> {
    const res = await this.api("GET", `/nfce?referencia=${encodeURIComponent(referenceId)}&ambiente=${this.ambienteParam()}`);
    const first = res.body.data?.[0] ?? res.body;
    return this.toResult(referenceId, first);
  }

  async cancel(referenceId: string, justificativa: string): Promise<FiscalCancelResult> {
    // Resolve o id interno da Nuvem a partir da nossa referência.
    const found = await this.api("GET", `/nfce?referencia=${encodeURIComponent(referenceId)}&ambiente=${this.ambienteParam()}`);
    const id = found.body.data?.[0]?.id ?? found.body.id;
    if (!id) return { providerName: this.name, status: "ERRO", rejeicao: { motivo: "Nota não encontrada no gateway." } };
    const res = await this.api("POST", `/nfce/${id}/cancelamento`, { justificativa });
    const ok = res.ok && mapNuvemStatus(res.body.status) === "CANCELADA";
    return {
      providerName: this.name,
      status: ok ? "CANCELADA" : "ERRO",
      protocolo: res.body.autorizacao?.protocolo,
      rejeicao: ok ? undefined : { codigo: res.body.error?.code, motivo: res.body.error?.message ?? res.body.message },
      raw: res.body,
    };
  }

  async testConnection(): Promise<FiscalConnectionResult> {
    try {
      await this.getToken();
      return { ok: true, message: `Conexão com o Nuvem Fiscal (${this.ambiente.toLowerCase()}) OK.` };
    } catch (err) {
      return { ok: false, message: `Falha na autenticação: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async registerCompany(reg: FiscalCompanyRegistration): Promise<FiscalCompanyResult> {
    const cnpj = digits(reg.cnpj);
    try {
      // 1. cria a empresa (409 = já existe, tudo bem)
      const emp = await this.api("POST", "/empresas", buildEmpresaNuvem(reg));
      if (!emp.ok && emp.status !== 409) {
        return { ok: false, message: emp.body.error?.message ?? emp.body.message ?? `Falha ao criar empresa (HTTP ${emp.status}).`, raw: emp.body };
      }
      // 2. envia o certificado A1
      const cert = await this.api("PUT", `/empresas/${cnpj}/certificado`, { certificado: reg.certificadoBase64, password: reg.certificadoSenha });
      if (!cert.ok) {
        return { ok: false, message: cert.body.error?.message ?? cert.body.message ?? "Falha ao enviar o certificado.", raw: cert.body };
      }
      // 3. habilita NFC-e (ambiente + CSC)
      await this.api("PUT", `/empresas/${cnpj}/nfce`, {
        ambiente: this.ambienteParam(),
        ...(reg.csc ? { id_csc: reg.csc.id, csc: reg.csc.token } : {}),
      });
      const validade = (cert.body as { vencimento?: string; valido_ate?: string }).vencimento ?? (cert.body as { valido_ate?: string }).valido_ate;
      return { ok: true, companyRef: cnpj, certificadoValidadeAte: validade, message: "Certificado registrado no gateway (Nuvem Fiscal)." };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}
