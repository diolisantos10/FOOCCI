/**
 * GET /api/health
 *
 * Public endpoint — no auth required.
 * Returns deployment version, uptime, and a DB connectivity check.
 * Used for post-deploy validation and Railway health checks.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resumoDeFrescorParaHealth } from "@/services/brain/runtime/MeasurementFreshnessAlarm";

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

  /**
   * OS MEDIDORES ESTÃO MEDINDO?
   *
   * Em 08/2026 a auditoria de qualidade ficou 10 dias sem rodar e ninguém soube:
   * o painel seguiu exibindo o veredito de 248 horas atrás com cara de veredito
   * de hoje. Um vigia agendado não resolveria — morreria junto, no mesmo
   * segredo e na mesma hora.
   *
   * Por isso o alarme mora AQUI: /api/health é lido por gente e por máquina a
   * todo momento, não depende de agendador nenhum, e é o primeiro lugar onde se
   * olha depois de um deploy. `false` significa "este medidor parou" — o número
   * que estiver na tela é velho.
   *
   * Público, então só o booleano: nem idade, nem nome de tabela, nem detalhe de
   * dentro de casa. O relatório completo fica na rota admin de qualidade.
   */
  let measurements: Record<string, boolean> = {};
  try {
    measurements = await resumoDeFrescorParaHealth();
  } catch {
    // O alarme nunca derruba o health — mas também não mente dizendo que está tudo bem.
    measurements = { unavailable: false };
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
        /**
         * A chave que decide se o checkout COBRA. Sem ela o cliente assina, o
         * contrato é registrado, o aceite é gravado — e o link de pagamento volta
         * `null`. Ou seja: falha em silêncio, do lado do dinheiro. Faltava aqui
         * justamente o único item que ninguém consegue conferir de fora, então
         * "será que a variável entrou?" só se respondia entrando no Railway.
         * Presença apenas — o valor nunca sai daqui.
         */
        mpPlatformToken:  !!process.env.MP_PLATFORM_ACCESS_TOKEN,
      },
      tables: {
        soundSettings: soundSettingsTableOk,
      },
      // Medidor parado = número velho na tela. Ver MeasurementFreshnessAlarm.
      measurements,
    },
    { status: 200 }
  );
}
