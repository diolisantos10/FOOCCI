/**
 * AnalyticsAuditor — Analytics.
 *
 * Audits metrics, dashboard and reports. Read-only. v0 does not execute the real
 * runner; it returns an honest PARTIAL/INFO finding and links the Analytics Test
 * Center.
 *
 * No runtime/side-effect imports.
 */

import type { Auditor } from "../types";
import { assertSafeMode } from "../SafeMode";
import { AUDITOR_META } from "../registryMeta";
import { notConnectedFinding } from "./_shared";

export const AnalyticsAuditor: Auditor = {
  ...AUDITOR_META.analytics,
  readOnly: true,
  canRunDaily: true,
  async run(ctx) {
    assertSafeMode(ctx.safeMode);
    return [
      notConnectedFinding(ctx, "analytics", {
        affectedArea: "Analytics",
        lab: "/admin/agentes/analytics/testes",
      }),
    ];
  },
};
