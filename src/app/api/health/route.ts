/**
 * GET /api/health
 *
 * Public endpoint — no auth required.
 * Returns deployment version, uptime, and a DB connectivity check.
 * Used for post-deploy validation and Railway health checks.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const startedAt = Date.now();

export async function GET() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    // DB check failed — still return 200 so Railway doesn't restart the container
    // on a transient connection issue. The dbOk flag surfaces it to operators.
  }

  return NextResponse.json(
    {
      ok: true,
      version:   process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
      commitSha: process.env.RAILWAY_GIT_COMMIT_SHA  ?? "unknown",
      branch:    process.env.RAILWAY_GIT_BRANCH      ?? "unknown",
      env: process.env.NODE_ENV,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      db: dbOk ? "ok" : "unreachable",
      checks: {
        encryptionKey:    !!process.env.ENCRYPTION_KEY,
        nextauthSecret:   !!process.env.NEXTAUTH_SECRET,
        openaiKey:        !!process.env.OPENAI_API_KEY,
        databaseUrl:      !!process.env.DATABASE_URL,
        mpWebhookSecret:  !!process.env.MERCADO_PAGO_WEBHOOK_SECRET,
      },
    },
    { status: 200 }
  );
}
