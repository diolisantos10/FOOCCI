/**
 * Assinaturas de plano da PRÓPRIA Foocci — o fluxo de compra V1 (assistido).
 *
 * A venda é 1:1: o CEO fecha no WhatsApp, cria a assinatura no admin, manda o
 * link de aceite; o cliente aceita o Termo (com trilha), recebe o link de
 * pagamento recorrente do Mercado Pago, e o webhook ativa. Cada cobrança
 * confirmada vira uma PlanInvoice — a fila da NFS-e.
 *
 * Regras desta casa aplicadas aqui:
 *  - dinheiro em centavos;
 *  - status só anda pelo serviço (nunca update solto de rota);
 *  - a fila fiscal NUNCA descarta: sem condição de emitir → PENDENTE com motivo.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { BillingCycle, Plan, PlanSubscription } from "@prisma/client";
import { TERMS_VERSION } from "@/lib/billing/terms";
import { assertNotDemoRestaurant } from "@/lib/demo-restaurant";

/** Preço mensal de tabela por plano, em centavos (tabela aprovada 03/08). */
export const PLAN_MONTHLY_CENTS: Record<Plan, number> = {
  STARTER: 17900,
  GROWTH: 42900,
  PRO: 89900,
};

export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MENSAL: 1,
  TRIMESTRAL: 3,
  ANUAL: 12,
};

/**
 * Estados TERMINAIS: uma assinatura aqui NÃO volta a cobrar por evento externo
 * (webhook de pagamento, preapproval "authorized" reenviado). Só sai daqui por
 * REASSINATURA EXPLÍCITA — que nesta casa é um registro novo (`create`), nunca a
 * ressurreição do registro cancelado (CR A1). Esta lista é a fonte da trava e é
 * código puro: não depende do `MP_PLATFORM_ACCESS_TOKEN`.
 */
export const TERMINAL_STATUSES = ["CANCELADA"] as const;

export function isTerminalStatus(status: PlanSubscription["status"]): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export interface CreateSubscriptionInput {
  customerName: string;
  customerWhatsapp: string;
  customerCnpj?: string | null;
  customerEmail?: string | null;
  plan: Plan;
  cycle: BillingCycle;
  /** Se omitido: preço de tabela × meses do ciclo (sem desconto automático — desconto é decisão do CEO, digitada). */
  priceCents?: number | null;
  restaurantId?: string | null;
  notes?: string | null;
}

export const PlanSubscriptionService = {
  /** Cria o rascunho e o token do link de aceite. Status: AGUARDANDO_ACEITE. */
  async create(input: CreateSubscriptionInput): Promise<PlanSubscription> {
    // Vitrine não vira cobrança. A Foocci Bakery é um tenant completo e funcional
    // (é o que faz a degustação valer); sem esta trava ela é indistinguível de um
    // cliente na hora de criar assinatura. Guardrail 4 — a marca é coluna e a
    // recusa é código, não um combinado de nomenclatura.
    if (input.restaurantId) {
      await assertNotDemoRestaurant(input.restaurantId);
    }

    const priceCents =
      input.priceCents && input.priceCents > 0
        ? Math.round(input.priceCents)
        : PLAN_MONTHLY_CENTS[input.plan] * CYCLE_MONTHS[input.cycle];

    return prisma.planSubscription.create({
      data: {
        customerName: input.customerName.trim(),
        customerWhatsapp: input.customerWhatsapp.trim(),
        customerCnpj: input.customerCnpj?.trim() || null,
        customerEmail: input.customerEmail?.trim() || null,
        plan: input.plan,
        cycle: input.cycle,
        priceCents,
        restaurantId: input.restaurantId || null,
        notes: input.notes?.trim() || null,
        status: "AGUARDANDO_ACEITE",
        // 24 bytes url-safe: não adivinhável, e curto o bastante para WhatsApp.
        acceptToken: randomBytes(24).toString("base64url"),
      },
    });
  },

  async getByToken(token: string): Promise<PlanSubscription | null> {
    if (!token || token.length < 16) return null;
    return prisma.planSubscription.findUnique({ where: { acceptToken: token } });
  },

  /**
   * Registra o aceite do Termo. Idempotente: aceitar duas vezes não sobrescreve
   * a trilha original — o primeiro aceite é O aceite.
   */
  async recordAcceptance(token: string, acceptedBy: string, ip: string): Promise<PlanSubscription | null> {
    const sub = await this.getByToken(token);
    if (!sub) return null;
    if (sub.termsAcceptedAt) return sub; // já aceito — trilha original preservada
    if (sub.status === "CANCELADA") return null;

    return prisma.planSubscription.update({
      where: { id: sub.id },
      data: {
        status: "ACEITO",
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(),
        termsAcceptedBy: acceptedBy.trim().slice(0, 160),
        termsAcceptedIp: ip.slice(0, 64),
      },
    });
  },

  /** Guarda o vínculo com o preapproval do MP e avança para AGUARDANDO_PAGAMENTO. */
  async attachMercadoPago(id: string, preapprovalId: string, initPoint: string): Promise<void> {
    await prisma.planSubscription.update({
      where: { id },
      data: { mpPreapprovalId: preapprovalId, mpInitPoint: initPoint, status: "AGUARDANDO_PAGAMENTO" },
    });
  },

  /**
   * Ativa a assinatura (webhook confirmou, ou o CEO marcou manualmente — o modo
   * manual existe porque a V1 não pode depender de o gateway estar configurado).
   */
  async activate(id: string): Promise<void> {
    // Trava terminal (CR A1, guardrail 4 — código é a trava, não o comentário):
    // uma assinatura CANCELADA é estado terminal. O `updateMany` com
    // `status notIn TERMINAL_STATUSES` é ATÔMICO — não há janela entre "ler" e
    // "gravar" para um webhook ressuscitar uma sub que acabou de ser cancelada.
    // É código puro: funciona mesmo sem o token de plataforma (é ela que impede
    // a cobrança-zumbi quando não deu para cancelar no MP).
    const { count } = await prisma.planSubscription.updateMany({
      where: { id, status: { notIn: [...TERMINAL_STATUSES] } },
      data: { status: "ATIVA", activatedAt: new Date(), canceledAt: null },
    });
    if (count === 0) {
      // Carrega a própria evidência (guardrail 6): ou a sub não existe, ou está
      // terminal. Se chegou aqui por um pagamento, é cobrança-zumbi do MP —
      // conferir reembolso no painel do Mercado Pago.
      console.warn(
        `[billing] activate NÃO reativou ${id}: inexistente ou em estado terminal (CANCELADA). ` +
          `Se houve pagamento associado, é cobrança-zumbi — verificar reembolso no Mercado Pago.`,
      );
    }
  },

  async markDelinquent(id: string): Promise<void> {
    await prisma.planSubscription.update({ where: { id }, data: { status: "INADIMPLENTE" } });
  },

  async cancel(id: string): Promise<void> {
    await prisma.planSubscription.update({
      where: { id },
      data: { status: "CANCELADA", canceledAt: new Date() },
    });
  },

  async findByPreapproval(preapprovalId: string): Promise<PlanSubscription | null> {
    if (!preapprovalId) return null;
    return prisma.planSubscription.findFirst({ where: { mpPreapprovalId: preapprovalId } });
  },

  /**
   * Registra uma cobrança confirmada → entra na fila de NFS-e. Idempotente por
   * mpPaymentId: o MP reenvia webhooks, e cobrança duplicada seria nota duplicada.
   */
  async recordPaidCharge(subscriptionId: string, opts: {
    amountCents: number;
    mpPaymentId?: string | null;
    referenceMonth: string;
  }): Promise<{ invoiceId: string; created: boolean }> {
    if (opts.mpPaymentId) {
      const existing = await prisma.planInvoice.findUnique({ where: { mpPaymentId: opts.mpPaymentId } });
      if (existing) return { invoiceId: existing.id, created: false };
    }
    const inv = await prisma.planInvoice.create({
      data: {
        subscriptionId,
        amountCents: Math.round(opts.amountCents),
        referenceMonth: opts.referenceMonth,
        mpPaymentId: opts.mpPaymentId || null,
        status: "PENDENTE",
      },
    });
    return { invoiceId: inv.id, created: true };
  },

  async list() {
    return prisma.planSubscription.findMany({
      orderBy: { createdAt: "desc" },
      include: { invoices: { orderBy: { createdAt: "desc" } }, restaurant: { select: { name: true, slug: true } } },
    });
  },
};
