/**
 * EvolutionWebhookStartupSync
 *
 * Called once from instrumentation.ts on every server start (every Railway deploy).
 * Re-registers the webhook URL with Evolution for every active restaurant.
 *
 * Why this exists: Evolution marks a webhook endpoint as failed after repeated
 * errors (e.g. a server crash). On the next deploy the server is healthy again
 * but Evolution has stopped sending events — requiring a manual "Sincronizar
 * webhook" click. This service runs that sync automatically so no human
 * intervention is ever needed.
 *
 * Safe to run on every boot:
 *  - setWebhook is idempotent (re-registering an already-correct config is a no-op).
 *  - Failures are logged but never throw — they never block server startup.
 *  - Runs after a short delay so the DB pool is warm.
 */

import { prisma } from "@/lib/prisma";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { getExpectedEvolutionWebhookUrl } from "@/lib/public-url";

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"];

// Delay before first sync attempt — gives the DB pool and env time to settle.
const STARTUP_DELAY_MS = 8_000;

async function syncOne(restaurantId: string): Promise<void> {
  const snapshotResult = await EvolutionConfigService.getSnapshot(restaurantId, true);
  if (!snapshotResult.ok) return; // not configured — skip

  const snapshot = snapshotResult.data;

  const baseWebhookUrl = getExpectedEvolutionWebhookUrl();
  let finalWebhookUrl = baseWebhookUrl;
  if (snapshot.webhookSecret) {
    const u = new URL(baseWebhookUrl);
    u.searchParams.set("token", snapshot.webhookSecret);
    finalWebhookUrl = u.toString();
  }

  const sharedFields: Record<string, unknown> = {
    enabled:       true,
    url:           finalWebhookUrl,
    webhookBase64: false,
    events:        WEBHOOK_EVENTS,
    webhookByEvents: false,
  };
  if (snapshot.webhookSecret) sharedFields.secret = snapshot.webhookSecret;

  // Try all four body shapes Evolution versions use.
  const candidates = [
    { ...sharedFields, webhookByEvents: false },
    { webhook: { ...sharedFields, webhookByEvents: false } },
    { ...sharedFields, byEvents: false },
    { webhook: { ...sharedFields, byEvents: false } },
  ];

  for (const body of candidates) {
    try {
      await EvolutionClient.setWebhookRaw(snapshot, body);
      console.info(`[EvolutionWebhookStartupSync] ✓ ${snapshot.instanceName} synced`);
      return;
    } catch {
      // Try next shape
    }
  }

  console.warn(`[EvolutionWebhookStartupSync] ✗ ${snapshot.instanceName} — all shapes failed`);
}

export async function syncAllEvolutionWebhooks(): Promise<void> {
  await new Promise((r) => setTimeout(r, STARTUP_DELAY_MS));

  let configs: { restaurantId: string }[];
  try {
    configs = await prisma.evolutionConfig.findMany({
      where:  { isActive: true },
      select: { restaurantId: true },
    });
  } catch (err) {
    console.error("[EvolutionWebhookStartupSync] DB query failed", err);
    return;
  }

  if (configs.length === 0) {
    console.info("[EvolutionWebhookStartupSync] No active Evolution configs found — skipping");
    return;
  }

  console.info(`[EvolutionWebhookStartupSync] Syncing webhook for ${configs.length} restaurant(s)…`);

  await Promise.allSettled(configs.map((c) => syncOne(c.restaurantId)));
}
