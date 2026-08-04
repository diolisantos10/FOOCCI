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
import { PlanProvisioningService } from "@/services/billing/PlanProvisioningService";

const actionSchema = z.object({
  action: z.enum([
    "mp-link",
    "activate",
    "record-charge",
    "cancel",
    "emit-invoices",
    "refresh-invoice",
    "mark-invoice-emitted",
  ]),
  invoiceId: z.string().optional(),
  amountCents: z.number().int().positive().optional(),
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  /** Link do PDF/da nota emitida manualmente (Emissor Nacional do MEI). */
  pdfUrl: z.string().url().max(500).optional(),
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
      // G2 — dupla cobrança: antes, este botão chamava `createPreapproval` sem
      // olhar se a assinatura JÁ tinha um preapproval. Clicar duas vezes criava
      // duas recorrências no cartão do cliente, e a segunda cobrava para sempre
      // porque nenhum registro nosso apontava para ela. `ensurePreapproval`
      // devolve o link existente e, na corrida, cancela o órfão no MP.
      const pre = await PlanSubscriptionService.ensurePreapproval(sub.id);
      if (!pre.ok) {
        const msg =
          pre.reason === "gateway_nao_configurado"
            ? "Gateway não configurado (MP_PLATFORM_ACCESS_TOKEN)."
            : pre.reason === "sem_email"
              ? "MP exige e-mail do cliente para criar a assinatura — preencha o e-mail."
              : pre.reason === "terminal"
                ? "Assinatura cancelada: não se gera link de cobrança para estado terminal."
                : "Assinatura não encontrada.";
        return NextResponse.json({ ok: false, error: msg }, { status: 400 });
      }
      return NextResponse.json({ ok: true, initPoint: pre.initPoint, reused: pre.reused });
    }

    if (action === "activate") {
      // G4: ativar sem aceite é recusado no serviço. O admin PRECISA ver o motivo
      // — "cliquei e não ativou, sem explicação" já é um incidente por si só.
      const act = await PlanSubscriptionService.activate(sub.id);
      if (!act.ok) {
        const msg =
          act.reason === "sem_aceite"
            ? `Sem aceite do Termo. Mande o link https://foocci.com.br/contratar/${sub.acceptToken} e ative depois do aceite.`
            : act.reason === "terminal"
              ? "Assinatura cancelada (estado terminal) — não reativa. Crie uma nova assinatura."
              : "Assinatura não encontrada.";
        return NextResponse.json({ ok: false, error: msg }, { status: 409 });
      }
      // A costura vale também para a venda 1:1: se a assinatura tem cadastro
      // pendente, a conta nasce aqui; se não tem, é no-op.
      await PlanProvisioningService.provision(sub.id).catch((e) =>
        console.error(`[admin/billing] provisionamento falhou para ${sub.id}:`, e),
      );
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
      // Cancelamento REAL (CR A1): não basta marcar CANCELADA no nosso banco —
      // sem cancelar o preapproval no MP, o gateway cobra o próximo ciclo e o
      // webhook tentaria reativar. Duas travas, complementares:
      //  1. Marcar terminal SEMPRE arma a trava anti-reativação (código puro,
      //     independe do token) — o webhook não ressuscita nem fatura.
      //  2. Cancelar no MP é o que estanca o dinheiro no cartão — depende do
      //     MP_PLATFORM_ACCESS_TOKEN.
      let gateway: { ok: boolean; detail?: string; skipped?: boolean } = { ok: true, skipped: true };
      if (sub.mpPreapprovalId) {
        const r = await MercadoPagoPlatformBilling.cancelPreapproval(sub.mpPreapprovalId);
        gateway = r.ok
          ? { ok: true, detail: r.status }
          : {
              ok: false,
              detail:
                r.reason === "gateway_nao_configurado"
                  ? "MP_PLATFORM_ACCESS_TOKEN ausente — o preapproval NÃO foi cancelado no Mercado Pago; a cobrança pode continuar. Cancele manualmente no painel do MP."
                  : `Mercado Pago recusou o cancelamento (${r.detail ?? "sem detalhe"}). Cancele manualmente no painel do MP.`,
            };
      }

      // A trava local é armada AINDA QUE o MP falhe — é ela que impede a
      // cobrança-zumbi de reativar/faturar do nosso lado.
      await PlanSubscriptionService.cancel(sub.id);

      if (!gateway.ok) {
        // Guardrail: cancelamento externo falho NÃO vira sucesso silencioso.
        // Cancelado localmente (trava armada), mas o operador PRECISA agir no MP.
        return NextResponse.json(
          { ok: false, canceledLocally: true, gatewayError: gateway.detail },
          { status: 502 },
        );
      }
      return NextResponse.json({ ok: true, gateway });
    }

    if (action === "emit-invoices") {
      const r = await PlanNfseService.emitAllPending();
      return NextResponse.json({ ok: true, ...r });
    }

    if (action === "refresh-invoice" && parsed.data.invoiceId) {
      const r = await PlanNfseService.refreshStatus(parsed.data.invoiceId);
      return NextResponse.json({ ok: r.ok, detail: r.detail });
    }

    if (action === "mark-invoice-emitted" && parsed.data.invoiceId) {
      // Modo MEI manual (decisão do CEO, 03/08): a nota é emitida à mão no
      // Emissor Nacional (gov.br) e registrada aqui para a fila não mentir.
      // A fila continua sendo a lista de conferência: PENDENTE = falta emitir.
      const inv = await prisma.planInvoice.findUnique({ where: { id: parsed.data.invoiceId } });
      if (!inv || inv.subscriptionId !== sub.id) {
        return NextResponse.json({ ok: false, error: "Cobrança não encontrada" }, { status: 404 });
      }
      await prisma.planInvoice.update({
        where: { id: inv.id },
        data: {
          status: "AUTORIZADA",
          emittedAt: new Date(),
          providerRef: inv.providerRef ?? `manual-${inv.id}`,
          pdfUrl: parsed.data.pdfUrl ?? inv.pdfUrl,
          errorMessage: null,
        },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Ação não reconhecida" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
