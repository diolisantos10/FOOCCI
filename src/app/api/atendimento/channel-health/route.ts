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

    const items = sortChannelHealth(
      evaluateInstagramHealth({
        configured: config !== null,
        enabled: config?.enabled ?? false,
        paused: config?.paused ?? false,
        mode: config?.mode ?? "DISABLED",
        lastError: config?.lastError ?? null,
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
