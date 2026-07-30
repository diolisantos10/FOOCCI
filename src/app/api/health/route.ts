/**
 * GET /api/health
 *
 * Public endpoint — no auth required.
 * Returns deployment version, uptime, and a DB connectivity check.
 * Used for post-deploy validation and Railway health checks.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Há quanto tempo o PROCESSO está de pé.
 *
 * Era `const startedAt = Date.now()` no topo do módulo — e o módulo de uma
 * rota é reavaliado, então `uptimeSeconds` dava 0 em toda requisição, sempre.
 * O número existia, parecia saudável e não queria dizer nada.
 *
 * Isso importa mais do que parece: uptime é exatamente a métrica que denuncia
 * container reiniciando em loop. Com ela travada em 0, o /api/health não tinha
 * como diferenciar "no ar há dois dias" de "acabou de subir pela décima vez".
 *
 * `process.uptime()` é do processo Node, não do módulo — sobrevive à
 * reavaliação da rota e cai para perto de zero quando o container reinicia de
 * verdade, que é o sinal que se quer.
 */
function uptimeSeconds(): number {
  return Math.floor(process.uptime());
}

export async function GET() {
  let dbOk = false;
  let soundSettingsTableOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    // DB check failed — still return 200 so Railway doesn't restart the container
    // on a transient connection issue. The dbOk flag surfaces it to operators.
  }

  if (dbOk) {
    try {
      await prisma.restaurantSoundSettings.count();
      soundSettingsTableOk = true;
    } catch {
      // Table missing — migration not yet applied
    }
  }

  return NextResponse.json(
    {
      ok: true,
      version:   process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
      commitSha: process.env.RAILWAY_GIT_COMMIT_SHA  ?? "unknown",
      branch:    process.env.RAILWAY_GIT_BRANCH      ?? "unknown",
      env: process.env.NODE_ENV,
      uptimeSeconds: uptimeSeconds(),
      db: dbOk ? "ok" : "unreachable",
      checks: {
        encryptionKey:    !!process.env.ENCRYPTION_KEY,
        nextauthSecret:   !!process.env.NEXTAUTH_SECRET,
        openaiKey:        !!process.env.OPENAI_API_KEY,
        databaseUrl:      !!process.env.DATABASE_URL,
        mpWebhookSecret:  !!process.env.MERCADO_PAGO_WEBHOOK_SECRET,
      },
      tables: {
        soundSettings: soundSettingsTableOk,
      },
    },
    { status: 200 }
  );
}
