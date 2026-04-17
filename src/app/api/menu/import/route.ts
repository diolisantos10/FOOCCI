export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { badRequest, unauthorized, serverError, ok } from "@/lib/api-response";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export type ParsedItem = { name: string; description: string; price: number };
export type ParsedCategory = { name: string; items: ParsedItem[] };
export type ParseResult = { categories: ParsedCategory[]; warnings: string[] };

// ── Price normalizer ──────────────────────────────────────────────────────────

function normalizePrice(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  const s = String(raw)
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:[,.]|$))/g, "") // strip thousand-separators (1.000 → 1000)
    .replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── Header detector ───────────────────────────────────────────────────────────

type ColMap = {
  categoria?: number;
  nome?: number;
  descricao?: number;
  preco?: number;
};

function normalizeKey(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const CATEGORY_KEYS = new Set([
  "categoria",
  "category",
  "cat",
  "grupo",
  "group",
  "secao",
  "seccao",
]);
const NAME_KEYS = new Set([
  "nome",
  "item",
  "produto",
  "product",
  "name",
  "titulo",
  "title",
]);
const DESC_KEYS = new Set([
  "descricao",
  "description",
  "desc",
  "detalhe",
  "detalhes",
  "observacao",
]);
const PRICE_KEYS = new Set([
  "preco",
  "price",
  "valor",
  "value",
  "custo",
  "cost",
]);

function detectHeaders(row: unknown[]): ColMap | null {
  const map: ColMap = {};
  row.forEach((h, i) => {
    const k = normalizeKey(h);
    if (CATEGORY_KEYS.has(k)) map.categoria = i;
    else if (NAME_KEYS.has(k)) map.nome = i;
    else if (DESC_KEYS.has(k)) map.descricao = i;
    else if (PRICE_KEYS.has(k)) map.preco = i;
  });
  return map.nome !== undefined ? map : null;
}

// ── Excel / CSV parser ────────────────────────────────────────────────────────

async function parseSpreadsheet(buffer: Buffer): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0] ?? "";
  const ws = wb.Sheets[sheetName] ?? {};
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  });

  const warnings: string[] = [];
  const catMap = new Map<string, ParsedItem[]>();
  let colMap: ColMap = {};
  let headerIdx = -1;

  // Try to detect header row in the first 5 rows
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i];
    if (!r) continue;
    const m = detectHeaders(r);
    if (m) {
      colMap = m;
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    warnings.push(
      "Cabeçalhos não reconhecidos — assumindo ordem: Categoria | Nome | Descrição | Preço"
    );
    colMap = { categoria: 0, nome: 1, descricao: 2, preco: 3 };
    headerIdx = 0;
  }

  let lastCat = "Geral";

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const isEmpty = row.every((c) => String(c ?? "").trim() === "");
    if (isEmpty) continue;

    const catIdx = colMap.categoria;
    const nameIdx = colMap.nome;
    const descIdx = colMap.descricao;
    const priceIdx = colMap.preco;

    const cat = catIdx !== undefined ? String(row[catIdx] ?? "").trim() : "";
    const name = nameIdx !== undefined ? String(row[nameIdx] ?? "").trim() : "";
    const desc = descIdx !== undefined ? String(row[descIdx] ?? "").trim() : "";
    const rawPrice = priceIdx !== undefined ? row[priceIdx] : "";

    // Row with only a category column filled → category separator
    if (!name) {
      if (cat) lastCat = cat;
      continue;
    }

    const categoryKey = cat || lastCat;
    if (cat) lastCat = cat;

    const price = normalizePrice(rawPrice);
    if (price <= 0) {
      warnings.push(
        `Linha ${i + 1}: preço inválido ("${rawPrice}") — adicionado com preço 0.`
      );
    }

    if (!catMap.has(categoryKey)) catMap.set(categoryKey, []);
    catMap.get(categoryKey)!.push({ name, description: desc, price });
  }

  const categories: ParsedCategory[] = [];
  for (const [catName, items] of catMap) {
    categories.push({ name: catName, items });
  }

  if (categories.length === 0) {
    warnings.push("Nenhum item encontrado na planilha. Verifique as colunas.");
  }

  return { categories, warnings };
}

// ── PDF parser ────────────────────────────────────────────────────────────────

// Price pattern: matches "R$ 42,90" / "42.90" / "42,90" / "42,9"
const PRICE_RX =
  /(?:R\$\s*)?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{1,2})/;

async function parsePdfFile(buffer: Buffer): Promise<ParseResult> {
  let text = "";
  try {
    // Use internal lib path to avoid Next.js + pdf-parse test-fixture issue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse: (buf: Buffer) => Promise<{ text: string }> = (
      await import("pdf-parse/lib/pdf-parse.js" as string)
    ).default;
    const result = await pdfParse(buffer);
    text = result.text ?? "";
  } catch {
    return {
      categories: [],
      warnings: [
        "Não foi possível extrair texto do PDF. Tente uma planilha .xlsx ou .csv.",
      ],
    };
  }

  const warnings: string[] = [
    "Importação por PDF é aproximada — revise todos os itens antes de confirmar.",
  ];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const categories: ParsedCategory[] = [];
  let current: ParsedCategory | null = null;

  for (const line of lines) {
    if (line.length > 200) continue; // skip page headers / footers

    const priceMatch = line.match(PRICE_RX);

    if (priceMatch?.[1]) {
      // Line contains a price → treat as item
      const priceStr = priceMatch[1]
        .replace(/\.(?=\d{3})/g, "")
        .replace(",", ".");
      const price = parseFloat(priceStr);
      const name = line
        .replace(priceMatch[0], "")
        .replace(/\.{2,}/g, " ")
        .replace(/_{2,}/g, " ")
        .trim();
      if (!name || name.length < 2) continue;

      if (!current) {
        current = { name: "Geral", items: [] };
        categories.push(current);
      }
      current.items.push({ name, description: "", price: isNaN(price) ? 0 : price });
    } else {
      // Heuristic: short, ALL-CAPS or Title-like line → category heading
      const isAllCaps =
        line === line.toUpperCase() && /[A-ZÁÉÍÓÚÃÕÇ]/.test(line);
      const isShort = line.length <= 60;
      const fewWords = line.split(/\s+/).length <= 5;

      if (isShort && (isAllCaps || fewWords) && !line.includes(".")) {
        current = { name: line, items: [] };
        categories.push(current);
      }
    }
  }

  const filled = categories.filter((c) => c.items.length > 0);
  if (filled.length === 0) {
    warnings.push(
      "Nenhum item identificado no PDF. Tente um arquivo .xlsx ou .csv para melhores resultados."
    );
  }

  return { categories: filled.length > 0 ? filled : categories, warnings };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    if (!file) return badRequest("Nenhum arquivo enviado.");

    const name = file.name.toLowerCase();
    const isPdf =
      file.type === "application/pdf" || name.endsWith(".pdf");
    const isSpreadsheet =
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      name.endsWith(".csv") ||
      file.type.includes("spreadsheet") ||
      file.type.includes("excel") ||
      file.type === "text/csv" ||
      file.type === "application/csv";

    if (!isPdf && !isSpreadsheet) {
      return badRequest(
        "Formato não suportado. Use .xlsx, .xls, .csv ou .pdf."
      );
    }

    if (file.size > MAX_BYTES) {
      return badRequest("Arquivo muito grande (máximo 20 MB).");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = isPdf
      ? await parsePdfFile(buffer)
      : await parseSpreadsheet(buffer);

    return ok(result);
  } catch (e) {
    console.error("[POST /api/menu/import]", e);
    return serverError("Erro ao processar arquivo.");
  }
}
