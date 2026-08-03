/**
 * POST /api/admin/billing/subscriptions/[id]/action — as alavancas do CEO.
 *
 * Ações: gerar link MP, ativar manualmente (pagamento combinado fora do
 * gateway), registrar cobrança manual (gera a NFS-e da fila), cancelar,
 * emitir/atualizar notas.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { PlanSubscriptionService } from "@/services/billing/PlanSubscriptionService";
import { MercadoPagoPlatformBilling } from "@/services/billing/MercadoPagoPlatformBilling";
import { PlanNfseService } from "@/services/billing/PlanNfseService";

const actionSchema = z.object({
  action: z.enum(["mp-link", "activate", "record-charge", "cancel", "emit-invoices", "refresh-invoice"]),
  invoiceId: z.string().optional(),
  amountCents: z.number().int().positive().optional(),
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const sub = await prisma.planSubscription.findUnique({ where: { id: params.id } });
  if (!sub) return NextResponse.json({ ok: false, error: "Assinatura não encontrada" }, { status: 404 });

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
  const { action } = parsed.data;

  try {
    if (action === "mp-link") {
      const pre = await MercadoPagoPlatformBilling.createPreapproval(sub);
      if (!pre) return NextResponse.json({ ok: false, error: "Gateway não configurado (MP_PLATFORM_ACCESS_TOKEN)." }, { status: 400 });
      await PlanSubscriptionService.attachMercadoPago(sub.id, pre.id, pre.initPoint);
      return NextResponse.json({ ok: true, initPoint: pre.initPoint });
    }

    if (action === "activate") {
      await PlanSubscriptionService.activate(sub.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "record-charge") {
      const referenceMonth = parsed.data.referenceMonth ?? new Date().toISOString().slice(0, 7);
      const { invoiceId } = await PlanSubscriptionService.recordPaidCharge(sub.id, {
        amountCents: parsed.data.amountCents ?? sub.priceCents,
        referenceMonth,
      });
      const emit = await PlanNfseService.emit(invoiceId);
      return NextResponse.json({ ok: true, invoiceId, nfse: emit });
    }

    if (action === "cancel") {
      await PlanSubscriptionService.cancel(sub.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "emit-invoices") {
      const r = await PlanNfseService.emitAllPending();
      return NextResponse.json({ ok: true, ...r });
    }

    if (action === "refresh-invoice" && parsed.data.invoiceId) {
      const r = await PlanNfseService.refreshStatus(parsed.data.invoiceId);
      return NextResponse.json({ ok: r.ok, detail: r.detail });
    }

    return NextResponse.json({ ok: false, error: "Ação não reconhecida" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
