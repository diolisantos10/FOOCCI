/**
 * Transparent card (SumUp checkout model) + payment router — foundation tests.
 *   1. createSumUpCheckout builds the correct request and parses the response
 *      (mocked fetch — no network, no card data).
 *   2. SumUpProvider returns client-safe params and normalizes status.
 *   3. resolvePixProvider / resolveCardProvider gate on active credentials.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSumUpCheckout } from "@/lib/sumup";
import { SumUpProvider } from "@/services/payment/providers/SumUpProvider";

const CREDS = { apiKey: "sup_sk_test", merchantCode: "MC123" };

function mockFetch(handler: () => { ok: boolean; status?: number; json: () => Promise<unknown> }) {
  global.fetch = vi.fn(async () => handler() as unknown as Response) as unknown as typeof fetch;
}

describe("createSumUpCheckout", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; vi.restoreAllMocks(); });

  it("posts checkout_reference + amount + BRL + merchant_code, never card data", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    global.fetch = vi.fn(async (url: string, init: RequestInit) => {
      captured.url = url; captured.init = init;
      return { ok: true, json: async () => ({ id: "chk_1", status: "PENDING", currency: "BRL" }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const co = await createSumUpCheckout(CREDS, { orderId: "order_abc", amount: 90.5, description: "Pedido" });

    expect(captured.url).toBe("https://api.sumup.com/v0.1/checkouts");
    expect((captured.init!.headers as Record<string, string>)["Authorization"]).toBe("Bearer sup_sk_test");
    const body = JSON.parse(captured.init!.body as string);
    expect(body.checkout_reference).toBe("order_abc");
    expect(body.amount).toBe(90.5);
    expect(body.currency).toBe("BRL");
    expect(body.merchant_code).toBe("MC123");
    // A checkout creation must never carry raw card data.
    expect(JSON.stringify(body)).not.toMatch(/card_number|cvv|security_code/i);
    expect(co.id).toBe("chk_1");
    expect(co.status).toBe("PENDING");
  });

  it("throws with SumUp detail on a 4xx", async () => {
    mockFetch(() => ({ ok: false, status: 400, json: async () => ({ message: "bad" }) }));
    await expect(createSumUpCheckout(CREDS, { orderId: "o", amount: 10 })).rejects.toThrow(/400/);
  });
});

describe("SumUpProvider", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it("createCardCheckout returns id + client-safe params (no api key)", async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ id: "chk_9", status: "PENDING", currency: "BRL" }) }));
    const p = new SumUpProvider(CREDS, { maxInstallments: 6 });
    const init = await p.createCardCheckout({ orderId: "o1", amount: 12.3, description: "x" });
    expect(init.providerName).toBe("sumup");
    expect(init.checkoutId).toBe("chk_9");
    expect(init.clientParams.currency).toBe("BRL");
    expect(init.clientParams.amount).toBe("12.30");
    expect(init.clientParams.merchantCode).toBe("MC123");
    expect(init.clientParams.maxInstallments).toBe(6);
    expect(JSON.stringify(init.clientParams)).not.toContain("sup_sk");
  });

  const statusCases: Array<[string, string]> = [
    ["PAID", "paid"], ["PENDING", "pending"], ["FAILED", "failed"],
    ["EXPIRED", "failed"], ["WEIRD", "unknown"],
  ];
  for (const [sumup, expected] of statusCases) {
    it(`getCardCheckoutStatus maps ${sumup} → ${expected}`, async () => {
      mockFetch(() => ({ ok: true, json: async () => ({
        id: "chk_9", status: sumup,
        transactions: [{ transaction_code: "TC", installments_count: 3, card: { last_4_digits: "4242", type: "VISA" } }],
      }) }));
      const p = new SumUpProvider(CREDS);
      const r = await p.getCardCheckoutStatus("chk_9");
      expect(r.status).toBe(expected);
      expect(r.providerName).toBe("sumup");
      if (sumup === "PAID") { expect(r.last4).toBe("4242"); expect(r.installments).toBe(3); }
    });
  }
});

describe("PaymentRouter", () => {
  beforeEach(() => { vi.resetModules(); });

  it("resolves Pix→MP and Card→SumUp when both active", async () => {
    vi.doMock("@/services/payment/paymentCredentials", () => ({
      getMercadoPagoCredentials: async () => ({ accessToken: "APP-TOKEN" }),
      getSumUpCredentials: async () => ({ apiKey: "sup_sk", merchantCode: "MC" }),
    }));
    const { resolvePixProvider, resolveCardProvider } = await import("@/services/payment/PaymentRouter");
    expect((await resolvePixProvider("r1"))?.name).toBe("mercadopago");
    expect((await resolveCardProvider("r1"))?.name).toBe("sumup");
  });

  it("returns null when operators are not configured/active", async () => {
    vi.doMock("@/services/payment/paymentCredentials", () => ({
      getMercadoPagoCredentials: async () => null,
      getSumUpCredentials: async () => null,
    }));
    const { resolvePixProvider, resolveCardProvider } = await import("@/services/payment/PaymentRouter");
    expect(await resolvePixProvider("r1")).toBeNull();
    expect(await resolveCardProvider("r1")).toBeNull();
  });
});
