/**
 * agent-admin-scope — quem pode olhar o Agente de CRM de qual restaurante.
 *
 * A escada do agente (ligar por campanha, master switch, botão de pânico) saiu
 * do painel do lojista e passou a viver no admin. Para isso o admin precisa
 * pedir os mesmos dados de um restaurante que não é o "dele" — e essa é
 * exatamente a permissão que não pode vazar para o lojista.
 *
 * A regra, na ordem:
 *   1. Tem contexto de tenant? É o restaurante dele. Ponto — lojista NUNCA
 *      escolhe restaurante, mesmo mandando o parâmetro.
 *   2. Não tem tenant, mas é admin autenticado e declarou o restaurante? Vale.
 *   3. Qualquer outra coisa: null (o chamador devolve 401).
 *
 * A ordem importa: com o tenant primeiro, um lojista que descubra o parâmetro
 * `restaurantId` continua vendo só a própria casa — o valor declarado é
 * simplesmente ignorado.
 *
 * Mesma forma do `resolverAgencia` do SDR, de propósito: uma regra só para
 * "admin pode declarar o dono do dado", em vez de uma variação por rota.
 */

import type { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getTenantContext } from "@/lib/tenant";

export interface EscopoDoAgente {
  restaurantId: string;
  /** true quando quem pediu é o admin olhando outro restaurante. */
  viaAdmin: boolean;
}

export function resolverEscopoDoAgente(
  req: NextRequest,
  declarado?: string | null,
): EscopoDoAgente | null {
  const ctx = getTenantContext(req);
  if (ctx) return { restaurantId: ctx.restaurantId, viaAdmin: false };

  const id = declarado?.trim();
  if (id && checkAdminRequest(req)) return { restaurantId: id, viaAdmin: true };

  return null;
}
