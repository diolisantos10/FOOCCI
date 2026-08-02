/**
 * Menu spreadsheet import — the cost column must never be read as the sale price.
 *
 * The defect this locks: `PRECO_PREFIXES` contained "custo" and "cost", so a merchant
 * importing a sheet to feed the CMV had the sale price of their entire menu overwritten
 * with their cost. Silent, irreversible, and done by the customer's own hand — the
 * worst shape a bug can take, because there is no error to investigate afterwards.
 *
 * These tests drive the real route with real .xlsx buffers, so they fail if anyone puts
 * a cost synonym back into the price list.
 */

import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";

vi.mock("@/lib/tenant", () => ({
  getTenantContext: () => ({ restaurantId: "r1", userId: "u1", role: "OWNER" }),
}));

import { POST } from "./route";

/** Builds an .xlsx File from a grid, the way the browser would upload it. */
function sheetFile(grid: unknown[][]): File {
  const ws = XLSX.utils.aoa_to_sheet(grid);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cardapio");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new File([buf], "cardapio.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function importSheet(grid: unknown[][]) {
  const fd = new FormData();
  fd.set("file", sheetFile(grid));
  const req = { formData: async () => fd } as unknown as Parameters<typeof POST>[0];
  const res = await POST(req);
  const json = await res.json();
  return json.data as {
    rows: Array<{ nome: string; preco: number; custo: number | null; status: string; errors: string[] }>;
    missingColumns: string[];
  };
}

describe("import — a cost column is never the sale price", () => {
  it("keeps price and cost in their own fields when the sheet has both", async () => {
    const data = await importSheet([
      ["Categoria", "Nome do Item", "Preço", "Custo"],
      ["Sushi", "Hot Roll", "R$ 42,90", "R$ 12,50"],
    ]);

    const row = data.rows[0]!;
    expect(row.preco).toBe(42.9);
    expect(row.custo).toBe(12.5);
    expect(row.status).toBe("valid");
  });

  it("does NOT treat a cost-only sheet as a price sheet — it reports the missing price", async () => {
    // This is the exact shape that destroyed menus: no price column, only cost.
    const data = await importSheet([
      ["Categoria", "Nome do Item", "Custo"],
      ["Sushi", "Hot Roll", "R$ 12,50"],
    ]);

    expect(data.missingColumns).toContain("Preço");
    const row = data.rows[0]!;
    expect(row.preco).not.toBe(12.5); // the cost must never land in the price
    expect(row.custo).toBe(12.5);
    expect(row.status).toBe("error");
  });

  it('reads "valor de custo" as cost, even though it starts with the price word "valor"', async () => {
    const data = await importSheet([
      ["Categoria", "Nome do Item", "Preço", "Valor de custo"],
      ["Sushi", "Temaki", "30,00", "9,00"],
    ]);

    const row = data.rows[0]!;
    expect(row.preco).toBe(30);
    expect(row.custo).toBe(9);
  });

  it("leaves cost null when the sheet has no cost column at all", async () => {
    const data = await importSheet([
      ["Categoria", "Nome do Item", "Preço"],
      ["Sushi", "Niguiri", "18,00"],
    ]);

    expect(data.rows[0]!.custo).toBeNull();
  });

  it("an unreadable cost does not invalidate a row that has a good price", async () => {
    // The menu needs the price to work; a bad cost only leaves the CMV blank.
    const data = await importSheet([
      ["Categoria", "Nome do Item", "Preço", "Custo"],
      ["Sushi", "Sashimi", "55,00", "não sei"],
    ]);

    const row = data.rows[0]!;
    expect(row.status).toBe("valid");
    expect(row.preco).toBe(55);
    expect(row.custo).toBeNull();
  });
});
