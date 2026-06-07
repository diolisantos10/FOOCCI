import { describe, it, expect } from "vitest";
import {
  buildOpeningOptions,
  SUGGESTION_OPTION_VALUE,
  SUGGESTION_OPTION_LABEL,
  FORBIDDEN_OPENING_LABELS,
} from "../waiterOpening";

describe("waiterOpening — clean chat opening", () => {
  it("offers exactly ONE optional action", () => {
    expect(buildOpeningOptions()).toHaveLength(1);
  });

  it("the single action is 'Quero uma sugestão'", () => {
    const [opt] = buildOpeningOptions();
    expect(opt.label).toBe(SUGGESTION_OPTION_LABEL);
    expect(opt.label).toBe("Quero uma sugestão");
    expect(opt.value).toBe(SUGGESTION_OPTION_VALUE);
  });

  it("never includes a forbidden opening label (no 'Me sugere algo' / 'Agora não' / second CTA)", () => {
    const labels = buildOpeningOptions().map((o) => o.label);
    for (const forbidden of FORBIDDEN_OPENING_LABELS) {
      expect(labels).not.toContain(forbidden);
    }
    expect(labels).not.toContain("Me sugere algo");
    expect(labels).not.toContain("Agora não");
  });
});
