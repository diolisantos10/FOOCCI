import { describe, it, expect } from "vitest";
import { updateCustomerSchema } from "./customer";

describe("updateCustomerSchema — email vazio no editar cliente", () => {
  // Regressão 03/08: o form de editar cliente manda `email: null` quando o
  // campo está em branco, e o schema recusava null — toda gravação de cliente
  // sem email dava "Erro ao salvar".
  it("aceita email null (campo em branco enviado pelo form)", () => {
    const r = updateCustomerSchema.safeParse({ name: "Diego", email: null });
    expect(r.success).toBe(true);
  });

  it("aceita email string vazia", () => {
    expect(updateCustomerSchema.safeParse({ name: "Diego", email: "" }).success).toBe(true);
  });

  it("aceita email válido de verdade", () => {
    expect(
      updateCustomerSchema.safeParse({ name: "Diego", email: "a@b.com" }).success,
    ).toBe(true);
  });

  it("ainda recusa email malformado", () => {
    expect(updateCustomerSchema.safeParse({ email: "não-é-email" }).success).toBe(false);
  });

  it("aceita o telefone E.164 do caso real", () => {
    expect(
      updateCustomerSchema.safeParse({ phone: "+5511940595223" }).success,
    ).toBe(true);
  });
});
