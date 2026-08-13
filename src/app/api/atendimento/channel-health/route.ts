/**
 * GET /api/atendimento/channel-health
 *
 * Saúde dos canais de entrada do restaurante logado, para a faixa de aviso da
 * Central de Atendimento. Somente leitura: não envia mensagem, não toca token,
 * não decifra segredo, não fala com a Meta. Nenhuma credencial sai daqui — nem
 * mascarada; a rota só devolve nível, texto e o próximo passo.
 *
 * Lista vazia significa **"nada a dizer"** e NUNCA "está tudo bem" — quem
 * consome não pode concluir saúde do silêncio desta rota (guardrail 1). Ver
 * `src/services/channels/channelHealth.ts` para as regras.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { getInstagramConfig } from "@/services/instagram/InstagramConfigService";
import { prisma } from "@/lib/prisma";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import {
  evaluateInstagramHealth, evaluateWhatsAppHealth, sortChannelHealth,
} from "@/services/channels/channelHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // ── A ÚLTIMA ENTRADA DO WHATSAPP VEM DE `Message`, NÃO DO CANAL ────────
    // `MetaWhatsAppConfig` não tem carimbo de recebimento. Esperar por uma
    // coluna nova foi exatamente o que manteve o WhatsApp fora desta faixa por
    // meses — e foi essa cegueira que deixou um restaurante mudo um dia inteiro
    // com a tela verde, em 12/08/2026. O dado sempre esteve aqui.
    const [config, wa, ultimaEntrada] = await Promise.all([
      getInstagramConfig(ctx.restaurantId),
      MetaConfigService.getPublic(ctx.restaurantId).catch(() => null),
      prisma.message.findFirst({
        where: { direction: "INBOUND", conversation: { restaurantId: ctx.restaurantId, channel: "WHATSAPP" } },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      }).catch(() => null),
    ]);

    const agora = new Date();
    const items = sortChannelHealth([
      ...evaluateWhatsAppHealth({
        configured: wa !== null,
        connectionStatus: wa?.connectionStatus ?? "NOT_CONNECTED",
        lastError: wa?.lastError ?? null,
        lastInboundAt: ultimaEntrada?.sentAt ?? null,
        // `getPublic` devolve a data como string. Converter aqui, e não confiar
        // no tipo, evita um `connectedAt` inválido virar "nunca conectou".
        connectedAt: parseDate(wa?.lastHealthCheckAt),
        now: agora,
      }),
      ...evaluateInstagramHealth({
        configured: config !== null,
        enabled: config?.enabled ?? false,
        paused: config?.paused ?? false,
        mode: config?.mode ?? "DISABLED",
        lastError: config?.lastError ?? null,
        lastWebhookAt: config?.lastWebhookAt ?? null,
        connectedAt: parseDate(config?.metadata?.connectedAt),
        now: agora,
      }),
    ]);

    return NextResponse.json({ data: { items } });
  } catch (err) {
    console.error("[GET /api/atendimento/channel-health]", err);
    // Falhou a leitura → a Central não recebe item nenhum e, por contrato, não
    // desenha faixa nem afirma saúde. Silêncio honesto, não "tudo certo".
    return NextResponse.json({ error: "channel_health_unavailable" }, { status: 503 });
  }
}
