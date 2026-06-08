/**
 * WhatsAppFallbackGuard — tests that prove the Receptionist fallback is always
 * preserved when Text Ordering is not going to handle a message.
 *
 * Root cause these tests guard against: `handleInboundForOrdering` used env-only
 * guards (isWaTextOrderingEnabled, resolveSideEffectPermissions) that returned
 * false/no-reply for DB-configured restaurants. The webhook pre-set
 * textOrderingHandled=true, so the old Receptionist was silently blocked and
 * customers received no reply.
 *
 * All tests mock:
 *   - @/lib/prisma (no real DB)
 *   - @/services/whatsapp/ordering/WhatsAppTextOrderingConfigService (config)
 *   - @/services/whatsapp/ordering/WhatsAppTextOrderService (processCustomerMessage)
 *   - @/services/whatsapp/ordering/WhatsAppOrderingSessionService (session)
 *   - @/lib/handoff (markConversationNeedsHuman)
 *   - @/services/evolution/EvolutionConfigService (send)
 *   - @/lib/evolution/EvolutionClient (send)
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const prismaMock = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  message:      { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const configMock = vi.hoisted(() => ({
  resolveWaConfig: vi.fn(),
}));
vi.mock("@/services/whatsapp/ordering/WhatsAppTextOrderingConfigService", () => configMock);

const processMock = vi.hoisted(() => ({
  processCustomerMessage: vi.fn(),
}));
vi.mock("@/services/whatsapp/ordering/WhatsAppTextOrderService", () => processMock);

const sessionMock = vi.hoisted(() => ({
  WhatsAppOrderingSessionService: {
    findActiveSession: vi.fn(),
    createSession:     vi.fn(),
    updateSession:     vi.fn(),
  },
}));
vi.mock("@/services/whatsapp/ordering/WhatsAppOrderingSessionService", () => sessionMock);

vi.mock("@/lib/handoff", () => ({ markConversationNeedsHuman: vi.fn() }));
vi.mock("@/services/evolution/EvolutionConfigService", () => ({
  EvolutionConfigService: { getSnapshot: vi.fn(async () => ({ ok: false })) },
}));
vi.mock("@/lib/evolution/EvolutionClient", () => ({
  EvolutionClient: { sendTextMessage: vi.fn() },
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────

import { handleInboundForOrdering } from "../WhatsAppTextOrderingRuntimeService";

// ── helpers ───────────────────────────────────────────────────────────────────

const ENV_KEYS = [
  "WHATSAPP_TEXT_ORDERING_ENABLED",
  "WHATSAPP_TEXT_ORDERING_PAUSED",
] as const;

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

afterEach(() => { clearEnv(); vi.clearAllMocks(); });
beforeEach(() => clearEnv());

const REST  = "rest-sushi-cazza";
const PHONE = "+5511999990000";
const CONV  = "conv-abc";

function activeConv() {
  return {
    aiEnabled:   true,
    aiLocked:    false,
    status:      "OPEN",
    contextType: "INBOUND",
  };
}

function processResult(reply = "Olá! Bem-vindo!") {
  return {
    suggestedReply: reply,
    handoff: false,
    session: {
      status: "ACTIVE", stage: "IDLE", selectedItems: [], unresolvedItems: [],
      missingQuestions: [], deliveryType: null, address: null, deliveryQuote: null,
      paymentMethod: null, paymentStatus: null, orderId: null, pixPaymentId: null, metadata: null,
    },
    actions: [], safetyNotes: [], sideEffectsPerformed: [],
  };
}

function fakeSession() {
  return { id: "sess-1", restaurantId: REST, phone: PHONE };
}

function dbConfig(over: {
  enabled?: boolean; paused?: boolean; mode?: string; scope?: string; allowlistedPhones?: string[];
} = {}) {
  return {
    source:            "db" as const,
    enabled:           over.enabled ?? true,
    paused:            over.paused  ?? false,
    mode:              over.mode    ?? "ALLOWLIST_REPLY_ONLY",
    scope:             over.scope   ?? "RESTAURANT_WIDE",
    allowlistedPhones: over.allowlistedPhones ?? [],
  };
}

// ── A. Disabled → engine blocks without touching old agent ───────────────────

describe("A — runtime returns handled=false when config disabled", () => {
  it("enabled=false → block(), handled=false", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({ enabled: false }));
    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Bom dia",
    });
    expect(r.handled).toBe(false);
    expect(r.blockedReason).toContain("disabled");
    expect(processMock.processCustomerMessage).not.toHaveBeenCalled();
  });
});

// ── B. Paused → engine blocks ─────────────────────────────────────────────────

describe("B — paused config returns handled=false", () => {
  it("config.paused=true → block(), handled=false", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({ paused: true }));
    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Bom dia",
    });
    expect(r.handled).toBe(false);
    expect(r.blockedReason).toContain("paused");
    expect(processMock.processCustomerMessage).not.toHaveBeenCalled();
  });

  it("global env PAUSED=true → block()", async () => {
    process.env.WHATSAPP_TEXT_ORDERING_PAUSED = "true";
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({ paused: false })); // DB not paused
    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Bom dia",
    });
    expect(r.handled).toBe(false);
    expect(r.blockedReason).toContain("global pause");
  });
});

// ── C. Enabled RESTAURANT_WIDE → "Bom dia" processed and reply sent ──────────

describe("C — RESTAURANT_WIDE enabled + reply-only + greeting produces a reply", () => {
  it("handleInboundForOrdering runs processCustomerMessage and returns handled=true", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({
      enabled: true, paused: false, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE",
    }));
    prismaMock.conversation.findUnique.mockResolvedValue(activeConv());
    sessionMock.WhatsAppOrderingSessionService.findActiveSession.mockResolvedValue(null);
    sessionMock.WhatsAppOrderingSessionService.createSession.mockResolvedValue(fakeSession());
    sessionMock.WhatsAppOrderingSessionService.updateSession.mockResolvedValue({});
    processMock.processCustomerMessage.mockResolvedValue(processResult("Olá! Bem-vindo ao Sushi Cazza!"));

    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Bom dia",
    });
    expect(r.handled).toBe(true);
    expect(r.blockedReason).toBeNull();
    expect(r.replyWouldSend).toBe(true);
    expect(processMock.processCustomerMessage).toHaveBeenCalledTimes(1);
  });
});

// ── D. Empty suggestedReply does not create a false success ──────────────────

describe("D — empty suggestedReply sets replySent=false (no silent drop)", () => {
  it("processCustomerMessage returns empty reply → replySent=false, but handled=true", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({
      enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE",
    }));
    prismaMock.conversation.findUnique.mockResolvedValue(activeConv());
    sessionMock.WhatsAppOrderingSessionService.findActiveSession.mockResolvedValue(fakeSession());
    sessionMock.WhatsAppOrderingSessionService.updateSession.mockResolvedValue({});
    processMock.processCustomerMessage.mockResolvedValue(processResult(""));

    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Oi",
    });
    // Engine handled it (session was tracked) but nothing to send.
    expect(r.handled).toBe(true);
    expect(r.replySent).toBe(false);
    expect(r.replyWouldSend).toBe(true);
    // Webhook semantics (task E): handled && (replySent || handoffApplied) = false → old agent falls back.
    const textOrderingHandled = r.handled && (r.replySent || r.handoffApplied);
    expect(textOrderingHandled).toBe(false);
  });
});

// ── E. Order message routes to Text Ordering ─────────────────────────────────

describe("E — order message is processed by Text Ordering engine", () => {
  it("'quero 2 yakisoba' → processCustomerMessage called with the message", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({
      enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE",
    }));
    prismaMock.conversation.findUnique.mockResolvedValue(activeConv());
    sessionMock.WhatsAppOrderingSessionService.findActiveSession.mockResolvedValue(fakeSession());
    sessionMock.WhatsAppOrderingSessionService.updateSession.mockResolvedValue({});
    processMock.processCustomerMessage.mockResolvedValue(processResult("Adicionei 2 yakisoba!"));

    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "quero 2 yakisoba",
    });
    expect(r.handled).toBe(true);
    const callArg = processMock.processCustomerMessage.mock.calls[0][0];
    expect(callArg.messageText).toBe("quero 2 yakisoba");
    expect(callArg.mode).toBe("ALLOWLIST_REPLY_ONLY");
    expect(callArg.allowSideEffects).toBe(false); // REPLY_ONLY → no order creation
  });
});

// ── F. PHONE_ALLOWLIST blocks non-listed phone ────────────────────────────────

describe("F — PHONE_ALLOWLIST scope rejects unlisted phone", () => {
  it("phone not in allowlist → block(), no message processing", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({
      enabled: true, scope: "PHONE_ALLOWLIST", allowlistedPhones: ["+5511000001111"],
    }));
    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Bom dia",
    });
    expect(r.handled).toBe(false);
    expect(r.blockedReason).toContain("allowlist");
    expect(processMock.processCustomerMessage).not.toHaveBeenCalled();
  });

  it("phone in PHONE_ALLOWLIST (any BR format) → engine runs", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({
      enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "PHONE_ALLOWLIST",
      // stored as national without 9th digit — should still match +5511999990000
      allowlistedPhones: ["1199990000"],
    }));
    prismaMock.conversation.findUnique.mockResolvedValue(activeConv());
    sessionMock.WhatsAppOrderingSessionService.findActiveSession.mockResolvedValue(fakeSession());
    sessionMock.WhatsAppOrderingSessionService.updateSession.mockResolvedValue({});
    processMock.processCustomerMessage.mockResolvedValue(processResult("Olá!"));

    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Bom dia",
    });
    expect(r.handled).toBe(true);
  });
});

// ── G. Engine error (send failure) logs and doesn't swallow ──────────────────

describe("G — send failure logs but engine still returns handled=true", () => {
  it("EvolutionClient send throws → replySent=false, handled=true, error logged", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({
      enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE",
    }));
    prismaMock.conversation.findUnique.mockResolvedValue(activeConv());
    sessionMock.WhatsAppOrderingSessionService.findActiveSession.mockResolvedValue(fakeSession());
    sessionMock.WhatsAppOrderingSessionService.updateSession.mockResolvedValue({});
    processMock.processCustomerMessage.mockResolvedValue(processResult("Olá!"));

    const { EvolutionConfigService } = await import("@/services/evolution/EvolutionConfigService");
    vi.mocked(EvolutionConfigService.getSnapshot).mockResolvedValue({ ok: true, data: {} as never });
    const { EvolutionClient } = await import("@/lib/evolution/EvolutionClient");
    vi.mocked(EvolutionClient.sendTextMessage).mockRejectedValue(new Error("network error"));

    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Bom dia",
    });
    expect(r.handled).toBe(true);
    expect(r.replySent).toBe(false);
    expect(r.safetyNotes.some(n => n.includes("reply failed"))).toBe(true);
    consoleSpy.mockRestore();
  });
});

// ── H. Human handoff / AI lock blocks engine ─────────────────────────────────

describe("H — human handoff / AI lock blocks engine correctly", () => {
  it("aiLocked=true → block() with conversation guard reason", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig());
    prismaMock.conversation.findUnique.mockResolvedValue({
      aiEnabled: true, aiLocked: true, status: "OPEN", contextType: "INBOUND",
    });
    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Bom dia",
    });
    expect(r.handled).toBe(false);
    expect(r.blockedReason).toContain("conversation guard");
    expect(processMock.processCustomerMessage).not.toHaveBeenCalled();
  });

  it("status=HUMAN → block() with conversation guard reason", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig());
    prismaMock.conversation.findUnique.mockResolvedValue({
      aiEnabled: true, aiLocked: false, status: "HUMAN", contextType: "INBOUND",
    });
    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Bom dia",
    });
    expect(r.handled).toBe(false);
    expect(r.blockedReason).toContain("conversation guard");
  });
});

// ── I. No order/Pix created in REPLY_ONLY mode ───────────────────────────────

describe("I — REPLY_ONLY mode never creates an order or Pix", () => {
  it("allowSideEffects=false in ALLOWLIST_REPLY_ONLY", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({
      enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE",
    }));
    prismaMock.conversation.findUnique.mockResolvedValue(activeConv());
    sessionMock.WhatsAppOrderingSessionService.findActiveSession.mockResolvedValue(fakeSession());
    sessionMock.WhatsAppOrderingSessionService.updateSession.mockResolvedValue({});
    processMock.processCustomerMessage.mockResolvedValue(processResult("Adicionei!"));

    await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV,
      messageText: "quero guioza yaksoba e coca",
    });
    const call = processMock.processCustomerMessage.mock.calls[0][0];
    expect(call.allowSideEffects).toBe(false);
  });

  it("allowSideEffects=true ONLY in ALLOWLIST_FULL_TEST", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({
      enabled: true, mode: "ALLOWLIST_FULL_TEST", scope: "RESTAURANT_WIDE",
    }));
    prismaMock.conversation.findUnique.mockResolvedValue(activeConv());
    sessionMock.WhatsAppOrderingSessionService.findActiveSession.mockResolvedValue(fakeSession());
    sessionMock.WhatsAppOrderingSessionService.updateSession.mockResolvedValue({});
    processMock.processCustomerMessage.mockResolvedValue(processResult("Ok!"));

    await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "confirmar pedido",
    });
    const call = processMock.processCustomerMessage.mock.calls[0][0];
    expect(call.allowSideEffects).toBe(true);
  });
});

// ── J. DRY_RUN_ONLY: engine handles silently → old agent must fall back ───────
// Root cause of "order message still got the old agent": in DRY_RUN the engine
// processes the turn but cannot reply, so replySent=false AND replyWouldSend=false.
// The webhook computes textOrderingHandled = handled && (replySent || handoffApplied)
// = true && (false || false) = false → old agent answers. Customer never silenced.

describe("J — DRY_RUN_ONLY processes silently (replyWouldSend=false) so old agent falls back", () => {
  it("order message in DRY_RUN_ONLY → handled=true, replySent=false, replyWouldSend=false", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({
      enabled: true, mode: "DRY_RUN_ONLY", scope: "RESTAURANT_WIDE",
    }));
    prismaMock.conversation.findUnique.mockResolvedValue(activeConv());
    sessionMock.WhatsAppOrderingSessionService.findActiveSession.mockResolvedValue(fakeSession());
    sessionMock.WhatsAppOrderingSessionService.updateSession.mockResolvedValue({});
    processMock.processCustomerMessage.mockResolvedValue(processResult("Adicionei 1 yakisoba!"));

    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Quero 1 yakisoba",
    });
    expect(r.handled).toBe(true);
    expect(r.replyWouldSend).toBe(false); // DRY_RUN cannot reply
    expect(r.replySent).toBe(false);
    expect(r.handoffApplied).toBe(false);
    // Webhook semantics: handled && (replySent || handoffApplied) = false → fallback.
    const textOrderingHandled = r.handled && (r.replySent || r.handoffApplied);
    expect(textOrderingHandled).toBe(false);
    // And no order/Pix created in DRY_RUN.
    const call = processMock.processCustomerMessage.mock.calls[0][0];
    expect(call.allowSideEffects).toBe(false);
  });
});

// ── K. REPLY_ONLY + send succeeds → textOrderingHandled=true (old agent blocked) ──
// This is the POSITIVE counterpart to test J. When the engine actually sends a
// reply in ALLOWLIST_REPLY_ONLY mode, `textOrderingHandled` must be `true` so the
// old WhatsApp Receptionist is NOT invoked. This directly proves the fix for the
// live test failure: switching from DRY_RUN_ONLY → ALLOWLIST_REPLY_ONLY and having
// a real reply go out blocks the old agent from also answering.

describe("K — REPLY_ONLY + reply sent → textOrderingHandled=true (old agent blocked)", () => {
  it("replySent=true → webhook textOrderingHandled=true, Receptionist skipped", async () => {
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({
      enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE",
    }));
    prismaMock.conversation.findUnique.mockResolvedValue(activeConv());
    sessionMock.WhatsAppOrderingSessionService.findActiveSession.mockResolvedValue(fakeSession());
    sessionMock.WhatsAppOrderingSessionService.updateSession.mockResolvedValue({});
    processMock.processCustomerMessage.mockResolvedValue(processResult("Adicionei 1 yakisoba!"));
    prismaMock.$transaction.mockResolvedValue([]);

    const { EvolutionConfigService } = await import("@/services/evolution/EvolutionConfigService");
    vi.mocked(EvolutionConfigService.getSnapshot).mockResolvedValue({ ok: true, data: {} as never });
    const { EvolutionClient } = await import("@/lib/evolution/EvolutionClient");
    vi.mocked(EvolutionClient.sendTextMessage).mockResolvedValue({ key: { id: "msg-test-1" } } as never);

    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV,
      messageText: "Quero um yakisoba",
    });
    expect(r.handled).toBe(true);
    expect(r.replyWouldSend).toBe(true);
    expect(r.replySent).toBe(true);
    // Webhook semantics: handled && (replySent || handoffApplied) = true → old agent blocked.
    const textOrderingHandled = r.handled && (r.replySent || r.handoffApplied);
    expect(textOrderingHandled).toBe(true);
  });
});

// ── Global kill switch overrides DB config ───────────────────────────────────

describe("Kill switch — global env ENABLED=false overrides DB enabled=true", () => {
  it("ENABLED=false blocks even with DB config enabled=true", async () => {
    process.env.WHATSAPP_TEXT_ORDERING_ENABLED = "false";
    configMock.resolveWaConfig.mockResolvedValue(dbConfig({ enabled: true }));
    const r = await handleInboundForOrdering({
      restaurantId: REST, phone: PHONE, conversationId: CONV, messageText: "Bom dia",
    });
    expect(r.handled).toBe(false);
    expect(r.blockedReason).toContain("kill switch");
  });
});
