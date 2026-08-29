/**
 * A assinatura DA PRÓPRIA LOJA — ler e cancelar.
 *
 *   GET    → o que a loja tem contratado e se dá para cancelar.
 *   DELETE → cancela.
 *
 * ── A regra que esta rota existe para não ser esquecida ─────────────────────
 *
 * **Não há `subscriptionId` em lugar nenhum.** Nem no corpo, nem na URL, nem na
 * query. O dono é lido do cabeçalho `x-restaurant-id` que o middleware injeta a
 * partir do JWT — e é ele que vira o `where` da busca. Um id vindo do cliente,
 * mesmo conferido depois, é uma chave que o cliente escolhe; o jeito de essa
 * conferência nunca falhar é ela não existir.
 *
 * É DELETE e não POST porque o efeito é exatamente o de um DELETE bem-comportado:
 * idempotente. Chamar duas vezes devolve o mesmo 200 e não duplica nada.
 *
 * ⚠️ FALHA DE GATEWAY NÃO É SUCESSO. Se o preapproval não pôde ser cancelado no
 * Mercado Pago, a assinatura já está cancelada aqui (a trava anti-reativação
 * está armada), mas a resposta diz `gatewayOk: false` com o motivo — a tela
 * precisa avisar que a cobrança pode cair mais uma vez, em vez de mostrar um
 * "pronto!" que o cartão vai desmentir.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { MercadoPagoPlatformBilling } from "@/services/billing/MercadoPagoPlatformBilling";
import {
  assinaturaDaLoja,
  cancelarPelaPropriaLoja,
  CONSEQUENCIAS_DO_CANCELAMENTO,
} from "@/services/billing/cancelamento";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const assinatura = await assinaturaDaLoja(prisma, ctx.restaurantId);

  return NextResponse.json({
    ok: true,
    assinatura,
    // As consequências viajam do servidor, da mesma fonte que o teste confere
    // contra as cláusulas do Termo. Escrevê-las na tela seria abrir a porta para
    // alguém "melhorar o texto" e prometer devolução que o contrato não promete.
    consequencias: CONSEQUENCIAS_DO_CANCELAMENTO.map((c) => c.texto),
  });
}

export async function DELETE(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // O nome de quem cancelou vai para a trilha. Se a busca falhar, o evento sai
  // com o id — trilha com nome faltando é ruim; cancelamento travado por causa
  // de um `SELECT` de nome seria pior.
  const autor = await prisma.user
    .findUnique({ where: { id: ctx.userId }, select: { name: true, email: true } })
    .catch(() => null);

  const r = await cancelarPelaPropriaLoja(prisma, {
    restaurantId: ctx.restaurantId,
    autorUserId: ctx.userId,
    autorNome: autor?.name || autor?.email || ctx.userId,
    cancelarNoGateway: async (preapprovalId) => {
      const mp = await MercadoPagoPlatformBilling.cancelPreapproval(preapprovalId);
      if (mp.ok) return { ok: true, detalhe: null };
      return {
        ok: false,
        detalhe:
          mp.reason === "gateway_nao_configurado"
            ? "MP_PLATFORM_ACCESS_TOKEN ausente — o Mercado Pago não foi tocado."
            : `Mercado Pago recusou (${mp.detail ?? "sem detalhe"}).`,
      };
    },
  });

  if (r.resultado === "naoExiste") {
    return NextResponse.json(
      { ok: false, error: "Esta loja não tem assinatura registrada para cancelar." },
      { status: 404 },
    );
  }

  if (r.resultado === "jaEstavaCancelada") {
    // Idempotência com cara de idempotência: 200, e não 409. Quem clicou duas
    // vezes fez a coisa certa duas vezes.
    return NextResponse.json({
      ok: true,
      jaEstavaCancelada: true,
      canceladaEm: r.canceladaEm,
      gatewayOk: true,
    });
  }

  return NextResponse.json({
    ok: true,
    jaEstavaCancelada: false,
    canceladaEm: r.canceladaEm,
    gatewayOk: r.gateway.ok,
    gatewayErro: r.gateway.ok ? null : r.gateway.detalhe,
  });
}
