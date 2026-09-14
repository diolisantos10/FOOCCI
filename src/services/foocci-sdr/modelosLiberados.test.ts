import { describe, expect, it } from "vitest";
import { escolherAleatorio } from "./modelosLiberados";

describe("escolherAleatorio", () => {
  it("não inventa fallback quando não existe modelo liberado", () => {
    expect(escolherAleatorio([], () => 0.5)).toBeNull();
  });

  it("sorteia somente dentro da lista recebida", () => {
    const modelos = ["a", "b", "c"];
    expect(escolherAleatorio(modelos, () => 0)).toBe("a");
    expect(escolherAleatorio(modelos, () => 0.34)).toBe("b");
    expect(escolherAleatorio(modelos, () => 0.99)).toBe("c");
  });

  it("um único modelo liberado é sempre o escolhido", () => {
    expect(escolherAleatorio(["unico"], () => 0.999)).toBe("unico");
  });
});
