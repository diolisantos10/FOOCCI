import { describe, expect, it } from "vitest";
import {
  selecionarSeisMaisRecentes,
  type CandidatoAoPadrao,
} from "./padraoModelosRecentes";

const base = (nome: string, atualizadoEm: string): CandidatoAoPadrao => ({
  nome,
  idioma: "pt_BR",
  categoria: "MARKETING",
  situacao: "APPROVED",
  atualizadoEm,
  temCorpo: true,
});

describe("selecionarSeisMaisRecentes", () => {
  it("escolhe exatamente os seis APPROVED de Marketing pt-BR mais recentemente editados", () => {
    const modelos = [
      base("m1", "2026-09-14T10:00:00Z"),
      base("m2", "2026-09-14T11:00:00Z"),
      base("m3", "2026-09-14T12:00:00Z"),
      base("m4", "2026-09-14T13:00:00Z"),
      base("m5", "2026-09-14T14:00:00Z"),
      base("m6", "2026-09-14T15:00:00Z"),
      base("antigo", "2026-09-01T15:00:00Z"),
      { ...base("utility", "2026-09-14T20:00:00Z"), categoria: "UTILITY" },
      { ...base("ingles", "2026-09-14T21:00:00Z"), idioma: "en_US" },
      { ...base("pendente", "2026-09-14T22:00:00Z"), situacao: "PENDING" },
    ];

    const r = selecionarSeisMaisRecentes(modelos);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.modelos.map((m) => m.nome)).toEqual(["m6", "m5", "m4", "m3", "m2", "m1"]);
  });

  it("não adivinha a ordem quando a Meta omite a data da última edição", () => {
    const r = selecionarSeisMaisRecentes([
      base("com-data", "2026-09-14T10:00:00Z"),
      base("sem-data", ""),
    ]);
    expect(r.ok).toBe(false);
  });

  it("aceita menos de seis quando a conta realmente tem menos elegíveis", () => {
    const r = selecionarSeisMaisRecentes([
      base("a", "2026-09-14T10:00:00Z"),
      base("b", "2026-09-14T11:00:00Z"),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.modelos.map((m) => m.nome)).toEqual(["b", "a"]);
  });
});
