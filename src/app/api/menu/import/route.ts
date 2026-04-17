export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { badRequest, unauthorized, serverError, ok } from "@/lib/api-response";

// ── Shared types (re-used by confirm route and UI) ────────────────────────────

export type RowStatus = "valid" | "error" | "skipped";

export type RowResult = {
  rowIndex: number; // 1-based spreadsheet row number
  foto: string;
  categoria: string;
  nome: string;
  descricao: string;
  precoRaw: string;
  preco: number;
  status: RowStatus;
  errors: string[];
};

export type ImportPreview = {
  rows: RowResult[]; // only non-skipped rows
  categories: string[]; // ordered unique category names from valid rows
  missingColumns: string[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
    skipped: number;
  };
};

// ── Price normaliser ──────────────────────────────────────────────────────────
// Handles: "R$ 42,90" / "42,90" / "42.90" / "1.234,90" / numeric cells

export function normalizePrice(raw: unknown): { value: number; valid: boolean } {
  if (raw === null || raw === undefined || raw === "") {
    return { value: 0, valid: false };
  }
  if (typeof raw === "number") {
    return { value: isNaN(raw) ? 0 : raw, valid: !isNaN(raw) && raw > 0 };
  }
  let s = String(raw).replace(/R\$\s*/gi, "").replace(/\s/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // "1.234,90" → dots are thousands separators
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // "42,90"
    s = s.replace(",", ".");
  }
  // else: "42.90" or bare number — parseFloat handles it

  const n = parseFloat(s);
  return { value: isNaN(n) ? 0 : n, valid: !isNaN(n) && n > 0 };
}

// ── Column detection ──────────────────────────────────────────────────────────

type ColMap = {
  foto?: number;
  categoria?: number;
  nome?: number;
  descricao?: number;
  preco?: number;
};

function normalizeHeader(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const FOTO_KEYS = new Set(["foto", "imagem", "image", "img", "foto / imagem"]);
const CAT_KEYS = new Set(["categoria", "category", "cat", "grupo", "group"]);
const NOME_KEYS = new Set([
  "nome do item",
  "nome",
  "item",
  "produto",
  "name",
  "product",
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
  "observacao do item",
]);
const PRECO_KEYS = new Set([
  "preco",
  "price",
  "valor",
  "value",
  "custo",
  "cost",
]);

function detectColumns(headerRow: unknown[]): ColMap {
  const map: ColMap = {};
  headerRow.forEach((h, i) => {
    const k = normalizeHeader(h);
    if (FOTO_KEYS.has(k)) map.foto = i;
    else if (CAT_KEYS.has(k)) map.categoria = i;
    else if (NOME_KEYS.has(k)) map.nome = i;
    else if (DESC_KEYS.has(k)) map.descricao = i;
    else if (PRECO_KEYS.has(k)) map.preco = i;
  });
  return map;
}

// ── Parser ────────────────────────────────────────────────────────────────────

async function parseSpreadsheet(buffer: Buffer): Promise<ImportPreview> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0] ?? "";
  const ws = wb.Sheets[sheetName] ?? {};
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  });

  // Detect header row (first 5 rows)
  let headerIdx = -1;
  let colMap: ColMap = {};

  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const r = raw[i];
    if (!r) continue;
    const m = detectColumns(r);
    // Consider a header found if at least 2 known columns are mapped
    const mapped = Object.keys(m).length;
    if (mapped >= 2) {
      colMap = m;
      headerIdx = i;
      break;
    }
  }

  // Check which required columns are missing
  const missingColumns: string[] = [];
  if (colMap.categoria === undefined) missingColumns.push("Categoria");
  if (colMap.nome === undefined) missingColumns.push("Nome do Item");
  if (colMap.preco === undefined) missingColumns.push("Preço");

  const rows: RowResult[] = [];
  const categoriesSet = new Set<string>();
  const categoriesOrder: string[] = [];
  let skippedCount = 0;

  const dataRows = headerIdx >= 0 ? raw.slice(headerIdx + 1) : raw;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row) continue;

    const rowIndex = headerIdx + i + 2; // 1-based spreadsheet number

    const get = (idx: number | undefined): string =>
      idx !== undefined ? String(row[idx] ?? "").trim() : "";

    const foto = get(colMap.foto);
    const categoria = get(colMap.categoria);
    const nome = get(colMap.nome);
    const descricao = get(colMap.descricao);
    const rawCell = colMap.preco !== undefined ? row[colMap.preco] : "";
    const precoRaw = String(rawCell ?? "").trim();

    // Skip entirely empty rows
    const allEmpty = !foto && !categoria && !nome && !descricao && !precoRaw;
    if (allEmpty) {
      skippedCount++;
      continue;
    }

    // Validate
    const errors: string[] = [];
    if (!categoria) errors.push("Categoria ausente");
    if (!nome) errors.push("Nome do item ausente");

    const { value: preco, valid: precoValid } = normalizePrice(rawCell);
    if (!precoValid) {
      errors.push(
        precoRaw ? `Preço inválido: "${precoRaw}"` : "Preço ausente"
      );
    }

    const status: RowStatus = errors.length > 0 ? "error" : "valid";

    if (status === "valid" && categoria) {
      if (!categoriesSet.has(categoria)) {
        categoriesSet.add(categoria);
        categoriesOrder.push(categoria);
      }
    }

    rows.push({
      rowIndex,
      foto,
      categoria,
      nome,
      descricao,
      precoRaw,
      preco,
      status,
      errors,
    });
  }

  return {
    rows,
    categories: categoriesOrder,
    missingColumns,
    stats: {
      total: rows.length,
      valid: rows.filter((r) => r.status === "valid").length,
      invalid: rows.filter((r) => r.status === "error").length,
      skipped: skippedCount,
    },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    if (!file) return badRequest("Nenhum arquivo enviado.");

    const name = file.name.toLowerCase();
    const accepted =
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      name.endsWith(".csv") ||
      file.type.includes("spreadsheet") ||
      file.type.includes("excel") ||
      file.type === "text/csv" ||
      file.type === "application/csv";

    if (!accepted) {
      return badRequest("Use .xlsx, .xls ou .csv. PDF não é suportado neste modo.");
    }
    if (file.size > MAX_BYTES) {
      return badRequest("Arquivo muito grande (máx 20 MB).");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await parseSpreadsheet(buffer);
    return ok(preview);
  } catch (e) {
    console.error("[POST /api/menu/import]", e);
    return serverError("Erro ao processar arquivo.");
  }
}
