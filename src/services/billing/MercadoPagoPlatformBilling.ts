/**
 * Cobrança recorrente da PLATAFORMA no Mercado Pago (Assinaturas / preapproval).
 *
 * ATENÇÃO À FRONTEIRA: o Mercado Pago que já existia no sistema é o dos
 * RESTAURANTES (cada lojista recebe os pedidos dele na conta dele). Este módulo
 * usa a conta DA FOOCCI, com credencial própria (MP_PLATFORM_ACCESS_TOKEN) —
 * misturar as duas contas mandaria a mensalidade dos planos para o caixa de um
 * restaurante.
 *
 * Sem o token configurado o fluxo NÃO trava: o serviço devolve null e a
 * assinatura segue no modo manual (o CEO combina o pagamento e marca ativa no
 * admin). Gateway é acelerador, não pré-requisito — a V1 vende hoje.
 */

import type { PlanSubscription } from "@prisma/client";
import { CYCLE_MONTHS } from "./PlanSubscriptionService";

const MP_API = "https://api.mercadopago.com";

function platformToken(): string | null {
  return process.env.MP_PLATFORM_ACCESS_TOKEN || null;
}

export function isPlatformBillingConfigured(): boolean {
  return !!platformToken();
}

export interface PreapprovalResult {
  id: string;
  initPoint: string;
}

export const MercadoPagoPlatformBilling = {
  /**
   * Cria a assinatura recorrente no MP e devolve o link de pagamento hospedado.
   * Exige e-mail do cliente (obrigatório na API do MP para preapproval).
   */
  async createPreapproval(sub: PlanSubscription): Promise<PreapprovalResult | null> {
    const token = platformToken();
    if (!token) return null;
    if (!sub.customerEmail) {
      throw new Error("MP exige e-mail do cliente para criar a assinatura — preencha o e-mail no admin.");
    }

    const months = CYCLE_MONTHS[sub.cycle];
    const res = await fetch(`${MP_API}/preapproval`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: `Foocci — plano ${sub.plan} (${sub.cycle.toLowerCase()})`,
        external_reference: sub.id,
        payer_email: sub.customerEmail,
        back_url: "https://foocci.com.br/contratar/obrigado",
        auto_recurring: {
          frequency: months,
          frequency_type: "months",
          transaction_amount: sub.priceCents / 100,
          currency_id: "BRL",
        },
      }),
    });

    const body = (await res.json().catch(() => null)) as { id?: string; init_point?: string; message?: string } | null;
    if (!res.ok || !body?.id || !body?.init_point) {
      throw new Error(`MP recusou a criação da assinatura (${res.status}): ${body?.message ?? "sem detalhe"}`);
    }
    return { id: body.id, initPoint: body.init_point };
  },

  /**
   * Busca o estado real de um preapproval direto na API — o webhook do MP só
   * carrega o ID, e confiar no corpo do webhook seria confiar em quem POSTou.
   * O refetch com o NOSSO token é a verificação (mesmo padrão do webhook de
   * pedidos).
   */
  async fetchPreapproval(id: string): Promise<{ status: string; externalReference: string | null } | null> {
    const token = platformToken();
    if (!token) return null;
    const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { status?: string; external_reference?: string } | null;
    if (!body?.status) return null;
    return { status: body.status, externalReference: body.external_reference ?? null };
  },

  /** Busca um pagamento (cobrança individual da assinatura) para confirmar e faturar. */
  async fetchPayment(id: string): Promise<{
    status: string;
    amountCents: number;
    preapprovalId: string | null;
    externalReference: string | null;
    approvedAt: string | null;
  } | null> {
    const token = platformToken();
    if (!token) return null;
    const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
      status?: string;
      transaction_amount?: number;
      external_reference?: string;
      date_approved?: string;
      point_of_interaction?: { transaction_data?: { subscription_id?: string } };
      metadata?: { preapproval_id?: string };
    } | null;
    if (!body?.status) return null;
    return {
      status: body.status,
      amountCents: Math.round((body.transaction_amount ?? 0) * 100),
      preapprovalId:
        body.point_of_interaction?.transaction_data?.subscription_id ?? body.metadata?.preapproval_id ?? null,
      externalReference: body.external_reference ?? null,
      approvedAt: body.date_approved ?? null,
    };
  },
};
