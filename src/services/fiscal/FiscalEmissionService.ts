/**
 * FiscalEmissionService — turns a finished order into an emitted NFC-e.
 *
 * Sibling of PrintQueueService: fired (fire-and-forget) at the same "order is
 * ready" moments. It is fully SELF-GUARDING, so wiring the trigger everywhere is
 * safe — it no-ops unless the restaurant explicitly enabled emission:
 *   • emission disabled / unconfigured        → no-op
 *   • order already has an authorized/pending/
 *     cancelled note (idempotent)             → no-op
 *   • required fiscal data missing            → records a PENDENTE note w/ reason
 *
 * Numbering is reserved atomically (FiscalConfig.proximoNumero) so two orders
 * never grab the same número. The provider adapter (Focus NFe) does the SEFAZ
 * talking; we persist the result on FiscalDocument. Never throws to the caller.
 */

import { prisma } from "@/lib/prisma";
import { Prisma, type FiscalDocument } from "@prisma/client";
import { getFiscalConfig } from "./fiscalCredentials";
import { enqueueDanfcePrint, mirrorFiscalArtifacts } from "./fiscalArtifacts";
import { buildFiscalProvider } from "./FiscalProviderRouter";
import { buildNFCePayload, validateForEmit, type NFCeBuildItem } from "./nfceBuilder";
import type { FiscalEmitResult } from "./providers/types";

/** Order-item shape (with product/category fiscal fields) the mapper needs. */
export interface OrderItemForFiscal {
  id: string;
  menuItemId: string | null;
  name: string;
  price: Prisma.Decimal;
  quantity: number;
  total: Prisma.Decimal;
  menuItem?: {
    code: string | null;
    fiscalNcm: string | null;
    fiscalCest: string | null;
    fiscalCfop: string | null;
    fiscalCsosn: string | null;
    fiscalCst: string | null;
    fiscalOrigem: string | null;
    fiscalUnidade: string | null;
    fiscalIcmsAliquota: Prisma.Decimal | null;
    category?: {
      fiscalNcm: string | null;
      fiscalCest: string | null;
      fiscalCfop: string | null;
      fiscalCsosn: string | null;
      fiscalCst: string | null;
      fiscalOrigem: string | null;
      fiscalUnidade: string | null;
    } | null;
  } | null;
}

const dec = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();

/** Pure: map order items to the builder's item shape (item + categoria fiscal). Exported for tests. */
export function mapOrderItemsToBuilder(items: OrderItemForFiscal[]): NFCeBuildItem[] {
  return items.map((it) => {
    const mi = it.menuItem;
    const cat = mi?.category ?? null;
    return {
      codigo: mi?.code || it.menuItemId || it.id,
      descricao: it.name,
      quantidade: it.quantity,
      valorUnitario: dec(it.price),
      valorTotal: dec(it.total),
      item: mi
        ? {
            ncm: mi.fiscalNcm,
            cest: mi.fiscalCest,
            cfop: mi.fiscalCfop,
            csosn: mi.fiscalCsosn,
            cst: mi.fiscalCst,
            origem: mi.fiscalOrigem,
            unidade: mi.fiscalUnidade,
            icmsAliquota: mi.fiscalIcmsAliquota == null ? null : dec(mi.fiscalIcmsAliquota),
          }
        : null,
      categoria: cat
        ? {
            ncm: cat.fiscalNcm,
            cest: cat.fiscalCest,
            cfop: cat.fiscalCfop,
            csosn: cat.fiscalCsosn,
            cst: cat.fiscalCst,
            origem: cat.fiscalOrigem,
            unidade: cat.fiscalUnidade,
          }
        : null,
    };
  });
}

/** Statuses that mean "already handled — don't auto-emit again". */
const TERMINAL_OR_INFLIGHT = new Set(["AUTORIZADA", "PROCESSANDO", "CANCELADA"]);

export const FiscalEmissionService = {
  /**
   * Emit the NFC-e for an order if (and only if) emission is enabled and the
   * order has no authorized/pending/cancelled note yet. Safe to call from any
   * order-ready hook; never throws.
   */
  async maybeEmitForOrder(restaurantId: string, orderId: string): Promise<void> {
    try {
      const resolved = await getFiscalConfig(restaurantId);
      if (!resolved) return;
      const { config, ambiente, providerToken, csc } = resolved;
      if (!config.enabled || config.provider === "DISABLED" || !providerToken) return;

      const existing = await prisma.fiscalDocument.findUnique({ where: { orderId } });
      if (existing && TERMINAL_OR_INFLIGHT.has(existing.status)) return;

      // Missing fiscal identity → park a PENDENTE note explaining what to fill.
      const missing = validateForEmit(config);
      if (missing.length > 0) {
        await prisma.fiscalDocument.upsert({
          where: { orderId },
          create: { orderId, restaurantId, ambiente, status: "PENDENTE", lastError: `Faltam dados: ${missing.join(", ")}` },
          update: { status: "PENDENTE", lastError: `Faltam dados: ${missing.join(", ")}` },
        });
        return;
      }

      const provider = buildFiscalProvider(config.provider, providerToken, ambiente);
      if (!provider) return;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          payment: true,
          items: { include: { menuItem: { include: { category: true } } } },
        },
      });
      if (!order) return;

      // Reserve a número atomically so concurrent orders never collide.
      const { numero, serie } = await prisma.$transaction(async (tx) => {
        const c = await tx.fiscalConfig.findUnique({ where: { restaurantId }, select: { proximoNumero: true, serie: true } });
        const n = c?.proximoNumero ?? 1;
        await tx.fiscalConfig.update({ where: { restaurantId }, data: { proximoNumero: n + 1 } });
        return { numero: n, serie: c?.serie ?? 1 };
      });

      const payload = buildNFCePayload({
        config,
        csc,
        serie,
        numero,
        ambiente,
        items: mapOrderItemsToBuilder(order.items as OrderItemForFiscal[]),
        valorFrete: dec(order.deliveryFee),
        valorDesconto: dec(order.discount),
        valorTotal: dec(order.total),
        pagamentos: [
          {
            method: order.payment?.method ?? "CASH",
            valor: dec(order.total),
            bandeira: order.payment?.cardBrand ?? undefined,
          },
        ],
      });

      // Create/refresh the doc as PROCESSANDO; its id is the gateway idempotency ref.
      const doc = await prisma.fiscalDocument.upsert({
        where: { orderId },
        create: { orderId, restaurantId, ambiente, serie, numero, valorTotal: order.total, status: "PROCESSANDO", attempts: 1 },
        update: { ambiente, serie, numero, valorTotal: order.total, status: "PROCESSANDO", attempts: { increment: 1 }, lastError: null },
      });

      let result: FiscalEmitResult;
      try {
        result = await provider.emitNFCe(doc.id, payload);
      } catch (err) {
        await prisma.fiscalDocument.update({
          where: { id: doc.id },
          data: { status: "ERRO", lastError: err instanceof Error ? err.message : String(err) },
        });
        return;
      }

      await persistResult(doc.id, result);
    } catch (err) {
      console.error("[FiscalEmissionService.maybeEmitForOrder]", restaurantId, orderId, err);
    }
  },

  /** Poll the gateway for a PROCESSANDO note and persist the outcome. */
  async refreshStatus(restaurantId: string, orderId: string): Promise<void> {
    try {
      const resolved = await getFiscalConfig(restaurantId);
      if (!resolved?.providerToken) return;
      const provider = buildFiscalProvider(resolved.config.provider, resolved.providerToken, resolved.ambiente);
      if (!provider) return;
      const doc = await prisma.fiscalDocument.findUnique({ where: { orderId } });
      if (!doc || doc.status !== "PROCESSANDO") return;
      const result = await provider.getStatus(doc.id);
      await persistResult(doc.id, result);
    } catch (err) {
      console.error("[FiscalEmissionService.refreshStatus]", restaurantId, orderId, err);
    }
  },

  /** Cancel an authorized NFC-e (justificativa ≥ 15 chars, regra SEFAZ). */
  async cancelForOrder(restaurantId: string, orderId: string, justificativa: string): Promise<{ ok: boolean; message: string }> {
    try {
      if (!justificativa || justificativa.trim().length < 15) {
        return { ok: false, message: "A justificativa precisa ter ao menos 15 caracteres." };
      }
      const resolved = await getFiscalConfig(restaurantId);
      if (!resolved?.providerToken) return { ok: false, message: "Emissão fiscal não configurada." };
      const provider = buildFiscalProvider(resolved.config.provider, resolved.providerToken, resolved.ambiente);
      if (!provider) return { ok: false, message: "Emissor não suportado." };
      const doc = await prisma.fiscalDocument.findUnique({ where: { orderId } });
      if (!doc) return { ok: false, message: "Sem nota para este pedido." };
      if (doc.status !== "AUTORIZADA") return { ok: false, message: "Só é possível cancelar uma nota autorizada." };

      const result = await provider.cancel(doc.id, justificativa.trim());
      if (result.status === "CANCELADA") {
        await prisma.fiscalDocument.update({
          where: { id: doc.id },
          data: { status: "CANCELADA", canceladaAt: new Date(), cancelamentoJustificativa: justificativa.trim(), cancelamentoProtocolo: result.protocolo ?? null },
        });
        return { ok: true, message: "Nota cancelada." };
      }
      return { ok: false, message: result.rejeicao?.motivo ?? "Falha ao cancelar." };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Erro ao cancelar." };
    }
  },

  /** The fiscal document for an order (tenant-scoped), or null. */
  async getForOrder(restaurantId: string, orderId: string) {
    return prisma.fiscalDocument.findFirst({ where: { orderId, restaurantId } });
  },
};

/** Persist a provider emit/status result onto the FiscalDocument. */
async function persistResult(docId: string, result: FiscalEmitResult): Promise<void> {
  const prev = await prisma.fiscalDocument.findUnique({ where: { id: docId }, select: { status: true } });
  const doc = await prisma.fiscalDocument.update({
    where: { id: docId },
    data: {
      status: result.status,
      providerRef: result.providerRef ?? undefined,
      chave: result.chave ?? undefined,
      protocolo: result.protocolo ?? undefined,
      numero: result.numero ?? undefined,
      serie: result.serie ?? undefined,
      qrCodeData: result.qrCodeData ?? undefined,
      urlConsulta: result.urlConsulta ?? undefined,
      xmlUrl: result.xmlUrl ?? undefined,
      danfceUrl: result.danfceUrl ?? undefined,
      rejeicaoCodigo: result.rejeicao?.codigo ?? null,
      rejeicaoMotivo: result.rejeicao?.motivo ?? null,
      emitidaAt: result.status === "AUTORIZADA" ? new Date() : undefined,
      lastError: result.status === "ERRO" ? (result.rejeicao?.motivo ?? "Erro na emissão") : null,
    },
  });
  // Transição para AUTORIZADA (uma vez só): imprime a DANFCE e arquiva no S3.
  if (result.status === "AUTORIZADA" && prev?.status !== "AUTORIZADA") {
    void onFiscalAuthorized(doc);
  }
}

/** Efeitos best-effort na autorização — nunca quebram a emissão. */
async function onFiscalAuthorized(doc: FiscalDocument): Promise<void> {
  try {
    await enqueueDanfcePrint(doc.restaurantId, doc);
  } catch (err) {
    console.error("[fiscal] DANFCE print", err);
  }
  try {
    const mirrored = await mirrorFiscalArtifacts(doc);
    if (mirrored.xmlUrl || mirrored.danfceUrl) {
      await prisma.fiscalDocument.update({
        where: { id: doc.id },
        data: { xmlUrl: mirrored.xmlUrl ?? doc.xmlUrl, danfceUrl: mirrored.danfceUrl ?? doc.danfceUrl },
      });
    }
  } catch (err) {
    console.error("[fiscal] S3 mirror", err);
  }
}
