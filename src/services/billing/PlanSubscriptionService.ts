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
import {
  CYCLE_MONTHS,
  PLAN_MONTHLY_CENTS,
  firstChargeCents as firstChargeCentsFor,
  recurringChargeCents,
} from "@/lib/billing/pricing";
import { MercadoPagoPlatformBilling } from "./MercadoPagoPlatformBilling";

// Preço não mora mais aqui: a fonte única é `@/lib/billing/pricing`, lida também
// pela página pública. Reexportado para não quebrar quem já importava daqui.
export { PLAN_MONTHLY_CENTS, CYCLE_MONTHS };

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
  /** Se omitido: valor de tabela do CICLO (fonte única `@/lib/billing/pricing`). */
  priceCents?: number | null;
  /**
   * Primeira cobrança (regra dos 50% do 1º mês). Se omitido, aplica a regra da
   * fonte única. Passe `null` explícito só quando NÃO houver desconto — é o caso
   * de uma renegociação digitada pelo CEO no admin.
   */
  firstChargeCents?: number | null;
  restaurantId?: string | null;
  notes?: string | null;
  /** Dados do checkout self-service — a conta que nasce quando o pagamento entrar. */
  signupRestaurantName?: string | null;
  signupSlug?: string | null;
  signupOwnerPasswordHash?: string | null;
  signupIdempotencyKey?: string | null;
}

export const PlanSubscriptionService = {
  /** Cria o rascunho e o token do link de aceite. Status: AGUARDANDO_ACEITE. */
  async create(input: CreateSubscriptionInput): Promise<PlanSubscription> {
    // `priceCents` é o valor CHEIO do ciclo (o de toda renovação).
    const priceCents =
      input.priceCents && input.priceCents > 0
        ? Math.round(input.priceCents)
        : recurringChargeCents(input.plan, input.cycle);

    // A primeira cobrança carrega os 50% do primeiro mês. Só é omitida quando o
    // preço veio digitado (negociação) sem primeira cobrança explícita — aí o
    // desconto não se inventa em cima de um valor que a tabela não conhece.
    const firstCharge =
      input.firstChargeCents === null
        ? null
        : input.firstChargeCents && input.firstChargeCents > 0
          ? Math.round(input.firstChargeCents)
          : input.priceCents && input.priceCents > 0
            ? null
            : firstChargeCentsFor(input.plan, input.cycle);

    return prisma.planSubscription.create({
      data: {
        customerName: input.customerName.trim(),
        customerWhatsapp: input.customerWhatsapp.trim(),
        customerCnpj: input.customerCnpj?.trim() || null,
        customerEmail: input.customerEmail?.trim() || null,
        plan: input.plan,
        cycle: input.cycle,
        priceCents,
        firstChargeCents: firstCharge,
        restaurantId: input.restaurantId || null,
        notes: input.notes?.trim() || null,
        status: "AGUARDANDO_ACEITE",
        // 24 bytes url-safe: não adivinhável, e curto o bastante para WhatsApp.
        acceptToken: randomBytes(24).toString("base64url"),
        signupRestaurantName: input.signupRestaurantName?.trim() || null,
        signupSlug: input.signupSlug?.trim() || null,
        signupOwnerPasswordHash: input.signupOwnerPasswordHash || null,
        signupIdempotencyKey: input.signupIdempotencyKey || null,
      },
    });
  },

  async getById(id: string): Promise<PlanSubscription | null> {
    if (!id) return null;
    return prisma.planSubscription.findUnique({ where: { id } });
  },

  async findByIdempotencyKey(key: string): Promise<PlanSubscription | null> {
    if (!key) return null;
    return prisma.planSubscription.findUnique({ where: { signupIdempotencyKey: key } });
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
   * O ÚNICO caminho para obter o link de pagamento de uma assinatura (G2).
   *
   * O bug que isto fecha: `createPreapproval` era chamado sem olhar se a
   * assinatura já tinha um. No self-service, um cliente que recarrega a página
   * ou clica duas vezes criava DUAS recorrências no cartão dele — e a segunda
   * cobra para sempre, porque nada no nosso lado sabia que ela existia.
   *
   * Duas travas, para os dois cenários diferentes:
   *  1. Reenvio SEQUENCIAL (o comum): já existe `mpPreapprovalId` → devolve o
   *     link guardado e não toca no MP.
   *  2. CORRIDA (dois requests simultâneos, nenhum vê o do outro): os dois criam
   *     no MP, mas a gravação é um `updateMany` com `mpPreapprovalId: null` —
   *     atômico, só um vence. O perdedor CANCELA no MP o preapproval órfão que
   *     acabou de criar. Sem isso a corrida deixaria uma recorrência viva que
   *     nenhum registro nosso aponta: cobrança fantasma, invisível para sempre.
   */
  async ensurePreapproval(
    id: string,
  ): Promise<
    | { ok: true; preapprovalId: string; initPoint: string; reused: boolean }
    | { ok: false; reason: "nao_encontrada" | "terminal" | "gateway_nao_configurado" | "sem_email" }
  > {
    const sub = await prisma.planSubscription.findUnique({ where: { id } });
    if (!sub) return { ok: false, reason: "nao_encontrada" };
    if (isTerminalStatus(sub.status)) return { ok: false, reason: "terminal" };

    // Trava 1 — reenvio sequencial. Não fala com o MP.
    if (sub.mpPreapprovalId && sub.mpInitPoint) {
      return { ok: true, preapprovalId: sub.mpPreapprovalId, initPoint: sub.mpInitPoint, reused: true };
    }
    if (!sub.customerEmail) return { ok: false, reason: "sem_email" };

    const pre = await MercadoPagoPlatformBilling.createPreapproval(sub);
    if (!pre) return { ok: false, reason: "gateway_nao_configurado" };

    // Trava 2 — a corrida. Só grava quem chegar primeiro.
    const { count } = await prisma.planSubscription.updateMany({
      where: { id, mpPreapprovalId: null },
      data: { mpPreapprovalId: pre.id, mpInitPoint: pre.initPoint, status: "AGUARDANDO_PAGAMENTO" },
    });

    if (count === 0) {
      // Perdemos a corrida: o preapproval que acabamos de criar não pertence a
      // ninguém. Cancelar é o que impede a segunda cobrança no cartão do cliente.
      const cancel = await MercadoPagoPlatformBilling.cancelPreapproval(pre.id).catch(() => null);
      if (!cancel || !cancel.ok) {
        console.error(
          `[billing] CORRIDA no ensurePreapproval da assinatura ${id}: o preapproval órfão ${pre.id} ` +
            `NÃO pôde ser cancelado no Mercado Pago. RISCO DE COBRANÇA EM DOBRO — cancele ${pre.id} ` +
            `manualmente no painel do MP (cliente: ${sub.customerName} / ${sub.customerEmail}).`,
        );
      }
      const fresh = await prisma.planSubscription.findUnique({ where: { id } });
      if (fresh?.mpPreapprovalId && fresh.mpInitPoint) {
        return { ok: true, preapprovalId: fresh.mpPreapprovalId, initPoint: fresh.mpInitPoint, reused: true };
      }
      return { ok: false, reason: "nao_encontrada" };
    }

    return { ok: true, preapprovalId: pre.id, initPoint: pre.initPoint, reused: false };
  },

  /**
   * Ativa a assinatura (webhook confirmou, ou o CEO marcou manualmente — o modo
   * manual existe porque a V1 não pode depender de o gateway estar configurado).
   *
   * DUAS condições, ambas dentro do mesmo UPDATE atômico:
   *  - não estar em estado terminal (CR A1 — cobrança-zumbi não ressuscita);
   *  - TER ACEITE DE CONTRATO (`termsAcceptedAt`). É o G4: sem esta cláusula, um
   *    cliente que pulasse a tela de aceite e pagasse direto ficava ATIVO sem
   *    contrato — a Foocci prestando serviço sem nada assinado. Não é validação
   *    de formulário, é o que dá sustentação jurídica à cobrança.
   *
   * Recusar NÃO descarta o dinheiro (guardrail 5: a proteção não pode ser pior
   * que o problema): quem chama continua registrando a cobrança e a NFS-e. O que
   * fica retido é só o acesso, com o motivo e o link de aceite no log.
   */
  async activate(id: string): Promise<{ ok: boolean; reason?: "nao_encontrada" | "terminal" | "sem_aceite" }> {
    const { count } = await prisma.planSubscription.updateMany({
      where: {
        id,
        status: { notIn: [...TERMINAL_STATUSES] },
        termsAcceptedAt: { not: null },
      },
      data: { status: "ATIVA", activatedAt: new Date(), canceledAt: null },
    });
    if (count > 0) return { ok: true };

    // Caminho lento, só quando algo barrou: descobrir O QUE barrou para o alerta
    // carregar a própria evidência (guardrail 6). "Não ativou" sem motivo é ruído.
    const sub = await prisma.planSubscription.findUnique({ where: { id } });
    if (!sub) {
      console.warn(`[billing] activate: assinatura ${id} não existe.`);
      return { ok: false, reason: "nao_encontrada" };
    }
    if (isTerminalStatus(sub.status)) {
      console.warn(
        `[billing] activate NÃO reativou ${id}: estado terminal (${sub.status}). ` +
          `Se houve pagamento associado, é cobrança-zumbi — verificar reembolso no Mercado Pago.`,
      );
      return { ok: false, reason: "terminal" };
    }
    console.error(
      `[billing] activate BLOQUEADO na assinatura ${id}: SEM ACEITE DO TERMO. ` +
        `Cliente ${sub.customerName} (${sub.customerEmail ?? "sem e-mail"} / ${sub.customerWhatsapp}), ` +
        `plano ${sub.plan}/${sub.cycle}. Se o pagamento já entrou, a cobrança foi registrada mas o acesso ` +
        `está retido: mande o aceite em https://foocci.com.br/contratar/${sub.acceptToken} e ative de novo.`,
    );
    return { ok: false, reason: "sem_aceite" };
  },

  /**
   * Eleva o preapproval do MP do valor da 1ª cobrança para o valor cheio do
   * ciclo. Chamado quando a primeira cobrança é confirmada.
   *
   * Idempotente pelo `fullAmountSyncedAt` gravado num `updateMany` atômico ANTES
   * da chamada externa: um webhook reenviado não repete o PUT. Se o MP recusar, o
   * carimbo é desfeito e o erro fica gravado — nunca some.
   */
  async syncFullAmount(id: string): Promise<{ ok: boolean; reason?: string }> {
    const sub = await prisma.planSubscription.findUnique({ where: { id } });
    if (!sub) return { ok: false, reason: "nao_encontrada" };
    if (sub.fullAmountSyncedAt) return { ok: true, reason: "ja_sincronizado" };
    if (!sub.mpPreapprovalId) return { ok: true, reason: "sem_preapproval" };
    if (sub.firstChargeCents == null || sub.firstChargeCents >= sub.priceCents) {
      return { ok: true, reason: "sem_desconto" };
    }

    // Reserva o degrau primeiro: dois webhooks simultâneos, só um faz o PUT.
    const { count } = await prisma.planSubscription.updateMany({
      where: { id, fullAmountSyncedAt: null },
      data: { fullAmountSyncedAt: new Date() },
    });
    if (count === 0) return { ok: true, reason: "ja_sincronizado" };

    const r = await MercadoPagoPlatformBilling.updatePreapprovalAmount(
      sub.mpPreapprovalId,
      sub.priceCents,
      sub.cycle,
    ).catch((err) => ({ ok: false as const, reason: "mp_recusou" as const, detail: String(err) }));

    if (r.ok) {
      await prisma.planSubscription.update({ where: { id }, data: { priceSyncError: null } });
      return { ok: true };
    }

    const detail =
      `Mercado Pago não aceitou elevar a assinatura ${sub.mpPreapprovalId} de ` +
      `${sub.firstChargeCents} para ${sub.priceCents} centavos (${r.reason}: ${"detail" in r ? r.detail : "sem detalhe"}). ` +
      `O cliente ${sub.customerName} seguirá pagando o valor do 1º mês — corrigir no painel do MP.`;
    // Desfaz o carimbo: sem isso a próxima tentativa achava que já estava feito
    // e a receita ficaria metade para sempre, em silêncio.
    await prisma.planSubscription.update({
      where: { id },
      data: { fullAmountSyncedAt: null, priceSyncError: detail.slice(0, 500) },
    });
    console.error(`[billing] ${detail}`);
    return { ok: false, reason: detail };
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
