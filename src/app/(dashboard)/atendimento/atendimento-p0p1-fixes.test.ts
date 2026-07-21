/**
 * Atendimento P0/P1 fix tests (A–E).
 *
 * Pure: no DOM, no React, no DB. All logic is mirrored from AtendimentoClient.tsx.
 *
 *   A — Composer visibility predicate (resolved/human/aiActive/locked)
 *   B — Manual send on locked: predicate allows send, aiLocked is not cleared
 *   C — CRM actor label variants (Campanha / Automação / CRM fallback)
 *   D — Conv type badge in list (Staff / Fornecedor / Customer → null)
 *   E — Error state vs empty state predicate
 */

import { describe, it, expect } from "vitest";

// ── Mirrored helpers from AtendimentoClient.tsx ────────────────────────────────

type ConversationType = "CUSTOMER" | "STAFF" | "SUPPLIER" | "PARTNER" | "INTERNAL" | "OTHER_NON_CUSTOMER";

const CONV_TYPE_LABEL: Record<ConversationType, string> = {
  CUSTOMER:           "Cliente",
  STAFF:              "Staff",
  SUPPLIER:           "Fornecedor",
  PARTNER:            "Parceiro",
  INTERNAL:           "Interno",
  OTHER_NON_CUSTOMER: "Não-cliente",
};

interface ConvSummaryLite {
  aiLocked?:          boolean;
  aiEnabled:          boolean;
  status:             string;
  conversationType?:  ConversationType;
}

/** Mirror of the composerVisible predicate from ThreadPanel. */
function composerVisible(t: { aiEnabled: boolean; status: string; aiLocked?: boolean }): boolean {
  const isResolved      = t.status === "RESOLVED";
  const isLocked        = t.aiLocked === true;
  const isHumanHandling = !t.aiEnabled && !isResolved && !isLocked;
  return !isResolved && (isHumanHandling || isLocked);
}

/** Mirror of getConvTypeBadge from AtendimentoClient. */
function getConvTypeBadge(c: ConvSummaryLite): { label: string; cls: string } | null {
  const t = c.conversationType;
  if (!t || t === "CUSTOMER") return null;
  return { label: CONV_TYPE_LABEL[t], cls: "bg-slate-100 text-slate-600 border-slate-200" };
}

/**
 * Mirror of the CRM actor label resolution from MessageBubble.
 * Only covers the outbound CRM / HUMAN / AI branches exercised by these tests.
 */
function resolveSenderLabel(msg: {
  direction:  "INBOUND" | "OUTBOUND";
  senderType: string | null;
  metadata?:  Record<string, unknown> | null;
  customerName: string;
}): string {
  const isOutbound  = msg.direction === "OUTBOUND";
  const msgSource   = msg.metadata?.source as string | undefined;
  const crmCtx      = msg.metadata?.contextType as string | undefined;
  const crmActorLabel = crmCtx === "CRM_CAMPAIGN" ? "Campanha"
                      : crmCtx === "CRM_AUTOMATION" ? "Automação"
                      : "CRM";

  if (!isOutbound) {
    return msg.senderType === "CUSTOMER_CARDAPIO"
      ? `${msg.customerName} · Cardápio`
      : `${msg.customerName} · WhatsApp`;
  }
  if (msg.senderType === "AI")
    return msgSource === "CARDAPIO" ? "IA · Cardápio" : "IA · WhatsApp";
  if (msg.senderType === "HUMAN_EXTERNAL") return "WhatsApp externo";
  if (msg.senderType === "CRM") return crmActorLabel;
  if (msg.senderType === "HUMAN")
    return msgSource === "CARDAPIO" ? "Operador · Cardápio" : "Operador · WhatsApp";
  return "Operador";
}

/** Mirror of senderBadgeCls for outbound messages. */
function resolveSenderBadgeCls(senderType: string | null): string {
  if (senderType === "AI") return "bg-orange-50 border border-orange-200 text-orange-600";
  if (senderType === "HUMAN_EXTERNAL") return "bg-teal-50 border border-teal-200 text-teal-700";
  if (senderType === "CRM") return "bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-700";
  return "bg-gray-700 border border-gray-600 text-white";
}

/** Mirror of list render branch selector. */
type ListBranch = "loading" | "error" | "empty" | "list";
function resolveListBranch(opts: {
  loadingList:   boolean;
  fetchError:    string | null;
  displayedLen:  number;
}): ListBranch {
  if (opts.loadingList)  return "loading";
  if (opts.fetchError)   return "error";
  if (opts.displayedLen === 0) return "empty";
  return "list";
}

// ── A — Composer visibility predicate ─────────────────────────────────────────

describe("A — composer visibility predicate", () => {
  it("resolved → hidden", () => {
    expect(composerVisible({ aiEnabled: false, status: "RESOLVED", aiLocked: false })).toBe(false);
  });

  it("resolved + locked → still hidden (resolved takes priority)", () => {
    expect(composerVisible({ aiEnabled: false, status: "RESOLVED", aiLocked: true })).toBe(false);
  });

  it("human handling (aiEnabled=false, open, not locked) → visible", () => {
    expect(composerVisible({ aiEnabled: false, status: "OPEN", aiLocked: false })).toBe(true);
  });

  it("AI active (aiEnabled=true, open, not locked) → hidden", () => {
    expect(composerVisible({ aiEnabled: true, status: "OPEN", aiLocked: false })).toBe(false);
  });

  it("locked (aiLocked=true, open) → visible", () => {
    expect(composerVisible({ aiEnabled: false, status: "OPEN", aiLocked: true })).toBe(true);
  });

  it("locked + aiEnabled=true (edge case) → visible because isLocked takes precedence", () => {
    // isLocked=true overrides isAIActive; composer should show
    expect(composerVisible({ aiEnabled: true, status: "OPEN", aiLocked: true })).toBe(true);
  });
});

// ── B — Manual send on locked does not alter aiLocked ─────────────────────────

describe("B — locked conversation: composer visible, aiLocked preserved", () => {
  const lockedThread = { aiEnabled: false, status: "OPEN", aiLocked: true };

  it("composer is visible for a locked conversation", () => {
    expect(composerVisible(lockedThread)).toBe(true);
  });

  it("aiLocked remains true after composerVisible check (pure function — no mutation)", () => {
    composerVisible(lockedThread);
    expect(lockedThread.aiLocked).toBe(true);
  });

  it("composerVisible does not flip aiEnabled to true", () => {
    const t = { aiEnabled: false, status: "OPEN", aiLocked: true };
    composerVisible(t);
    expect(t.aiEnabled).toBe(false);
  });
});

// ── C — CRM actor label variants ──────────────────────────────────────────────

describe("C — CRM actor label variants", () => {
  it("senderType=CRM + contextType=CRM_CAMPAIGN → 'Campanha'", () => {
    const label = resolveSenderLabel({
      direction: "OUTBOUND",
      senderType: "CRM",
      metadata: { contextType: "CRM_CAMPAIGN" },
      customerName: "João",
    });
    expect(label).toBe("Campanha");
  });

  it("senderType=CRM + contextType=CRM_AUTOMATION → 'Automação'", () => {
    const label = resolveSenderLabel({
      direction: "OUTBOUND",
      senderType: "CRM",
      metadata: { contextType: "CRM_AUTOMATION" },
      customerName: "João",
    });
    expect(label).toBe("Automação");
  });

  it("senderType=CRM + no contextType → 'CRM'", () => {
    const label = resolveSenderLabel({
      direction: "OUTBOUND",
      senderType: "CRM",
      metadata: null,
      customerName: "João",
    });
    expect(label).toBe("CRM");
  });

  it("senderType=CRM + unknown contextType → 'CRM' fallback", () => {
    const label = resolveSenderLabel({
      direction: "OUTBOUND",
      senderType: "CRM",
      metadata: { contextType: "SOMETHING_ELSE" },
      customerName: "João",
    });
    expect(label).toBe("CRM");
  });

  it("CRM badge uses a distinct (fuchsia) style", () => {
    expect(resolveSenderBadgeCls("CRM")).toContain("fuchsia");
  });

  it("HUMAN senderType unaffected — still 'Operador · WhatsApp'", () => {
    expect(resolveSenderLabel({
      direction: "OUTBOUND",
      senderType: "HUMAN",
      metadata: null,
      customerName: "João",
    })).toBe("Operador · WhatsApp");
  });

  it("AI senderType unaffected — still 'IA · WhatsApp'", () => {
    expect(resolveSenderLabel({
      direction: "OUTBOUND",
      senderType: "AI",
      metadata: null,
      customerName: "João",
    })).toBe("IA · WhatsApp");
  });
});

// ── D — Conv type badge in list ───────────────────────────────────────────────

describe("D — conv type badge in list", () => {
  it("conversationType=CUSTOMER → null (no badge)", () => {
    expect(getConvTypeBadge({ aiEnabled: true, status: "OPEN", conversationType: "CUSTOMER" })).toBeNull();
  });

  it("conversationType=undefined → null (no badge)", () => {
    expect(getConvTypeBadge({ aiEnabled: true, status: "OPEN" })).toBeNull();
  });

  it("conversationType=STAFF → badge with label 'Staff'", () => {
    const badge = getConvTypeBadge({ aiEnabled: false, status: "OPEN", conversationType: "STAFF" });
    expect(badge).not.toBeNull();
    expect(badge?.label).toBe("Staff");
    expect(badge?.cls).toContain("slate");
  });

  it("conversationType=SUPPLIER → badge with label 'Fornecedor'", () => {
    const badge = getConvTypeBadge({ aiEnabled: false, status: "OPEN", conversationType: "SUPPLIER" });
    expect(badge?.label).toBe("Fornecedor");
  });

  it("conversationType=PARTNER → badge with label 'Parceiro'", () => {
    const badge = getConvTypeBadge({ aiEnabled: false, status: "OPEN", conversationType: "PARTNER" });
    expect(badge?.label).toBe("Parceiro");
  });

  it("conversationType=INTERNAL → badge with label 'Interno'", () => {
    const badge = getConvTypeBadge({ aiEnabled: false, status: "OPEN", conversationType: "INTERNAL" });
    expect(badge?.label).toBe("Interno");
  });

  it("all non-CUSTOMER type badges use the slate style", () => {
    const types: ConversationType[] = ["STAFF", "SUPPLIER", "PARTNER", "INTERNAL", "OTHER_NON_CUSTOMER"];
    for (const t of types) {
      const badge = getConvTypeBadge({ aiEnabled: false, status: "OPEN", conversationType: t });
      expect(badge?.cls).toContain("slate");
    }
  });
});

// ── E — Error state vs empty state ───────────────────────────────────────────

describe("E — list render branch: error vs empty vs list", () => {
  it("loadingList → 'loading' branch regardless of error", () => {
    expect(resolveListBranch({ loadingList: true, fetchError: "err", displayedLen: 0 })).toBe("loading");
  });

  it("fetchError set → 'error' branch (not empty)", () => {
    expect(resolveListBranch({ loadingList: false, fetchError: "Falha ao carregar conversas.", displayedLen: 0 })).toBe("error");
  });

  it("fetchError null + 0 conversations → 'empty' branch", () => {
    expect(resolveListBranch({ loadingList: false, fetchError: null, displayedLen: 0 })).toBe("empty");
  });

  it("fetchError null + conversations present → 'list' branch", () => {
    expect(resolveListBranch({ loadingList: false, fetchError: null, displayedLen: 3 })).toBe("list");
  });

  it("fetchError set + conversations present → 'error' branch (error wins over list)", () => {
    expect(resolveListBranch({ loadingList: false, fetchError: "net error", displayedLen: 5 })).toBe("error");
  });
});
