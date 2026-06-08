/**
 * CrmAuditor — CRM.
 *
 * Audits campaigns, segments and send safety. Dry-run is MANDATORY: this auditor
 * never dispatches a real campaign. v0 is read-only and does not execute the real
 * runner; it returns an honest PARTIAL/INFO finding and links the CRM Test Center.
 *
 * No runtime/side-effect imports.
 */

import type { Auditor } from "../types";
import { assertSafeMode } from "../SafeMode";
import { AUDITOR_META } from "../registryMeta";
import { notConnectedFinding } from "./_shared";

export const CrmAuditor: Auditor = {
  ...AUDITOR_META.crm,
  readOnly: true,
  canRunDaily: true,
  async run(ctx) {
    assertSafeMode(ctx.safeMode);
    return [
      notConnectedFinding(ctx, "crm", {
        affectedArea: "CRM",
        lab: "/admin/agentes/crm/testes",
      }),
    ];
  },
};
