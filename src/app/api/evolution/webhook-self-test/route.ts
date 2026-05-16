/**
 * POST /api/evolution/webhook-self-test
 *
 * OWNER-only. Validates the Foocci webhook receiver without sending a real
 * WhatsApp message:
 *
 * 1. Writes a test row to EvolutionWebhookEventLog — proves the DB table
 *    exists and the restaurant config is reachable.
 * 2. Parses a minimal fake messages.upsert payload through WebhookParserService
 *    — proves the parser works without hitting WhatsApp or creating real records.
 *
 * Interpretation:
 * - Both OK   → receiver works. If events still don't arrive, problem is in
 *               Evolution's webhook sending (URL config or connectivity).
 * - DB error  → migration not applied. Run `npx prisma migrate deploy` on Railway.
 * - Parse err → bug in WebhookParserService (report to engineering).
 *
 * Never creates real Conversations or Messages.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { WebhookParserService } from "@/services/evolution/WebhookParserService";
import { prisma } from "@/lib/prisma";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Restrito ao proprietário.");

    const snapshotResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId);
    if (!snapshotResult.ok) {
      return NextResponse.json(
        { success: false, error: "Configuração Evolution não encontrada." },
        { status: 404 }
      );
    }

    const { instanceName } = snapshotResult.data;

    // Test 1: write a diagnostic row to the event log table
    let dbOk    = false;
    let dbError: string | null = null;
    let rowId:   string | null = null;

    try {
      const row = await prisma.evolutionWebhookEventLog.create({
        data: {
          restaurantId:    ctx.restaurantId,
          instanceName,
          eventName:       "self_test",
          accepted:        true,
          ignored:         true,
          error:           null,
          bodyKeys:        ["self_test"],
          dataKeys:        [],
          messageId:       null,
          remoteJidMasked: null,
          direction:       null,
        },
      });
      dbOk  = true;
      rowId = row.id;
    } catch (err) {
      dbError = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
    }

    // Test 2: parse a minimal fake inbound event (no DB side effects — parse only)
    let parseOk    = false;
    let parseError: string | null = null;
    let parsedEvent: Record<string, unknown> | null = null;

    try {
      const fakeBody = {
        event:    "messages.upsert",
        instance: instanceName,
        data: {
          key: {
            remoteJid: "5500000000000@s.whatsapp.net",
            fromMe:    false,
            id:        "SELF_TEST_MSG_001",
          },
          message:     { conversation: "self test" },
          messageType: "conversation",
          pushName:    "Self Test",
        },
      };
      const parsed = WebhookParserService.parse(fakeBody) as unknown as Record<string, unknown>;
      parseOk     = true;
      parsedEvent = {
        type:         parsed.type,
        instanceName: parsed.instanceName,
      };
    } catch (err) {
      parseError = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
    }

    const success = dbOk;

    let diagnosis: string;
    if (!dbOk) {
      diagnosis =
        "ERRO: tabela evolution_webhook_event_logs não existe ou inacessível. " +
        "Execute 'npx prisma migrate deploy' no Railway Shell e faça redeploy. " +
        `Detalhe: ${dbError}`;
    } else if (!parseOk) {
      diagnosis = `DB OK mas parsing falhou: ${parseError}. Reporte ao suporte Foocci.`;
    } else {
      diagnosis =
        "Receiver Foocci OK — DB e parser funcionam. " +
        "Se nenhum evento real chega, o problema está 100% na Evolution: " +
        "webhook URL incorreta, webhookByEvents=true, ou Evolution não consegue alcançar foocci.com.br.";
    }

    return NextResponse.json({
      success,
      instanceName,
      dbWrite:  { ok: dbOk,    rowId, error: dbError },
      parse:    { ok: parseOk, event: parsedEvent, error: parseError },
      diagnosis,
    });
  } catch (err) {
    console.error("[POST /api/evolution/webhook-self-test]", err);
    return serverError();
  }
}
