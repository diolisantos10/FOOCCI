/**
 * SaiposNemoImportService
 *
 * Parses, matches, and imports customer + product sales data from:
 *   1. BASE CLIENTES SAIPOS.xlsx   — master customer base (POS/operations)
 *   2. RelatórioClientesDetalhado NEMO.xlsx — delivery app customers (complement)
 *   3. ItensVendidos SAIPOS.xlsx   — aggregate sold items report (no customer link)
 *
 * Safe guards:
 *   - Saipos is the master for sales metrics; Nemo does NOT add totals.
 *   - No fake Orders / OrderItems are created from aggregate sales data.
 *   - Customers without valid phone are skipped (marked SEM_TELEFONE).
 *   - Preview mode never writes to DB.
 *   - Execution requires an explicit jobId from a prior preview call.
 */

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

// ── Public types ───────────────────────────────────────────────────────────────

export interface SaiposCustomerRow {
  nome: string | null;
  cpfCnpj: string | null;
  dataAniversario: Date | null;
  email: string | null;
  rawPhone: string;
  normalizedPhone: string | null;
  endereco: string | null;
  complemento: string | null;
  qtdPedidos: number | null;
  valorTotal: number | null;
  ticketMedio: number | null;
  ultimaCompra: Date | null;
  saldoTotal: number | null;
  saldoPeriodo: number | null;
  observacao: string | null;
  rowIndex: number;
}

export interface NemoAddressGroup {
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  complement: string | null;
  reference: string | null;
  state: string | null;
  zipCode: string | null;
}

export interface NemoCustomerRow {
  nome: string | null;
  cpf: string | null;
  rawPhone: string;
  normalizedPhone: string | null;
  email: string | null;
  aniversario: Date | null;
  pedidos: number | null;
  addresses: NemoAddressGroup[];
  rowIndex: number;
}

export type ProductRowType = "CATEGORY" | "PRODUCT";

export interface ProductSalesRow {
  rowType: ProductRowType;
  categoryName: string;
  productName: string | null;
  quantitySold: number;
  grossRevenue: number;
  percent: number | null;
}

export interface SoldItemsMeta {
  periodStart: Date | null;
  periodEnd: Date | null;
  reportTypes: string | null;
}

export interface DuplicateAggregateGroup {
  categoryName: string;
  productName: string | null;
  rowType: ProductRowType;
  originalCount: number;
  totalQuantitySold: number;
  totalGrossRevenue: number;
}

export interface SoldItemsResult {
  meta: SoldItemsMeta;
  rows: ProductSalesRow[];           // already consolidated — safe to insert
  categoryCount: number;
  productCount: number;
  totalQuantity: number;
  totalRevenue: number;
  originalRowCount: number;          // raw row count before consolidation
  consolidatedRowCount: number;      // rows removed (duplicate keys merged)
  duplicateGroups: DuplicateAggregateGroup[];
}

export interface MergedCustomer {
  name: string;
  phone: string;           // non-null: contactable customers always have a phone
  document: string | null;
  email: string | null;
  birthDate: Date | null;
  importedOrderCount: number | null;
  importedTotalSpent: number | null;
  averageTicket: number | null;
  importedLastOrderAt: Date | null;
  financialBalance: number | null;
  financialBalancePeriod: number | null;
  notes: string | null;
  addresses: NemoAddressGroup[];
  sourceSystems: string[];
  importStatus: "READY" | "NEEDS_REVIEW" | "DUPLICATE_CONFLICT";
  crmContactable: true;    // always true — contactable customers have a phone
  sourceSystem: string;    // "SAIPOS" | "NEMO" | "SAIPOS+NEMO"
}

export interface NoPhoneImportableCustomer {
  name: string;
  document: string | null;
  email: string | null;
  birthDate: Date | null;
  importedOrderCount: number | null;
  importedTotalSpent: number | null;
  averageTicket: number | null;
  importedLastOrderAt: Date | null;
  financialBalance: number | null;
  financialBalancePeriod: number | null;
  notes: string | null;
  addresses: NemoAddressGroup[];
  sourceSystems: string[];
  /**
   * DOCUMENT  — matched to an existing customer by CPF/CNPJ
   * EMAIL     — matched by email
   * NAME_ADDRESS — matched by name + primary street address
   * CREATE    — no match found; will create a new record
   * NEEDS_REVIEW — ambiguous (multiple potential matches or conflicting data)
   */
  dedupStrategy: "DOCUMENT" | "EMAIL" | "NAME_ADDRESS" | "CREATE" | "NEEDS_REVIEW";
}

export interface NoPhoneCustomer {
  nome: string | null;
  cpfCnpj: string | null;
  email: string | null;
  rawPhone: string;
  qtdPedidos: number | null;
  valorTotal: number | null;
}

export interface MatchStats {
  saiposTotal: number;
  nemoTotal: number;
  saiposWithPhone: number;
  nemoWithPhone: number;
  phoneMatches: number;
  saiposOnly: number;
  nemoOnly: number;
  noPhoneCount: number;            // total no-phone rows (importable + skipped)
  noPhoneImportableCount: number;  // will be imported as non-contactable CRM records
  noPhoneSkippedCount: number;     // insufficient data — truly skipped
  noPhoneNeedsReviewCount: number; // ambiguous within-batch duplicates flagged NEEDS_REVIEW
  noPhoneWithDocument: number;     // importable rows that have a CPF/CNPJ
  noPhoneWithEmail: number;        // importable rows that have an email
  noPhoneWithAddress: number;      // importable rows that have an address
  conflictCount: number;
  readyCount: number;
  needsReviewCount: number;
}

export interface MatchResult {
  merged: MergedCustomer[];
  noPhone: NoPhoneCustomer[];                      // skipped (insufficient data)
  noPhoneImportable: NoPhoneImportableCustomer[];  // will be imported as non-contactable
  stats: MatchStats;
}

export interface SaiposNemoPreview {
  stats: MatchStats;
  periodStart: string | null;
  periodEnd: string | null;
  categoryCount: number;
  productCount: number;
  totalQuantity: number;
  totalRevenue: number;
  originalProductRowCount: number;
  consolidatedRowCount: number;
  duplicateAggregateGroupsCount: number;
  duplicateAggregateGroups: DuplicateAggregateGroup[];
  sampleMerged: MergedCustomer[];
  sampleNoPhone: NoPhoneCustomer[];
  sampleNoPhoneImportable: NoPhoneImportableCustomer[];
  topProducts: ProductSalesRow[];
  noPhoneWarning: string;
  importMode: "RAW_FILES" | "COMPILED_WORKBOOK";
}

export interface StoredReport {
  merged: MergedCustomer[];
  noPhone: NoPhoneCustomer[];                      // skipped (insufficient data)
  noPhoneImportable: NoPhoneImportableCustomer[];  // will be imported as non-contactable
  soldRows: ProductSalesRow[];
  soldMeta: SoldItemsMeta;
  preview: SaiposNemoPreview;
}

export interface SaiposNemoExecuteResult {
  contactableCustomersCreated: number;
  contactableCustomersUpdated: number;
  nonContactableCustomersCreated: number;
  nonContactableCustomersUpdated: number;
  noPhoneSkippedInsufficientData: number;
  addressesCreated: number;
  productAggregatesCreated: number;
  productAggregatesSkipped: number;
}

// ── Private helpers ────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits || digits.length < 8) return null;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`;
  if (digits.length <= 15) return `+${digits}`;
  return null;
}

// Normalize column name: strip diacritics, lowercase, collapse spaces
function nc(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s/.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanName(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const cleaned = raw.trim().replace(/\s+/g, " ").trim();
  // Reject generic/junk names
  const junk = /^[.\-_/\\0 ]+$|^cliente$/i;
  if (junk.test(cleaned) || cleaned.length < 2) return null;
  return cleaned;
}

function parseDateField(raw: string | undefined | null): Date | null {
  if (!raw?.trim()) return null;
  const v = raw.trim();
  // DD/MM/YYYY
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br?.[1] && br[2] && br[3]) {
    const d = new Date(`${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d;
  }
  // ISO / other
  const iso = new Date(v);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

function parseDecimalField(raw: string | undefined | null): number | null {
  if (!raw?.trim()) return null;
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function parseIntField(raw: string | undefined | null): number | null {
  if (!raw?.trim()) return null;
  const n = parseInt(raw.trim().replace(/\D/g, ""), 10);
  return isNaN(n) ? null : n;
}

function pickBestName(a: string | null, b: string | null): string | null {
  const ca = cleanName(a);
  const cb = cleanName(b);
  if (!ca && !cb) return null;
  if (!ca) return cb;
  if (!cb) return ca;
  // Prefer longer, more complete name
  return ca.length >= cb.length ? ca : cb;
}

interface ColInfo {
  rawHeader: string;
  normalizedBase: string;
  occurrence: number;
  colIndex: number;
}

function buildColInfos(headerRow: unknown[]): ColInfo[] {
  const occurrences = new Map<string, number>();
  return headerRow.map((h, i) => {
    const raw = String(h ?? "").trim();
    // Strip "__N" suffix that Excel/parse route may add for duplicates
    const base = nc(raw.replace(/__\d+$/, ""));
    const occ = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occ);
    return { rawHeader: raw, normalizedBase: base, occurrence: occ, colIndex: i };
  });
}

function findColIdx(colInfos: ColInfo[], keys: string[], occurrence = 1): number {
  const info = colInfos.find(c => keys.includes(c.normalizedBase) && c.occurrence === occurrence);
  return info?.colIndex ?? -1;
}

function cellStr(row: unknown[], idx: number): string {
  if (idx < 0 || idx >= row.length) return "";
  const v = row[idx];
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "").trim();
}

function cellDate(row: unknown[], idx: number): Date | null {
  if (idx < 0 || idx >= row.length) return null;
  const v = row[idx];
  if (v instanceof Date) return v;
  return parseDateField(String(v ?? ""));
}

// ── Saipos customer parser ─────────────────────────────────────────────────────

export function parseSaiposFile(buffer: Buffer): SaiposCustomerRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  // Prefer sheet named "Clientes", fallback to first
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("cliente")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName!];
  if (!ws) return [];

  const raw2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (raw2D.length < 2) return [];

  const colInfos = buildColInfos(raw2D[0] as unknown[]);

  const nomeIdx      = findColIdx(colInfos, ["nome"]);
  const cpfIdx       = findColIdx(colInfos, ["cpf/cnpj", "cpf cnpj", "cpf", "cnpj"]);
  const aniverIdx    = findColIdx(colInfos, ["data aniversario", "aniversario", "data aniversario"]);
  const emailIdx     = findColIdx(colInfos, ["email"]);
  const phoneIdx     = findColIdx(colInfos, ["telefone", "fone", "celular"]);
  const endIdx       = findColIdx(colInfos, ["endereco", "logradouro", "rua"]);
  const compIdx      = findColIdx(colInfos, ["complemento"]);
  const qtdIdx       = findColIdx(colInfos, ["qtd. pedidos", "qtd pedidos", "quantidade pedidos", "pedidos"]);
  const totalIdx     = findColIdx(colInfos, ["valor total", "total gasto", "total"]);
  const ticketIdx    = findColIdx(colInfos, ["ticket medio", "ticket medico"]);
  const lastOrderIdx = findColIdx(colInfos, ["ultima compra", "ultimo pedido", "ultima compra"]);
  // Saldo Financeiro: try specific names first, fall back to occurrence-based
  const saldoTotalIdx = (() => {
    let idx = findColIdx(colInfos, ["saldo financeiro total"]);
    if (idx < 0) idx = findColIdx(colInfos, ["saldo financeiro"], 1);
    return idx;
  })();
  const saldoPeriodoIdx = (() => {
    let idx = findColIdx(colInfos, ["saldo financeiro do periodo", "saldo financeiro periodo"]);
    if (idx < 0) idx = findColIdx(colInfos, ["saldo financeiro"], 2);
    return idx;
  })();
  const obsIdx = findColIdx(colInfos, ["observacao interna", "observacao", "obs"]);

  const rows: SaiposCustomerRow[] = [];
  for (let r = 1; r < raw2D.length; r++) {
    const row = raw2D[r] as unknown[];
    // Skip completely empty rows
    if (row.every(v => !v || String(v).trim() === "")) continue;

    const rawPhone = cellStr(row, phoneIdx);
    rows.push({
      nome:            cellStr(row, nomeIdx) || null,
      cpfCnpj:         cellStr(row, cpfIdx) || null,
      dataAniversario: cellDate(row, aniverIdx),
      email:           cellStr(row, emailIdx).toLowerCase() || null,
      rawPhone,
      normalizedPhone: normalizePhone(rawPhone),
      endereco:        cellStr(row, endIdx) || null,
      complemento:     cellStr(row, compIdx) || null,
      qtdPedidos:      parseIntField(cellStr(row, qtdIdx)),
      valorTotal:      parseDecimalField(cellStr(row, totalIdx)),
      ticketMedio:     parseDecimalField(cellStr(row, ticketIdx)),
      ultimaCompra:    cellDate(row, lastOrderIdx),
      saldoTotal:      parseDecimalField(cellStr(row, saldoTotalIdx)),
      saldoPeriodo:    parseDecimalField(cellStr(row, saldoPeriodoIdx)),
      observacao:      cellStr(row, obsIdx) || null,
      rowIndex:        r,
    });
  }
  return rows;
}

// ── Nemo customer parser ───────────────────────────────────────────────────────

const NEMO_ADDR_COLS: Record<string, string> = {
  "endereco":   "street",
  "numero":     "number",
  "bairro":     "neighborhood",
  "cidade":     "city",
  "complemento": "complement",
  "referencia": "reference",
  "estado":     "state",
  "cep":        "zipCode",
};

export function parseNemoFile(buffer: Buffer): NemoCustomerRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("cliente")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName!];
  if (!ws) return [];

  const raw2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (raw2D.length < 2) return [];

  const colInfos = buildColInfos(raw2D[0] as unknown[]);

  // Scalar columns
  const nomeIdx     = findColIdx(colInfos, ["nome"]);
  const cpfIdx      = findColIdx(colInfos, ["cpf"]);
  const phoneIdx    = findColIdx(colInfos, ["telefone", "fone", "celular"]);
  const emailIdx    = findColIdx(colInfos, ["email"]);
  const aniverIdx   = findColIdx(colInfos, ["aniversario"]);
  const pedidosIdx  = findColIdx(colInfos, ["pedidos"]);

  // Build address groups by tracking repeated address columns
  const addrColNorms = new Set(Object.keys(NEMO_ADDR_COLS));
  let maxGroups = 0;
  for (const [base, count] of (() => {
    const m = new Map<string, number>();
    colInfos.forEach(c => { if (addrColNorms.has(c.normalizedBase)) m.set(c.normalizedBase, Math.max(m.get(c.normalizedBase) ?? 0, c.occurrence)); });
    return m;
  })()) {
    void base;
    maxGroups = Math.max(maxGroups, count);
  }

  // groupColMap[groupIdx][fieldKey] = colIndex
  const groupColMap: Record<string, number>[] = Array.from({ length: maxGroups }, () => ({}));
  for (const info of colInfos) {
    if (addrColNorms.has(info.normalizedBase)) {
      const gi = info.occurrence - 1;
      groupColMap[gi] = groupColMap[gi] ?? {};
      groupColMap[gi][NEMO_ADDR_COLS[info.normalizedBase]!] = info.colIndex;
    }
  }

  const rows: NemoCustomerRow[] = [];
  for (let r = 1; r < raw2D.length; r++) {
    const row = raw2D[r] as unknown[];
    if (row.every(v => !v || String(v).trim() === "")) continue;

    // Parse all non-empty address groups
    const addresses: NemoAddressGroup[] = [];
    for (const groupCols of groupColMap) {
      const street = cellStr(row, groupCols["street"] ?? -1);
      if (!street) continue;
      const addr: NemoAddressGroup = {
        street,
        number:       cellStr(row, groupCols["number"] ?? -1) || null,
        neighborhood: cellStr(row, groupCols["neighborhood"] ?? -1) || null,
        city:         cellStr(row, groupCols["city"] ?? -1) || null,
        complement:   cellStr(row, groupCols["complement"] ?? -1) || null,
        reference:    cellStr(row, groupCols["reference"] ?? -1) || null,
        state:        cellStr(row, groupCols["state"] ?? -1) || null,
        zipCode:      cellStr(row, groupCols["zipCode"] ?? -1) || null,
      };
      // Dedup within same customer row
      const key = `${addr.street}|${addr.city}`;
      if (!addresses.some(a => `${a.street}|${a.city}` === key)) {
        addresses.push(addr);
      }
    }

    const rawPhone = cellStr(row, phoneIdx);
    rows.push({
      nome:           cellStr(row, nomeIdx) || null,
      cpf:            cellStr(row, cpfIdx) || null,
      rawPhone,
      normalizedPhone: normalizePhone(rawPhone),
      email:          cellStr(row, emailIdx).toLowerCase() || null,
      aniversario:    cellDate(row, aniverIdx),
      pedidos:        parseIntField(cellStr(row, pedidosIdx)),
      addresses,
      rowIndex: r,
    });
  }
  return rows;
}

// ── Product row consolidation ─────────────────────────────────────────────────

function consolidateProductRows(rows: ProductSalesRow[]): {
  consolidated: ProductSalesRow[];
  originalCount: number;
  removedCount: number;
  duplicateGroups: DuplicateAggregateGroup[];
} {
  const keyMap = new Map<string, ProductSalesRow[]>();
  for (const row of rows) {
    const key = `${row.rowType}::${row.categoryName}::${row.productName ?? ""}`;
    const group = keyMap.get(key) ?? [];
    group.push(row);
    keyMap.set(key, group);
  }

  const consolidated: ProductSalesRow[] = [];
  const duplicateGroups: DuplicateAggregateGroup[] = [];
  let removedCount = 0;

  for (const [, group] of keyMap) {
    if (group.length === 1) {
      consolidated.push(group[0]!);
    } else {
      const first = group[0]!;
      const totalQty = group.reduce((s, r) => s + r.quantitySold, 0);
      const totalRev = group.reduce((s, r) => s + r.grossRevenue, 0);
      consolidated.push({
        rowType:      first.rowType,
        categoryName: first.categoryName,
        productName:  first.productName,
        quantitySold: totalQty,
        grossRevenue: totalRev,
        percent:      first.percent,
      });
      duplicateGroups.push({
        categoryName:     first.categoryName,
        productName:      first.productName,
        rowType:          first.rowType,
        originalCount:    group.length,
        totalQuantitySold: totalQty,
        totalGrossRevenue: totalRev,
      });
      removedCount += group.length - 1;
    }
  }

  return { consolidated, originalCount: rows.length, removedCount, duplicateGroups };
}

// ── Saipos ItensVendidos parser ────────────────────────────────────────────────

function parsePeriodFromMetaRow(row: unknown[]): { start: Date | null; end: Date | null; types: string | null } {
  const line = row.map(v => String(v ?? "").trim()).filter(Boolean).join(" ");
  let start: Date | null = null;
  let end:   Date | null = null;
  let types: string | null = null;

  const startM = line.match(/Data\s+Inicial[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
  const endM   = line.match(/Data\s+Final[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
  const typeM  = line.match(/Tipo[:\s]+(.+?)(?:Data|$)/i);

  if (startM?.[1]) start = parseDateField(startM[1]);
  if (endM?.[1])   end   = parseDateField(endM[1]);
  if (typeM?.[1])  types = typeM[1].trim();

  return { start, end, types };
}

export function parseSoldItemsFile(buffer: Buffer): SoldItemsResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName!];
  if (!ws) return { meta: { periodStart: null, periodEnd: null, reportTypes: null }, rows: [], categoryCount: 0, productCount: 0, totalQuantity: 0, totalRevenue: 0, originalRowCount: 0, consolidatedRowCount: 0, duplicateGroups: [] };

  const raw2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (raw2D.length < 2) return { meta: { periodStart: null, periodEnd: null, reportTypes: null }, rows: [], categoryCount: 0, productCount: 0, totalQuantity: 0, totalRevenue: 0, originalRowCount: 0, consolidatedRowCount: 0, duplicateGroups: [] };

  // First row(s) contain metadata; scan for period
  let metaStart: Date | null = null;
  let metaEnd:   Date | null = null;
  let metaTypes: string | null = null;
  let dataStartRow = 0;

  for (let r = 0; r < Math.min(5, raw2D.length); r++) {
    const row = raw2D[r] as unknown[];
    const line = row.map(v => String(v ?? "").trim()).join(" ");
    if (line.match(/Data\s+Inicial/i)) {
      const { start, end, types } = parsePeriodFromMetaRow(row);
      if (start) metaStart = start;
      if (end)   metaEnd   = end;
      if (types) metaTypes = types;
    }
    // Find the actual header/data start row: first row where col A is not metadata-like
    // Data rows: col A is category name (no leading "-") or product name (leading "- ")
    if (r > 0 && line.match(/Quantidade|Qtd|Valor/i)) {
      dataStartRow = r + 1;
      break;
    }
    if (r === 1) dataStartRow = 2; // safe default: skip first 2 rows
  }

  // Detect column positions from the header row (if found) or use positional defaults
  let nameColIdx = 0;
  let qtyColIdx  = 1;
  let revColIdx  = 2;
  let pctColIdx  = 3;

  if (dataStartRow > 1) {
    const headerRow = raw2D[dataStartRow - 1] as unknown[];
    const hInfos = buildColInfos(headerRow);
    const qIdx = findColIdx(hInfos, ["quantidade", "qtd", "qtde"]);
    const rIdx = findColIdx(hInfos, ["valor bruto", "valor total", "total", "valor"]);
    const pIdx = findColIdx(hInfos, ["participacao", "participacao %", "%", "perc"]);
    if (qIdx >= 0) qtyColIdx = qIdx;
    if (rIdx >= 0) revColIdx = rIdx;
    if (pIdx >= 0) pctColIdx = pIdx;
  }

  const productRows: ProductSalesRow[] = [];
  let currentCategory = "";
  let categoryCount = 0;
  let productCount  = 0;
  let totalQuantity = 0;
  let totalRevenue  = 0;

  for (let r = dataStartRow; r < raw2D.length; r++) {
    const row = raw2D[r] as unknown[];
    const rawName = cellStr(row, nameColIdx);
    if (!rawName) continue;

    const isProduct = rawName.startsWith("- ");
    const displayName = isProduct ? rawName.replace(/^-\s*/, "").trim() : rawName.trim();

    const qty = parseDecimalField(cellStr(row, qtyColIdx)) ?? 0;
    const rev = parseDecimalField(cellStr(row, revColIdx)) ?? 0;
    const pct = parseDecimalField(cellStr(row, pctColIdx));

    if (!isProduct) {
      currentCategory = displayName;
      categoryCount++;
      productRows.push({ rowType: "CATEGORY", categoryName: displayName, productName: null, quantitySold: qty, grossRevenue: rev, percent: pct });
      totalQuantity += qty;
      totalRevenue  += rev;
    } else {
      if (!currentCategory) continue; // orphan product row, skip
      productCount++;
      productRows.push({ rowType: "PRODUCT", categoryName: currentCategory, productName: displayName, quantitySold: qty, grossRevenue: rev, percent: pct });
      // Don't double-count: category rows already sum products
    }
  }

  // Use category totals for global sums (already counted above in CATEGORY rows)
  const catRows = productRows.filter(r => r.rowType === "CATEGORY");
  totalQuantity = catRows.reduce((s, r) => s + r.quantitySold, 0);
  totalRevenue  = catRows.reduce((s, r) => s + r.grossRevenue, 0);

  const { consolidated, originalCount, removedCount, duplicateGroups } = consolidateProductRows(productRows);

  return {
    meta: { periodStart: metaStart, periodEnd: metaEnd, reportTypes: metaTypes },
    rows: consolidated,
    categoryCount,
    productCount,
    totalQuantity,
    totalRevenue,
    originalRowCount: originalCount,
    consolidatedRowCount: removedCount,
    duplicateGroups,
  };
}

// ── Customer matching + merging ────────────────────────────────────────────────

function mergeSaiposGroup(rows: SaiposCustomerRow[]): SaiposCustomerRow {
  const best = { ...rows[0]! };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    if (!best.nome && r.nome) best.nome = r.nome;
    if (!best.cpfCnpj && r.cpfCnpj) best.cpfCnpj = r.cpfCnpj;
    if (!best.email && r.email) best.email = r.email;
    if (!best.dataAniversario && r.dataAniversario) best.dataAniversario = r.dataAniversario;
    if (!best.endereco && r.endereco) best.endereco = r.endereco;
    if (best.qtdPedidos === null && r.qtdPedidos !== null) best.qtdPedidos = r.qtdPedidos;
    if (best.valorTotal === null && r.valorTotal !== null) best.valorTotal = r.valorTotal;
    if (best.ultimaCompra === null && r.ultimaCompra !== null) best.ultimaCompra = r.ultimaCompra;
    if (best.saldoTotal === null && r.saldoTotal !== null) best.saldoTotal = r.saldoTotal;
    if (best.saldoPeriodo === null && r.saldoPeriodo !== null) best.saldoPeriodo = r.saldoPeriodo;
    if (!best.observacao && r.observacao) best.observacao = r.observacao;
  }
  return best;
}

function buildSaiposAddresses(s: SaiposCustomerRow): NemoAddressGroup[] {
  if (!s.endereco) return [];
  // Saipos may store multiple addresses separated by ";"
  const parts = s.endereco.split(";").map(p => p.trim()).filter(Boolean);
  return parts.map(street => ({
    street,
    number: null,
    neighborhood: null,
    city: null,
    complement: s.complemento ?? null,
    reference: null,
    state: null,
    zipCode: null,
  }));
}

function buildMergedRecord(saipos: SaiposCustomerRow, nemoRows: NemoCustomerRow[]): MergedCustomer {
  const saiposName = cleanName(saipos.nome);
  const nemoName   = nemoRows.length > 0 ? cleanName(nemoRows[0]?.nome ?? null) : null;
  const name = pickBestName(saiposName, nemoName) ?? saipos.nome?.trim() ?? "Sem nome";

  const document =
    (saipos.cpfCnpj?.replace(/\D/g, "") || null) ??
    (nemoRows[0]?.cpf?.replace(/\D/g, "") || null);

  const email =
    (saipos.email?.trim() || null) ??
    (nemoRows.find(r => r.email)?.email ?? null);

  const birthDate = saipos.dataAniversario ?? (nemoRows[0]?.aniversario ?? null);

  // Saipos is master for all metrics
  const importedOrderCount = saipos.qtdPedidos ?? (nemoRows[0]?.pedidos ?? null);
  const importedTotalSpent = saipos.valorTotal ?? null;
  const averageTicket = saipos.ticketMedio ??
    (importedTotalSpent && importedOrderCount && importedOrderCount > 0
      ? Math.round((importedTotalSpent / importedOrderCount) * 100) / 100
      : null);

  // Notes: include sources
  const notesParts: string[] = [];
  if (saipos.observacao) notesParts.push(`[Saipos] ${saipos.observacao}`);
  if (nemoRows.length > 0) notesParts.push(`[Fontes: SAIPOS+NEMO]`);
  else notesParts.push(`[Fonte: SAIPOS]`);

  // Addresses: prefer Nemo structured addresses; fallback to Saipos text
  const nemoAddrs = nemoRows.flatMap(r => r.addresses);
  const addresses = nemoAddrs.length > 0 ? nemoAddrs : buildSaiposAddresses(saipos);

  return {
    name,
    phone: saipos.normalizedPhone!,
    document: document?.length ? document : null,
    email,
    birthDate,
    importedOrderCount,
    importedTotalSpent,
    averageTicket,
    importedLastOrderAt: saipos.ultimaCompra ?? null,
    financialBalance: saipos.saldoTotal ?? null,
    financialBalancePeriod: saipos.saldoPeriodo ?? null,
    notes: notesParts.join("\n") || null,
    addresses,
    sourceSystems: nemoRows.length > 0 ? ["SAIPOS", "NEMO"] : ["SAIPOS"],
    importStatus: "READY",
    crmContactable: true,
    sourceSystem: nemoRows.length > 0 ? "SAIPOS+NEMO" : "SAIPOS",
  };
}

function buildNemoOnlyRecord(nemo: NemoCustomerRow): MergedCustomer {
  const name = cleanName(nemo.nome) ?? "Sem nome";
  const document = nemo.cpf?.replace(/\D/g, "") || null;
  return {
    name,
    phone: nemo.normalizedPhone!,
    document: document?.length ? document : null,
    email: nemo.email ?? null,
    birthDate: nemo.aniversario ?? null,
    importedOrderCount: nemo.pedidos ?? null,
    importedTotalSpent: null, // Nemo doesn't have total spent
    averageTicket: null,
    importedLastOrderAt: null,
    financialBalance: null,
    financialBalancePeriod: null,
    notes: "[Fonte: NEMO]",
    addresses: nemo.addresses,
    sourceSystems: ["NEMO"],
    importStatus: "NEEDS_REVIEW", // Nemo-only = less data, flag for review
    crmContactable: true,
    sourceSystem: "NEMO",
  };
}

// ── Within-batch duplicate detection ─────────────────────────────────────────

function normalizeForDedup(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function flagBatchDuplicates(records: NoPhoneImportableCustomer[]): void {
  // Only flag records that lack both document and email (no reliable dedup key)
  // and share the same normalized name+primary-street as another record in the batch.
  const nameAddrCount = new Map<string, number>();
  for (const r of records) {
    if (r.document || r.email) continue; // has a reliable key — skip
    const normName = normalizeForDedup(r.name);
    const street = r.addresses[0]?.street ?? "";
    const key = `${normName}::${normalizeForDedup(street).slice(0, 20)}`;
    nameAddrCount.set(key, (nameAddrCount.get(key) ?? 0) + 1);
  }
  for (const r of records) {
    if (r.document || r.email) continue;
    const normName = normalizeForDedup(r.name);
    const street = r.addresses[0]?.street ?? "";
    const key = `${normName}::${normalizeForDedup(street).slice(0, 20)}`;
    if ((nameAddrCount.get(key) ?? 0) > 1) {
      r.dedupStrategy = "NEEDS_REVIEW";
    } else if (r.dedupStrategy === "CREATE" && street) {
      r.dedupStrategy = "NAME_ADDRESS"; // single match possible — mark for address-based dedup at execute
    }
  }
}

function hasUsefulData(row: SaiposCustomerRow): boolean {
  const name = cleanName(row.nome);
  if (!name) return false; // no valid name = nothing meaningful to store
  return !!(
    row.cpfCnpj?.trim() ||
    row.email?.trim() ||
    row.endereco?.trim() ||
    row.qtdPedidos !== null ||
    row.valorTotal !== null ||
    row.saldoTotal !== null ||
    row.observacao?.trim()
  );
}

function buildNoPhoneRecord(saipos: SaiposCustomerRow): NoPhoneImportableCustomer {
  const name = cleanName(saipos.nome) ?? saipos.nome?.trim() ?? "Sem nome";
  const document = saipos.cpfCnpj?.replace(/\D/g, "") || null;
  const email = saipos.email?.trim() || null;
  const notes = saipos.observacao
    ? `[Saipos - Sem Telefone] ${saipos.observacao}`
    : "[Saipos - Sem Telefone]";
  const dedupStrategy: NoPhoneImportableCustomer["dedupStrategy"] =
    document ? "DOCUMENT" : email ? "EMAIL" : "CREATE";
  return {
    name,
    document: document?.length ? document : null,
    email,
    birthDate: saipos.dataAniversario ?? null,
    importedOrderCount: saipos.qtdPedidos ?? null,
    importedTotalSpent: saipos.valorTotal ?? null,
    averageTicket: saipos.ticketMedio ?? null,
    importedLastOrderAt: saipos.ultimaCompra ?? null,
    financialBalance: saipos.saldoTotal ?? null,
    financialBalancePeriod: saipos.saldoPeriodo ?? null,
    notes,
    addresses: buildSaiposAddresses(saipos),
    sourceSystems: ["SAIPOS"],
    dedupStrategy,
  };
}

export function matchAndMerge(saipos: SaiposCustomerRow[], nemo: NemoCustomerRow[]): MatchResult {
  // Build phone maps (handle multiple rows per phone within each source)
  const saiposPhone = new Map<string, SaiposCustomerRow[]>();
  for (const row of saipos) {
    if (!row.normalizedPhone) continue;
    const group = saiposPhone.get(row.normalizedPhone) ?? [];
    group.push(row);
    saiposPhone.set(row.normalizedPhone, group);
  }

  const nemoPhone = new Map<string, NemoCustomerRow[]>();
  for (const row of nemo) {
    if (!row.normalizedPhone) continue;
    const group = nemoPhone.get(row.normalizedPhone) ?? [];
    group.push(row);
    nemoPhone.set(row.normalizedPhone, group);
  }

  const merged: MergedCustomer[] = [];
  const noPhone: NoPhoneCustomer[] = [];

  // Step 1: Process Saipos rows that have a valid phone
  for (const [phone, saiposGroup] of saiposPhone) {
    const saiposBest = mergeSaiposGroup(saiposGroup);
    const nemoGroup  = nemoPhone.get(phone) ?? [];
    merged.push(buildMergedRecord(saiposBest, nemoGroup));
  }

  // Step 2: Nemo-only rows (not matched to any Saipos phone)
  for (const [phone, nemoGroup] of nemoPhone) {
    if (saiposPhone.has(phone)) continue; // already handled
    // Merge within Nemo group (pick first, take best name)
    const base = { ...nemoGroup[0]! };
    for (let i = 1; i < nemoGroup.length; i++) {
      const r = nemoGroup[i]!;
      if (!base.nome && r.nome) base.nome = r.nome;
      if (!base.email && r.email) base.email = r.email;
      if (!base.cpf && r.cpf) base.cpf = r.cpf;
      if (!base.aniversario && r.aniversario) base.aniversario = r.aniversario;
      base.addresses = [...base.addresses, ...r.addresses];
    }
    base.normalizedPhone = phone;
    merged.push(buildNemoOnlyRecord(base));
  }

  // Step 3: Classify no-phone Saipos rows into importable vs skipped
  const noPhoneImportable: NoPhoneImportableCustomer[] = [];
  for (const row of saipos) {
    if (!row.normalizedPhone) {
      if (hasUsefulData(row)) {
        noPhoneImportable.push(buildNoPhoneRecord(row));
      } else {
        noPhone.push({
          nome: row.nome,
          cpfCnpj: row.cpfCnpj,
          email: row.email,
          rawPhone: row.rawPhone,
          qtdPedidos: row.qtdPedidos,
          valorTotal: row.valorTotal,
        });
      }
    }
  }

  // Step 4: Within-batch duplicate detection for no-phone importable rows
  // Flag as NEEDS_REVIEW if multiple rows share the same name+primary-street
  // (without document or email to disambiguate)
  flagBatchDuplicates(noPhoneImportable);

  // Compute stats
  const saiposWithPhone          = saiposPhone.size;
  const nemoWithPhone            = nemoPhone.size;
  const phoneMatches             = [...saiposPhone.keys()].filter(p => nemoPhone.has(p)).length;
  const saiposOnly               = saiposWithPhone - phoneMatches;
  const nemoOnly                 = nemoWithPhone - phoneMatches;
  const readyCount               = merged.filter(r => r.importStatus === "READY").length;
  const needsReviewCount         = merged.filter(r => r.importStatus !== "READY").length;
  const noPhoneWithDocument      = noPhoneImportable.filter(r => r.document).length;
  const noPhoneWithEmail         = noPhoneImportable.filter(r => r.email).length;
  const noPhoneWithAddress       = noPhoneImportable.filter(r => r.addresses.length > 0).length;
  const noPhoneNeedsReviewCount  = noPhoneImportable.filter(r => r.dedupStrategy === "NEEDS_REVIEW").length;

  return {
    merged,
    noPhone,                // skipped — insufficient data
    noPhoneImportable,      // will be imported as non-contactable CRM records
    stats: {
      saiposTotal: saipos.length,
      nemoTotal: nemo.length,
      saiposWithPhone,
      nemoWithPhone,
      phoneMatches,
      saiposOnly,
      nemoOnly,
      noPhoneCount:            noPhoneImportable.length + noPhone.length,
      noPhoneImportableCount:  noPhoneImportable.length,
      noPhoneSkippedCount:     noPhone.length,
      noPhoneNeedsReviewCount,
      noPhoneWithDocument,
      noPhoneWithEmail,
      noPhoneWithAddress,
      conflictCount: 0,
      readyCount,
      needsReviewCount,
    },
  };
}

// ── Preview report ─────────────────────────────────────────────────────────────

export function buildPreview(
  match: MatchResult,
  sold: SoldItemsResult,
  importMode: SaiposNemoPreview["importMode"] = "RAW_FILES",
): SaiposNemoPreview {
  const topProducts = sold.rows
    .filter(r => r.rowType === "PRODUCT")
    .sort((a, b) => b.grossRevenue - a.grossRevenue)
    .slice(0, 10);

  const noPhoneImportableCount = match.stats.noPhoneImportableCount;
  const noPhoneWarning = noPhoneImportableCount > 0
    ? `${noPhoneImportableCount} cliente(s) sem telefone serão importados como não contatáveis para enriquecimento futuro. Eles não entrarão em campanhas WhatsApp até receberem telefone válido.`
    : "Nenhum cliente sem telefone encontrado para importação.";

  return {
    stats: match.stats,
    periodStart: sold.meta.periodStart?.toISOString().slice(0, 10) ?? null,
    periodEnd:   sold.meta.periodEnd?.toISOString().slice(0, 10) ?? null,
    categoryCount: sold.categoryCount,
    productCount:  sold.productCount,
    totalQuantity: sold.totalQuantity,
    totalRevenue:  sold.totalRevenue,
    originalProductRowCount:      sold.originalRowCount,
    consolidatedRowCount:          sold.consolidatedRowCount,
    duplicateAggregateGroupsCount: sold.duplicateGroups.length,
    duplicateAggregateGroups:      sold.duplicateGroups,
    sampleMerged:              match.merged.slice(0, 10),
    sampleNoPhone:             match.noPhone.slice(0, 10),
    sampleNoPhoneImportable:   match.noPhoneImportable.slice(0, 10),
    topProducts,
    noPhoneWarning,
    importMode,
  };
}

// ── Execute ────────────────────────────────────────────────────────────────────

function makeImportKey(
  restaurantId: string,
  sourceSystem: string,
  periodStart: Date,
  periodEnd: Date,
  categoryName: string,
  productName: string | null,
  rowType: string,
): string {
  return [
    restaurantId, sourceSystem,
    periodStart.toISOString().slice(0, 10),
    periodEnd.toISOString().slice(0, 10),
    categoryName,
    productName ?? "",
    rowType,
  ].join("::");
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function executeImport(
  restaurantId: string,
  report: StoredReport,
): Promise<SaiposNemoExecuteResult> {
  const { merged, noPhone, soldRows, soldMeta } = report;
  const noPhoneImportable: NoPhoneImportableCustomer[] = report.noPhoneImportable ?? [];

  let contactableCreated      = 0;
  let contactableUpdated      = 0;
  let nonContactableCreated   = 0;
  let nonContactableUpdated   = 0;
  let addressesCreated        = 0;
  let productAggCreated       = 0;
  let productAggSkipped       = 0;

  // ── Upsert customers in batches ───────────────────────────────────────────
  const phones = merged.map(r => r.phone);

  // Bulk fetch existing
  const existing = await prisma.customer.findMany({
    where: { restaurantId, phone: { in: phones } },
    select: { id: true, phone: true, name: true, email: true, birthDate: true, document: true, notes: true },
  });
  const existingMap = new Map(existing.map(c => [c.phone, c]));

  const toCreate = merged.filter(r => !existingMap.has(r.phone));
  const toUpdate = merged.filter(r => existingMap.has(r.phone));

  // Create new customers (with addresses in nested write)
  for (const batch of chunks(toCreate, 50)) {
    await prisma.$transaction(
      batch.map(r => prisma.customer.create({
        data: {
          restaurantId,
          name:    r.name,
          phone:   r.phone,
          email:   r.email ?? undefined,
          birthDate: r.birthDate ?? undefined,
          document:  r.document ?? undefined,
          importedOrderCount:   r.importedOrderCount   ?? undefined,
          importedTotalSpent:   r.importedTotalSpent   ?? undefined,
          averageTicket:        r.averageTicket         ?? undefined,
          importedLastOrderAt:  r.importedLastOrderAt  ?? undefined,
          financialBalance:     r.financialBalance      ?? undefined,
          financialBalancePeriod: r.financialBalancePeriod ?? undefined,
          notes:   r.notes ?? undefined,
          isGuest: false,
          addresses: r.addresses.length > 0 ? {
            create: r.addresses
              .filter(a => !!a.street)
              .map((a, i) => ({
                street:       a.street!,
                number:       a.number ?? "",
                neighborhood: a.neighborhood ?? "",
                city:         a.city ?? "",
                state:        a.state ?? "",
                zipCode:      a.zipCode ?? "",
                complement:   a.complement ?? undefined,
                label:        a.reference ?? undefined,
                isDefault:    i === 0,
              })),
          } : undefined,
        },
      }))
    );
    contactableCreated += batch.length;
    addressesCreated += batch.reduce((s, r) => s + r.addresses.filter(a => !!a.street).length, 0);
  }

  // Update existing customers (only overwrite with non-null values)
  for (const batch of chunks(toUpdate, 50)) {
    await prisma.$transaction(
      batch.map(r => {
        const ex = existingMap.get(r.phone)!;
        const patch: Record<string, unknown> = {};
        if (r.name && !ex.name) patch.name = r.name;
        if (r.email && !ex.email) patch.email = r.email;
        if (r.birthDate && !ex.birthDate) patch.birthDate = r.birthDate;
        if (r.document && !ex.document) patch.document = r.document;
        if (r.importedOrderCount !== null) patch.importedOrderCount = r.importedOrderCount;
        if (r.importedTotalSpent !== null) patch.importedTotalSpent = r.importedTotalSpent;
        if (r.averageTicket !== null) patch.averageTicket = r.averageTicket;
        if (r.importedLastOrderAt !== null) patch.importedLastOrderAt = r.importedLastOrderAt;
        if (r.financialBalance !== null) patch.financialBalance = r.financialBalance;
        if (r.financialBalancePeriod !== null) patch.financialBalancePeriod = r.financialBalancePeriod;
        if (r.notes) patch.notes = ex.notes ? `${ex.notes}\n${r.notes}` : r.notes;
        return prisma.customer.update({ where: { id: ex.id }, data: patch });
      })
    );
    contactableUpdated += batch.length;

    // Create new addresses for updated customers (skip if street already exists)
    for (const r of batch) {
      const ex = existingMap.get(r.phone)!;
      const existingAddrs = await prisma.address.findMany({
        where: { customerId: ex.id },
        select: { street: true, city: true },
      });
      const existingKeys = new Set(existingAddrs.map(a => `${a.street}|${a.city}`));
      const newAddrs = r.addresses.filter(a =>
        !!a.street && !existingKeys.has(`${a.street}|${a.city ?? ""}`)
      );
      if (newAddrs.length > 0) {
        await prisma.address.createMany({
          data: newAddrs.map((a, i) => ({
            customerId:   ex.id,
            street:       a.street!,
            number:       a.number ?? "",
            neighborhood: a.neighborhood ?? "",
            city:         a.city ?? "",
            state:        a.state ?? "",
            zipCode:      a.zipCode ?? "",
            complement:   a.complement ?? undefined,
            label:        a.reference ?? undefined,
            isDefault:    i === 0 && existingAddrs.length === 0,
          })),
        });
        addressesCreated += newAddrs.length;
      }
    }
  }

  // ── Upsert no-phone customers as non-contactable CRM records ─────────────
  for (const r of noPhoneImportable) {
    let existingId: string | null = null;

    // Dedup: document → email → name+address → create new
    // NEEDS_REVIEW: ambiguous within-batch rows are created as new records (safe)
    if (r.document) {
      const found = await prisma.customer.findFirst({
        where: { restaurantId, document: r.document },
        select: { id: true },
      });
      if (found) existingId = found.id;
    }
    if (!existingId && r.email) {
      const found = await prisma.customer.findFirst({
        where: { restaurantId, email: r.email },
        select: { id: true },
      });
      if (found) existingId = found.id;
    }
    // Rule 3: name + address dedup (only for NAME_ADDRESS strategy — skip NEEDS_REVIEW)
    if (!existingId && r.dedupStrategy === "NAME_ADDRESS" && r.addresses[0]?.street) {
      const normName = normalizeForDedup(r.name);
      const street   = normalizeForDedup(r.addresses[0].street);
      const candidates = await prisma.customer.findMany({
        where: {
          restaurantId,
          phone: null,
          // Prisma mode insensitive search on name
          name: { contains: normName.split(" ")[0] ?? r.name, mode: "insensitive" },
        },
        select: { id: true, name: true, addresses: { select: { street: true, city: true } } },
      });
      const matches = candidates.filter(c => {
        const cn = normalizeForDedup(c.name);
        if (!cn.includes(normName.split(" ")[0]!)) return false;
        return c.addresses.some(a =>
          normalizeForDedup(a.street).slice(0, 15) === street.slice(0, 15)
        );
      });
      if (matches.length === 1) existingId = matches[0]!.id; // single unambiguous match
      // if 0 or >1 matches → existingId stays null → create new (safe)
    }

    if (existingId) {
      await prisma.customer.update({
        where: { id: existingId },
        data: {
          crmContactable:       false,
          contactStatus:        "SEM_TELEFONE",
          dataEnrichmentStatus: "NEEDS_ENRICHMENT",
          ...(r.document               ? { document: r.document }                       : {}),
          ...(r.email                  ? { email: r.email }                             : {}),
          ...(r.birthDate              ? { birthDate: r.birthDate }                     : {}),
          ...(r.importedOrderCount !== null ? { importedOrderCount: r.importedOrderCount } : {}),
          ...(r.importedTotalSpent !== null ? { importedTotalSpent: r.importedTotalSpent } : {}),
          ...(r.averageTicket !== null  ? { averageTicket: r.averageTicket }            : {}),
          ...(r.importedLastOrderAt !== null ? { importedLastOrderAt: r.importedLastOrderAt } : {}),
          ...(r.financialBalance !== null    ? { financialBalance: r.financialBalance }      : {}),
          ...(r.financialBalancePeriod !== null ? { financialBalancePeriod: r.financialBalancePeriod } : {}),
          ...(r.notes ? { notes: r.notes } : {}),
        },
      });
      nonContactableUpdated++;
      // Add any new addresses
      if (r.addresses.length > 0) {
        const existingAddrs = await prisma.address.findMany({
          where: { customerId: existingId },
          select: { street: true, city: true },
        });
        const existingKeys = new Set(existingAddrs.map(a => `${a.street}|${a.city}`));
        const newAddrs = r.addresses.filter(a => !!a.street && !existingKeys.has(`${a.street}|${a.city ?? ""}`));
        if (newAddrs.length > 0) {
          await prisma.address.createMany({
            data: newAddrs.map((a, i) => ({
              customerId:   existingId!,
              street:       a.street!,
              number:       a.number ?? "",
              neighborhood: a.neighborhood ?? "",
              city:         a.city ?? "",
              state:        a.state ?? "",
              zipCode:      a.zipCode ?? "",
              complement:   a.complement ?? undefined,
              label:        a.reference ?? undefined,
              isDefault:    i === 0 && existingAddrs.length === 0,
            })),
          });
          addressesCreated += newAddrs.length;
        }
      }
    } else {
      await prisma.customer.create({
        data: {
          restaurantId,
          name:                 r.name,
          phone:                null,
          crmContactable:       false,
          contactStatus:        "SEM_TELEFONE",
          dataEnrichmentStatus: "NEEDS_ENRICHMENT",
          isGuest:              false,
          document:             r.document ?? undefined,
          email:                r.email ?? undefined,
          birthDate:            r.birthDate ?? undefined,
          importedOrderCount:   r.importedOrderCount ?? undefined,
          importedTotalSpent:   r.importedTotalSpent ?? undefined,
          averageTicket:        r.averageTicket ?? undefined,
          importedLastOrderAt:  r.importedLastOrderAt ?? undefined,
          financialBalance:     r.financialBalance ?? undefined,
          financialBalancePeriod: r.financialBalancePeriod ?? undefined,
          notes:                r.notes ?? undefined,
          addresses: r.addresses.length > 0 ? {
            create: r.addresses
              .filter(a => !!a.street)
              .map((a, i) => ({
                street:       a.street!,
                number:       a.number ?? "",
                neighborhood: a.neighborhood ?? "",
                city:         a.city ?? "",
                state:        a.state ?? "",
                zipCode:      a.zipCode ?? "",
                complement:   a.complement ?? undefined,
                label:        a.reference ?? undefined,
                isDefault:    i === 0,
              })),
          } : undefined,
        },
      });
      nonContactableCreated++;
      addressesCreated += r.addresses.filter(a => !!a.street).length;
    }
  }

  // ── Insert product sales aggregates ───────────────────────────────────────
  if (soldRows.length > 0 && soldMeta.periodStart && soldMeta.periodEnd) {
    // Pre-flight: block if duplicate importKeys remain after consolidation
    const importKeys = soldRows.map(r =>
      makeImportKey(restaurantId, "SAIPOS", soldMeta.periodStart!, soldMeta.periodEnd!, r.categoryName, r.productName, r.rowType)
    );
    const uniqueKeys = new Set(importKeys);
    if (uniqueKeys.size !== importKeys.length) {
      throw new Error("Importação bloqueada: ainda existem chaves agregadas duplicadas.");
    }

    const aggRows = soldRows.map(r => ({
      id:          `psa_${Math.random().toString(36).slice(2)}`,
      restaurantId,
      sourceSystem: "SAIPOS",
      periodStart:  soldMeta.periodStart!,
      periodEnd:    soldMeta.periodEnd!,
      categoryName: r.categoryName,
      productName:  r.productName ?? undefined,
      quantitySold: Math.round(r.quantitySold),
      grossRevenue: r.grossRevenue,
      percent:      r.percent ?? undefined,
      rowType:      r.rowType,
      importKey:    makeImportKey(
        restaurantId, "SAIPOS",
        soldMeta.periodStart!, soldMeta.periodEnd!,
        r.categoryName, r.productName, r.rowType
      ),
    }));

    // Insert with skipDuplicates using importKey uniqueness
    const result = await prisma.productSalesAggregate.createMany({
      data: aggRows,
      skipDuplicates: true,
    });
    productAggCreated  = result.count;
    productAggSkipped  = aggRows.length - result.count;
  }

  return {
    contactableCustomersCreated:    contactableCreated,
    contactableCustomersUpdated:    contactableUpdated,
    nonContactableCustomersCreated: nonContactableCreated,
    nonContactableCustomersUpdated: nonContactableUpdated,
    noPhoneSkippedInsufficientData: noPhone.length,
    addressesCreated,
    productAggregatesCreated: productAggCreated,
    productAggregatesSkipped: productAggSkipped,
  };
}

// ── Compiled workbook parser ───────────────────────────────────────────────────
//
// Parses Foocci_Base_Compilada_Saipos_Nemo.xlsx which has pre-merged sheets:
//   Clientes_Master  — contactable customers (with phone)
//   Sem_Telefone     — no-phone customers pre-classified
//   Produtos_Agregados — aggregate sales data
//
// The compiled workbook is produced by a prior merge run. This parser reads the
// output directly without re-running matchAndMerge() against the raw files.
//

export interface CompiledWorkbookDebug {
  sheetsAll:    string[];
  sheetsFound:  Record<string, string>;
  headers:      Record<string, string[]>;
  rawCounts: {
    masterTotal:             number;
    masterContactable:       number;
    masterNoPhoneImportable: number;
    masterNoPhoneSkipped:    number;
    semTelTotal:             number;
    semTelImportable:        number;
    semTelSkipped:           number;
    prodRowsAfterConsolidate: number;
    addrTotal:               number;
  };
  sampleContactable:       Array<{ name: string; phone: string; source: string }>;
  sampleNoPhoneImportable: Array<{ name: string; dedup: string; hasDoc: boolean; hasEmail: boolean }>;
  sampleProducts:          Array<{ rowType: string; cat: string; prod: string | null; qty: number }>;
}

export interface CompiledWorkbookParseResult {
  merged:            MergedCustomer[];
  noPhoneImportable: NoPhoneImportableCustomer[];
  noPhone:           NoPhoneCustomer[];
  soldRows:          ProductSalesRow[];
  soldMeta:          SoldItemsMeta;
  stats:             MatchStats;
  debug:             CompiledWorkbookDebug;
}

function normSheetName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

function findSheet(wb: XLSX.WorkBook, candidates: string[]): XLSX.WorkSheet | null {
  for (const c of candidates) {
    const nc = normSheetName(c);
    const name = wb.SheetNames.find(n => normSheetName(n).includes(nc));
    if (name && wb.Sheets[name]) return wb.Sheets[name]!;
  }
  return null;
}

function parseMasterSheet(ws: XLSX.WorkSheet): { contactable: MergedCustomer[]; noPhoneImportable: NoPhoneImportableCustomer[]; noPhone: NoPhoneCustomer[] } {
  const raw2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (raw2D.length < 2) return { contactable: [], noPhoneImportable: [], noPhone: [] };

  const colInfos = buildColInfos(raw2D[0] as unknown[]);
  // Supports both Portuguese (raw Saipos file) and English camelCase (compiled workbook)
  const nomeIdx        = findColIdx(colInfos, ["nome", "name"]);
  const phoneIdx       = findColIdx(colInfos, ["telefone", "fone", "celular", "phone"]);
  const cpfIdx         = findColIdx(colInfos, ["cpf/cnpj", "cpf cnpj", "cpf", "cnpj", "document"]);
  const emailIdx       = findColIdx(colInfos, ["email"]);
  const aniverIdx      = findColIdx(colInfos, ["data aniversario", "aniversario", "birthdate"]);
  const endIdx         = findColIdx(colInfos, ["endereco", "logradouro", "rua"]);
  const numIdx         = findColIdx(colInfos, ["numero", "number"]);
  const bairroIdx      = findColIdx(colInfos, ["bairro", "neighborhood"]);
  const cidadeIdx      = findColIdx(colInfos, ["cidade", "city"]);
  const estadoIdx      = findColIdx(colInfos, ["estado", "state"]);
  const cepIdx         = findColIdx(colInfos, ["cep", "zipcode"]);
  const compIdx        = findColIdx(colInfos, ["complemento", "complement"]);
  const qtdIdx         = findColIdx(colInfos, ["qtd. pedidos", "qtd pedidos", "pedidos", "quantidade pedidos", "importedordercount"]);
  const totalIdx       = findColIdx(colInfos, ["valor total", "total gasto", "importedtotalspent"]);
  const ticketIdx      = findColIdx(colInfos, ["ticket medio", "ticket medico", "averageticket"]);
  const lastOrderIdx   = findColIdx(colInfos, ["ultima compra", "ultimo pedido", "importedlastorderat"]);
  const saldoTotalIdx  = (() => {
    let i = findColIdx(colInfos, ["saldo financeiro total", "financialbalancetotal"]);
    if (i < 0) i = findColIdx(colInfos, ["saldo financeiro"], 1);
    return i;
  })();
  const saldoPeriodoIdx = (() => {
    let i = findColIdx(colInfos, ["saldo financeiro do periodo", "saldo financeiro periodo", "financialbalanceperiod"]);
    if (i < 0) i = findColIdx(colInfos, ["saldo financeiro"], 2);
    return i;
  })();
  const obsIdx         = findColIdx(colInfos, ["observacao interna", "observacao", "obs", "internalnotes"]);
  const sourceIdx      = findColIdx(colInfos, ["source system", "origem", "sistema", "sourcesystems"]);

  const contactable:      MergedCustomer[]           = [];
  const noPhoneImportable: NoPhoneImportableCustomer[] = [];
  const noPhone:           NoPhoneCustomer[]            = [];

  for (let r = 1; r < raw2D.length; r++) {
    const row = raw2D[r] as unknown[];
    if (row.every(v => !v || String(v).trim() === "")) continue;

    const rawPhone      = cellStr(row, phoneIdx);
    const normalizedPh  = normalizePhone(rawPhone);
    const nome          = cellStr(row, nomeIdx) || null;
    const cpfCnpj       = cellStr(row, cpfIdx)  || null;
    const email         = cellStr(row, emailIdx).toLowerCase() || null;
    const birthDate     = cellDate(row, aniverIdx);
    const endereco      = cellStr(row, endIdx) || null;
    const qtdPedidos    = parseIntField(cellStr(row, qtdIdx));
    const valorTotal    = parseDecimalField(cellStr(row, totalIdx));
    const ticketMedio   = parseDecimalField(cellStr(row, ticketIdx));
    const ultimaCompra  = cellDate(row, lastOrderIdx);
    const saldoTotal    = parseDecimalField(cellStr(row, saldoTotalIdx));
    const saldoPeriodo  = parseDecimalField(cellStr(row, saldoPeriodoIdx));
    const observacao    = cellStr(row, obsIdx) || null;
    const rawSource     = cellStr(row, sourceIdx) || "SAIPOS+NEMO";
    const sourceSystem  = (rawSource.includes("NEMO") && rawSource.includes("SAIPOS"))
      ? "SAIPOS+NEMO"
      : rawSource.includes("NEMO") ? "NEMO" : "SAIPOS";

    const addrGroup: NemoAddressGroup = {
      street:       endereco,
      number:       cellStr(row, numIdx) || null,
      neighborhood: cellStr(row, bairroIdx) || null,
      city:         cellStr(row, cidadeIdx) || null,
      complement:   cellStr(row, compIdx) || null,
      reference:    null,
      state:        cellStr(row, estadoIdx) || null,
      zipCode:      cellStr(row, cepIdx) || null,
    };
    const addresses = endereco ? [addrGroup] : [];
    const document = cpfCnpj?.replace(/\D/g, "") || null;

    if (normalizedPh) {
      // Contactable customer
      contactable.push({
        name:                 cleanName(nome) ?? nome ?? "Sem nome",
        phone:                normalizedPh,
        document,
        email,
        birthDate,
        importedOrderCount:   qtdPedidos,
        importedTotalSpent:   valorTotal,
        averageTicket:        ticketMedio,
        importedLastOrderAt:  ultimaCompra,
        financialBalance:     saldoTotal,
        financialBalancePeriod: saldoPeriodo,
        notes:                observacao,
        addresses,
        sourceSystems:        [sourceSystem],
        importStatus:         "READY",
        crmContactable:       true,
        sourceSystem,
      });
    } else {
      // No-phone row from master sheet
      const fakeRow: SaiposCustomerRow = {
        nome, cpfCnpj, dataAniversario: birthDate, email,
        rawPhone, normalizedPhone: null,
        endereco, complemento: cellStr(row, compIdx) || null,
        qtdPedidos, valorTotal, ticketMedio, ultimaCompra,
        saldoTotal, saldoPeriodo, observacao, rowIndex: r,
      };
      if (hasUsefulData(fakeRow)) {
        const rec = buildNoPhoneRecord(fakeRow);
        // Override source tag to reflect compiled workbook origin
        rec.sourceSystems = [sourceSystem];
        if (rec.notes) rec.notes = rec.notes.replace("[Saipos - Sem Telefone]", "[Compilado - Sem Telefone]");
        noPhoneImportable.push(rec);
      } else {
        noPhone.push({ nome, cpfCnpj, email, rawPhone, qtdPedidos, valorTotal });
      }
    }
  }

  return { contactable, noPhoneImportable, noPhone };
}

function parseSemTelefoneSheet(ws: XLSX.WorkSheet): { noPhoneImportable: NoPhoneImportableCustomer[]; noPhone: NoPhoneCustomer[] } {
  const raw2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (raw2D.length < 2) return { noPhoneImportable: [], noPhone: [] };

  const colInfos    = buildColInfos(raw2D[0] as unknown[]);
  // Supports both Portuguese (raw file) and English camelCase (compiled workbook)
  const nomeIdx     = findColIdx(colInfos, ["nome", "name"]);
  const cpfIdx      = findColIdx(colInfos, ["cpf/cnpj", "cpf cnpj", "cpf", "cnpj", "document"]);
  const emailIdx    = findColIdx(colInfos, ["email"]);
  const aniverIdx   = findColIdx(colInfos, ["data aniversario", "aniversario", "birthdate"]);
  const endIdx      = findColIdx(colInfos, ["endereco", "logradouro", "rua", "address", "addressline"]);
  const numIdx      = findColIdx(colInfos, ["numero", "number"]);
  const bairroIdx   = findColIdx(colInfos, ["bairro", "neighborhood"]);
  const cidadeIdx   = findColIdx(colInfos, ["cidade", "city"]);
  const estadoIdx   = findColIdx(colInfos, ["estado", "state"]);
  const cepIdx      = findColIdx(colInfos, ["cep", "zipcode"]);
  const compIdx     = findColIdx(colInfos, ["complemento", "complement"]);
  const qtdIdx      = findColIdx(colInfos, ["qtd. pedidos", "qtd pedidos", "pedidos", "orders"]);
  const totalIdx    = findColIdx(colInfos, ["valor total", "totalspent"]);
  const ticketIdx   = findColIdx(colInfos, ["ticket medio", "averageticket"]);
  const lastOrderIdx = findColIdx(colInfos, ["ultima compra", "ultimo pedido", "lastorderat"]);
  const saldoTotalIdx = (() => {
    let i = findColIdx(colInfos, ["saldo financeiro total", "financialbalancetotal"]);
    if (i < 0) i = findColIdx(colInfos, ["saldo financeiro"], 1);
    return i;
  })();
  const saldoPeriodoIdx = (() => {
    let i = findColIdx(colInfos, ["saldo financeiro do periodo", "saldo financeiro periodo", "financialbalanceperiod"]);
    if (i < 0) i = findColIdx(colInfos, ["saldo financeiro"], 2);
    return i;
  })();
  const obsIdx      = findColIdx(colInfos, ["observacao interna", "observacao", "obs", "internalnotes"]);

  const noPhoneImportable: NoPhoneImportableCustomer[] = [];
  const noPhone: NoPhoneCustomer[] = [];

  for (let r = 1; r < raw2D.length; r++) {
    const row = raw2D[r] as unknown[];
    if (row.every(v => !v || String(v).trim() === "")) continue;

    const nome      = cellStr(row, nomeIdx) || null;
    const cpfCnpj   = cellStr(row, cpfIdx) || null;
    const email     = cellStr(row, emailIdx).toLowerCase() || null;
    const endereco  = cellStr(row, endIdx) || null;
    const qtdPedidos = parseIntField(cellStr(row, qtdIdx));
    const valorTotal = parseDecimalField(cellStr(row, totalIdx));

    const addrGroup: NemoAddressGroup = {
      street:       endereco,
      number:       cellStr(row, numIdx) || null,
      neighborhood: cellStr(row, bairroIdx) || null,
      city:         cellStr(row, cidadeIdx) || null,
      complement:   cellStr(row, compIdx) || null,
      reference:    null,
      state:        cellStr(row, estadoIdx) || null,
      zipCode:      cellStr(row, cepIdx) || null,
    };
    const addresses = endereco ? [addrGroup] : [];
    const document  = cpfCnpj?.replace(/\D/g, "") || null;

    const fakeRow: SaiposCustomerRow = {
      nome, cpfCnpj, dataAniversario: cellDate(row, aniverIdx), email,
      rawPhone: "", normalizedPhone: null,
      endereco, complemento: cellStr(row, compIdx) || null,
      qtdPedidos, valorTotal,
      ticketMedio: parseDecimalField(cellStr(row, ticketIdx)),
      ultimaCompra: cellDate(row, lastOrderIdx),
      saldoTotal: parseDecimalField(cellStr(row, saldoTotalIdx)),
      saldoPeriodo: parseDecimalField(cellStr(row, saldoPeriodoIdx)),
      observacao: cellStr(row, obsIdx) || null,
      rowIndex: r,
    };

    if (hasUsefulData(fakeRow)) {
      const rec = buildNoPhoneRecord(fakeRow);
      rec.sourceSystems = ["SAIPOS"];
      rec.notes = rec.notes?.replace("[Saipos - Sem Telefone]", "[Sem_Telefone Sheet]") ?? "[Sem_Telefone Sheet]";
      // Ensure addresses from separate columns are captured
      if (addresses.length > 0 && rec.addresses.length === 0) rec.addresses = addresses;
      if (document) rec.document = document;
      noPhoneImportable.push(rec);
    } else {
      noPhone.push({ nome, cpfCnpj, email, rawPhone: "", qtdPedidos, valorTotal });
    }
  }

  return { noPhoneImportable, noPhone };
}

function parseProdutosAgregadosSheet(ws: XLSX.WorkSheet): SoldItemsResult {
  const raw2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const empty: SoldItemsResult = {
    meta: { periodStart: null, periodEnd: null, reportTypes: null },
    rows: [], categoryCount: 0, productCount: 0,
    totalQuantity: 0, totalRevenue: 0,
    originalRowCount: 0, consolidatedRowCount: 0, duplicateGroups: [],
  };
  if (raw2D.length < 2) return empty;

  const headerColInfos = buildColInfos(raw2D[0] as unknown[]);

  // ── Direct columnar format (compiled workbook) ─────────────────────────────
  // Detected by the presence of a "rowType" column in the first row.
  const rowTypeColIdx = findColIdx(headerColInfos, ["rowtype", "row type"]);
  if (rowTypeColIdx >= 0) {
    const catIdx         = findColIdx(headerColInfos, ["categoryname", "categoria", "category"]);
    const prodIdx        = findColIdx(headerColInfos, ["productname", "produto", "product", "item"]);
    const qtyIdx         = findColIdx(headerColInfos, ["quantitysold", "quantidade", "qtde", "qtd", "qty"]);
    const revIdx         = findColIdx(headerColInfos, ["grossrevenue", "receita bruta", "receita", "total", "valor"]);
    const pctIdx         = findColIdx(headerColInfos, ["percent", "percentual", "%"]);
    const periodStartIdx = findColIdx(headerColInfos, ["periodstart", "periodo inicio"]);
    const periodEndIdx   = findColIdx(headerColInfos, ["periodend", "periodo fim"]);

    let periodStart: Date | null = null;
    let periodEnd:   Date | null = null;
    const rows: ProductSalesRow[] = [];

    for (let r = 1; r < raw2D.length; r++) {
      const row = raw2D[r] as unknown[];
      if (row.every(v => !v || String(v).trim() === "")) continue;

      const rowTypeRaw = cellStr(row, rowTypeColIdx).toUpperCase();
      if (rowTypeRaw !== "CATEGORY" && rowTypeRaw !== "PRODUCT") continue;

      const catName  = catIdx  >= 0 ? cellStr(row, catIdx)  : "";
      const prodName = prodIdx >= 0 ? cellStr(row, prodIdx) : "";
      const qty      = parseDecimalField(cellStr(row, qtyIdx)) ?? 0;
      const rev      = parseDecimalField(cellStr(row, revIdx)) ?? 0;
      const pct      = pctIdx >= 0 ? parseDecimalField(cellStr(row, pctIdx)) : null;

      if (!catName) continue;

      // Read period from first row that has it
      if (!periodStart && periodStartIdx >= 0) periodStart = cellDate(row, periodStartIdx);
      if (!periodEnd   && periodEndIdx   >= 0) periodEnd   = cellDate(row, periodEndIdx);

      rows.push({
        rowType:      rowTypeRaw as ProductRowType,
        categoryName: catName,
        productName:  rowTypeRaw === "PRODUCT" ? (prodName || null) : null,
        quantitySold: qty,
        grossRevenue: rev,
        percent:      pct,
      });
    }

    const { consolidated, originalCount, removedCount, duplicateGroups } = consolidateProductRows(rows);
    const categoryCount = consolidated.filter(r => r.rowType === "CATEGORY").length;
    const productCount  = consolidated.filter(r => r.rowType === "PRODUCT").length;
    const totalQuantity = consolidated.filter(r => r.rowType === "PRODUCT").reduce((s, r) => s + r.quantitySold, 0);
    const totalRevenue  = consolidated.filter(r => r.rowType === "PRODUCT").reduce((s, r) => s + r.grossRevenue, 0);

    return {
      meta: { periodStart, periodEnd, reportTypes: null },
      rows: consolidated,
      categoryCount, productCount, totalQuantity, totalRevenue,
      originalRowCount: originalCount, consolidatedRowCount: removedCount, duplicateGroups,
    };
  }

  // ── Indent-based format (legacy raw Saipos ItensVendidos file) ─────────────
  let metaStart: Date | null = null;
  let metaEnd:   Date | null = null;
  let metaTypes: string | null = null;
  let dataStartRow = 0;

  for (let r = 0; r < Math.min(5, raw2D.length); r++) {
    const row = raw2D[r] as unknown[];
    const line = row.map(v => String(v ?? "").trim()).join(" ");
    if (line.match(/Data\s+Inicial/i) || line.match(/periodo/i)) {
      const { start, end, types } = parsePeriodFromMetaRow(row);
      if (start) metaStart = start;
      if (end)   metaEnd   = end;
      if (types) metaTypes = types;
    }
    const ci = buildColInfos(row);
    if (findColIdx(ci, ["categoria"]) >= 0 || findColIdx(ci, ["produto", "item"]) >= 0) {
      dataStartRow = r; break;
    }
  }

  const legacyHeader  = raw2D[dataStartRow] as unknown[];
  const legacyInfos   = buildColInfos(legacyHeader);
  const catIdx        = findColIdx(legacyInfos, ["categoria", "category"]);
  const prodIdx       = findColIdx(legacyInfos, ["produto", "product", "item"]);
  const qtyIdx        = findColIdx(legacyInfos, ["quantidade", "qtde", "qtd", "qty"]);
  const revIdx        = findColIdx(legacyInfos, ["receita bruta", "receita", "total", "valor"]);
  const pctIdx        = findColIdx(legacyInfos, ["percentual", "percent", "%"]);

  const rows: ProductSalesRow[] = [];
  let currentCategory = "";

  for (let r = dataStartRow + 1; r < raw2D.length; r++) {
    const row = raw2D[r] as unknown[];
    if (row.every(v => !v || String(v).trim() === "")) continue;
    const catStr  = catIdx  >= 0 ? cellStr(row, catIdx)  : "";
    const prodStr = prodIdx >= 0 ? cellStr(row, prodIdx) : "";
    const qty     = parseDecimalField(cellStr(row, qtyIdx)) ?? 0;
    const rev     = parseDecimalField(cellStr(row, revIdx)) ?? 0;
    const pct     = pctIdx >= 0 ? parseDecimalField(cellStr(row, pctIdx)) : null;
    if (!catStr && !prodStr) continue;
    if (catStr && !prodStr) {
      currentCategory = catStr;
      rows.push({ rowType: "CATEGORY", categoryName: catStr, productName: null, quantitySold: qty, grossRevenue: rev, percent: pct });
    } else {
      if (!currentCategory && catStr) currentCategory = catStr;
      rows.push({ rowType: "PRODUCT", categoryName: currentCategory, productName: prodStr || catStr, quantitySold: qty, grossRevenue: rev, percent: pct });
    }
  }

  const { consolidated, originalCount, removedCount, duplicateGroups } = consolidateProductRows(rows);
  const categoryCount = consolidated.filter(r => r.rowType === "CATEGORY").length;
  const productCount  = consolidated.filter(r => r.rowType === "PRODUCT").length;
  const totalQuantity = consolidated.filter(r => r.rowType === "PRODUCT").reduce((s, r) => s + r.quantitySold, 0);
  const totalRevenue  = consolidated.filter(r => r.rowType === "PRODUCT").reduce((s, r) => s + r.grossRevenue, 0);

  return {
    meta: { periodStart: metaStart, periodEnd: metaEnd, reportTypes: metaTypes },
    rows: consolidated,
    categoryCount, productCount, totalQuantity, totalRevenue,
    originalRowCount: originalCount, consolidatedRowCount: removedCount, duplicateGroups,
  };
}

function parseEnderecosSheet(ws: XLSX.WorkSheet): { addrByPhone: Map<string, NemoAddressGroup[]>; totalRows: number } {
  const raw2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const addrByPhone = new Map<string, NemoAddressGroup[]>();
  if (raw2D.length < 2) return { addrByPhone, totalRows: 0 };

  const colInfos  = buildColInfos(raw2D[0] as unknown[]);
  const phoneIdx  = findColIdx(colInfos, ["phone", "telefone", "fone", "celular"]);
  const addrIdx   = findColIdx(colInfos, ["addressline", "endereco", "logradouro", "rua", "address"]);
  const numIdx    = findColIdx(colInfos, ["number", "numero"]);
  const bairroIdx = findColIdx(colInfos, ["neighborhood", "bairro"]);
  const cidadeIdx = findColIdx(colInfos, ["city", "cidade"]);
  const estadoIdx = findColIdx(colInfos, ["state", "estado"]);
  const cepIdx    = findColIdx(colInfos, ["cep", "zipcode"]);
  const compIdx   = findColIdx(colInfos, ["complement", "complemento"]);
  const refIdx    = findColIdx(colInfos, ["reference", "referencia"]);

  let totalRows = 0;
  for (let r = 1; r < raw2D.length; r++) {
    const row = raw2D[r] as unknown[];
    if (row.every(v => !v || String(v).trim() === "")) continue;
    totalRows++;

    const rawPhone  = phoneIdx >= 0 ? cellStr(row, phoneIdx) : "";
    const normPhone = normalizePhone(rawPhone);
    if (!normPhone) continue;

    const street = addrIdx >= 0 ? (cellStr(row, addrIdx) || null) : null;
    if (!street) continue;

    const addr: NemoAddressGroup = {
      street,
      number:       numIdx    >= 0 ? (cellStr(row, numIdx)    || null) : null,
      neighborhood: bairroIdx >= 0 ? (cellStr(row, bairroIdx) || null) : null,
      city:         cidadeIdx >= 0 ? (cellStr(row, cidadeIdx) || null) : null,
      state:        estadoIdx >= 0 ? (cellStr(row, estadoIdx) || null) : null,
      zipCode:      cepIdx    >= 0 ? (cellStr(row, cepIdx)    || null) : null,
      complement:   compIdx   >= 0 ? (cellStr(row, compIdx)   || null) : null,
      reference:    refIdx    >= 0 ? (cellStr(row, refIdx)    || null) : null,
    };
    const key      = `${street}|${addr.city ?? ""}`;
    const existing = addrByPhone.get(normPhone) ?? [];
    if (!existing.some(a => `${a.street}|${a.city ?? ""}` === key)) {
      existing.push(addr);
      addrByPhone.set(normPhone, existing);
    }
  }

  return { addrByPhone, totalRows };
}

function sheetHeaderStrings(ws: XLSX.WorkSheet | null): string[] {
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (!raw.length) return [];
  return (raw[0] as unknown[]).map(h => String(h ?? "").trim()).filter(Boolean);
}

function sheetActualName(wb: XLSX.WorkBook, ws: XLSX.WorkSheet | null): string {
  if (!ws) return "";
  return wb.SheetNames.find(n => wb.Sheets[n] === ws) ?? "";
}

export function parseCompiledWorkbook(buffer: Buffer): CompiledWorkbookParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  // ── Locate sheets ─────────────────────────────────────────────────────────
  const masterSheet = findSheet(wb, ["Clientes_Master", "ClientesMaster", "clientes master", "master"]);
  const semTelSheet = findSheet(wb, ["Sem_Telefone", "SemTelefone", "sem telefone"]);
  const prodSheet   = findSheet(wb, ["Produtos_Agregados", "ProdutosAgregados", "produtos agregados", "itens vendidos"]);
  const endSheet    = findSheet(wb, ["Enderecos", "Endereços", "enderecos", "enderecos", "addresses", "endere"]);

  // ── Parse each sheet ──────────────────────────────────────────────────────
  const masterResult = masterSheet
    ? parseMasterSheet(masterSheet)
    : { contactable: [], noPhoneImportable: [], noPhone: [] };

  const semTelResult = semTelSheet
    ? parseSemTelefoneSheet(semTelSheet)
    : { noPhoneImportable: [], noPhone: [] };

  const soldResult = prodSheet
    ? parseProdutosAgregadosSheet(prodSheet)
    : { meta: { periodStart: null, periodEnd: null, reportTypes: null }, rows: [], categoryCount: 0, productCount: 0, totalQuantity: 0, totalRevenue: 0, originalRowCount: 0, consolidatedRowCount: 0, duplicateGroups: [] };

  const endResult = endSheet
    ? parseEnderecosSheet(endSheet)
    : { addrByPhone: new Map<string, NemoAddressGroup[]>(), totalRows: 0 };

  // ── Enrich contactable customers with structured addresses from Endereços ──
  if (endResult.addrByPhone.size > 0) {
    for (const c of masterResult.contactable) {
      const addrs = endResult.addrByPhone.get(c.phone);
      if (addrs && addrs.length > 0) c.addresses = addrs;
    }
  }

  // ── Merge no-phone records from both sheets ───────────────────────────────
  const allNoPhoneImportable: NoPhoneImportableCustomer[] = [
    ...semTelResult.noPhoneImportable,
    ...masterResult.noPhoneImportable.filter(m => {
      const docMatch   = m.document && semTelResult.noPhoneImportable.some(s => s.document === m.document);
      const emailMatch = m.email    && semTelResult.noPhoneImportable.some(s => s.email    === m.email);
      return !docMatch && !emailMatch;
    }),
  ];

  const allNoPhone: NoPhoneCustomer[] = [
    ...semTelResult.noPhone,
    ...masterResult.noPhone,
  ];

  flagBatchDuplicates(allNoPhoneImportable);

  const noPhoneWithDocument     = allNoPhoneImportable.filter(r => r.document).length;
  const noPhoneWithEmail        = allNoPhoneImportable.filter(r => r.email).length;
  const noPhoneWithAddress      = allNoPhoneImportable.filter(r => r.addresses.length > 0).length;
  const noPhoneNeedsReviewCount = allNoPhoneImportable.filter(r => r.dedupStrategy === "NEEDS_REVIEW").length;

  const stats: MatchStats = {
    saiposTotal:            0,
    nemoTotal:              0,
    saiposWithPhone:        0,
    nemoWithPhone:          0,
    phoneMatches:           0,
    saiposOnly:             0,
    nemoOnly:               0,
    noPhoneCount:           allNoPhoneImportable.length + allNoPhone.length,
    noPhoneImportableCount: allNoPhoneImportable.length,
    noPhoneSkippedCount:    allNoPhone.length,
    noPhoneNeedsReviewCount,
    noPhoneWithDocument,
    noPhoneWithEmail,
    noPhoneWithAddress,
    conflictCount:    masterResult.contactable.filter(r => r.importStatus !== "READY").length,
    readyCount:       masterResult.contactable.filter(r => r.importStatus === "READY").length,
    needsReviewCount: masterResult.contactable.filter(r => r.importStatus !== "READY").length,
  };

  const debug: CompiledWorkbookDebug = {
    sheetsAll:   wb.SheetNames,
    sheetsFound: {
      master: sheetActualName(wb, masterSheet),
      semTel: sheetActualName(wb, semTelSheet),
      prod:   sheetActualName(wb, prodSheet),
      end:    sheetActualName(wb, endSheet),
    },
    headers: {
      master: sheetHeaderStrings(masterSheet),
      semTel: sheetHeaderStrings(semTelSheet),
      prod:   sheetHeaderStrings(prodSheet),
      end:    sheetHeaderStrings(endSheet),
    },
    rawCounts: {
      masterTotal:             masterResult.contactable.length + masterResult.noPhoneImportable.length + masterResult.noPhone.length,
      masterContactable:       masterResult.contactable.length,
      masterNoPhoneImportable: masterResult.noPhoneImportable.length,
      masterNoPhoneSkipped:    masterResult.noPhone.length,
      semTelTotal:             semTelResult.noPhoneImportable.length + semTelResult.noPhone.length,
      semTelImportable:        semTelResult.noPhoneImportable.length,
      semTelSkipped:           semTelResult.noPhone.length,
      prodRowsAfterConsolidate: soldResult.rows.length,
      addrTotal:               endResult.totalRows,
    },
    sampleContactable: masterResult.contactable.slice(0, 3).map(c => ({
      name: c.name, phone: c.phone, source: c.sourceSystem,
    })),
    sampleNoPhoneImportable: allNoPhoneImportable.slice(0, 3).map(r => ({
      name: r.name, dedup: r.dedupStrategy, hasDoc: !!r.document, hasEmail: !!r.email,
    })),
    sampleProducts: soldResult.rows.slice(0, 3).map(r => ({
      rowType: r.rowType, cat: r.categoryName, prod: r.productName, qty: r.quantitySold,
    })),
  };

  return {
    merged:            masterResult.contactable,
    noPhoneImportable: allNoPhoneImportable,
    noPhone:           allNoPhone,
    soldRows:          soldResult.rows,
    soldMeta:          soldResult.meta,
    stats,
    debug,
  };
}
