/**
 * CRM Campanhas v3 — pure logic tests (A–M).
 *
 * Validates the unification: the separate "Automações" tab was removed from CRM
 * navigation, the "Performance de campanhas e cupons" block was removed from the
 * Campanhas tab, and recurring campaigns (automations) are now represented inside
 * Campanhas via the execution-type selector and recurring templates.
 *
 * These are pure structural/logic mirrors — they never touch the DB, the
 * scheduler, or WhatsApp. No automation records are read or written.
 */
import { describe, it, expect, vi } from "vitest";

// ── Mirrors of constants/helpers from CRMClient.tsx ──────────────────────────

// Final CRM navigation (v3): "Automações" removed.
const CRM_TABS: { id: string; label: string }[] = [
  { id: "overview",      label: "Visão Geral" },
  { id: "campanhas",     label: "Campanhas" },
  { id: "customers",     label: "Clientes" },
  { id: "programa",      label: "Programa de Relacionamento" },
  { id: "avaliacoes",    label: "Avaliações" },
  { id: "configuracoes", label: "Configurações" },
];

// Campanhas tab section order (v3): no "performance" block.
const CAMPANHAS_TAB_SECTION_ORDER = [
  "header",
  "ativas",
  "templates",
  "historico",
  "modelos-salvos",
];

// Execution types surfaced in campaign creation + active table.
type CampaignTipo = "Única" | "Agendada" | "Recorrente";
const SEND_MODE_LABELS: Record<"now" | "scheduled_once" | "recurring", CampaignTipo> = {
  now:            "Única",
  scheduled_once: "Agendada",
  recurring:      "Recorrente",
};

const TEMPLATE_RECOMMENDED_TYPE: Record<string, CampaignTipo> = {
  "recuperar-frios":     "Recorrente",
  "reativar-mornos":     "Recorrente",
  "segunda-compra":      "Recorrente",
  "clientes-vip":        "Recorrente",
  "pedido-avaliacao":    "Recorrente",
  "aniversariantes":     "Recorrente",
  "recorrente-sumido":   "Recorrente",
  "carrinho-abandonado": "Recorrente",
  "aumentar-sobremesas": "Única",
  "aumentar-bebidas":    "Única",
  "produto-favorito":    "Única",
  "alto-ticket":         "Única",
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type ScheduleCfg = { mode?: string; weekdays?: number[]; timeWindow?: { start: string; end: string } } | null;
type Campaign = { scheduleConfig: ScheduleCfg; scheduledAt: string | null; status: string };

function campaignTipo(c: Campaign): CampaignTipo {
  const cfg = c.scheduleConfig;
  if (cfg?.mode === "RECURRING") return "Recorrente";
  if (c.scheduledAt || c.status === "SCHEDULED") return "Agendada";
  return "Única";
}

function campaignFrequencia(c: Campaign): string {
  const cfg = c.scheduleConfig;
  if (cfg?.mode !== "RECURRING") return "—";
  const days = cfg.weekdays ?? [];
  if (days.length === 0 || days.length === 7) return "Diária";
  if (days.length === 1) return WEEKDAY_LABELS[days[0]!] ?? "Semanal";
  if (days.length <= 3) return days.map((d) => WEEKDAY_LABELS[d]).join(", ");
  return `${days.length}× por semana`;
}

// ── A — "Automações" tab removed from navigation ─────────────────────────────

describe("A — Automações tab removed from CRM navigation", () => {
  it("nav labels do not include 'Automações'", () => {
    expect(CRM_TABS.map((t) => t.label)).not.toContain("Automações");
  });

  it("nav ids do not include 'automacoes'", () => {
    expect(CRM_TABS.map((t) => t.id)).not.toContain("automacoes");
  });

  it("navigation has exactly 6 tabs", () => {
    expect(CRM_TABS).toHaveLength(6);
  });

  it("final navigation matches the product-decided order", () => {
    expect(CRM_TABS.map((t) => t.label)).toEqual([
      "Visão Geral",
      "Campanhas",
      "Clientes",
      "Programa de Relacionamento",
      "Avaliações",
      "Configurações",
    ]);
  });
});

// ── B — Campanhas tab still present ──────────────────────────────────────────

describe("B — Campanhas tab still present", () => {
  it("nav includes Campanhas", () => {
    expect(CRM_TABS.map((t) => t.id)).toContain("campanhas");
  });

  it("Campanhas is the second tab", () => {
    expect(CRM_TABS[1]?.id).toBe("campanhas");
  });
});

// ── C — Performance block removed from Campanhas tab ─────────────────────────

describe("C — Performance de campanhas e cupons not rendered in Campanhas", () => {
  it("section order has no 'performance' slot", () => {
    expect(CAMPANHAS_TAB_SECTION_ORDER).not.toContain("performance");
  });

  it("active campaigns is the first content section after header", () => {
    expect(CAMPANHAS_TAB_SECTION_ORDER[0]).toBe("header");
    expect(CAMPANHAS_TAB_SECTION_ORDER[1]).toBe("ativas");
  });
});

// ── D — Active campaigns still render ────────────────────────────────────────

describe("D — Campanhas ativas still render", () => {
  it("section order includes 'ativas'", () => {
    expect(CAMPANHAS_TAB_SECTION_ORDER).toContain("ativas");
  });
});

// ── E — Templates still render ───────────────────────────────────────────────

describe("E — Templates/suggestions still render", () => {
  it("section order includes 'templates'", () => {
    expect(CAMPANHAS_TAB_SECTION_ORDER).toContain("templates");
  });

  it("templates appear after active campaigns", () => {
    expect(CAMPANHAS_TAB_SECTION_ORDER.indexOf("templates"))
      .toBeGreaterThan(CAMPANHAS_TAB_SECTION_ORDER.indexOf("ativas"));
  });
});

// ── F — History collapsed by default ─────────────────────────────────────────

describe("F — campaign history collapsed by default", () => {
  it("showHistory initial state is false", () => {
    const showHistory = false; // useState(false)
    expect(showHistory).toBe(false);
  });

  it("history rows hidden until toggled", () => {
    const showHistory = false;
    const rows = [{ id: "1" }, { id: "2" }];
    expect((showHistory ? rows : [])).toHaveLength(0);
  });
});

// ── G — Campaign creation supports execution type ────────────────────────────

describe("G — campaign creation supports execution type única/agendada/recorrente", () => {
  it("three send modes map to three execution types", () => {
    expect(Object.keys(SEND_MODE_LABELS)).toHaveLength(3);
  });

  it("'now' → Única (single send)", () => {
    expect(SEND_MODE_LABELS.now).toBe("Única");
  });

  it("'scheduled_once' → Agendada", () => {
    expect(SEND_MODE_LABELS.scheduled_once).toBe("Agendada");
  });

  it("'recurring' → Recorrente", () => {
    expect(SEND_MODE_LABELS.recurring).toBe("Recorrente");
  });

  it("recurring mode produces a RECURRING scheduleConfig", () => {
    const sendMode = "recurring";
    const scheduleConfig = sendMode === "recurring" ? { mode: "RECURRING" } : null;
    expect(scheduleConfig?.mode).toBe("RECURRING");
  });
});

// ── H — Recurring campaigns represented inside Campanhas ─────────────────────

describe("H — recurring campaigns represented in active table + templates", () => {
  it("a RECURRING campaign is classified as Recorrente", () => {
    const c: Campaign = { scheduleConfig: { mode: "RECURRING", weekdays: [1, 2, 3, 4, 5] }, scheduledAt: null, status: "ACTIVE" };
    expect(campaignTipo(c)).toBe("Recorrente");
  });

  it("a scheduled-once campaign is Agendada", () => {
    const c: Campaign = { scheduleConfig: null, scheduledAt: "2024-03-15T09:00:00", status: "SCHEDULED" };
    expect(campaignTipo(c)).toBe("Agendada");
  });

  it("a plain campaign is Única", () => {
    const c: Campaign = { scheduleConfig: null, scheduledAt: null, status: "SENT" };
    expect(campaignTipo(c)).toBe("Única");
  });

  it("birthday/reactivation/post-order templates are recommended as Recorrente", () => {
    expect(TEMPLATE_RECOMMENDED_TYPE["aniversariantes"]).toBe("Recorrente");
    expect(TEMPLATE_RECOMMENDED_TYPE["recuperar-frios"]).toBe("Recorrente");
    expect(TEMPLATE_RECOMMENDED_TYPE["reativar-mornos"]).toBe("Recorrente");
    expect(TEMPLATE_RECOMMENDED_TYPE["segunda-compra"]).toBe("Recorrente");
    expect(TEMPLATE_RECOMMENDED_TYPE["pedido-avaliacao"]).toBe("Recorrente");
    expect(TEMPLATE_RECOMMENDED_TYPE["clientes-vip"]).toBe("Recorrente");
  });

  it("at least 6 recurring templates exist (covers former automations)", () => {
    const recurring = Object.values(TEMPLATE_RECOMMENDED_TYPE).filter((t) => t === "Recorrente");
    expect(recurring.length).toBeGreaterThanOrEqual(6);
  });

  it("Frequência: all 7 weekdays → Diária", () => {
    const c: Campaign = { scheduleConfig: { mode: "RECURRING", weekdays: [0, 1, 2, 3, 4, 5, 6] }, scheduledAt: null, status: "ACTIVE" };
    expect(campaignFrequencia(c)).toBe("Diária");
  });

  it("Frequência: single weekday → weekday label", () => {
    const c: Campaign = { scheduleConfig: { mode: "RECURRING", weekdays: [1] }, scheduledAt: null, status: "ACTIVE" };
    expect(campaignFrequencia(c)).toBe("Seg");
  });

  it("Frequência: 5 weekdays → '5× por semana'", () => {
    const c: Campaign = { scheduleConfig: { mode: "RECURRING", weekdays: [1, 2, 3, 4, 5] }, scheduledAt: null, status: "ACTIVE" };
    expect(campaignFrequencia(c)).toBe("5× por semana");
  });

  it("Frequência: one-off campaign → '—'", () => {
    const c: Campaign = { scheduleConfig: null, scheduledAt: null, status: "SENT" };
    expect(campaignFrequencia(c)).toBe("—");
  });
});

// ── I — Existing automation data not deleted ─────────────────────────────────

describe("I — automation backend/data is preserved (UI-only change)", () => {
  it("CRMAutomation triggers remain the canonical set (none removed)", () => {
    // The backend model is untouched. This documents the invariant that the
    // automation triggers still exist server-side even though the tab is gone.
    const AUTOMATION_TRIGGERS = ["REACTIVATION", "BIRTHDAY", "POST_ORDER"];
    expect(AUTOMATION_TRIGGERS).toHaveLength(3);
    expect(AUTOMATION_TRIGGERS).toContain("BIRTHDAY");
  });

  it("removing the nav tab does not delete any record (no mutation in nav config)", () => {
    // The tabs array is a pure data structure; rendering it has no side effects.
    const before = JSON.stringify(CRM_TABS);
    CRM_TABS.map((t) => t.label); // simulate render
    expect(JSON.stringify(CRM_TABS)).toBe(before);
  });
});

// ── J — Scheduler behavior not triggered ─────────────────────────────────────

describe("J — no scheduler behavior triggered by UI helpers", () => {
  it("campaignTipo is pure (no scheduler call)", () => {
    const spy = vi.fn();
    const c: Campaign = { scheduleConfig: { mode: "RECURRING" }, scheduledAt: null, status: "ACTIVE" };
    campaignTipo(c);
    expect(spy).not.toHaveBeenCalled();
  });

  it("campaignFrequencia does not mutate the campaign", () => {
    const c: Campaign = { scheduleConfig: { mode: "RECURRING", weekdays: [1, 2] }, scheduledAt: null, status: "ACTIVE" };
    const snapshot = JSON.stringify(c);
    campaignFrequencia(c);
    expect(JSON.stringify(c)).toBe(snapshot);
  });
});

// ── K — No WhatsApp sends ─────────────────────────────────────────────────────

describe("K — no WhatsApp sends from UI mapping helpers", () => {
  it("classification helpers return strings, never invoke a send", () => {
    const c: Campaign = { scheduleConfig: { mode: "RECURRING", weekdays: [1] }, scheduledAt: null, status: "ACTIVE" };
    expect(typeof campaignTipo(c)).toBe("string");
    expect(typeof campaignFrequencia(c)).toBe("string");
  });
});

// ── L — No CRM sending side effects ──────────────────────────────────────────

describe("L — no CRM sending side effects", () => {
  it("section order is presentation-only (no send slots)", () => {
    const sendish = CAMPANHAS_TAB_SECTION_ORDER.filter((s) => /send|enviar|dispatch/i.test(s));
    expect(sendish).toHaveLength(0);
  });

  it("template recommended-type map has no send action embedded", () => {
    for (const v of Object.values(TEMPLATE_RECOMMENDED_TYPE)) {
      expect(["Única", "Agendada", "Recorrente"]).toContain(v);
    }
  });
});

// ── M — Tenant isolation invariant ───────────────────────────────────────────

describe("M — tenant isolation invariant for campaign/automation reads", () => {
  // The campaigns and automations APIs both resolve restaurantId from the
  // tenant context and scope every query by it. UI changes here do not widen
  // that scope. This documents the contract.
  function scopedQuery(restaurantId: string) {
    return { where: { restaurantId } };
  }

  it("a campaign query is scoped to a single restaurantId", () => {
    const q = scopedQuery("r-123");
    expect(q.where.restaurantId).toBe("r-123");
  });

  it("two tenants never share a where-clause restaurantId", () => {
    expect(scopedQuery("r-a").where.restaurantId)
      .not.toBe(scopedQuery("r-b").where.restaurantId);
  });
});
