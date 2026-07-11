import { describe, it, expect } from "vitest";
import {
  buildOpeningOptions,
  SUGGESTION_OPTION_VALUE,
  SUGGESTION_OPTION_LABEL,
  REPEAT_OPTION_VALUE,
  REPEAT_OPTION_LABEL,
  FORBIDDEN_OPENING_LABELS,
} from "../waiterOpening";

describe("waiterOpening — clean chat opening", () => {
  it("offers ONLY 'Quero uma sugestão' when there is no history", () => {
    const opts = buildOpeningOptions();
    expect(opts).toHaveLength(1);
    expect(opts[0].label).toBe(SUGGESTION_OPTION_LABEL);
    expect(opts[0].value).toBe(SUGGESTION_OPTION_VALUE);
  });

  it("adds 'Pedir novamente' beside it when the customer can repeat", () => {
    const opts = buildOpeningOptions({ canRepeat: true });
    expect(opts).toHaveLength(2);
    expect(opts[0].value).toBe(SUGGESTION_OPTION_VALUE);   // suggestion stays first
    expect(opts[1].label).toBe(REPEAT_OPTION_LABEL);
    expect(opts[1].label).toBe("Pedir novamente");
    expect(opts[1].value).toBe(REPEAT_OPTION_VALUE);
  });

  it("canRepeat=false behaves like the no-arg default (suggestion only)", () => {
    expect(buildOpeningOptions({ canRepeat: false })).toHaveLength(1);
  });

  it("never includes a forbidden opening label (no 'Me sugere algo' / 'Agora não')", () => {
    const labels = buildOpeningOptions({ canRepeat: true }).map((o) => o.label);
    for (const forbidden of FORBIDDEN_OPENING_LABELS) {
      expect(labels).not.toContain(forbidden);
    }
    expect(labels).not.toContain("Me sugere algo");
    expect(labels).not.toContain("Agora não");
  });
});
