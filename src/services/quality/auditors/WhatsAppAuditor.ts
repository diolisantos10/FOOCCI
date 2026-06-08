/**
 * WhatsAppAuditor — WhatsApp.
 *
 * Audits routing, dry-run text ordering and internal-command leak prevention.
 * NEVER sends a real WhatsApp message and NEVER calls the Evolution API. v0 is
 * read-only and does not execute the real runner; it returns an honest
 * PARTIAL/INFO finding and links the two existing WhatsApp labs.
 *
 * No runtime/side-effect imports.
 */

import type { Auditor } from "../types";
import { assertSafeMode } from "../SafeMode";
import { AUDITOR_META } from "../registryMeta";
import { notConnectedFinding } from "./_shared";

export const WhatsAppAuditor: Auditor = {
  ...AUDITOR_META.whatsapp,
  readOnly: true,
  canRunDaily: true,
  async run(ctx) {
    assertSafeMode(ctx.safeMode);
    return [
      notConnectedFinding(ctx, "whatsapp", {
        affectedArea: "WhatsApp",
        lab: "/admin/diagnostics/whatsapp-text-ordering",
      }),
    ];
  },
};
