import { describe, it, expect } from "vitest";
import { generateWaMenuCode } from "./wa-menu-link";

describe("wa-menu-link — generateWaMenuCode", () => {
  it("is 7 chars from the unambiguous alphabet (no 0/O/1/l/I)", () => {
    const allowed = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]{7}$/;
    for (let i = 0; i < 200; i++) {
      const code = generateWaMenuCode();
      expect(code).toMatch(allowed);
      // explicit: none of the confusable characters slip in
      expect(code).not.toMatch(/[0O1lI]/);
    }
  });

  it("is effectively unique across many draws (no collision in 2k)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(generateWaMenuCode());
    expect(seen.size).toBe(2000);
  });
});
