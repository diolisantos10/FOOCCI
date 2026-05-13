import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import * as XLSX from "xlsx";

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
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const fileName = (file as File).name.toLowerCase();
  const isCSV  = fileName.endsWith(".csv");
  const isXLSX = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

  if (!isCSV && !isXLSX) {
    return NextResponse.json(
      { error: "Formato não suportado. Use CSV ou XLSX." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await (file as File).arrayBuffer());

  let rows: Record<string, string>[] = [];
  let duplicateHeaders: string[] = [];

  try {
    const wb = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!ws) {
      return NextResponse.json({ error: "Planilha vazia" }, { status: 400 });
    }

    // Get raw 2D array; first row = headers
    const rawData = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    if (rawData.length < 2) {
      return NextResponse.json(
        { error: "Arquivo não contém dados suficientes" },
        { status: 400 }
      );
    }

    const headerRow = rawData[0] as unknown[];
    const rawHeaders = headerRow.map((h) => String(h ?? "").trim());

    // Detect and rename duplicate headers: second occurrence → "key_2"
    const seenHeaders = new Map<string, number>();
    const headers = rawHeaders.map((h) => {
      const count = (seenHeaders.get(h) ?? 0) + 1;
      seenHeaders.set(h, count);
      if (count === 2) duplicateHeaders.push(h);
      return count === 1 ? h : `${h}_2`;
    });

    // Remaining rows → objects keyed by header
    rows = (rawData.slice(1) as unknown[][]).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        const cell = row[i];
        obj[h] = cell != null ? String(cell).trim() : "";
      });
      return obj;
    });

    // Drop completely empty rows
    rows = rows.filter((r) => Object.values(r).some((v) => v !== ""));
  } catch (err) {
    console.error("[import/parse]", err);
    return NextResponse.json(
      { error: "Falha ao processar arquivo" },
      { status: 400 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma linha de dados encontrada no arquivo" },
      { status: 400 }
    );
  }

  const columns = Object.keys(rows[0] ?? {});

  return NextResponse.json({ columns, rows, totalRows: rows.length, duplicateHeaders });
}
