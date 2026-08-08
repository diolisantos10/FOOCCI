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
import { evaluateInstagramHealth, sortChannelHealth } from "@/services/channels/channelHealth";
import { reconnectCanFixAny } from "@/services/meta/metaGraphErrorFamily";

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
    const config = await getInstagramConfig(ctx.restaurantId);

    // Reconectar resolve? Três fontes, da mais precisa para a mais antiga — porque a
    // conexão que está quebrada em produção AGORA foi gravada antes do campo existir,
    // e uma correção que só valesse para conexões futuras não tiraria a faixa mentirosa
    // da tela de ninguém hoje.
    const md = config?.metadata ?? null;
    const reconnectCanFix =
      typeof md?.reconnectCanFix === "boolean"
        ? md.reconnectCanFix
        : reconnectCanFixAny([
            typeof md?.longLivedExchangeError === "string" ? md.longLivedExchangeError : null,
            typeof md?.webhookSubscribeError === "string" ? md.webhookSubscribeError : null,
            config?.lastError ?? null,
          ]);

    const items = sortChannelHealth(
      evaluateInstagramHealth({
        configured: config !== null,
        enabled: config?.enabled ?? false,
        paused: config?.paused ?? false,
        mode: config?.mode ?? "DISABLED",
        lastError: config?.lastError ?? null,
        reconnectCanFix,
        lastWebhookAt: config?.lastWebhookAt ?? null,
        connectedAt: parseDate(config?.metadata?.connectedAt),
        now: new Date(),
      }),
    );

    return NextResponse.json({ data: { items } });
  } catch (err) {
    console.error("[GET /api/atendimento/channel-health]", err);
    // Falhou a leitura → a Central não recebe item nenhum e, por contrato, não
    // desenha faixa nem afirma saúde. Silêncio honesto, não "tudo certo".
    return NextResponse.json({ error: "channel_health_unavailable" }, { status: 503 });
  }
}
