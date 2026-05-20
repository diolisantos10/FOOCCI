import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import * as XLSX from "xlsx";
import { autoDetect, normalizeHeader } from "@/services/crm/UniversalFieldMapper";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  const fileName = (file as File).name.toLowerCase();
  const isCSV  = fileName.endsWith(".csv");
  const isXLSX = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

  if (!isCSV && !isXLSX) {
    return NextResponse.json({ error: "Formato não suportado. Use CSV ou XLSX." }, { status: 400 });
  }

  const buffer = Buffer.from(await (file as File).arrayBuffer());

  try {
    const wb = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!ws) return NextResponse.json({ error: "Planilha vazia" }, { status: 400 });

    const rawData = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    if (rawData.length < 2) {
      return NextResponse.json({ error: "Arquivo sem dados suficientes" }, { status: 400 });
    }

    const headerRow = rawData[0] as unknown[];
    const headers = headerRow.map((h) => String(h ?? "").trim()).filter(Boolean);

    if (headers.length === 0) {
      return NextResponse.json({ error: "Nenhum cabeçalho encontrado" }, { status: 400 });
    }

    // Up to 5 sample rows (skip header)
    const dataRows = rawData.slice(1, 6) as unknown[][];
    const sampleRows = dataRows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] != null ? String(row[i]).trim() : "";
      });
      return obj;
    });

    const detected = autoDetect(headers, sampleRows);

    return NextResponse.json({
      headers,
      normalizedHeaders: headers.map(normalizeHeader),
      detected,
      sampleRows,
      totalRows: rawData.length - 1,
    });
  } catch (err) {
    console.error("[detect-mapping]", err);
    return NextResponse.json({ error: "Falha ao processar arquivo" }, { status: 400 });
  }
}
