/**
 * WaiterAuditor — IA / Vendas.
 *
 * Audits the Waiter: intelligence, cards, recommendations, dietary restrictions
 * and Test Center coverage. v0 is read-only and does NOT execute the real runner
 * to avoid any coupling with WaiterBrain/`/pedido`. It returns an honest
 * PARTIAL/INFO finding and links the existing Waiter Test Center.
 *
 * No runtime/side-effect imports.
 */

import type { Auditor } from "../types";
import { assertSafeMode } from "../SafeMode";
import { notConnectedFinding } from "./_shared";

export const WaiterAuditor: Auditor = {
  id: "waiter",
  name: "Auditor Waiter",
  area: "IA / Vendas",
  group: "IA",
  mission:
    "Auditar o Waiter: inteligência, cards reais, recomendações, restrições alimentares e cobertura do Test Center.",
  readOnly: true,
  canRunDaily: true,
  connection: "PARTIAL",
  linkedLabs: [
    { label: "Waiter Test Center", href: "/admin/agentes/waiter/testes", exists: true },
  ],
  async run(ctx) {
    assertSafeMode(ctx.safeMode);
    return [
      notConnectedFinding(ctx, "waiter", {
        affectedArea: "IA / Vendas",
        lab: "/admin/agentes/waiter/testes",
      }),
    ];
  },
};
