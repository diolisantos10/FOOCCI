/**
 * WhatsAppOrderingPixReuse — proves the WhatsApp text-ordering channel reuses the
 * EXACT same Mercado Pago integration as the /pedido visual checkout, with no
 * parallel payment config, no WhatsApp-specific MP env var, and no premature
 * order confirmation.
 *
 * Deliverable guarantees verified here:
 *   - Pix from WhatsApp starts the order as AWAITING_PAYMENT (hidden until paid).
 *   - The Payment record is created as LINK_SENT (webhook-driven), never CONFIRMED.
 *   - WhatsApp reuses createPixPayment() from src/lib/mercadopago.ts.
 *   - WhatsApp reuses the same integrationConfig (provider="mercadopago") row used
 *     by /pedido finalize — no separate WhatsApp MP credentials.
 *   - WhatsApp reuses the same /api/payments/mercadopago/webhook confirmation route.
 *   - No new Mercado Pago env vars are introduced for WhatsApp.
 */

import { describe, it, expect } from "vitest";
import { createOrderFromSession } from "../WhatsAppOrderCreationService";
import { generatePix } from "../WhatsAppPaymentService";
import type { WaPersistedSession } from "../types";

function pixSession(overrides: Partial<WaPersistedSession> = {}): WaPersistedSession {
  const now = new Date();
  return {
    id:               "sess-pix-1",
    restaurantId:     "rest-1",
    customerId:       null,
    conversationId:   "conv-1",
    phone:            "+5511999990000",
    status:           "AWAITING_CUSTOMER",
    stage:            "CONFIRMING_ORDER",
    selectedItems:    [],
    unresolvedItems:  [],
    missingQuestions: [],
    deliveryType:     "PICKUP",
    address:          null,
    deliveryQuote:    null,
    paymentMethod:    "PIX",
    paymentStatus:    null,
    orderDraftId:     null,
    orderId:          null,
    pixPaymentId:     null,
    mode:             "ALLOWLIST_FULL_TEST",
    source:           "webhook",
    metadata:         null,
    lastMessageAt:    now,
    expiresAt:        null,
    createdAt:        now,
    updatedAt:        now,
    ...overrides,
  };
}

// ── A. Order starts AWAITING_PAYMENT for Pix ───────────────────────────────────

describe("PixReuse A — Pix order starts AWAITING_PAYMENT", () => {
  it("dry-run (allowCreate=false) reports a Pix order WOULD be AWAITING_PAYMENT", async () => {
    const res = await createOrderFromSession({
      session:      pixSession(),
      customerName: "Cliente Teste",
      subtotal:     50,
      deliveryFee:  0,
      total:        50,
      allowCreate:  false,
    });
    expect(res.isPix).toBe(true);
    expect(res.created).toBe(false);
    expect(res.wouldCreate).toBe(true);
    expect(res.status).toBe("AWAITING_PAYMENT");
  });

  it("idempotent — existing orderId never re-creates, stays AWAITING_PAYMENT", async () => {
    const res = await createOrderFromSession({
      session:      pixSession({ orderId: "order-existing" }),
      customerName: "Cliente Teste",
      subtotal:     50,
      deliveryFee:  0,
      total:        50,
      allowCreate:  true,
    });
    expect(res.created).toBe(false);
    expect(res.orderId).toBe("order-existing");
    expect(res.status).toBe("AWAITING_PAYMENT");
    expect(res.reason).toContain("idempotent");
  });
});

// ── B. Pix generation waits for webhook (never auto-confirms) ───────────────────

describe("PixReuse B — Pix never confirmed before webhook", () => {
  it("dry-run Pix returns a clearly-marked stub and makes no MP call", async () => {
    const pix = await generatePix({
      restaurantId: "rest-1",
      orderId:      "order-1",
      amount:       50,
      allowReal:    false,
    });
    expect(pix.isDryRunStub).toBe(true);
    expect(pix.status).toBe("AWAITING_PIX");
    expect(pix.pixCopyPaste).toContain("DRY_RUN_PIX_");
    // Pending wording is awaiting payment — never "PAID".
    expect(pix.status).not.toBe("PAID");
  });
});

// ── C. Reuses the canonical Mercado Pago integration (no duplication) ───────────

describe("PixReuse C — reuses canonical MP service/config", () => {
  async function paymentSrc(): Promise<string> {
    const fs = await import("node:fs/promises");
    return fs.readFile(new URL("../WhatsAppPaymentService.ts", import.meta.url), "utf-8");
  }

  it("imports the shared createPixPayment from @/lib/mercadopago", async () => {
    const src = await paymentSrc();
    expect(src).toContain('await import("@/lib/mercadopago")');
    expect(src).toContain("createPixPayment(");
    // MP must not be statically imported — only dynamically inside the real branch.
    expect(src).not.toMatch(/^import .*@\/lib\/mercadopago/m);
  });

  it("loads the SAME integrationConfig row used by /pedido (provider=mercadopago)", async () => {
    const src = await paymentSrc();
    expect(src).toContain("integrationConfig");
    expect(src).toContain('provider: "mercadopago"');
  });

  it("persists the Payment as webhook-driven (LINK_SENT, mercadopago) — never CONFIRMED", async () => {
    const src = await paymentSrc();
    expect(src).toContain('status:            "LINK_SENT"');
    expect(src).toContain('providerName:      "mercadopago"');
    // The payment service must NOT flip the order to a confirmed/preparing state.
    expect(src).not.toContain('status: "CONFIRMED"');
    expect(src).not.toContain('status: "PREPARING"');
  });

  it("uses the SAME Mercado Pago webhook route as /pedido", async () => {
    const src = await paymentSrc();
    expect(src).toContain("/api/payments/mercadopago/webhook");
  });

  it("introduces NO WhatsApp-specific Mercado Pago env var", async () => {
    const src = await paymentSrc();
    // No process.env reads for any MP/Pix credential — config comes from the DB.
    expect(src).not.toMatch(/process\.env\.[A-Z_]*MERCADO/);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*\bMP_/);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*PIX/);
  });
});

// ── D. Order creation reuses the existing Order/Payment state machine ───────────

describe("PixReuse D — order creation reuses existing state machine", () => {
  it("WhatsAppOrderCreationService maps Pix → AWAITING_PAYMENT, others → PENDING", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppOrderCreationService.ts", import.meta.url),
      "utf-8",
    );
    expect(src).toContain('isPix ? "AWAITING_PAYMENT" : "PENDING"');
    // Non-Pix path confirms; Pix path is left for the webhook.
    expect(src).toContain('data:  { status: "CONFIRMED" }');
  });
});
