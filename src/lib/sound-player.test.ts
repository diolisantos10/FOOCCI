/**
 * Volume/gain math + asset wiring for the NEW ORDER alert.
 *
 *   B. volume > 100 is preserved (drives Web Audio gain) and clamped to MAX_VOLUME
 *   A. the Pedidos screen and the settings test button share ONE asset constant
 *   G. the new-order asset is separate from the (unchanged) atendimento asset
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { clampVolume, effectiveAlertVolume, MAX_VOLUME } from "@/lib/sound-player";
import { ORDER_ALERT_ASSET, HANDOFF_ALERT_ASSET } from "@/lib/sound-prefs";

describe("clampVolume (B — gain ceiling)", () => {
  it("raises the ceiling to 400% for noisy kitchens", () => {
    expect(MAX_VOLUME).toBe(400);
  });

  it("preserves values above 100 (these become Web Audio gain)", () => {
    expect(clampVolume(150)).toBe(150);
    expect(clampVolume(200)).toBe(200);
    expect(clampVolume(400)).toBe(400);
  });

  it("clamps out-of-range values", () => {
    expect(clampVolume(450)).toBe(MAX_VOLUME);
    expect(clampVolume(-10)).toBe(0);
    expect(clampVolume(Number.NaN)).toBe(100);
  });
});

describe("effectiveAlertVolume (theme gain)", () => {
  it("URGENT multiplies by 1.5 (clamped to MAX_VOLUME)", () => {
    expect(effectiveAlertVolume(200, "URGENT")).toBe(300);
    expect(effectiveAlertVolume(300, "URGENT")).toBe(MAX_VOLUME); // 450 → 400
  });

  it("SOFT pulls volume back, DEFAULT is unchanged", () => {
    expect(effectiveAlertVolume(100, "SOFT")).toBe(60);
    expect(effectiveAlertVolume(120, "DEFAULT")).toBe(120);
    expect(effectiveAlertVolume(150, "unknown-theme")).toBe(150);
  });
});

describe("alert assets (A — test/real parity, G — atendimento unchanged)", () => {
  it("new-order asset is the official Foocci order sound and exists on disk", () => {
    expect(ORDER_ALERT_ASSET).toBe("/sounds/foocci-order-alert-v2.wav");
    const onDisk = path.join(process.cwd(), "public", ORDER_ALERT_ASSET);
    expect(fs.existsSync(onDisk)).toBe(true);
  });

  it("new-order alert is a different file from the atendimento alert", () => {
    expect(ORDER_ALERT_ASSET).not.toBe(HANDOFF_ALERT_ASSET);
    const handoff = path.join(process.cwd(), "public", HANDOFF_ALERT_ASSET);
    expect(fs.existsSync(handoff)).toBe(true); // atendimento sound left intact
  });
});
