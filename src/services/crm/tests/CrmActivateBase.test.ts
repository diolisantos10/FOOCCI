/**
 * CRMService.activateContactableBase — "Ativar base" para WhatsApp.
 *
 * Garante: dry-run (padrão) NÃO escreve; o filtro exclui opt-out e sem-telefone
 * e só liga quem está crmContactable=false; live escreve e reporta o total.
 * NENHUM banco real é tocado.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  customer: { count: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { CRMService } from "../CRMService";

describe("CRMService.activateContactableBase", () => {
  beforeEach(() => {
    prismaMock.customer.count.mockReset();
    prismaMock.customer.updateMany.mockReset();
  });

  it("dry-run é o padrão: só conta, nunca escreve", async () => {
    prismaMock.customer.count.mockResolvedValue(42);
    const res = await CRMService.activateContactableBase("r1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.dryRun).toBe(true);
      expect(res.data.activatable).toBe(42);
      expect(res.data.activated).toBe(0);
    }
    expect(prismaMock.customer.updateMany).not.toHaveBeenCalled();
  });

  it("o filtro exclui opt-out e sem-telefone; só liga quem está desligado", async () => {
    prismaMock.customer.count.mockResolvedValue(10);
    await CRMService.activateContactableBase("r1", { dryRun: true });
    const where = prismaMock.customer.count.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      restaurantId:   "r1",
      isGuest:        false,
      hasOptedOut:    false,   // nunca mexe em quem pediu opt-out
      crmContactable: false,   // só quem está desligado
      phone:          { not: null }, // precisa ter telefone
    });
  });

  it("live escreve crmContactable=true e retorna quantos foram ativados", async () => {
    prismaMock.customer.count.mockResolvedValue(30);
    prismaMock.customer.updateMany.mockResolvedValue({ count: 30 });
    const res = await CRMService.activateContactableBase("r1", { dryRun: false });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.dryRun).toBe(false);
      expect(res.data.activated).toBe(30);
    }
    const call = prismaMock.customer.updateMany.mock.calls[0]?.[0];
    expect(call?.data).toEqual({ crmContactable: true });
    expect(call?.where).toMatchObject({ hasOptedOut: false, crmContactable: false, phone: { not: null } });
  });

  it("live com 0 ativáveis não chama updateMany", async () => {
    prismaMock.customer.count.mockResolvedValue(0);
    const res = await CRMService.activateContactableBase("r1", { dryRun: false });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.activated).toBe(0);
    expect(prismaMock.customer.updateMany).not.toHaveBeenCalled();
  });
});
