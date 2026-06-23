/**
 * startOrderFromMenu — the menu → Text Ordering bridge.
 *
 *   - opens a session + returns the prompt only when the engine is live AND
 *     reply-capable (ALLOWLIST_REPLY_ONLY / ALLOWLIST_FULL_TEST);
 *   - returns null (no session, no side effects) when not eligible, when the mode
 *     is dry-run, or when there is no phone;
 *   - never double-creates when a session is already active.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const cfg = vi.hoisted(() => ({
  getRoutingDecisionForRestaurant: vi.fn(),
  isReplyCapableMode: vi.fn(),
}));
vi.mock("../WhatsAppTextOrderingConfigService", () => cfg);

const sessions = vi.hoisted(() => ({
  WhatsAppOrderingSessionService: { findActiveSession: vi.fn(), createSession: vi.fn() },
}));
vi.mock("../WhatsAppOrderingSessionService", () => sessions);

import { startOrderFromMenu, ORDER_FROM_MENU_PROMPT } from "../startOrderFromMenu";

const INPUT = { restaurantId: "r1", phone: "5511999990000", conversationId: "c1", customerId: "cust1" };

beforeEach(() => {
  vi.clearAllMocks();
  cfg.getRoutingDecisionForRestaurant.mockResolvedValue({ shouldUseTextOrdering: true, mode: "ALLOWLIST_REPLY_ONLY" });
  cfg.isReplyCapableMode.mockReturnValue(true);
  sessions.WhatsAppOrderingSessionService.findActiveSession.mockResolvedValue(null);
  sessions.WhatsAppOrderingSessionService.createSession.mockResolvedValue({ id: "s1" });
});

describe("startOrderFromMenu", () => {
  it("opens a session and returns the prompt when live + reply-capable", async () => {
    const out = await startOrderFromMenu(INPUT);
    expect(out).toBe(ORDER_FROM_MENU_PROMPT);
    expect(sessions.WhatsAppOrderingSessionService.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: "r1", phone: "5511999990000",
        mode: "ALLOWLIST_REPLY_ONLY", source: "menu_digitar_pedido",
      }),
    );
  });

  it("returns null (no session) when the restaurant is not routing-eligible", async () => {
    cfg.getRoutingDecisionForRestaurant.mockResolvedValue({ shouldUseTextOrdering: false, mode: "DRY_RUN_ONLY" });
    const out = await startOrderFromMenu(INPUT);
    expect(out).toBeNull();
    expect(sessions.WhatsAppOrderingSessionService.createSession).not.toHaveBeenCalled();
  });

  it("returns null when eligible but the mode is dry-run (not reply-capable)", async () => {
    cfg.getRoutingDecisionForRestaurant.mockResolvedValue({ shouldUseTextOrdering: true, mode: "DRY_RUN_ONLY" });
    cfg.isReplyCapableMode.mockReturnValue(false);
    const out = await startOrderFromMenu(INPUT);
    expect(out).toBeNull();
    expect(sessions.WhatsAppOrderingSessionService.createSession).not.toHaveBeenCalled();
  });

  it("reuses an active session instead of creating a second one", async () => {
    sessions.WhatsAppOrderingSessionService.findActiveSession.mockResolvedValue({ id: "existing" });
    const out = await startOrderFromMenu(INPUT);
    expect(out).toBe(ORDER_FROM_MENU_PROMPT);
    expect(sessions.WhatsAppOrderingSessionService.createSession).not.toHaveBeenCalled();
  });

  it("returns null when there is no phone", async () => {
    const out = await startOrderFromMenu({ ...INPUT, phone: "" });
    expect(out).toBeNull();
    expect(cfg.getRoutingDecisionForRestaurant).not.toHaveBeenCalled();
  });
});
