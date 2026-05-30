import { describe, it, expect } from "vitest";
import {
  AUTHORIZED_QUOTE_STATUSES,
  isQuoteStatusBlocked,
  isDeliveryQuoteAuthorized,
} from "./delivery-authorization";

describe("isQuoteStatusBlocked — allowlist semantics", () => {
  it("authorizes every allowlisted status", () => {
    for (const status of AUTHORIZED_QUOTE_STATUSES) {
      expect(isQuoteStatusBlocked(status)).toBe(false);
    }
  });

  it("blocks out_of_range (Poá/SP case)", () => {
    expect(isQuoteStatusBlocked("out_of_range")).toBe(true);
  });

  it("blocks distance_blocked", () => {
    expect(isQuoteStatusBlocked("distance_blocked")).toBe(true);
  });

  it("blocks error", () => {
    expect(isQuoteStatusBlocked("error")).toBe(true);
  });

  it("blocks unknown / future statuses", () => {
    expect(isQuoteStatusBlocked("nao_autorizado")).toBe(true);
    expect(isQuoteStatusBlocked("whatever_new_status")).toBe(true);
  });

  it("blocks null / undefined / empty", () => {
    expect(isQuoteStatusBlocked(null)).toBe(true);
    expect(isQuoteStatusBlocked(undefined)).toBe(true);
    expect(isQuoteStatusBlocked("")).toBe(true);
  });
});

describe("isDeliveryQuoteAuthorized — full quote object", () => {
  it("A. unauthorized status → not authorized (Avançar disabled)", () => {
    expect(isDeliveryQuoteAuthorized({ calculationStatus: "out_of_range", deliveryFee: 0 })).toBe(false);
  });

  it("B. no quote yet (after editing address) → not authorized", () => {
    expect(isDeliveryQuoteAuthorized(null)).toBe(false);
    expect(isDeliveryQuoteAuthorized(undefined)).toBe(false);
  });

  it("D. valid distance_calculated quote → authorized", () => {
    expect(isDeliveryQuoteAuthorized({ calculationStatus: "distance_calculated", deliveryFee: 7.5 })).toBe(true);
  });

  it("authorizes free_delivery with zero fee", () => {
    expect(isDeliveryQuoteAuthorized({ calculationStatus: "free_delivery", deliveryFee: 0 })).toBe(true);
  });

  it("authorizes manual mode (operator confirms fee)", () => {
    expect(isDeliveryQuoteAuthorized({ calculationStatus: "manual", deliveryFee: 0 })).toBe(true);
  });

  it("rejects authorized status with invalid fee", () => {
    expect(isDeliveryQuoteAuthorized({ calculationStatus: "distance_calculated", deliveryFee: NaN })).toBe(false);
    expect(isDeliveryQuoteAuthorized({ calculationStatus: "distance_calculated", deliveryFee: -5 })).toBe(false);
    expect(isDeliveryQuoteAuthorized({ calculationStatus: "distance_calculated", deliveryFee: null })).toBe(false);
  });
});
