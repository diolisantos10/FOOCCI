import { describe, it, expect } from "vitest";
import { SAFE_MODE, isSafeMode, assertSafeMode, QualitySafeModeError } from "./SafeMode";
import { getAuditors } from "./QualityControlService";

describe("Quality Control — SafeMode", () => {
  it("(4) SAFE_MODE forces dryRun and allowSideEffects=false (and is frozen)", () => {
    expect(SAFE_MODE).toEqual({ safeMode: true, dryRun: true, allowSideEffects: false });
    expect(Object.isFrozen(SAFE_MODE)).toBe(true);
  });

  it("isSafeMode rejects any unsafe configuration", () => {
    expect(isSafeMode(SAFE_MODE)).toBe(true);
    expect(isSafeMode({ safeMode: true, dryRun: false, allowSideEffects: false })).toBe(false);
    expect(isSafeMode({ safeMode: true, dryRun: true, allowSideEffects: true })).toBe(false);
    expect(isSafeMode({ safeMode: false, dryRun: true, allowSideEffects: false })).toBe(false);
    expect(isSafeMode(null)).toBe(false);
    expect(isSafeMode(undefined)).toBe(false);
  });

  it("assertSafeMode throws a controlled error outside safe mode", () => {
    expect(() => assertSafeMode({ safeMode: true, dryRun: true, allowSideEffects: true })).toThrow(
      QualitySafeModeError,
    );
    expect(() => assertSafeMode(undefined)).toThrow(QualitySafeModeError);
  });

  it("an auditor refuses to run when handed an unsafe context (impede execução)", async () => {
    const waiter = getAuditors().find((a) => a.id === "waiter")!;
    const unsafeCtx = {
      runId: "x",
      now: new Date(),
      // deliberately unsafe — must be blocked
      safeMode: { safeMode: true, dryRun: false, allowSideEffects: true } as never,
    };
    await expect(waiter.run(unsafeCtx)).rejects.toBeInstanceOf(QualitySafeModeError);
  });
});
