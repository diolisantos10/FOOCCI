/**
 * conversationListFilter — pure where-builder tests.
 *
 * Verifies the "CRM enviado" filter is channel-independent and that existing
 * status/channel/search filters keep working.
 *
 *   A — crm flag → contextType IN (all CRM_CONTEXT_TYPES)
 *   B — crm flag works with NO channel (channel-independent)
 *   C — crm + channel can coexist (CRM is additive, not channel-bound)
 *   D — no crm flag → no contextType constraint
 *   E — valid status applied; invalid status ignored
 *   F — valid channel applied; invalid channel ignored
 *   G — search builds an OR across name/phone/customer
 *   H — tenant: restaurantId always present
 *   I — pure & deterministic
 */

import { describe, it, expect } from "vitest";
import {
  buildConversationWhere,
  CRM_CONTEXT_TYPES,
} from "./conversationListFilter";

const TENANT = "rest_123";

// ─── A. CRM flag → contextType filter ─────────────────────────────────────────

describe("A — crm flag restricts to CRM-origin conversations", () => {
  it("crm='1' sets contextType IN (all CRM_CONTEXT_TYPES)", () => {
    const where = buildConversationWhere(TENANT, { crm: "1" });
    expect(where.contextType).toEqual({ in: [...CRM_CONTEXT_TYPES] });
  });

  it("CRM_CONTEXT_TYPES covers campaign, automation, review, and cart recovery", () => {
    expect(CRM_CONTEXT_TYPES).toContain("CRM_CAMPAIGN");
    expect(CRM_CONTEXT_TYPES).toContain("CRM_AUTOMATION");
    expect(CRM_CONTEXT_TYPES).toContain("CRM_REVIEW");
    expect(CRM_CONTEXT_TYPES).toContain("CART_RECOVERY");
  });

  it("any truthy crm value enables the filter", () => {
    for (const v of ["1", "SENT", "REPLIED", "CRM", "true"]) {
      const where = buildConversationWhere(TENANT, { crm: v });
      expect(where.contextType).toEqual({ in: [...CRM_CONTEXT_TYPES] });
    }
  });
});

// ─── B. CRM is channel-independent ────────────────────────────────────────────

describe("B — crm filter works without a channel", () => {
  it("crm set, no channel → contextType present, no channel constraint", () => {
    const where = buildConversationWhere(TENANT, { crm: "1" });
    expect(where.contextType).toBeDefined();
    expect(where.channel).toBeUndefined();
  });

  it("crm set with channel null/empty → still CRM-filtered, no channel", () => {
    const where = buildConversationWhere(TENANT, { crm: "1", channel: null });
    expect(where.contextType).toEqual({ in: [...CRM_CONTEXT_TYPES] });
    expect(where.channel).toBeUndefined();
  });
});

// ─── C. CRM + channel coexist ─────────────────────────────────────────────────

describe("C — crm and channel can coexist", () => {
  it("crm + WHATSAPP → both constraints present", () => {
    const where = buildConversationWhere(TENANT, { crm: "1", channel: "WHATSAPP" });
    expect(where.contextType).toEqual({ in: [...CRM_CONTEXT_TYPES] });
    expect(where.channel).toBe("WHATSAPP");
  });
});

// ─── D. No crm flag → no contextType ──────────────────────────────────────────

describe("D — no crm flag leaves contextType unconstrained", () => {
  it("absent crm → contextType undefined", () => {
    const where = buildConversationWhere(TENANT, {});
    expect(where.contextType).toBeUndefined();
  });

  it("empty-string crm → contextType undefined (falsy)", () => {
    const where = buildConversationWhere(TENANT, { crm: "" });
    expect(where.contextType).toBeUndefined();
  });

  it("null crm → contextType undefined", () => {
    const where = buildConversationWhere(TENANT, { crm: null });
    expect(where.contextType).toBeUndefined();
  });
});

// ─── E. Status filter ─────────────────────────────────────────────────────────

describe("E — status filter", () => {
  it("valid status (RESOLVED) is applied", () => {
    const where = buildConversationWhere(TENANT, { status: "RESOLVED" });
    expect(where.status).toBe("RESOLVED");
  });

  it("invalid status is ignored", () => {
    const where = buildConversationWhere(TENANT, { status: "NOT_A_STATUS" });
    expect(where.status).toBeUndefined();
  });
});

// ─── F. Channel filter ────────────────────────────────────────────────────────

describe("F — channel filter still works", () => {
  it("valid channel (WHATSAPP) is applied", () => {
    const where = buildConversationWhere(TENANT, { channel: "WHATSAPP" });
    expect(where.channel).toBe("WHATSAPP");
  });

  it("valid channel (QR_AGENT) is applied", () => {
    const where = buildConversationWhere(TENANT, { channel: "QR_AGENT" });
    expect(where.channel).toBe("QR_AGENT");
  });

  it("invalid channel is ignored", () => {
    const where = buildConversationWhere(TENANT, { channel: "TELEPATHY" });
    expect(where.channel).toBeUndefined();
  });
});

// ─── G. Search filter ─────────────────────────────────────────────────────────

describe("G — search builds an OR", () => {
  it("search produces an OR across name/phone/customer", () => {
    const where = buildConversationWhere(TENANT, { search: "maria" });
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR!.length).toBeGreaterThanOrEqual(3);
  });

  it("crm + search coexist", () => {
    const where = buildConversationWhere(TENANT, { crm: "1", search: "joao" });
    expect(where.contextType).toEqual({ in: [...CRM_CONTEXT_TYPES] });
    expect(Array.isArray(where.OR)).toBe(true);
  });
});

// ─── H. Tenant isolation ──────────────────────────────────────────────────────

describe("H — tenant isolation", () => {
  it("restaurantId is always present", () => {
    expect(buildConversationWhere(TENANT, {}).restaurantId).toBe(TENANT);
    expect(buildConversationWhere(TENANT, { crm: "1" }).restaurantId).toBe(TENANT);
    expect(buildConversationWhere("other", { crm: "1" }).restaurantId).toBe("other");
  });
});

// ─── I. Pure & deterministic ──────────────────────────────────────────────────

describe("I — pure & deterministic", () => {
  it("same input → equal output", () => {
    const a = buildConversationWhere(TENANT, { crm: "1", status: "RESOLVED" });
    const b = buildConversationWhere(TENANT, { crm: "1", status: "RESOLVED" });
    expect(a).toEqual(b);
  });

  it("does not mutate its filters argument", () => {
    const filters = { crm: "1", channel: "WHATSAPP" };
    const before = JSON.stringify(filters);
    buildConversationWhere(TENANT, filters);
    expect(JSON.stringify(filters)).toBe(before);
  });
});
