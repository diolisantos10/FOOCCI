import { describe, expect, it } from "vitest";
import { AgendadorDaSupervisora } from "./agendador";

describe("AgendadorDaSupervisora", () => {
  it("não inicia timer no ambiente de teste", () => {
    AgendadorDaSupervisora.stop();
    expect(() => AgendadorDaSupervisora.start()).not.toThrow();
  });
});
