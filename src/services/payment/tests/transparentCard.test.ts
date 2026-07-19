/**
 * Transparent card checkout — foundation tests.
 *   1. createCardPayment builds the correct MP Payments API request and parses
 *      the response (mocked fetch — no network, no real token).
 *   2. MercadoPagoProvider normalizes MP statuses to our CardChargeStatus.
 *   3. resolvePaymentProvider returns the operator only when it's active.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCardPayment } from "@/lib/mercadopago";
import { MercadoPagoProvider } from "@/services/payment/providers/MercadoPagoProvider";

describe("createCardPayment (MP Checkout API)", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; vi.restoreAllMocks(); });

  it("posts token + installments and never sends raw card data", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    global.fetch = vi.fn(async (url: string, init: RequestInit) => {
      captured.url = url; captured.init = init;
      return {
        ok: true,
        json: async () => ({
          id: 123456789,
          status: "approved",
          status_detail: "accredited",
          payment_method_id: "visa",
          installments: 3,
          card: { last_four_digits: "1234" },
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await createCardPayment("APP-TOKEN", {
      orderId: "order_abcdef12",
      amount: 90.5,
      description: "Pedido teste",
      token: "CARD_TOKEN_FROM_SDK",
      installments: 3,
      paymentMethodId: "visa",
      issuerId: "25",
    });

    // Endpoint + auth + idempotency
    expect(captured.url).toBe("https://api.mercadopago.com/v1/payments");
    expect((captured.init!.headers as Record<string, string>)["Authorization"]).toBe("Bearer APP-TOKEN");
    expect((captured.init!.headers as Record<string, string>)["X-Idempotency-Key"]).toBe("mercadopago-card-order_abcdef12");

    const body = JSON.parse(captured.init!.body as string);
    expect(body.token).toBe("CARD_TOKEN_FROM_SDK");
    expect(body.installments).toBe(3);
    expect(body.transaction_amount).toBe(90.5);
    expect(body.external_reference).toBe("order_abcdef12");
    expect(body.payer.email).toContain("@");
    // Never leak PAN/CVV — those live only in the client-side token.
    expect(JSON.stringify(body)).not.toMatch(/card_number|cvv|security_code/i);

    expect(r.paymentId).toBe("123456789");
    expect(r.status).toBe("approved");
    expect(r.last4).toBe("1234");
    expect(r.installments).toBe(3);
  });

  it("throws with MP detail on a 4xx (e.g. bad token)", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ message: "invalid token" }),
    } as unknown as Response)) as unknown as typeof fetch;

    await expect(createCardPayment("T", {
      orderId: "o1", amount: 10, description: "x", token: "bad", installments: 1,
    })).rejects.toThrow(/400/);
  });
});

describe("MercadoPagoProvider status normalization", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  const cases: Array<[string, string]> = [
    ["approved", "approved"],
    ["in_process", "pending"],
    ["pending", "pending"],
    ["rejected", "rejected"],
    ["cancelled", "cancelled"],
    ["something_else", "unknown"],
  ];

  for (const [mp, expected] of cases) {
    it(`maps MP "${mp}" → "${expected}"`, async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 1, status: mp, status_detail: "d", payment_method_id: "visa", installments: 1 }),
      } as unknown as Response)) as unknown as typeof fetch;

      const provider = new MercadoPagoProvider("T");
      const r = await provider.createCardCharge({
        orderId: "o", amount: 10, description: "x", cardToken: "tok", installments: 1,
      });
      expect(r.status).toBe(expected);
      expect(r.providerName).toBe("mercadopago");
    });
  }
});

describe("resolvePaymentProvider", () => {
  beforeEach(() => { vi.resetModules(); });

  it("returns the MP provider when credentials are active", async () => {
    vi.doMock("@/services/payment/paymentCredentials", () => ({
      getMercadoPagoCredentials: async () => ({ accessToken: "APP-TOKEN" }),
    }));
    const { resolvePaymentProvider } = await import("@/services/payment/PaymentRouter");
    const card = await resolvePaymentProvider("r1", "card");
    const pix  = await resolvePaymentProvider("r1", "pix");
    expect(card?.name).toBe("mercadopago");
    expect(pix?.name).toBe("mercadopago");
  });

  it("returns null when no operator is configured/active", async () => {
    vi.doMock("@/services/payment/paymentCredentials", () => ({
      getMercadoPagoCredentials: async () => null,
    }));
    const { resolvePaymentProvider } = await import("@/services/payment/PaymentRouter");
    expect(await resolvePaymentProvider("r1", "card")).toBeNull();
  });
});
