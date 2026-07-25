import { describe, it, expect } from "vitest";
import { fiscalRowToData } from "../MenuFiscalService";

describe("fiscalRowToData", () => {
  it("only writes fields that were sent; blank clears to null", () => {
    expect(fiscalRowToData({ ncm: "21069090" })).toEqual({ fiscalNcm: "21069090" });
    expect(fiscalRowToData({ ncm: "" })).toEqual({ fiscalNcm: null });
    expect(fiscalRowToData({ cfop: "  5102 " })).toEqual({ fiscalCfop: "5102" });
    expect(fiscalRowToData({})).toEqual({});
  });

  it("maps every short key to its schema column", () => {
    expect(
      fiscalRowToData({ ncm: "1", cest: "2", cfop: "3", csosn: "4", cst: "5", origem: "6", unidade: "7" }),
    ).toEqual({
      fiscalNcm: "1",
      fiscalCest: "2",
      fiscalCfop: "3",
      fiscalCsosn: "4",
      fiscalCst: "5",
      fiscalOrigem: "6",
      fiscalUnidade: "7",
    });
  });
});
