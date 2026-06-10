import { describe, it, expect } from "vitest";
import { WAITER_NAV_TABS, waiterNavLabel } from "./waiterDepartmentNav";

describe("waiterDepartmentNav — navegação do Waiter Department", () => {
  const labels = WAITER_NAV_TABS.map((t) => t.label);

  it("(1/2) Perfil/Operação/Brain & Skills foram unificados em 'Perfil do Agente'", () => {
    expect(labels).toContain("Perfil do Agente");
    expect(labels).not.toContain("Operação");
    expect(labels).not.toContain("Brain & Skills");
    expect(labels.filter((l) => l.startsWith("Perfil"))).toHaveLength(1);
  });

  it("(3-6) abas de produto presentes com os nomes certos", () => {
    expect(labels).toContain("Centro de Treinamento");
    expect(labels).toContain("Biblioteca de Treinamento");
    expect(labels).toContain("Versão de Teste");
    expect(labels).toContain("Provas de Resultado");
    expect(labels).toContain("Qualidade");
    expect(labels).toContain("Governança");
  });

  it("(7) termos técnicos não aparecem como destaque (labels/subtítulos)", () => {
    const all = WAITER_NAV_TABS.map((t) => `${t.label} ${t.subtitle}`).join(" ");
    for (const term of ["P0", "P2", "CRON", "runtimeTouched", "runtimeEnabled", "promptBlock", "Runtime Merge", "MISSED_SALE", "Library"]) {
      expect(all).not.toContain(term);
    }
  });

  it("navegação enxuta: 8 abas", () => {
    expect(WAITER_NAV_TABS).toHaveLength(8);
  });

  it("subtítulo do Perfil cobre identidade + regras + habilidades + operação", () => {
    const sub = WAITER_NAV_TABS.find((t) => t.key === "perfil")!.subtitle;
    expect(sub).toContain("Identidade");
    expect(sub).toContain("regras");
    expect(sub).toContain("habilidades");
    expect(sub).toContain("operação");
  });

  it("waiterNavLabel resolve por chave", () => {
    expect(waiterNavLabel("treinamento")).toBe("Centro de Treinamento");
    expect(waiterNavLabel("provas")).toBe("Provas de Resultado");
  });
});
