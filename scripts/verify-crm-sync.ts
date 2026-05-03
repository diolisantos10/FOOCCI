/**
 * scripts/verify-crm-sync.ts
 *
 * Unit-style verification of the CRM sync logic (isCrmCountable + sync semantics).
 * Runs entirely in-process with no live DB required — just imports and asserts.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/verify-crm-sync.ts
 */

import { isCrmCountable } from "../src/services/crm/crm-countable";
import { toE164 } from "../src/lib/phone";

// ── Test harness ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(description: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅  ${description}`);
    passed++;
  } else {
    console.error(`  ❌  ${description}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── A. isCrmCountable — pay_on_delivery ───────────────────────────────────────

console.log("\n── A. pay_on_delivery orders ──");

expect(
  "CONFIRMED + PAY_ON_DELIVERY = countable",
  isCrmCountable({ status: "CONFIRMED", payment: { paymentMode: "PAY_ON_DELIVERY", status: "PAY_ON_DELIVERY" } }),
  true
);

expect(
  "DELIVERED + PAY_ON_DELIVERY = countable",
  isCrmCountable({ status: "DELIVERED", payment: { paymentMode: "PAY_ON_DELIVERY", status: "PAY_ON_DELIVERY" } }),
  true
);

expect(
  "CANCELLED + PAY_ON_DELIVERY = NOT countable",
  isCrmCountable({ status: "CANCELLED", payment: { paymentMode: "PAY_ON_DELIVERY", status: "PAY_ON_DELIVERY" } }),
  false
);

expect(
  "PENDING + PAY_ON_DELIVERY = NOT countable",
  isCrmCountable({ status: "PENDING", payment: { paymentMode: "PAY_ON_DELIVERY", status: "PAY_ON_DELIVERY" } }),
  false
);

// ── B. isCrmCountable — pay_now (online) ──────────────────────────────────────

console.log("\n── B. pay_now (online payment) orders ──");

expect(
  "AWAITING_PAYMENT + PAY_NOW + LINK_SENT = NOT countable",
  isCrmCountable({ status: "AWAITING_PAYMENT", payment: { paymentMode: "PAY_NOW", status: "LINK_SENT" } }),
  false
);

expect(
  "CONFIRMED + PAY_NOW + LINK_SENT = NOT countable (payment not yet received)",
  isCrmCountable({ status: "CONFIRMED", payment: { paymentMode: "PAY_NOW", status: "LINK_SENT" } }),
  false
);

expect(
  "CONFIRMED + PAY_NOW + PAID = countable",
  isCrmCountable({ status: "CONFIRMED", payment: { paymentMode: "PAY_NOW", status: "PAID" } }),
  true
);

expect(
  "DELIVERED + PAY_NOW + PAID = countable",
  isCrmCountable({ status: "DELIVERED", payment: { paymentMode: "PAY_NOW", status: "PAID" } }),
  true
);

expect(
  "CANCELLED + PAY_NOW + PAID = NOT countable (cancelled wins)",
  isCrmCountable({ status: "CANCELLED", payment: { paymentMode: "PAY_NOW", status: "PAID" } }),
  false
);

expect(
  "CONFIRMED + PAY_NOW + EXPIRED = NOT countable",
  isCrmCountable({ status: "CONFIRMED", payment: { paymentMode: "PAY_NOW", status: "EXPIRED" } }),
  false
);

// ── C. isCrmCountable — no payment record (draft-confirm path) ────────────────

console.log("\n── C. orders without payment record (draft-confirmed) ──");

expect(
  "CONFIRMED + no payment = countable",
  isCrmCountable({ status: "CONFIRMED", payment: null }),
  true
);

expect(
  "PENDING + no payment = NOT countable",
  isCrmCountable({ status: "PENDING", payment: null }),
  false
);

expect(
  "CANCELLED + no payment = NOT countable",
  isCrmCountable({ status: "CANCELLED", payment: null }),
  false
);

// ── D. isCrmCountable — pay_on_pickup ─────────────────────────────────────────

console.log("\n── D. pay_on_pickup orders ──");

expect(
  "CONFIRMED + PAY_ON_PICKUP = countable",
  isCrmCountable({ status: "CONFIRMED", payment: { paymentMode: "PAY_ON_PICKUP", status: "PAY_ON_PICKUP" } }),
  true
);

expect(
  "CANCELLED + PAY_ON_PICKUP = NOT countable",
  isCrmCountable({ status: "CANCELLED", payment: { paymentMode: "PAY_ON_PICKUP", status: "PAY_ON_PICKUP" } }),
  false
);

// ── E. Phone normalization ────────────────────────────────────────────────────

console.log("\n── E. Phone normalization (toE164) ──");

expect(
  '"11999990000" (11 digits) → E.164',
  toE164("11999990000"),
  "+5511999990000"
);

expect(
  '"(11) 99999-0000" (formatted) → E.164',
  toE164("(11) 99999-0000"),
  "+5511999990000"
);

expect(
  '"+5511999990000" (already E.164) → unchanged',
  toE164("+5511999990000"),
  "+5511999990000"
);

expect(
  '"5511999990000" (with country code, no +) → E.164',
  toE164("5511999990000"),
  "+5511999990000"
);

expect(
  '"11 9999-0000" (10 digits, old landline format) → DDD + 9 + local = E.164',
  toE164("11 9999-0000"),
  "+5511999990000"
);

// ── F. Idempotency semantic (description only) ────────────────────────────────

console.log("\n── F. Idempotency semantics (design verification) ──");

// These are design-level checks, not executable assertions.
// The actual DB-level idempotency is enforced by the crmSyncedAt check
// inside a transaction in CustomerMetricsSyncService.syncOrderToCustomerMetrics.

console.log("  ℹ️  crmSyncedAt idempotency: if Order.crmSyncedAt is set,");
console.log("      syncOrderToCustomerMetrics returns 'skipped_already_synced'");
console.log("      and does NOT increment any counters.");
console.log("  ℹ️  MP webhook idempotency: if payment.status === 'PAID',");
console.log("      returns early before calling sync service.");
console.log("  ℹ️  Stone webhook idempotency: same early-return guard.");
console.log("  ℹ️  Both guards together = two independent layers of protection.");

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("══════════════════════════════════════════════════\n");

if (failed > 0) {
  process.exit(1);
}
