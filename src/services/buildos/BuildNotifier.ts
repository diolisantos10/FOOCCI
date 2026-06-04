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
import { EvolutionClient, type EvolutionConfigSnapshot } from "@/lib/evolution/EvolutionClient";
import { getAdminWhatsAppSnapshot } from "./AdminWhatsAppConfigService";

/**
 * Send a plain-text WhatsApp reply to `phone`. When `restaurantId` is null the
 * reply goes out via the ADMIN/SYSTEM-level Build OS WhatsApp instance (the Admin
 * channel) — NOT via any restaurant. Otherwise it uses that restaurant's instance
 * (the instance that received the webhook). `phone` is normalized E.164 ("+5511…");
 * the Evolution API wants it without the "+".
 */
export async function sendBuildConfirmation(
  restaurantId: string | null,
  phone: string,
  text: string,
): Promise<boolean> {
  try {
    let snapshot: EvolutionConfigSnapshot | null = null;
    if (restaurantId) {
      const res = await EvolutionConfigService.getSnapshot(restaurantId);
      snapshot = res.ok ? res.data : null;
    } else {
      snapshot = await getAdminWhatsAppSnapshot();
    }
    if (!snapshot) return false;

    const to = phone.replace(/^\+/, "");
    await EvolutionClient.sendTextMessage(snapshot, to, text);
    return true;
  } catch {
    return false;
  }
}
