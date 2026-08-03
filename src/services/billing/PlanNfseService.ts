/**
 * O gerador de NFS-e da Foocci — a nota do NOSSO serviço, uma por cobrança paga.
 *
 * Usa a MESMA conta-mãe Focus NFe que já emite as notas dos lojistas
 * (fiscalPlatform.ts). O que muda é o documento (NFS-e, não NFC-e) e o emissor
 * (a Foocci, não o restaurante).
 *
 * A REALIDADE FISCAL MANDA AQUI: enquanto o CNPJ da Foocci for MEI de vestuário
 * (docs/juridico/parecer-cnpj-e-caminho-fiscal.md), emitir seria irregular. Por
 * isso a emissão é GATED por configuração explícita, e a fila NUNCA descarta:
 * cobrança paga sem condição de emitir fica PENDENTE com o motivo escrito.
 * Quando a SLU-ME sair e os envs entrarem, um clique em "emitir pendentes"
 * despacha a fila inteira. Nada se perde, nada se emite errado.
 *
 * Envs (entram quando o contador concluir):
 *   FOOCCI_NFSE_ENABLED=true          — o interruptor (código é trava, guardrail 4)
 *   FOOCCI_NFSE_CNPJ                  — CNPJ emissor (só dígitos)
 *   FOOCCI_NFSE_INSCRICAO_MUNICIPAL
 *   FOOCCI_NFSE_CODIGO_MUNICIPIO      — IBGE (São Paulo: 3550308)
 *   FOOCCI_NFSE_ITEM_LISTA            — LC 116 (default 1.05 — licenciamento de software)
 *   FOOCCI_NFSE_ALIQUOTA              — % ISS, ex. "2.00"
 *   FOOCCI_NFSE_AMBIENTE              — HOMOLOGACAO | PRODUCAO (default HOMOLOGACAO)
 */

import { prisma } from "@/lib/prisma";
import { getPlatformFiscalToken } from "@/services/fiscal/fiscalPlatform";
import type { FiscalEnvironment } from "@/services/fiscal/providers/types";

const FOCUS_API = {
  PRODUCAO: "https://api.focusnfe.com.br",
  HOMOLOGACAO: "https://homologacao.focusnfe.com.br",
} as const;

interface NfseConfig {
  cnpj: string;
  inscricaoMunicipal: string;
  codigoMunicipio: string;
  itemLista: string;
  aliquota: number;
  ambiente: FiscalEnvironment;
  token: string;
}

/** null = não configurado, com o motivo humano — o alerta carrega a evidência. */
export function getNfseConfig(): { config: NfseConfig | null; reason: string | null } {
  if (process.env.FOOCCI_NFSE_ENABLED !== "true") {
    return { config: null, reason: "Emissão desligada (FOOCCI_NFSE_ENABLED≠true) — aguardando SLU-ME/CNAE de software." };
  }
  const ambiente: FiscalEnvironment =
    process.env.FOOCCI_NFSE_AMBIENTE === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO";
  const token = getPlatformFiscalToken("FOCUS_NFE", ambiente);
  const cnpj = (process.env.FOOCCI_NFSE_CNPJ || "").replace(/\D/g, "");
  const im = process.env.FOOCCI_NFSE_INSCRICAO_MUNICIPAL || "";
  const mun = process.env.FOOCCI_NFSE_CODIGO_MUNICIPIO || "";
  const aliquota = Number(process.env.FOOCCI_NFSE_ALIQUOTA || "0");
  if (!token) return { config: null, reason: "Token Focus NFe ausente para o ambiente." };
  if (!cnpj || !im || !mun || !aliquota) {
    return { config: null, reason: "Dados fiscais incompletos (CNPJ/IM/município/alíquota) — ver docs/juridico/." };
  }
  return {
    config: {
      cnpj,
      inscricaoMunicipal: im,
      codigoMunicipio: mun,
      itemLista: process.env.FOOCCI_NFSE_ITEM_LISTA || "1.05",
      aliquota,
      ambiente,
      token,
    },
    reason: null,
  };
}

/** Monta o corpo da NFS-e do Focus. Puro, para o teste travar o formato. */
export function buildNfsePayload(opts: {
  config: Pick<NfseConfig, "cnpj" | "inscricaoMunicipal" | "codigoMunicipio" | "itemLista" | "aliquota">;
  amountCents: number;
  referenceMonth: string;
  plan: string;
  cycle: string;
  tomadorCnpj: string | null;
  tomadorNome: string;
  emissionIso: string;
}) {
  return {
    data_emissao: opts.emissionIso,
    prestador: {
      cnpj: opts.config.cnpj,
      inscricao_municipal: opts.config.inscricaoMunicipal,
      codigo_municipio: opts.config.codigoMunicipio,
    },
    tomador: {
      ...(opts.tomadorCnpj ? { cnpj: opts.tomadorCnpj.replace(/\D/g, "") } : {}),
      razao_social: opts.tomadorNome,
    },
    servico: {
      aliquota: opts.config.aliquota,
      discriminacao: `Licenciamento de uso da plataforma Foocci — plano ${opts.plan}, ciclo ${opts.cycle}, competência ${opts.referenceMonth}.`,
      iss_retido: false,
      item_lista_servico: opts.config.itemLista,
      valor_servicos: opts.amountCents / 100,
    },
  };
}

export const PlanNfseService = {
  /**
   * Tenta emitir a NFS-e de uma cobrança. Sem condição de emitir, a cobrança
   * FICA na fila (PENDENTE) com o motivo — nunca some, nunca vira erro fatal.
   */
  async emit(invoiceId: string): Promise<{ ok: boolean; detail: string }> {
    const invoice = await prisma.planInvoice.findUnique({
      where: { id: invoiceId },
      include: { subscription: true },
    });
    if (!invoice) return { ok: false, detail: "Cobrança não encontrada." };
    if (invoice.status === "AUTORIZADA") return { ok: true, detail: "Já autorizada." };

    const { config, reason } = getNfseConfig();
    if (!config) {
      await prisma.planInvoice.update({ where: { id: invoiceId }, data: { errorMessage: reason } });
      return { ok: false, detail: reason! };
    }

    // Referência idempotente: reemitir a mesma cobrança não cria nota nova.
    const ref = invoice.providerRef ?? `foocci-plan-${invoice.id}`;
    const payload = buildNfsePayload({
      config,
      amountCents: invoice.amountCents,
      referenceMonth: invoice.referenceMonth,
      plan: invoice.subscription.plan,
      cycle: invoice.subscription.cycle,
      tomadorCnpj: invoice.subscription.customerCnpj,
      tomadorNome: invoice.subscription.customerName,
      emissionIso: new Date().toISOString(),
    });

    const res = await fetch(`${FOCUS_API[config.ambiente]}/v2/nfse?ref=${encodeURIComponent(ref)}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.token}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (res.status === 202 || res.status === 200) {
      await prisma.planInvoice.update({
        where: { id: invoiceId },
        data: { status: "PROCESSANDO", providerRef: ref, errorMessage: null },
      });
      return { ok: true, detail: "Enviada ao Focus — aguardando autorização da prefeitura." };
    }

    const msg = `Focus recusou (${res.status}): ${JSON.stringify(body ?? {}).slice(0, 400)}`;
    await prisma.planInvoice.update({
      where: { id: invoiceId },
      data: { status: "ERRO", providerRef: ref, errorMessage: msg },
    });
    return { ok: false, detail: msg };
  },

  /** Consulta o resultado no Focus e materializa PDF/XML quando autorizada. */
  async refreshStatus(invoiceId: string): Promise<{ ok: boolean; detail: string }> {
    const invoice = await prisma.planInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice?.providerRef) return { ok: false, detail: "Sem referência no provedor." };
    const { config, reason } = getNfseConfig();
    if (!config) return { ok: false, detail: reason! };

    const res = await fetch(
      `${FOCUS_API[config.ambiente]}/v2/nfse/${encodeURIComponent(invoice.providerRef)}`,
      { headers: { Authorization: `Basic ${Buffer.from(`${config.token}:`).toString("base64")}` } },
    );
    const body = (await res.json().catch(() => null)) as {
      status?: string;
      url?: string;
      caminho_xml_nota_fiscal?: string;
      erros?: unknown;
    } | null;
    if (!body?.status) return { ok: false, detail: `Consulta falhou (${res.status}).` };

    if (body.status === "autorizado") {
      await prisma.planInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "AUTORIZADA",
          emittedAt: new Date(),
          pdfUrl: body.url ?? null,
          xmlUrl: body.caminho_xml_nota_fiscal ?? null,
          errorMessage: null,
        },
      });
      return { ok: true, detail: "NFS-e autorizada." };
    }
    if (body.status === "erro_autorizacao") {
      const msg = `Prefeitura rejeitou: ${JSON.stringify(body.erros ?? {}).slice(0, 400)}`;
      await prisma.planInvoice.update({ where: { id: invoiceId }, data: { status: "REJEITADA", errorMessage: msg } });
      return { ok: false, detail: msg };
    }
    return { ok: true, detail: `Ainda processando (${body.status}).` };
  },

  /** Despacha a fila inteira de pendentes — o botão do dia em que a SLU-ME sair. */
  async emitAllPending(): Promise<{ attempted: number; sent: number }> {
    const pending = await prisma.planInvoice.findMany({
      where: { status: { in: ["PENDENTE", "ERRO"] } },
      select: { id: true },
    });
    let sent = 0;
    for (const inv of pending) {
      const r = await this.emit(inv.id);
      if (r.ok) sent++;
    }
    return { attempted: pending.length, sent };
  },
};
