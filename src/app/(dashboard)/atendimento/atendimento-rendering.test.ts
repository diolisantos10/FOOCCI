/**
 * Atendimento rendering rules — classification tests (A–F).
 *
 * Pure: no DOM, no React, no DB. These tests verify the isInternalCommandContent
 * helper and the rendering-decision logic that drives MessageBubble and
 * conversation-list preview in AtendimentoClient.
 *
 *   A — historical CUSTOMER /build row → classified as internal command, not a bubble
 *   B — historical /build row → excluded from conversation-list preview
 *   C — fromMe HUMAN_EXTERNAL /build → classified as internal, hidden/not outbound bubble
 *   D — normal customer message → not an internal command
 *   E — operator reply → not an internal command
 *   F — SYSTEM handoff event → not filtered by isInternalCommandContent (has its own path)
 */

import { describe, it, expect } from "vitest";

// ── Mirror the inline helper from AtendimentoClient (cannot import the client
//    component directly in unit tests; keep the logic in sync). ─────────────────

const INTERNAL_CMD_PREFIXES = ["/build", "/cmd", "/prompt"] as const;

function isInternalCommandContent(content: string): boolean {
  if (!content) return false;
  const lower = content.trimStart().toLowerCase();
  return INTERNAL_CMD_PREFIXES.some((p) => {
    if (!lower.startsWith(p)) return false;
    const next = lower.charAt(p.length);
    return next === "" || /[^a-z0-9]/.test(next);
  });
}

/** Simulates the preview-selection logic from the conversation-list render. */
function pickPreviewMessage(
  messages: { content: string; senderType: string | null }[],
): { content: string; senderType: string | null } | undefined {
  return messages.find(
    (m) => m.senderType !== "SYSTEM" && !isInternalCommandContent(m.content ?? ""),
  );
}

/**
 * Simulates the MessageBubble branch decision:
 * "SYSTEM" → system note (not a bubble)
 * isInternalCommandContent → internal separator (not a bubble)
 * else → normal bubble
 */
type RenderPath = "system_note" | "internal_separator" | "bubble";

function resolveRenderPath(msg: {
  senderType: string | null;
  content: string;
  direction: string;
}): RenderPath {
  if (msg.senderType === "SYSTEM") return "system_note";
  if (isInternalCommandContent(msg.content)) return "internal_separator";
  return "bubble";
}

// ── A ────────────────────────────────────────────────────────────────────────
describe("A — historical CUSTOMER /build row renders as internal separator", () => {
  const historicalMsg = {
    senderType: "CUSTOMER",
    direction: "INBOUND",
    content: "/build antigo checkout v2",
  };

  it("is detected as an internal command", () => {
    expect(isInternalCommandContent(historicalMsg.content)).toBe(true);
  });

  it("resolves to internal_separator, not a customer bubble", () => {
    expect(resolveRenderPath(historicalMsg)).toBe("internal_separator");
  });

  it("is not rendered as a customer bubble", () => {
    expect(resolveRenderPath(historicalMsg)).not.toBe("bubble");
  });
});

// ── B ────────────────────────────────────────────────────────────────────────
describe("B — historical /build row is excluded from conversation-list preview", () => {
  it("a /build row alone leaves no preview message", () => {
    const messages = [
      { content: "/build raio-x deploy", senderType: "CUSTOMER" },
    ];
    expect(pickPreviewMessage(messages)).toBeUndefined();
  });

  it("a /build row is skipped; the next non-command message is used", () => {
    const messages = [
      { content: "/build raio-x deploy", senderType: "CUSTOMER" },
      { content: "Olá! Como posso ajudar?", senderType: "AI" },
    ];
    const preview = pickPreviewMessage(messages);
    expect(preview?.content).toBe("Olá! Como posso ajudar?");
  });

  it("all /build rows are skipped when no normal message exists", () => {
    const messages = [
      { content: "/build step1", senderType: "CUSTOMER" },
      { content: "/cmd x", senderType: "CUSTOMER" },
      { content: "/prompt teste", senderType: "CUSTOMER" },
    ];
    expect(pickPreviewMessage(messages)).toBeUndefined();
  });

  it("/cmd and /prompt are also excluded from preview", () => {
    const messages = [
      { content: "/cmd migrate prod", senderType: "CUSTOMER" },
      { content: "/prompt system override", senderType: "CUSTOMER" },
      { content: "Oi!", senderType: "CUSTOMER" },
    ];
    const preview = pickPreviewMessage(messages);
    expect(preview?.content).toBe("Oi!");
  });
});

// ── C ────────────────────────────────────────────────────────────────────────
describe("C — fromMe HUMAN_EXTERNAL /build renders hidden/internal", () => {
  const fromMeMsg = {
    senderType: "HUMAN_EXTERNAL",
    direction: "OUTBOUND",
    content: "/build deploy v3",
  };

  it("is detected as an internal command", () => {
    expect(isInternalCommandContent(fromMeMsg.content)).toBe(true);
  });

  it("resolves to internal_separator, not an outbound bubble", () => {
    expect(resolveRenderPath(fromMeMsg)).toBe("internal_separator");
  });

  it("is NOT rendered as a bubble regardless of direction", () => {
    expect(resolveRenderPath(fromMeMsg)).not.toBe("bubble");
  });

  it("is excluded from conversation-list preview (outbound fromMe mirror)", () => {
    const messages = [
      { content: "/build deploy v3", senderType: "HUMAN_EXTERNAL" },
      { content: "Pedido confirmado!", senderType: "AI" },
    ];
    const preview = pickPreviewMessage(messages);
    expect(preview?.content).toBe("Pedido confirmado!");
  });
});

// ── D ────────────────────────────────────────────────────────────────────────
describe("D — normal customer message is unaffected", () => {
  const customerMsg = {
    senderType: "CUSTOMER",
    direction: "INBOUND",
    content: "Quero fazer um pedido de pizza",
  };

  it("is NOT detected as an internal command", () => {
    expect(isInternalCommandContent(customerMsg.content)).toBe(false);
  });

  it("resolves to a normal bubble", () => {
    expect(resolveRenderPath(customerMsg)).toBe("bubble");
  });

  it("appears in conversation-list preview", () => {
    const messages = [{ content: customerMsg.content, senderType: "CUSTOMER" }];
    expect(pickPreviewMessage(messages)?.content).toBe(customerMsg.content);
  });

  it("message mentioning /build in the middle is not an internal command", () => {
    const msg = { senderType: "CUSTOMER", direction: "INBOUND", content: "como uso /build no app?" };
    expect(isInternalCommandContent(msg.content)).toBe(false);
    expect(resolveRenderPath(msg)).toBe("bubble");
  });
});

// ── E ────────────────────────────────────────────────────────────────────────
describe("E — operator reply is unaffected", () => {
  const operatorMsg = {
    senderType: "HUMAN",
    direction: "OUTBOUND",
    content: "Olá, posso ajudar com o seu pedido!",
  };

  it("is NOT detected as an internal command", () => {
    expect(isInternalCommandContent(operatorMsg.content)).toBe(false);
  });

  it("resolves to a normal bubble", () => {
    expect(resolveRenderPath(operatorMsg)).toBe("bubble");
  });

  it("operator message with /build anywhere not at start is still a bubble", () => {
    const msg = { senderType: "HUMAN", direction: "OUTBOUND", content: "você pode usar /build para isso" };
    expect(isInternalCommandContent(msg.content)).toBe(false);
    expect(resolveRenderPath(msg)).toBe("bubble");
  });
});

// ── F ────────────────────────────────────────────────────────────────────────
describe("F — SYSTEM handoff event is handled by its own path, not by isInternalCommandContent", () => {
  it("SYSTEM senderType takes the system_note path before the internal-command check", () => {
    const systemMsg = {
      senderType: "SYSTEM",
      direction: "OUTBOUND",
      content: "Conversa transferida para atendimento humano",
    };
    expect(resolveRenderPath(systemMsg)).toBe("system_note");
    // isInternalCommandContent is never reached for SYSTEM messages
    expect(isInternalCommandContent(systemMsg.content)).toBe(false);
  });

  it("SYSTEM message with a /build-like body still routes to system_note (SYSTEM check is first)", () => {
    const systemMsg = {
      senderType: "SYSTEM",
      direction: "OUTBOUND",
      content: "/build pipeline triggered by system",
    };
    // The SYSTEM branch fires first in resolveRenderPath
    expect(resolveRenderPath(systemMsg)).toBe("system_note");
  });

  it("SYSTEM messages are excluded from preview by the senderType guard, not the content guard", () => {
    const messages = [
      { content: "Conversa transferida", senderType: "SYSTEM" },
      { content: "Oi, vim pelo cardápio", senderType: "CUSTOMER" },
    ];
    const preview = pickPreviewMessage(messages);
    expect(preview?.content).toBe("Oi, vim pelo cardápio");
  });
});
