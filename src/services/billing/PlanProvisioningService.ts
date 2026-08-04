/**
 * A COSTURA: pagamento confirmado → a conta do cliente existe e ele já roda.
 *
 * Era o buraco central do self-service. `PlanSubscription.restaurantId` nunca era
 * preenchido por ninguém: o cliente pagava, a assinatura ficava ATIVA, e não havia
 * restaurante, nem usuário dono, nem `Restaurant.plan` escrito. Este serviço é o
 * único lugar que fecha esse elo.
 *
 * ── Por que a idempotência aqui não é opcional ──────────────────────────────
 * Quem chama isto é o webhook do Mercado Pago, que é RETRYABLE por contrato: o MP
 * reenvia o mesmo evento até receber 200, e reenvia de novo depois. Rodar duas
 * vezes NÃO pode criar dois restaurantes. A trava não é um `if` — é o índice
 * UNIQUE em `restaurants.originSubscriptionId`. Dois processamentos concorrentes
 * chegam ao INSERT; o banco derruba o segundo, e como tudo está numa transação
 * única, o perdedor não deixa nem restaurante nem usuário pela metade. Uma
 * checagem só em código perderia a corrida entre o SELECT e o INSERT.
 *
 * ── Por que não reusa RestaurantService.register ────────────────────────────
 * Duas razões concretas: (1) `register` recebe senha em texto puro, e aqui a
 * senha foi definida no checkout e só existe como hash bcrypt guardado na
 * assinatura — reusar exigiria persistir texto puro; (2) `register` não tem como
 * gravar a chave de idempotência DENTRO da mesma transação, que é justamente o
 * que impede o restaurante duplicado. Os defaults do tenant continuam sendo os
 * mesmos (`RestaurantDefaultsService`), chamados aqui igual lá.
 *
 * ── O caso que não pode falhar em silêncio ──────────────────────────────────
 * "O cliente pagou e a conta não nasceu" é o pior desfecho deste domínio. Toda
 * falha é gravada em `provisionError` com o dado do cliente e sai no log com a
 * evidência (guardrail 6). Nada de catch mudo.
 */

import { prisma } from "@/lib/prisma";
import type { PlanSubscription, Prisma } from "@prisma/client";
import { RestaurantDefaultsService } from "@/services/restaurant/RestaurantDefaultsService";

export type ProvisionOutcome =
  /** Criou restaurante + dono agora. */
  | { status: "criado"; restaurantId: string; slug: string; ownerEmail: string; slugChanged: boolean }
  /** Já existia (rodada anterior, ou o CEO já tinha vinculado um restaurante). */
  | { status: "ja_provisionado"; restaurantId: string; slug: string }
  /** Assinatura sem dados de cadastro — venda 1:1 do admin. Nada a fazer. */
  | { status: "sem_dados_de_cadastro" }
  /** Falhou. O cliente PAGOU e não tem conta: exige ação humana. */
  | { status: "falhou"; error: string };

/** Slug legível a partir do nome — mesma regra do cadastro manual. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/**
 * Acha um slug livre a partir do desejado. O cliente escolheu o dele no checkout
 * e a colisão foi checada lá — mas entre o checkout e o pagamento pode entrar
 * outro restaurante com o mesmo nome. Perder a conta de um cliente que pagou por
 * causa de um slug ocupado seria muito pior do que entregar `pizzaria-do-ze-2`;
 * a URL real aparece na tela pós-pagamento, então o cliente vê a verdade.
 */
async function resolveFreeSlug(
  tx: Prisma.TransactionClient,
  desired: string,
): Promise<{ slug: string; changed: boolean }> {
  const base = slugify(desired) || "restaurante";
  for (let i = 1; i <= 20; i++) {
    const candidate = i === 1 ? base : `${base.slice(0, 56)}-${i}`;
    const taken = await tx.restaurant.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return { slug: candidate, changed: i > 1 };
  }
  // 20 colisões seguidas: sufixo aleatório em vez de desistir da conta paga.
  return { slug: `${base.slice(0, 50)}-${Math.random().toString(36).slice(2, 8)}`, changed: true };
}

export const PlanProvisioningService = {
  /**
   * Idempotente por construção. Pode ser chamado quantas vezes o MP quiser.
   */
  async provision(subscriptionId: string): Promise<ProvisionOutcome> {
    const sub = await prisma.planSubscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) return { status: "falhou", error: `Assinatura ${subscriptionId} não existe.` };

    // Caminho rápido: já costurada. (A trava de verdade é o UNIQUE lá embaixo —
    // este atalho só evita trabalho, não é o que garante a idempotência.)
    if (sub.restaurantId) {
      const r = await prisma.restaurant.findUnique({
        where: { id: sub.restaurantId },
        select: { id: true, slug: true, plan: true },
      });
      if (r) {
        // O plano contratado manda no plano do restaurante, sempre.
        if (r.plan !== sub.plan) {
          await prisma.restaurant.update({ where: { id: r.id }, data: { plan: sub.plan } });
        }
        return { status: "ja_provisionado", restaurantId: r.id, slug: r.slug };
      }
    }

    // Assinatura criada no admin (venda 1:1): não há cadastro para criar.
    if (!sub.signupSlug || !sub.signupRestaurantName || !sub.signupOwnerPasswordHash) {
      return { status: "sem_dados_de_cadastro" };
    }
    if (!sub.customerEmail) {
      return await this.recordFailure(sub, "Assinatura sem e-mail do cliente — impossível criar o usuário dono.");
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        // Releitura DENTRO da transação: fecha a janela entre o atalho acima e aqui.
        const fresh = await tx.planSubscription.findUnique({
          where: { id: sub.id },
          select: { restaurantId: true },
        });
        if (fresh?.restaurantId) return null;

        const { slug, changed } = await resolveFreeSlug(tx, sub.signupSlug!);

        const restaurant = await tx.restaurant.create({
          data: {
            name: sub.signupRestaurantName!,
            slug,
            phone: sub.customerWhatsapp,
            email: sub.customerEmail,
            plan: sub.plan,
            // A trava: UNIQUE. Um segundo webhook concorrente morre aqui.
            originSubscriptionId: sub.id,
          },
        });

        await tx.user.create({
          data: {
            restaurantId: restaurant.id,
            name: sub.customerName,
            email: sub.customerEmail!.toLowerCase(),
            password: sub.signupOwnerPasswordHash!,
            role: "OWNER",
          },
        });

        await tx.planSubscription.update({
          where: { id: sub.id },
          data: { restaurantId: restaurant.id, provisionedAt: new Date(), provisionError: null },
        });

        return { restaurant, slugChanged: changed };
      });

      if (!created) {
        // Outra rodada venceu entre o atalho e a transação.
        const again = await prisma.planSubscription.findUnique({
          where: { id: sub.id },
          include: { restaurant: { select: { id: true, slug: true } } },
        });
        if (again?.restaurant) {
          return { status: "ja_provisionado", restaurantId: again.restaurant.id, slug: again.restaurant.slug };
        }
        return await this.recordFailure(sub, "Provisionamento abortado sem restaurante resultante.");
      }

      if (created.slugChanged) {
        console.warn(
          `[billing/provisioning] o endereço desejado "${sub.signupSlug}" já estava ocupado; ` +
            `a loja de ${sub.customerName} nasceu como "${created.restaurant.slug}". ` +
            `A tela pós-pagamento mostra o endereço real ao cliente.`,
        );
      }

      // Defaults do tenant — igual ao cadastro manual. Fora da transação de
      // propósito: são muitas escritas e a conta já vale sem elas.
      RestaurantDefaultsService.createRestaurantDefaults(created.restaurant.id).catch((e) =>
        console.error(
          `[billing/provisioning] defaults falharam para o restaurante ${created.restaurant.id} ` +
            `(assinatura ${sub.id}). A conta EXISTE e o dono já entra; faltam só as configurações padrão:`,
          e,
        ),
      );

      return {
        status: "criado",
        restaurantId: created.restaurant.id,
        slug: created.restaurant.slug,
        ownerEmail: sub.customerEmail,
        slugChanged: created.slugChanged,
      };
    } catch (err) {
      if (isUniqueViolation(err)) {
        // O UNIQUE de originSubscriptionId fez o trabalho dele: outro
        // processamento do MESMO evento já criou a conta. Não é erro.
        const again = await prisma.restaurant.findUnique({
          where: { originSubscriptionId: sub.id },
          select: { id: true, slug: true },
        });
        if (again) return { status: "ja_provisionado", restaurantId: again.id, slug: again.slug };
      }
      return await this.recordFailure(sub, err instanceof Error ? err.message : String(err));
    }
  },

  /**
   * O cliente pagou e a conta não nasceu. Isto NUNCA passa em silêncio: grava o
   * motivo na assinatura (visível no admin) e loga com o dado de quem ficou sem
   * conta, para dar para agir sem caçar em log de gateway.
   */
  async recordFailure(sub: PlanSubscription, error: string): Promise<ProvisionOutcome> {
    const detail =
      `CLIENTE PAGOU E A CONTA NÃO FOI CRIADA. Assinatura ${sub.id} · ` +
      `${sub.customerName} · ${sub.customerEmail ?? "sem e-mail"} · ${sub.customerWhatsapp} · ` +
      `plano ${sub.plan}/${sub.cycle} · loja desejada "${sub.signupSlug ?? "-"}" · motivo: ${error}`;
    console.error(`[billing/provisioning] ${detail}`);
    await prisma.planSubscription
      .update({ where: { id: sub.id }, data: { provisionError: detail.slice(0, 800) } })
      .catch((e) => console.error("[billing/provisioning] nem o registro da falha gravou:", e));
    return { status: "falhou", error: detail };
  },
};
