import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_ACTORS,
  PUBLIC_JOURNEY,
  SALES_ROOM_KPIS,
  findCommercialTransition,
  requiresExceptionRole,
} from "./commercialFlow";

describe("commercialFlow", () => {
  it("exposes only three normal commercial actors", () => {
    expect(COMMERCIAL_ACTORS).toEqual(["CRM_ABORDAGEM", "SDR_TA", "CONSULTOR_COMERCIAL"]);
    expect(PUBLIC_JOURNEY).toEqual(COMMERCIAL_ACTORS);
  });

  it("routes an interested cold reply to TA", () => {
    expect(findCommercialTransition("WAITING_REPLY", "INTERESTED")).toMatchObject({
      to: "SDR_DISCOVERY",
      owner: "SDR_TA",
    });
  });

  it("recovers a referred decision maker through CRM instead of losing the lead", () => {
    expect(findCommercialTransition("WRONG_DECISION_MAKER", "REFERRED_DECISION_MAKER")).toMatchObject({
      to: "COLD_LIST",
      owner: "CRM_ABORDAGEM",
    });
  });

  it("lets the consultant close standard deals without mandatory closer handoff", () => {
    expect(findCommercialTransition("PROPOSAL", "STANDARD_ACCEPTANCE")).toMatchObject({
      to: "WON",
      owner: "CONSULTOR_COMERCIAL",
    });
  });

  it("reserves closer/manager for commercial exceptions", () => {
    expect(requiresExceptionRole("SPECIAL_DISCOUNT")).toBe(true);
    expect(requiresExceptionRole("SPECIAL_CONTRACT")).toBe(true);
    expect(requiresExceptionRole("STANDARD_ACCEPTANCE")).toBe(false);
  });

  it("keeps KPIs separated by responsibility without multiplying public actors", () => {
    expect(SALES_ROOM_KPIS.crm).toContain("reply_rate");
    expect(SALES_ROOM_KPIS.sdr).toContain("wrong_decision_maker_recovery_rate");
    expect(SALES_ROOM_KPIS.consultant).toContain("proposal_to_win_rate");
    expect(SALES_ROOM_KPIS.management).toContain("qa_score");
  });
});
