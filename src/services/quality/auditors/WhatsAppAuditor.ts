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
import { notConnectedFinding } from "./_shared";

export const WhatsAppAuditor: Auditor = {
  id: "whatsapp",
  name: "Auditor WhatsApp",
  area: "WhatsApp",
  group: "WhatsApp",
  mission:
    "Auditar roteamento, ordering em dry-run e prevenção de vazamento de comando interno (nunca envia WhatsApp nem chama Evolution real).",
  readOnly: true,
  canRunDaily: true,
  connection: "PARTIAL",
  linkedLabs: [
    { label: "WhatsApp Routing Lab", href: "/admin/diagnostics/whatsapp-routing-test", exists: true },
    { label: "WhatsApp Text Ordering Lab", href: "/admin/diagnostics/whatsapp-text-ordering", exists: true },
  ],
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
