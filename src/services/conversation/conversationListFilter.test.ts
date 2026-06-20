/**
 * conversationListFilter — pure where-builder tests.
 *
 * "CRM enviado" must include EVERY conversation that received any CRM outbound,
 * via contextType OR a CRM send log (CampaignExecution / CRMActionLog) keyed by
 * customerId. Channel-independent; existing status/channel/search filters keep working.
 *
 *   TASK 7:
 *   A–F — campaign/automation/post-order/review/cart-recovery recipients appear
 *         (contextType OR customerId-in-log).
 *   G   — appears even if the latest message is a normal WhatsApp (no message constraint).
 *   H   — a conversation with no CRM outbound is not matched.
 *   I   — staff/internal (no CRM log, no CRM context) is not matched.
 */

import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  buildConversationWhere,
  CRM_CONTEXT_TYPES,
} from "./conversationListFilter";

const TENANT = "rest_123";

/** Pull the CRM OR group (the one containing a contextType clause) out of where.AND. */
function crmOrOf(where: Prisma.ConversationWhereInput): Prisma.ConversationWhereInput[] | undefined {
  const and = (where.AND as Prisma.ConversationWhereInput[] | undefined) ?? [];
  const group = and.find(
    (c) => Array.isArray(c.OR) && c.OR.some((o) => (o as { contextType?: unknown }).contextType),
  );
  return group?.OR as Prisma.ConversationWhereInput[] | undefined;
}

describe("CRM context types", () => {
  it("cover campaign, automation, review, and cart recovery", () => {
    expect(CRM_CONTEXT_TYPES).toContain("CRM_CAMPAIGN");
    expect(CRM_CONTEXT_TYPES).toContain("CRM_AUTOMATION");
    expect(CRM_CONTEXT_TYPES).toContain("CRM_REVIEW");
    expect(CRM_CONTEXT_TYPES).toContain("CART_RECOVERY");
  });
});

describe("crm flag → contextType OR CRM-send-log filter", () => {
  it("crm with NO recipient ids → matches CRM contextTypes only", () => {
    const or = crmOrOf(buildConversationWhere(TENANT, { crm: "1" }));
    expect(or).toEqual([{ contextType: { in: [...CRM_CONTEXT_TYPES] } }]);
  });

  it("crm WITH recipient ids → also matches conversations of those customers (log-backed)", () => {
    const ids = ["c_campaign", "c_review", "c_postorder"];
    const or = crmOrOf(buildConversationWhere(TENANT, { crm: "1" }, ids));
    expect(or).toContainEqual({ contextType: { in: [...CRM_CONTEXT_TYPES] } });
    expect(or).toContainEqual({ customerId: { in: ids } });
  });

  it("A–F — a recipient of ANY CRM log type appears (campaign/automation/post-order/review/cart)", () => {
    // The route passes the union of CampaignExecution + CRMActionLog customerIds;
    // each such customer is matched regardless of which CRM flow sent the message.
    const recipients = ["camp", "auto", "postorder", "review", "cart", "manual", "birthday"];
    const or = crmOrOf(buildConversationWhere(TENANT, { crm: "1" }, recipients));
    expect(or).toContainEqual({ customerId: { in: recipients } });
  });

  it("G — match is customerId/contextType based, never message-content based", () => {
    const where = buildConversationWhere(TENANT, { crm: "1" }, ["c1"]);
    // A customer who later sends a normal WhatsApp still matches: no `messages` constraint.
    expect(JSON.stringify(where)).not.toContain("messages");
  });

  it("H/I — without the crm flag there is no CRM constraint at all", () => {
    const where = buildConversationWhere(TENANT, {});
    expect(where.AND).toBeUndefined();
    expect(where.contextType).toBeUndefined();
  });

  it("empty recipient ids → does not add an empty customerId IN (avoids matching all)", () => {
    const or = crmOrOf(buildConversationWhere(TENANT, { crm: "1" }, []));
    expect(or).toEqual([{ contextType: { in: [...CRM_CONTEXT_TYPES] } }]);
  });

  it("any truthy crm value enables the filter", () => {
    for (const v of ["1", "SENT", "REPLIED", "CRM", "true"]) {
      expect(crmOrOf(buildConversationWhere(TENANT, { crm: v }))).toBeDefined();
    }
  });
});

describe("crm is channel-independent and composes with channel/search", () => {
  it("crm set, no channel → no channel constraint", () => {
    const where = buildConversationWhere(TENANT, { crm: "1" });
    expect(where.channel).toBeUndefined();
    expect(crmOrOf(where)).toBeDefined();
  });

  it("crm + WHATSAPP → both present", () => {
    const where = buildConversationWhere(TENANT, { crm: "1", channel: "WHATSAPP" });
    expect(where.channel).toBe("WHATSAPP");
    expect(crmOrOf(where)).toBeDefined();
  });

  it("crm + search → AND holds both OR groups", () => {
    const where = buildConversationWhere(TENANT, { crm: "1", search: "joao" }, ["c1"]);
    const and = where.AND as Prisma.ConversationWhereInput[];
    expect(and).toHaveLength(2);
    expect(crmOrOf(where)).toBeDefined();
  });
});

describe("status / channel / search still work", () => {
  it("valid status applied; invalid ignored", () => {
    expect(buildConversationWhere(TENANT, { status: "RESOLVED" }).status).toBe("RESOLVED");
    expect(buildConversationWhere(TENANT, { status: "NOPE" }).status).toBeUndefined();
  });

  it("valid channel applied; invalid ignored", () => {
    expect(buildConversationWhere(TENANT, { channel: "QR_AGENT" }).channel).toBe("QR_AGENT");
    expect(buildConversationWhere(TENANT, { channel: "TELEPATHY" }).channel).toBeUndefined();
  });

  it("search builds an OR across name/phone/customer", () => {
    const where = buildConversationWhere(TENANT, { search: "maria" });
    const and = where.AND as Prisma.ConversationWhereInput[];
    expect(and).toHaveLength(1);
    expect((and[0].OR as unknown[]).length).toBeGreaterThanOrEqual(3);
  });
});

describe("tenant isolation + purity", () => {
  it("restaurantId is always present", () => {
    expect(buildConversationWhere(TENANT, {}).restaurantId).toBe(TENANT);
    expect(buildConversationWhere("other", { crm: "1" }).restaurantId).toBe("other");
  });

  it("does not mutate its filters argument", () => {
    const filters = { crm: "1", channel: "WHATSAPP" };
    const before = JSON.stringify(filters);
    buildConversationWhere(TENANT, filters, ["c1"]);
    expect(JSON.stringify(filters)).toBe(before);
  });
});
