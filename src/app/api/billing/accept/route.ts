/**
 * POST /api/billing/accept — o cliente aceita o Termo de Contratação.
 *
 * PÚBLICA (o cliente ainda não tem login), protegida por três coisas:
 * o token não-adivinhável do link, rate limit por IP, e o fato de que aceitar
 * não cria nada — só registra a trilha sobre uma assinatura já criada pelo CEO.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { PlanSubscriptionService } from "@/services/billing/PlanSubscriptionService";

const bodySchema = z.object({
  token: z.string().min(16).max(80),
  nome: z.string().trim().min(2, "Informe seu nome completo").max(160),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `billing-accept:${ip}`, limit: 10, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter) as NextResponse;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const sub = await PlanSubscriptionService.recordAcceptance(parsed.data.token, parsed.data.nome, ip);
  if (!sub) return NextResponse.json({ ok: false, error: "Link inválido ou expirado." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    // O próximo passo do cliente: pagar (se o link MP já existe) ou aguardar contato.
    paymentUrl: sub.mpInitPoint ?? null,
  });
}
