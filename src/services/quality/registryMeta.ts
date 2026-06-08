/**
 * Quality Control — auditor display metadata (pure, client-safe).
 *
 * Single source of truth for the auditor metadata shown in the dashboard. This
 * module imports NOTHING heavy (no evaluator, no WaiterBrainV2, no prisma) so it
 * can be safely bundled into the client `/admin/quality` page. The actual
 * `run()` logic lives in the auditor modules (server-side, via the API).
 */

import type { AuditorConnection, AuditorGroup, LinkedLab } from "./types";

export interface AuditorMeta {
  id: string;
  name: string;
  area: string;
  group: AuditorGroup;
  mission: string;
  connection: AuditorConnection;
  linkedLabs: LinkedLab[];
}

export const AUDITOR_META = {
  waiter: {
    id: "waiter",
    name: "Auditor Waiter",
    area: "IA / Vendas",
    group: "IA",
    mission:
      "Auditar o Waiter com checks reais (anti-alucinação, cards reais, recomendação, restrições, categoria/porção, grupo/família, checkout guidance, venda consultiva, recusa de bebida, fechamento).",
    connection: "ACTIVE",
    linkedLabs: [
      { label: "Waiter Test Center", href: "/admin/agentes/waiter/testes", exists: true },
    ],
  },
  crm: {
    id: "crm",
    name: "Auditor CRM",
    area: "CRM",
    group: "CRM",
    mission:
      "Auditar com checks reais (dry-run): contact-safety/segurança de disparo, segmentação, campanhas, templates, janelas, públicos vazios, atribuição e review — nunca dispara campanha real.",
    connection: "ACTIVE",
    linkedLabs: [
      { label: "CRM Test Center", href: "/admin/agentes/crm/testes", exists: true },
    ],
  },
  analytics: {
    id: "analytics",
    name: "Auditor Analytics",
    area: "Analytics",
    group: "Analytics",
    mission:
      "Auditar com checks reais read-only (data fixa): diagnóstico, métricas/vendas/upsell, retenção/cohort, operação, analista conversacional e dashboard cockpit — sem DB nem dado ao vivo.",
    connection: "ACTIVE",
    linkedLabs: [
      { label: "Analytics Test Center", href: "/admin/agentes/analytics/testes", exists: true },
    ],
  },
  whatsapp: {
    id: "whatsapp",
    name: "Auditor WhatsApp",
    area: "WhatsApp",
    group: "WhatsApp",
    mission:
      "Auditar com checks reais (DRY_RUN_ONLY): roteamento, parsing de pedido por texto, multi-turn, handoff, pix_safety e prevenção de vazamento de comando interno/Build OS — nunca envia WhatsApp nem chama Evolution real.",
    connection: "ACTIVE",
    linkedLabs: [
      { label: "WhatsApp Routing Lab", href: "/admin/diagnostics/whatsapp-routing-test", exists: true },
      { label: "WhatsApp Text Ordering Lab", href: "/admin/diagnostics/whatsapp-text-ordering", exists: true },
    ],
  },
} satisfies Record<string, AuditorMeta>;

/** Ordered list (matches the engine registry order). */
export const AUDITOR_META_LIST: readonly AuditorMeta[] = [
  AUDITOR_META.waiter,
  AUDITOR_META.crm,
  AUDITOR_META.analytics,
  AUDITOR_META.whatsapp,
];
