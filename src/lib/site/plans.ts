/**
 * Planos para o site público — a camada de COPY.
 *
 * MUDANÇA (04/08/2026): os valores não moram mais aqui. Esta era uma das quatro
 * tabelas de preço do repositório, e com o checkout self-service no ar tabela
 * duplicada deixou de ser dívida e virou risco de cobrar diferente do anunciado.
 * O número agora vem de `@/lib/billing/pricing` — a mesma função que decide o
 * que sai do cartão. Aqui ficam só nome, posicionamento e para quem serve.
 *
 * O `monthly: number | null` foi mantido na interface porque componentes leem
 * `monthly === null` para renderizar "sob demonstração". Hoje os três planos têm
 * valor fechado, então nunca é null — mas o caminho continua existindo para um
 * plano futuro sem preço público, que é exatamente o que a decisão D3 protege.
 */

import { PLAN_CYCLE_CENTS, SITE_PLAN_TO_CODE, type SitePlanId } from "@/lib/billing/pricing";

export interface Plan {
  id: SitePlanId;
  name: string;
  /** Mensalidade em reais, derivada da fonte única de preço. */
  monthly: number | null;
  /** O diferencial que abre o card — não uma lista de recursos. */
  onlyHere: string;
  forWho: string;
}

/** Reais por mês no ciclo mensal, lido da fonte única (nunca digitado aqui). */
function monthlyReais(id: SitePlanId): number {
  return PLAN_CYCLE_CENTS[SITE_PLAN_TO_CODE[id]].MENSAL / 100;
}

export const PLANS: Plan[] = [
  {
    id: "essencial",
    name: "Essencial",
    monthly: monthlyReais("essencial"),
    onlyHere: "Seu cardápio e seus pedidos fora do marketplace, com o cliente virando seu.",
    forWho: "Para quem está começando a vender direto.",
  },
  {
    id: "crescimento",
    name: "Crescimento",
    monthly: monthlyReais("crescimento"),
    onlyHere: "O CRM que traz o cliente de volta antes de ele sumir — não depois.",
    forWho: "Para quem já vende e quer recorrência.",
  },
  {
    id: "performance",
    name: "Performance",
    monthly: monthlyReais("performance"),
    onlyHere: "CMV com ficha técnica e reprecificação automática por canal.",
    forWho: "Para quem opera com margem apertada e muitos canais.",
  },
];

/** True enquanto algum plano estiver sem valor — usado para suavizar a copy. */
export const PRICING_INCOMPLETE = PLANS.some((p) => p.monthly === null);

export function planByIdOrNull(id: Plan["id"]): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
}
