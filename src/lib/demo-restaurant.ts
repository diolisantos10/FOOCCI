/**
 * Restaurante de DEMONSTRAÇÃO — o único lugar que responde "isto é cliente ou é vitrine?".
 *
 * A Foocci Bakery é um tenant completo e funcional: cardápio, horário, entrega,
 * pagamento, comanda. É assim de propósito — uma vitrine que não roda de verdade
 * não demonstra nada. O preço disso é que ela fica indistinguível de um cliente
 * numa consulta descuidada, e um restaurante fictício dentro de um relatório de
 * receita ou de uma cobrança é um erro caro e silencioso.
 *
 * A marca é a coluna `Restaurant.isDemo`, não o nome do slug: guardrail 4 —
 * convenção de nome é aviso, coluna é trava. O slug abaixo é só o endereço público
 * conhecido da vitrine (usado pelo seed e pela aba de degustação do site), NUNCA a
 * fonte da verdade sobre o que é demo.
 */

import { prisma } from "@/lib/prisma";

/** Endereço público da vitrine. Fonte da verdade de "é demo?" é `isDemo`, não isto. */
export const DEMO_BAKERY_SLUG = "foocci-bakery";

/**
 * Filtro canônico de "só clientes de verdade". Use em qualquer contagem, relatório
 * ou listagem comercial: `where: { ...REAL_RESTAURANTS_ONLY }`.
 */
export const REAL_RESTAURANTS_ONLY = { isDemo: false } as const;

/** Filtro canônico do inverso — só as vitrines. */
export const DEMO_RESTAURANTS_ONLY = { isDemo: true } as const;

/**
 * Erro de cobrança contra vitrine. Tipo próprio para a rota poder responder 400
 * com a evidência (guardrail 6) em vez de virar 500 anônimo.
 */
export class DemoRestaurantBillingError extends Error {
  readonly restaurantId: string;
  readonly reason: "DEMO" | "NOT_FOUND";

  constructor(restaurantId: string, reason: "DEMO" | "NOT_FOUND") {
    super(
      reason === "DEMO"
        ? `Restaurante ${restaurantId} é de DEMONSTRAÇÃO (isDemo=true) e não pode ser ` +
            `vinculado a uma assinatura. Vitrine não vira cobrança.`
        : `Restaurante ${restaurantId} não existe — não dá para provar que não é ` +
            `vitrine, então a assinatura não é criada (falha fechada).`,
    );
    this.name = "DemoRestaurantBillingError";
    this.restaurantId = restaurantId;
    this.reason = reason;
  }
}

/**
 * Trava: recusa vincular um restaurante de demonstração a qualquer coisa que cobre.
 * Falha FECHADA — restaurante inexistente também não passa, porque "não achei"
 * não é prova de que não é demo (guardrail 1).
 */
export async function assertNotDemoRestaurant(restaurantId: string): Promise<void> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { isDemo: true },
  });
  if (!r) throw new DemoRestaurantBillingError(restaurantId, "NOT_FOUND");
  if (r.isDemo) throw new DemoRestaurantBillingError(restaurantId, "DEMO");
}
