/**
 * POST /api/billing/mp-webhook — eventos do Mercado Pago da conta DA PLATAFORMA.
 *
 * Rota separada do webhook de pedidos de propósito: contas diferentes, dinheiro
 * diferente. Aqui chegam os eventos das ASSINATURAS de plano da Foocci.
 *
 * Confiança pelo mesmo padrão do webhook de pedidos: o corpo do POST só carrega
 * IDs; o estado real é REBUSCADO na API do MP com o nosso token. Quem postar
 * lixo aqui não consegue ativar nada — a ativação depende do que o MP responde.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PlanSubscriptionService, isTerminalStatus } from "@/services/billing/PlanSubscriptionService";
import { MercadoPagoPlatformBilling, isPlatformBillingConfigured } from "@/services/billing/MercadoPagoPlatformBilling";
import { PlanNfseService } from "@/services/billing/PlanNfseService";

async function resolveSubscription(externalReference: string | null, preapprovalId: string | null) {
  if (externalReference) {
    const byRef = await prisma.planSubscription.findUnique({ where: { id: externalReference } });
    if (byRef) return byRef;
  }
  if (preapprovalId) return PlanSubscriptionService.findByPreapproval(preapprovalId);
  return null;
}

export async function POST(req: Request) {
  // Sem token de plataforma não há o que verificar — aceita e ignora (200 para
  // o MP não re-tentar para sempre).
  if (!isPlatformBillingConfigured()) return NextResponse.json({ ok: true, ignored: true });

  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as { type?: string; data?: { id?: string } } | null;
  const type = body?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
  const id = String(body?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (!id) return NextResponse.json({ ok: true, ignored: true });

  try {
    if (type.includes("preapproval")) {
      const pre = await MercadoPagoPlatformBilling.fetchPreapproval(id);
      if (!pre) return NextResponse.json({ ok: true, ignored: true });
      const sub = await resolveSubscription(pre.externalReference, id);
      if (!sub) return NextResponse.json({ ok: true, ignored: true });

      if (pre.status === "authorized") await PlanSubscriptionService.activate(sub.id);
      else if (pre.status === "cancelled") await PlanSubscriptionService.cancel(sub.id);
      else if (pre.status === "paused") await PlanSubscriptionService.markDelinquent(sub.id);
      return NextResponse.json({ ok: true });
    }

    if (type.includes("payment")) {
      const payment = await MercadoPagoPlatformBilling.fetchPayment(id);
      if (!payment || payment.status !== "approved") return NextResponse.json({ ok: true, ignored: true });

      const sub = await resolveSubscription(payment.externalReference, payment.preapprovalId);
      if (!sub) return NextResponse.json({ ok: true, ignored: true });

      // Trava terminal (CR A1): pagamento avulso NUNCA ressuscita uma assinatura
      // cancelada. Não reativa E não fatura — emitir NFS-e para uma cobrança que
      // consideramos indevida só agravaria. Código puro, sem dependência de token:
      // se o cancelamento no MP falhou e o cartão foi cobrado mesmo assim, a
      // cobrança-zumbi para AQUI (o certo é reembolso no MP, não uma nota).
      if (isTerminalStatus(sub.status)) {
        console.warn(
          `[billing/mp-webhook] pagamento ${id} recebido para assinatura ${sub.id} em estado ${sub.status} (terminal). ` +
            `NÃO reativa nem fatura — provável cobrança-zumbi do Mercado Pago; verificar reembolso.`,
        );
        return NextResponse.json({ ok: true, ignored: true, reason: "subscription_terminal" });
      }

      const referenceMonth = (payment.approvedAt ?? new Date().toISOString()).slice(0, 7);
      const { invoiceId, created } = await PlanSubscriptionService.recordPaidCharge(sub.id, {
        amountCents: payment.amountCents || sub.priceCents,
        mpPaymentId: id,
        referenceMonth,
      });
      if (sub.status !== "ATIVA") await PlanSubscriptionService.activate(sub.id);

      // Emissão best-effort: sem condição fiscal a cobrança fica na fila com o
      // motivo — o webhook nunca falha por causa da nota.
      if (created) await PlanNfseService.emit(invoiceId).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, ignored: true });
  } catch (err) {
    console.error("[billing/mp-webhook] erro processando evento:", err);
    // 200 mesmo em erro interno: o estado é re-derivável da API do MP; 5xx só
    // faria o MP martelar a rota.
    return NextResponse.json({ ok: false });
  }
}
