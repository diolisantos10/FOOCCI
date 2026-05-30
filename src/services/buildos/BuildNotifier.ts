/**
 * BuildNotifier — sends the Build OS confirmation reply over WhatsApp.
 *
 * Reuses the existing Evolution send primitives, but deliberately does NOT touch
 * the restaurant CRM tables (no Customer / Conversation / Message records). The
 * Build OS operator is NOT a restaurant customer, so its replies stay out of the
 * customer-facing inbox entirely.
 *
 * Best-effort: any failure is swallowed and reported via the boolean result so
 * it can be logged as a BuildCommandEvent — it must never break the webhook.
 */

import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";

/**
 * Send a plain-text WhatsApp reply to `phone` using the Evolution instance of
 * the given restaurant (the instance that received the webhook). `phone` is the
 * normalized E.164 ("+5511…"); the Evolution API wants it without the "+".
 */
export async function sendBuildConfirmation(
  restaurantId: string,
  phone: string,
  text: string,
): Promise<boolean> {
  try {
    const snapshot = await EvolutionConfigService.getSnapshot(restaurantId);
    if (!snapshot.ok) return false;

    const to = phone.replace(/^\+/, "");
    await EvolutionClient.sendTextMessage(snapshot.data, to, text);
    return true;
  } catch {
    return false;
  }
}
