/**
 * POST /api/evolution/webhook-auth-self-test
 *
 * OWNER-only. Simulates the webhook authentication flow using the current
 * webhookSecret from DB to prove that the handler's auth logic accepts each
 * header/body strategy.
 *
 * Does NOT make any real HTTP requests — all verification is done in-process
 * using the same verifyWebhookAuth utility used by the live handler.
 *
 * Returns only booleans — never raw secrets.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { verifyWebhookAuth } from "@/lib/evolution/verifyWebhookAuth";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

const FAKE_BODY = '{"event":"self_test","instance":"test"}';

function emptyCandidates() {
  return {
    hmacHeader:              null,
    xEvolutionSecret:        null,
    xEvolutionWebhookSecret: null,
    xWebhookSecret:          null,
    webhookSecretHeader:     null,
    authorizationBearer:     null,
    bodySecret:              null,
    bodyWebhookSecret:       null,
    bodyApikey:              null,
    queryToken:              null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Restrito ao proprietário.");

    // Must include webhookSecret for the self-test
    const snapshotResult = await EvolutionConfigService.getSnapshot(
      ctx.restaurantId,
      true // includeWebhookSecret
    );
    if (!snapshotResult.ok) {
      return NextResponse.json(
        { success: false, error: "Configuração Evolution não encontrada." },
        { status: 404 }
      );
    }

    const { webhookSecret, instanceName } = snapshotResult.data;

    const hasSecret = !!webhookSecret;

    if (!hasSecret) {
      return NextResponse.json({
        success: false,
        instanceName,
        hasSecret: false,
        error:
          "Nenhum webhook secret configurado no banco. " +
          "Defina um secret nas Configurações avançadas e clique em Sincronizar webhook.",
        tests: null,
      });
    }

    // Run each strategy in isolation — inject only one candidate at a time
    const r1 = verifyWebhookAuth(FAKE_BODY, { ...emptyCandidates(), xEvolutionSecret:        webhookSecret }, webhookSecret);
    const r2 = verifyWebhookAuth(FAKE_BODY, { ...emptyCandidates(), xEvolutionWebhookSecret: webhookSecret }, webhookSecret);
    const r3 = verifyWebhookAuth(FAKE_BODY, { ...emptyCandidates(), xWebhookSecret:          webhookSecret }, webhookSecret);
    const r4 = verifyWebhookAuth(FAKE_BODY, { ...emptyCandidates(), authorizationBearer:     webhookSecret }, webhookSecret);
    const r5 = verifyWebhookAuth(FAKE_BODY, { ...emptyCandidates(), bodySecret:              webhookSecret }, webhookSecret);
    const r6 = verifyWebhookAuth(FAKE_BODY, { ...emptyCandidates(), bodyApikey:              webhookSecret }, webhookSecret);
    const r7 = verifyWebhookAuth(FAKE_BODY, { ...emptyCandidates(), queryToken:              webhookSecret }, webhookSecret);

    const allOk = r1.accepted && r2.accepted && r3.accepted && r4.accepted && r5.accepted && r6.accepted && r7.accepted;

    const diagnosis = allOk
      ? "Lógica de auth OK para todos os formatos testados. Se ainda há signature_mismatch, o problema é que a Evolution está enviando um secret diferente do armazenado no banco. Clique em 'Sincronizar webhook' para reenviar o secret correto."
      : "Lógica de auth com falha. Reporte ao suporte Foocci.";

    return NextResponse.json({
      success: true,
      instanceName,
      hasSecret,
      tests: {
        xEvolutionSecret:        { accepted: r1.accepted, strategy: r1.matchedStrategy },
        xEvolutionWebhookSecret: { accepted: r2.accepted, strategy: r2.matchedStrategy },
        xWebhookSecret:          { accepted: r3.accepted, strategy: r3.matchedStrategy },
        authorizationBearer:     { accepted: r4.accepted, strategy: r4.matchedStrategy },
        bodySecret:              { accepted: r5.accepted, strategy: r5.matchedStrategy },
        bodyApikey:              { accepted: r6.accepted, strategy: r6.matchedStrategy },
        queryToken:              { accepted: r7.accepted, strategy: r7.matchedStrategy },
      },
      allWorkingCorrectly: allOk,
      diagnosis,
    });
  } catch (err) {
    console.error("[POST /api/evolution/webhook-auth-self-test]", err);
    return serverError();
  }
}
