/**
 * Alarm system contract — raio-x 2 (2026-07-14).
 *
 * Locks the fixes for "apita em página aleatória / pedido e chat mudos":
 *   1. The floating "Silenciar alarme" balloon is GONE (owner's explicit order) —
 *      GlobalAlertEngine renders nothing, ever.
 *   2. Replying IS acknowledging: every human-outbound writer also sets
 *      handoffAlarmAckAt, so answering a customer (painel, WhatsApp do celular,
 *      Instagram) silences the handoff alarm durably. This was the #1 source of
 *      the chronic beep — phone-answered conversations kept ringing for hours.
 *   3. Sound is bounded: the engine rings handoffs inside the SOUND window
 *      (10 min), not the VISUAL window (2h), and overdue re-beeps only while the
 *      wait is recent.
 *
 * Source-level guards (same pattern as WaiterBrainV2.release-candidate): they
 * fail loudly if a future edit reintroduces the balloon, drops an auto-ack, or
 * points the sound back at the 2h window.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("alarm contract — no floating silence balloon", () => {
  const engine = read("src/components/layout/GlobalAlertEngine.tsx");

  it("GlobalAlertEngine renders nothing (no button, no 'Silenciar alarme' UI)", () => {
    expect(engine).not.toContain("Silenciar alarme");
    expect(engine).not.toContain("<button");
    expect(engine).toMatch(/return null;\s*\}\s*$/);
  });
});

describe("alarm contract — replying IS acknowledging (auto-ack on human outbound)", () => {
  it("MessageService sets handoffAlarmAckAt on BOTH outbound paths (internal/cardápio + WhatsApp)", () => {
    const src = read("src/services/conversation/MessageService.ts");
    const count = (src.match(/handoffAlarmAckAt:\s*now/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("external outbound (staff answering from their own phone) also auto-acks", () => {
    const src = read("src/services/evolution/WebhookProcessorService.ts");
    expect(src).toMatch(/lastMessageAt:\s*now,\s*handoffAlarmAckAt:\s*now/);
  });

  it("operator chat route auto-acks", () => {
    const src = read("src/app/api/chat/conversations/[id]/messages/route.ts");
    expect(src).toMatch(/handoffAlarmAckAt:\s*now/);
  });

  it("Instagram human replies auto-ack (DM + comment reply)", () => {
    const src = read("src/services/instagram/InstagramChannelService.ts");
    const count = (src.match(/handoffAlarmAckAt:\s*now/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe("alarm contract — sound is bounded (sound window ≠ visual window)", () => {
  const engine = read("src/components/layout/GlobalAlertEngine.tsx");

  it("the app-wide engine rings handoffs with the SOUND window, not the 2h visual one", () => {
    expect(engine).toContain("HANDOFF_SOUND_MAX_AGE_MS");
    expect(engine).toContain("OVERDUE_SOUND_MAX_WAIT_MINUTES");
    expect(engine).not.toContain("HANDOFF_ALARM_MAX_AGE_MS");
  });

  it("Atendimento rings with the SOUND window while keeping the 2h VISUAL banner", () => {
    const src = read("src/app/(dashboard)/atendimento/AtendimentoClient.tsx");
    expect(src).toContain("HANDOFF_SOUND_MAX_AGE_MS");  // sound
    expect(src).toContain("HANDOFF_ALARM_MAX_AGE_MS");  // visual banner stays generous
    expect(src).toContain("OVERDUE_SOUND_MAX_WAIT_MINUTES");
  });

  it("the engine remembers handled orders so accepting one never re-rings it", () => {
    expect(engine).toContain("resolvedOrderIds");
  });

  it("each alarm rings on any FOREGROUND tab, gated only by visibility (owner's request, 2026-07-23)", () => {
    // The rule that ends the cross-screen bleed WITHOUT muting off-screen tabs:
    // sound = this tab is in the foreground. Which screen you are on no longer
    // gates (the 2026-07-14 per-screen over-correction is gone — it forced the
    // owner to keep Pedidos open to hear anything). Both alarms use the visibility
    // gate, and neither is pinned to a specific route anymore.
    expect(engine).toContain("isVisibleRef");
    expect(engine).toContain("canRingOrder");
    expect(engine).toContain("canRingHandoff");
    expect(engine).not.toContain("isOrdersScreenRef");
    expect(engine).not.toContain("isAtendimentoScreenRef");
  });

  it("the old app-wide leader machinery that bled sound across screens is gone", () => {
    // Web Locks / cross-tab BroadcastChannel / device lease made one sound play
    // on several unrelated screens — all removed.
    expect(engine).not.toContain("navigator.locks");
    expect(engine).not.toContain("BroadcastChannel");
    expect(engine).not.toContain("claim-leader");
  });
});
