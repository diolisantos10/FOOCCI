import { COLD_CONTACT_OBJECTIVE, COLD_GREETING_TEMPLATES, routeColdReply } from "./coldContactDiscovery";

describe("cold contact discovery", () => {
  it("uses discovery, not sales, as the cold-list objective", () => {
    expect(COLD_CONTACT_OBJECTIVE).toBe("FIND_CORRECT_DECISION_MAKER");
    expect(COLD_GREETING_TEMPLATES.every(t => !t.body.toLowerCase().includes("foocci"))).toBe(true);
  });
  it("does not pitch before identifying the role", () => {
    expect(routeColdReply("HUMAN_UNKNOWN_ROLE")).toMatchObject({ action: "ASK_ROLE", salesPitchAllowed: false });
  });
  it("asks for a human when automation replies", () => {
    expect(routeColdReply("AUTOMATION")).toMatchObject({ action: "REQUEST_HUMAN", salesPitchAllowed: false });
  });
  it("returns a referred decision maker to CRM approach", () => {
    expect(routeColdReply("REFERRED_DECISION_MAKER")).toMatchObject({ owner: "CRM_ABORDAGEM", action: "REGISTER_REFERRAL" });
  });
  it("does not force already-qualified leads through contact discovery", () => {
    expect(routeColdReply("HUMAN_UNKNOWN_ROLE", true)).toMatchObject({ action: "START_DISCOVERY", salesPitchAllowed: true });
  });
  it("avoids time-of-day greetings", () => {
    expect(COLD_GREETING_TEMPLATES.every(t => !/bom dia|boa tarde|boa noite/i.test(t.body))).toBe(true);
  });
});
