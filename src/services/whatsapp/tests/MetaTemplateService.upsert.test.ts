import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  metaMessageTemplate: {
    upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
      id: "row1", templateName: create.templateName, languageCode: create.languageCode,
      category: create.category, status: create.status, bodyVariables: create.bodyVariables,
      mappedCampaignType: create.mappedCampaignType ?? null,
    })),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { MetaTemplateService } from "../MetaTemplateService";

beforeEach(() => vi.clearAllMocks());

describe("MetaTemplateService.upsert — status preservation", () => {
  it("OMITS status from the UPDATE when the caller does not provide it (preserves APPROVED)", async () => {
    await MetaTemplateService.upsert({
      restaurantId: "r1", templateName: "cliente_perdido", languageCode: "pt_BR",
      category: "MARKETING", bodyVariables: 4, // no status
    });
    const arg = db.metaMessageTemplate.upsert.mock.calls[0][0];
    expect(arg.update).not.toHaveProperty("status");
    // CREATE still defaults to PENDING for brand-new rows.
    expect(arg.create.status).toBe("PENDING");
  });

  it("includes status in the UPDATE when explicitly provided (sync refreshes APPROVED)", async () => {
    await MetaTemplateService.upsert({
      restaurantId: "r1", templateName: "cliente_perdido", languageCode: "pt_BR",
      category: "MARKETING", status: "APPROVED", bodyVariables: 4,
    });
    const arg = db.metaMessageTemplate.upsert.mock.calls[0][0];
    expect(arg.update.status).toBe("APPROVED");
  });

  it("preserves mappedCampaignType on UPDATE when omitted", async () => {
    await MetaTemplateService.upsert({
      restaurantId: "r1", templateName: "t", languageCode: "pt_BR", category: "UTILITY", bodyVariables: 0,
    });
    const arg = db.metaMessageTemplate.upsert.mock.calls[0][0];
    expect(arg.update).not.toHaveProperty("mappedCampaignType");
  });
});
