/**
 * GET /api/crm/import/template?type=customers|orders|customers_orders
 *
 * Returns a CSV template file the user can download, fill in, and re-upload.
 */

import { NextRequest, NextResponse } from "next/server";

const CUSTOMER_HEADERS = [
  "nome", "telefone", "email", "aniversario",
];
const CUSTOMER_SAMPLE_ROW = [
  "Maria Silva", "11999990000", "maria@email.com", "15/05/1990",
];

const ORDER_HEADERS = [
  "nome_cliente", "telefone_cliente", "email_cliente",
  "id_externo", "data_pedido", "tipo_entrega", "metodo_pagamento",
  "taxa_entrega", "desconto", "valor_total",
  "produto", "categoria", "quantidade", "preco_unitario", "total_item", "observacao",
];
const ORDER_SAMPLE_ROWS = [
  ["Maria Silva","11999990000","maria@email.com","P-001","10/04/2026","delivery","pix","8,00","0","42,00","Temaki Salmão","Sushi","1","26,00","26,00","Sem cebolinha"],
  ["Maria Silva","11999990000","maria@email.com","P-001","10/04/2026","delivery","pix","8,00","0","42,00","Coca-Cola 350ml","Bebidas","1","8,00","8,00",""],
  ["João Souza","11988887777","joao@email.com","P-002","12/04/2026","pickup","cartao","0","0","58,00","Combo Família","Combos","1","58,00","58,00","Bem passado"],
];

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (cell: string) => {
    if (/[,;"\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
    return cell;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "customers_orders";

  let csv: string;
  let filename: string;

  if (type === "customers") {
    csv = toCsv(CUSTOMER_HEADERS, [CUSTOMER_SAMPLE_ROW]);
    filename = "modelo-importacao-clientes.csv";
  } else {
    // orders + customers_orders both use the unified template
    csv = toCsv(ORDER_HEADERS, ORDER_SAMPLE_ROWS);
    filename = "modelo-importacao-pedidos.csv";
  }

  // UTF-8 BOM so Excel recognizes encoding
  const body = "﻿" + csv;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}
