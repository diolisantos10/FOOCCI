import { describe, it, expect } from "vitest";
import { chaveDoTelefone, gruposDuplicados, sobrevivente } from "./chaveDoTelefone";

const c = (id: string, phone: string | null, totalOrders = 0, dia = 1) =>
  ({ id, phone, totalOrders, createdAt: new Date(Date.UTC(2026, 0, dia)) });

describe("chave do telefone — a mesma pessoa em qualquer forma gravada", () => {
  it("celular com e sem o 9 caem na mesma chave", () => {
    expect(chaveDoTelefone("+551188887777")).toBe("11988887777");
    expect(chaveDoTelefone("+5511988887777")).toBe("11988887777");
    expect(chaveDoTelefone("11988887777")).toBe("11988887777");
  });
  it("fixo não ganha 9", () => {
    expect(chaveDoTelefone("+551133334444")).toBe("1133334444");
  });
  it("convidado e vazio ficam de fora", () => {
    expect(chaveDoTelefone("GUEST-abc")).toBeNull();
    expect(chaveDoTelefone(null)).toBeNull();
  });
  it("agrupa o importado sem o 9 com o criado no checkout, e o sobrevivente é o que tem histórico", () => {
    const importado = c("imp", "+551188887777", 5, 1);
    const novo      = c("novo", "+5511988887777", 1, 200);
    const grupos = gruposDuplicados([importado, novo, c("outro", "+5511977776666")]);
    expect(grupos).toHaveLength(1);
    expect(sobrevivente(grupos[0]!).id).toBe("imp");
  });
});
