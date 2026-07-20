/**
 * WhatsAppPaymentService — payment method parsing + controlled Pix generation.
 *
 * CRITICAL PIX RULES (never violated):
 *   - Generating a Pix does NOT confirm the order.
 *   - Real Pix is created ONLY when allowReal=true (ALLOWLIST_FULL_TEST mode).
 *   - In dry-run, a clearly-marked STUB Pix preview is returned — no MP call.
 *   - Order confirmation is driven exclusively by the existing MP webhook.
 *
 * Reuses the canonical createPixPayment() from src/lib/mercadopago.ts, exactly
 * as the /pedido finalize route does — no parallel payment logic.
 */

import type { WaPaymentInfo } from "./types";

export type WaPaymentMethod = "PIX" | "CARD" | "CASH";

export interface ParsedPayment {
  method:    WaPaymentMethod | null;
  changeFor: number | null; // cash: "troco para R$ X"
}

const PIX_RE  = /\bpix\b/i;
const CARD_RE = /\b(cart[aã]o|cr[eé]dito|d[eé]bito|maquininha|maquina|m[aá]quina)\b/i;
const CASH_RE = /\b(dinheiro|esp[eé]cie|cash|grana)\b/i;
const CHANGE_RE = /\btroco\s*(?:pra|para|de)?\s*(?:r\$\s*)?(\d{1,4})/i;

/** Parses the payment method (and cash change) from free text. */
export function parsePaymentMethod(text: string): ParsedPayment {
  let method: WaPaymentMethod | null = null;
  if (PIX_RE.test(text))       method = "PIX";
  else if (CARD_RE.test(text)) method = "CARD";
  else if (CASH_RE.test(text)) method = "CASH";

  let changeFor: number | null = null;
  const m = text.match(CHANGE_RE);
  if (m && m[1]) changeFor = parseInt(m[1], 10);

  return { method, changeFor };
}

export interface GeneratePixInput {
  restaurantId:  string;
  orderId:       string;
  amount:        number;
  description?:  string;
  /** Only true in ALLOWLIST_FULL_TEST with all guards passed. */
  allowReal:     boolean;
}

/**
 * Generates a Pix. When allowReal is false (dry-run/reply-only), returns a
 * clearly-marked stub — NO Mercado Pago call. When allowReal is true, creates a
 * real Pix via the shared MP service (the order must already be AWAITING_PAYMENT).
 */
export async function generatePix(input: GeneratePixInput): Promise<WaPaymentInfo> {
  if (!input.allowReal) {
    // DRY-RUN: never touch Mercado Pago
    return {
      method:          "PIX",
      status:          "AWAITING_PIX",
      pixCopyPaste:    `DRY_RUN_PIX_${input.orderId}`,
      pixQrCodeBase64: "",
      isDryRunStub:    true,
    };
  }

  // Controlled full-test: real Pix via the canonical service.
  const { prisma }          = await import("@/lib/prisma");
  const { createPixPayment } = await import("@/lib/mercadopago");
  const { decrypt }          = await import("@/lib/crypto");
  const { getPublicSiteUrl } = await import("@/lib/public-url");
  const { paymentDescription } = await import("@/lib/payment-description");

  const mpCfg = await prisma.integrationConfig.findUnique({
    where:  { restaurantId_provider: { restaurantId: input.restaurantId, provider: "mercadopago" } },
    select: { configBlob: true, isActive: true },
  });

  if (!mpCfg?.isActive) {
    return { method: "PIX", status: "FAILED", isDryRunStub: false };
  }

  let mpToken: string | null = null;
  try {
    mpToken = (JSON.parse(decrypt(mpCfg.configBlob)) as { accessToken: string }).accessToken;
  } catch {
    mpToken = null;
  }
  if (!mpToken) {
    return { method: "PIX", status: "FAILED", isDryRunStub: false };
  }

  const appUrl = getPublicSiteUrl();
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: input.restaurantId }, select: { name: true },
  });
  const pix = await createPixPayment(mpToken, {
    orderId:         input.orderId,
    amount:          input.amount,
    description:     input.description ?? paymentDescription(restaurant?.name),
    notificationUrl: appUrl ? `${appUrl}/api/payments/mercadopago/webhook` : undefined,
  });

  // Persist the payment record exactly like finalize (LINK_SENT, PAY_NOW).
  // Order stays AWAITING_PAYMENT until the MP webhook approves it.
  const { Decimal } = await import("@prisma/client/runtime/library");
  await prisma.payment.create({
    data: {
      orderId:           input.orderId,
      method:            "ONLINE",
      status:            "LINK_SENT",
      amount:            new Decimal(input.amount),
      paymentMode:       "PAY_NOW",
      providerName:      "mercadopago",
      providerReference: pix.paymentId,
      paymentUrl:        pix.pixCopyPaste,
      expiresAt:         new Date(pix.expiresAt),
    },
  });

  return {
    method:          "PIX",
    status:          "AWAITING_PIX",
    pixCopyPaste:    pix.pixCopyPaste,
    pixQrCodeBase64: pix.pixQrCodeBase64,
    isDryRunStub:    false,
  };
}
