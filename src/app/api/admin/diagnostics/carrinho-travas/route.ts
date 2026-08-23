/**
 * GET /api/admin/diagnostics/carrinho-travas
 *
 * O PREÇO DO CONSERTO da recuperação de carrinho, em número.
 *
 * Desde 23/08/2026 a recuperação passa pelo portão unificado do CRM (opt-out,
 * janela de silêncio, intervalo de 24 h, teto semanal). Este diagnóstico olha
 * para as recuperações que JÁ SAÍRAM num período e responde: quantas delas as
 * travas novas teriam barrado, e por qual motivo.
 *
 * Auth: header x-admin-secret OU cookie foocci-admin-token.
 * Query: restaurantId (ou slug) · dias (padrão 7, máx 90)
 *
 * SOMENTE LEITURA: nenhuma escrita, nenhum envio.
 *
 * ── O QUE É EXATO E O QUE É APROXIMAÇÃO (leia antes de citar o número) ───────
 *
 *  • `janelaDeSilencio` e `intervalo24h` e `tetoSemanal` são EXATOS: saem da
 *    hora gravada no envio e do histórico de envios daquele cliente naquele
 *    momento. É o passado recalculado, não estimativa.
 *
 *  • `optOut` é APROXIMAÇÃO POR CIMA e por baixo ao mesmo tempo: usa a marca de
 *    HOJE do cliente, porque o sistema não guarda o histórico dessa marca. Quem
 *    pediu para sair DEPOIS de receber aparece aqui como se já estivesse fora
 *    (por cima); quem pediu para sair e voltou não aparece (por baixo).
 *
 *  • O universo são as recuperações que DEIXARAM RASTRO em `campaign_executions`
 *    — ou seja, restaurantes com a linha de campanha "carrinho-abandonado". Loja
 *    sem essa linha envia e não grava, e não entra nesta conta.
 *
 *  • Bloqueio aqui é perda, não adiamento: a janela de entrega da recuperação é
 *    de 30 min a contar do abandono, então o carrinho barrado agora não vira
 *    mensagem depois.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getSafetyConfig, checkQuietHours } from "@/lib/crm-safety";

const CART_TEMPLATE_ID = "carrinho-abandonado";
const SENT_STATUSES    = ["SENT", "DELIVERED", "READ"] as const;
const DIA_MS           = 86_400_000;

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp   = req.nextUrl.searchParams;
  const slug = sp.get("slug") ?? undefined;
  const dias = Math.min(90, Math.max(1, parseInt(sp.get("dias") ?? "7", 10)));

  try {
    let restaurantId = sp.get("restaurantId") ?? undefined;
    if (!restaurantId && slug) {
      const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
      restaurantId = r?.id;
    }
    if (!restaurantId) {
      return NextResponse.json({ error: "Provide restaurantId or slug." }, { status: 400 });
    }

    const desde = new Date(Date.now() - dias * DIA_MS);

    const cartCampaigns = await prisma.campaign.findMany({
      where:  { restaurantId, templateId: CART_TEMPLATE_ID },
      select: { id: true },
    });
    const cartCampaignIds = cartCampaigns.map((c) => c.id);

    if (cartCampaignIds.length === 0) {
      return NextResponse.json({
        restaurantId, dias,
        aviso: "Este restaurante não tem linha de campanha 'carrinho-abandonado' — as recuperações dele não deixam rastro em campaign_executions e não há o que medir aqui.",
        alcanceAtual: { recuperacoesEnviadas: 0, clientesDistintos: 0 },
      });
    }

    // Recuperações que saíram no período + TODO o histórico de CRM daquele
    // cliente que possa ter influenciado (7 dias antes da mais antiga, para o
    // teto semanal fechar a conta).
    const [recuperacoes, historico, safety] = await Promise.all([
      prisma.campaignExecution.findMany({
        where:  { campaignId: { in: cartCampaignIds }, status: { in: [...SENT_STATUSES] }, sentAt: { gte: desde } },
        select: { customerId: true, sentAt: true },
      }),
      prisma.campaignExecution.findMany({
        where:  { restaurantId, status: { in: [...SENT_STATUSES] }, sentAt: { gte: new Date(desde.getTime() - 7 * DIA_MS) } },
        select: { customerId: true, sentAt: true, campaignId: true },
      }),
      getSafetyConfig(restaurantId),
    ]);

    const clientesAlcancados = [...new Set(recuperacoes.map((r) => r.customerId))];

    const foraDoCrm = clientesAlcancados.length > 0
      ? await prisma.customer.findMany({
          where:  { id: { in: clientesAlcancados }, OR: [{ hasOptedOut: true }, { crmContactable: false }] },
          select: { id: true },
        })
      : [];
    const foraDoCrmSet = new Set(foraDoCrm.map((c) => c.id));

    // Histórico por cliente, ordenado — usado para recalcular intervalo e teto.
    const porCliente = new Map<string, { sentAt: Date; campaignId: string }[]>();
    for (const h of historico) {
      if (!h.sentAt) continue;
      const lista = porCliente.get(h.customerId) ?? [];
      lista.push({ sentAt: h.sentAt, campaignId: h.campaignId });
      porCliente.set(h.customerId, lista);
    }

    const motivos = { optOut: 0, janelaDeSilencio: 0, intervalo24h: 0, tetoSemanal: 0 };
    let bloqueadas = 0;

    for (const rec of recuperacoes) {
      const quando = rec.sentAt;
      if (!quando) continue;

      // Mesma ordem do portão real: identidade → horário → frequência.
      if (foraDoCrmSet.has(rec.customerId)) { motivos.optOut++; bloqueadas++; continue; }

      if (checkQuietHours(safety, quando)) { motivos.janelaDeSilencio++; bloqueadas++; continue; }

      const anteriores = (porCliente.get(rec.customerId) ?? []).filter(
        (h) => h.sentAt.getTime() < quando.getTime(),
      );
      const nas24h = anteriores.filter((h) => quando.getTime() - h.sentAt.getTime() <= DIA_MS);
      if (nas24h.length > 0) { motivos.intervalo24h++; bloqueadas++; continue; }

      const naSemana = anteriores.filter((h) => quando.getTime() - h.sentAt.getTime() <= 7 * DIA_MS);
      if (safety.maxPerWeekPerCustomer > 0 && naSemana.length >= safety.maxPerWeekPerCustomer) {
        motivos.tetoSemanal++; bloqueadas++; continue;
      }
    }

    const enviadas = recuperacoes.length;
    return NextResponse.json({
      restaurantId,
      dias,
      alcanceAtual: {
        recuperacoesEnviadas: enviadas,
        clientesDistintos:    clientesAlcancados.length,
        porSemana:            Math.round((enviadas / dias) * 7 * 10) / 10,
      },
      deixariaDeAlcancar: {
        recuperacoes: bloqueadas,
        percentual:   enviadas > 0 ? Math.round((bloqueadas / enviadas) * 1000) / 10 : 0,
        porSemana:    Math.round((bloqueadas / dias) * 7 * 10) / 10,
        porMotivo:    motivos,
      },
      regrasAplicadas: {
        janelaDeSilencio:      safety.quietHoursEnabled ? `${safety.quietHoursStart}–${safety.quietHoursEnd}` : "desligada",
        fuso:                  safety.timezone,
        intervaloPorClienteH:  safety.customerCooldownHours,
        maxPorClienteSemana:   safety.maxPerWeekPerCustomer,
        tetoDiario:            "isento (decisão registrada — medir não pode custar envio)",
      },
      leiaAntesDeCitar: {
        exato:       ["janelaDeSilencio", "intervalo24h", "tetoSemanal"],
        aproximado:  "optOut usa a marca de HOJE do cliente — o sistema não guarda o histórico dessa marca",
        universo:    "só recuperações com rastro em campaign_executions (restaurante com linha de campanha 'carrinho-abandonado')",
        bloqueioEhPerda: "a janela de entrega da recuperação é de 30 min a contar do abandono — barrado agora não vira mensagem depois",
      },
    });
  } catch (err) {
    console.error("[GET /api/admin/diagnostics/carrinho-travas]", err);
    return NextResponse.json({ error: "Diagnostic failed" }, { status: 500 });
  }
}
