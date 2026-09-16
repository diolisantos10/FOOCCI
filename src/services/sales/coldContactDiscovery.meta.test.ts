import { describe, expect, it } from "vitest";
import { COLD_GREETING_TEMPLATES } from "./coldContactDiscovery";

describe("templates frios da Meta", () => {
  it("mantém variáveis longe das extremidades e com texto fixo depois delas", () => {
    for (const template of COLD_GREETING_TEMPLATES.filter(t => t.restaurantNameParam)) {
      expect(template.body.trim().startsWith("{{")).toBe(false);
      expect(template.body.trim().endsWith("}}")).toBe(false);
      expect(template.body).toMatch(/\{\{1\}\}.+$/);
    }
  });

  it("mantém o terceiro template sem variável", () => {
    const template = COLD_GREETING_TEMPLATES.find(t => t.name === "foocci_contato_inicial_03");
    expect(template?.restaurantNameParam).toBe(false);
    expect(template?.body).toBe("Olá! Tudo bem?");
  });
});
