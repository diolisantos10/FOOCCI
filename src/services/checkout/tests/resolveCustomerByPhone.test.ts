import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { resolveCustomerByPhone } from "../CheckoutFinalizationService";

function fakeTx(existentes: Array<{ id: string; phone: string }>) {
  return {
    customer: {
      findFirst: vi.fn(async ({ where }: { where: { phone: { in: string[] } } }) =>
        existentes.find((c) => where.phone.in.includes(c.phone)) ?? null),
      update: vi.fn(async () => ({})),
      upsert: vi.fn(async () => ({ id: "novo" })),
    },
  };
}

describe("checkout — o pedido cai no cliente que já existe", () => {
  it("cliente importado SEM o 9 é reaproveitado quando pede com o 9 (não nasce duplicado)", async () => {
    // Importação grava +55DD8dígitos; o checkout normaliza com o 9.
    const tx = fakeTx([{ id: "importado", phone: "+551188887777" }]);
    const id = await resolveCustomerByPhone(tx as never, "r1", "+5511988887777", "11988887777", "Ana");
    expect(id).toBe("importado");
    expect(tx.customer.upsert).not.toHaveBeenCalled();
  });

  it("sem cadastro em nenhuma forma, cria (comportamento de antes)", async () => {
    const tx = fakeTx([]);
    const id = await resolveCustomerByPhone(tx as never, "r1", "+5511988887777", "11988887777", "Ana");
    expect(id).toBe("novo");
    expect(tx.customer.upsert).toHaveBeenCalledTimes(1);
  });
});
