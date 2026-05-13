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

export interface SoldItemsResult {
  meta: SoldItemsMeta;
  rows: ProductSalesRow[];
  categoryCount: number;
  productCount: number;
  totalQuantity: number;
  totalRevenue: number;
}

export interface MergedCustomer {
  name: string;
  phone: string;
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
  noPhoneCount: number;
  conflictCount: number;
  readyCount: number;
  needsReviewCount: number;
}

export interface MatchResult {
  merged: MergedCustomer[];
  noPhone: NoPhoneCustomer[];
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
  sampleMerged: MergedCustomer[];
  sampleNoPhone: NoPhoneCustomer[];
  topProducts: ProductSalesRow[];
}

export interface StoredReport {
  merged: MergedCustomer[];
  noPhone: NoPhoneCustomer[];
  soldRows: ProductSalesRow[];
  soldMeta: SoldItemsMeta;
  preview: SaiposNemoPreview;
}

export interface SaiposNemoExecuteResult {
  customersCreated: number;
  customersUpdated: number;
  customersSkippedNoPhone: number;
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
  if (!ws) return { meta: { periodStart: null, periodEnd: null, reportTypes: null }, rows: [], categoryCount: 0, productCount: 0, totalQuantity: 0, totalRevenue: 0 };

  const raw2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (raw2D.length < 2) return { meta: { periodStart: null, periodEnd: null, reportTypes: null }, rows: [], categoryCount: 0, productCount: 0, totalQuantity: 0, totalRevenue: 0 };

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

  return {
    meta: { periodStart: metaStart, periodEnd: metaEnd, reportTypes: metaTypes },
    rows: productRows,
    categoryCount,
    productCount,
    totalQuantity,
    totalRevenue,
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

  // Step 3: Collect no-phone Saipos rows
  for (const row of saipos) {
    if (!row.normalizedPhone) {
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

  // Compute stats
  const saiposWithPhone = saiposPhone.size;
  const nemoWithPhone   = nemoPhone.size;
  const phoneMatches    = [...saiposPhone.keys()].filter(p => nemoPhone.has(p)).length;
  const saiposOnly      = saiposWithPhone - phoneMatches;
  const nemoOnly        = nemoWithPhone - phoneMatches;
  const readyCount      = merged.filter(r => r.importStatus === "READY").length;
  const needsReviewCount = merged.filter(r => r.importStatus !== "READY").length;

  return {
    merged,
    noPhone,
    stats: {
      saiposTotal: saipos.length,
      nemoTotal: nemo.length,
      saiposWithPhone,
      nemoWithPhone,
      phoneMatches,
      saiposOnly,
      nemoOnly,
      noPhoneCount: noPhone.length,
      conflictCount: 0,
      readyCount,
      needsReviewCount,
    },
  };
}

// ── Preview report ─────────────────────────────────────────────────────────────

export function buildPreview(match: MatchResult, sold: SoldItemsResult): SaiposNemoPreview {
  const topProducts = sold.rows
    .filter(r => r.rowType === "PRODUCT")
    .sort((a, b) => b.grossRevenue - a.grossRevenue)
    .slice(0, 10);

  return {
    stats: match.stats,
    periodStart: sold.meta.periodStart?.toISOString().slice(0, 10) ?? null,
    periodEnd:   sold.meta.periodEnd?.toISOString().slice(0, 10) ?? null,
    categoryCount: sold.categoryCount,
    productCount:  sold.productCount,
    totalQuantity: sold.totalQuantity,
    totalRevenue:  sold.totalRevenue,
    sampleMerged:  match.merged.slice(0, 10),
    sampleNoPhone: match.noPhone.slice(0, 10),
    topProducts,
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

  let customersCreated    = 0;
  let customersUpdated    = 0;
  let addressesCreated    = 0;
  let productAggCreated   = 0;
  let productAggSkipped   = 0;

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
    customersCreated += batch.length;
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
    customersUpdated += batch.length;

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

  // ── Insert product sales aggregates ───────────────────────────────────────
  if (soldRows.length > 0 && soldMeta.periodStart && soldMeta.periodEnd) {
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
    customersCreated,
    customersUpdated,
    customersSkippedNoPhone: noPhone.length,
    addressesCreated,
    productAggregatesCreated: productAggCreated,
    productAggregatesSkipped: productAggSkipped,
  };
}
