/**
 * GET /api/crm/ready-made — the ready-made campaign catalog with live per-restaurant
 * on/off state. Read-only; nothing is sent.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { ReadyMadeCampaignService } from "@/services/crm/ReadyMadeCampaignService";
import { CartRecoveryHealthService } from "@/services/order/CartRecoveryHealthService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  try {
    const [states, metaCrmActive] = await Promise.all([
      ReadyMadeCampaignService.getStates(ctx.restaurantId),
      ReadyMadeCampaignService.isMetaConnected(ctx.restaurantId),
    ]);
    // A saúde do carrinho vem junto porque é aqui que a tela decide mostrar
    // "Ativa". Selo de ativa sem prova de envio é promessa que o código não
    // cumpre — quem exibe o selo precisa ter o desmentido na mesma resposta.
    const cartAtiva = states.find((s) => s.id === "carrinho-abandonado")?.active ?? false;
    const cartRecoveryHealth = await CartRecoveryHealthService
      .get(ctx.restaurantId, cartAtiva)
      .catch((e) => {
        console.error("[GET /api/crm/ready-made] saúde do carrinho indisponível", e);
        return null; // a tela cai para o comportamento antigo; nunca some a lista
      });
    return ok({ campaigns: states, metaCrmActive, cartRecoveryHealth });
  } catch (err) {
    console.error("[GET /api/crm/ready-made]", err);
    return serverError();
  }
}
