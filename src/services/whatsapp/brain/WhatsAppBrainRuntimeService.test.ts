import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  message: { findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const evoClient = vi.hoisted(() => ({ sendTextMessage: vi.fn() }));
vi.mock("@/lib/evolution/EvolutionClient", () => ({ EvolutionClient: evoClient }));

const evoCfg = vi.hoisted(() => ({ getSnapshot: vi.fn() }));
vi.mock("@/services/evolution/EvolutionConfigService", () => ({ EvolutionConfigService: evoCfg }));

const handoff = vi.hoisted(() => ({ markConversationNeedsHuman: vi.fn() }));
vi.mock("@/lib/handoff", () => handoff);

const brain = vi.hoisted(() => ({ reasonAsAgent: vi.fn() }));
vi.mock("@/services/brain/reasoning/BrainReasoner", () => brain);

import { WhatsAppBrainRuntimeService, isWhatsAppBrainEnabled } from "./WhatsAppBrainRuntimeService";

function brainOutcome(over: Record<string, unknown> = {}) {
  return {
    engine: { provider: "OPENAI", model: "gpt-4o-mini", reason: "" },
    reasoningMode: "LLM",
    result: {
      primaryIntent: "PAYMENT_QUESTION",
      idealResponse: "Aceitamos Pix, cartão e dinheiro. 😊",
      shouldEscalate: false,
      runtimeTouched: false,
      ...over,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.findUnique.mockResolvedValue({
    id: "conv_1", restaurantId: "rest_1", status: "BOT", aiEnabled: true,
    customer: { id: "cust_1", phone: "5511999", name: "Ana" },
  });
  db.message.findFirst
    .mockResolvedValueOnce({ content: "vocês aceitam vale-refeição?", type: "TEXT", sentAt: new Date() })
    .mockResolvedValueOnce(null); // alreadyReplied = none
  db.$transaction.mockResolvedValue([{}, {}]);
  evoCfg.getSnapshot.mockResolvedValue({ ok: true, data: { instanceName: "i", baseUrl: "u", apiKey: "k" } });
  evoClient.sendTextMessage.mockResolvedValue({ key: { id: "ext_1" } });
  handoff.markConversationNeedsHuman.mockResolvedValue(true);
  brain.reasonAsAgent.mockResolvedValue(brainOutcome());
});

describe("isWhatsAppBrainEnabled (the safety switch)", () => {
  it("is OFF unless the flag is exactly 'true'", () => {
    expect(isWhatsAppBrainEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isWhatsAppBrainEnabled({ WHATSAPP_BRAIN_ENABLED: "1" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isWhatsAppBrainEnabled({ WHATSAPP_BRAIN_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe("WhatsAppBrainRuntimeService.respond (the cutover)", () => {
  it("reasons via the Brain and sends the Brain's reply (not a menu match)", async () => {
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(brain.reasonAsAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "whatsapp", businessId: "rest_1" }),
    );
    expect(evoClient.sendTextMessage).toHaveBeenCalledWith(
      expect.anything(), "5511999", "Aceitamos Pix, cartão e dinheiro. 😊",
    );
    expect(out.status).toBe("REPLIED");
  });

  it("escalates to a human when the Brain asks — but sends the reply first", async () => {
    brain.reasonAsAgent.mockResolvedValue(
      brainOutcome({ shouldEscalate: true, escalationReason: "reclamação", idealResponse: "Vou te passar pra um atendente. 🤝" }),
    );
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(evoClient.sendTextMessage).toHaveBeenCalled();
    expect(handoff.markConversationNeedsHuman).toHaveBeenCalledWith("conv_1", "AI_ESCALATION");
    expect(out.status).toBe("HANDOFF");
  });

  it("never touches a conversation a human took over", async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: "conv_1", restaurantId: "rest_1", status: "HUMAN", aiEnabled: false,
      customer: { id: "c", phone: "5511", name: "x" },
    });
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(out.status).toBe("SKIPPED");
    expect(brain.reasonAsAgent).not.toHaveBeenCalled();
    expect(evoClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it("is idempotent — skips if the AI already replied after the last inbound", async () => {
    db.message.findFirst.mockReset();
    db.message.findFirst
      .mockResolvedValueOnce({ content: "oi", type: "TEXT", sentAt: new Date() })
      .mockResolvedValueOnce({ id: "already" });
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(out.status).toBe("SKIPPED");
    expect(evoClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it("never throws into the webhook — returns SKIPPED on error", async () => {
    db.conversation.findUnique.mockRejectedValue(new Error("db down"));
    const out = await WhatsAppBrainRuntimeService.respond("conv_1");
    expect(out.status).toBe("SKIPPED");
  });
});
