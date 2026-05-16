/**
 * POST /api/evolution/rotate-webhook-secret
 *
 * OWNER-only. Generates a new webhook secret, stores it encrypted in DB,
 * and pushes the new tokenized webhook URL to the Evolution instance.
 *
 * Does NOT touch the WhatsApp session or QR flow.
 * Returns only booleans and the base URL — never the raw secret.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"];

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Restrito ao proprietário.");

    const snapshotResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId, true);
    if (!snapshotResult.ok) {
      return NextResponse.json(
        { success: false, error: "Integração Evolution não configurada." },
        { status: 404 }
      );
    }

    const snapshot = snapshotResult.data;

    // Generate a new 32-byte (64 hex char) secret
    const newSecret = randomBytes(32).toString("hex");

    // Persist encrypted secret — never store plain text
    await prisma.evolutionConfig.update({
      where:  { restaurantId: ctx.restaurantId },
      data:   { webhookSecret: encrypt(newSecret) },
    });

    // Build tokenized webhook URL (server-side only — never shown to client)
    const host    = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const proto   = (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() ?? "https";
    const baseUrl = `${proto}://${host}/api/webhooks/evolution`;
    const tokenUrl = new URL(baseUrl);
    tokenUrl.searchParams.set("token", newSecret);
    const finalWebhookUrl = tokenUrl.toString();

    const sharedFields: Record<string, unknown> = {
      enabled:       true,
      url:           finalWebhookUrl,
      webhookBase64: false,
      events:        WEBHOOK_EVENTS,
      secret:        newSecret,
    };

    // Probe all 4 body shapes — stop at first HTTP 200
    const newSnapshot = { ...snapshot, webhookSecret: newSecret };
    let synced     = false;
    let syncError: string | null = null;

    for (const body of [
      { ...sharedFields, webhookByEvents: false },
      { ...sharedFields, byEvents: false },
      { webhook: { ...sharedFields, webhookByEvents: false } },
      { webhook: { ...sharedFields, byEvents: false } },
    ]) {
      try {
        await EvolutionClient.setWebhookRaw(newSnapshot, body as Record<string, unknown>);
        synced = true;
        break;
      } catch (err) {
        syncError = err instanceof EvolutionApiError
          ? `HTTP ${err.status}: ${err.message}`
          : (err instanceof Error ? err.message : String(err));
        syncError = syncError.slice(0, 200);
      }
    }

    return NextResponse.json({
      success:        synced,
      webhookUrlBase: baseUrl,   // base only — never expose token
      tokenInUrl:     true,
      message: synced
        ? "Secret rotacionado e URL do webhook atualizada na Evolution. Envie uma mensagem WhatsApp para confirmar que a autenticação continua funcionando."
        : `Secret salvo no banco, mas falha ao atualizar na Evolution: ${syncError ?? "erro desconhecido"}. Clique em 'Sincronizar webhook' manualmente.`,
    });
  } catch (err) {
    console.error("[POST /api/evolution/rotate-webhook-secret]", err);
    return serverError();
  }
}
