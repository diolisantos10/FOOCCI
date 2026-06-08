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
import { notConnectedFinding } from "./_shared";

export const AnalyticsAuditor: Auditor = {
  id: "analytics",
  name: "Auditor Analytics",
  area: "Analytics",
  group: "Analytics",
  mission: "Auditar métricas, dashboard e relatórios (somente leitura).",
  readOnly: true,
  canRunDaily: true,
  connection: "PARTIAL",
  linkedLabs: [
    { label: "Analytics Test Center", href: "/admin/agentes/analytics/testes", exists: true },
  ],
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
