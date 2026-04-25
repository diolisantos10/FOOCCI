export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized } from "@/lib/api-response";

const SAMPLE_ROWS = [
  ["Foto", "Categoria", "Nome do Item", "Descricao", "Preco"],
  ["https://exemplo.com/foto.png", "Entradas", "Ceviche", "Peixe marinado no limão com cebola roxa", 62.9],
  ["", "Entradas", "Shimeji", "Cogumelos na manteiga e shoyu", 30.0],
  ["", "Bebidas", "Água", "", 7.0],
  ["", "Bebidas", "Refrigerante 350ml", "Coca, Guaraná, Fanta", 10.9],
  ["", "Sobremesas", "Banana Empanada", "Com leite condensado e canela", 26.9],
];

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(SAMPLE_ROWS);

  // Column widths
  ws["!cols"] = [
    { wch: 40 }, // Foto
    { wch: 20 }, // Categoria
    { wch: 30 }, // Nome do Item
    { wch: 40 }, // Descricao
    { wch: 12 }, // Preco
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Cardapio");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-cardapio.xlsx"',
    },
  });
}
