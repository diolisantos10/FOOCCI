/**
 * Mercado Pago transparent card — foundation tests.
 *   1. createCardPayment builds the /v1/payments request and parses the result
 *      (mocked fetch — no network, no raw card data).
 *   2. resolveCardOperator prefers MP (when it has a Public Key), falls back to
 *      SumUp, and reports card availability.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCardPayment } from "@/lib/mercadopago";

describe("createCardPayment (MP transparent card)", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; vi.restoreAllMocks(); });

  it("posts token + installments and never raw card data", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    global.fetch = vi.fn(async (url: string, init: RequestInit) => {
      captured.url = url; captured.init = init;
      return { ok: true, json: async () => ({
        id: 111, status: "approved", status_detail: "accredited",
        payment_method_id: "visa", installments: 3, card: { last_four_digits: "4242" },
      }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await createCardPayment("APP-TOKEN", {
      orderId: "order_abc", amount: 90.5, description: "Pedido",
      token: "CARD_TOKEN", installments: 3, paymentMethodId: "visa", issuerId: "25",
    });

    expect(captured.url).toBe("https://api.mercadopago.com/v1/payments");
    expect((captured.init!.headers as Record<string, string>)["Authorization"]).toBe("Bearer APP-TOKEN");
    expect((captured.init!.headers as Record<string, string>)["X-Idempotency-Key"]).toBe("mercadopago-card-order_abc");
    const body = JSON.parse(captured.init!.body as string);
    expect(body.token).toBe("CARD_TOKEN");
    expect(body.installments).toBe(3);
    expect(body.transaction_amount).toBe(90.5);
    expect(JSON.stringify(body)).not.toMatch(/card_number|cvv|security_code/i);
    expect(r.status).toBe("approved");
    expect(r.last4).toBe("4242");
    expect(r.installments).toBe(3);
  });

  it("throws with MP detail on a 4xx (bad token)", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ message: "bad token" }) } as unknown as Response)) as unknown as typeof fetch;
    await expect(createCardPayment("T", {
      orderId: "o", amount: 10, description: "x", token: "bad", installments: 1,
    })).rejects.toThrow(/400/);
  });
});

describe("resolveCardOperator (card = SumUp; MP is Pix-only)", () => {
  beforeEach(() => { vi.resetModules(); });

  it("routes card to SumUp even when MP has a Public Key", async () => {
    vi.doMock("@/services/payment/paymentCredentials", () => ({
      getMercadoPagoCredentials: async () => ({ accessToken: "T", publicKey: "APP_USR-pk" }),
      getSumUpCredentials: async () => ({ apiKey: "sup_sk", merchantCode: "MC", maxInstallments: 6 }),
    }));
    const { resolveCardOperator, isCardEnabled } = await import("@/services/payment/PaymentRouter");
    const op = await resolveCardOperator("r1");
    expect(op?.provider).toBe("sumup");
    if (op?.provider === "sumup") expect(op.maxInstallments).toBe(6);
    expect(await isCardEnabled("r1")).toBe(true);
  });

  it("card is disabled when SumUp is not configured (MP alone doesn't enable card)", async () => {
    vi.doMock("@/services/payment/paymentCredentials", () => ({
      getMercadoPagoCredentials: async () => ({ accessToken: "T", publicKey: "APP_USR-pk" }),
      getSumUpCredentials: async () => null,
    }));
    const { resolveCardOperator, isCardEnabled } = await import("@/services/payment/PaymentRouter");
    expect(await resolveCardOperator("r1")).toBeNull();
    expect(await isCardEnabled("r1")).toBe(false);
  });
});
