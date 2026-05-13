#!/usr/bin/env npx tsx
/**
 * PREVIEW ONLY — Saipos + Nemo import dry-run
 *
 * Usage:
 *   npx tsx scripts/preview-saipos-nemo.ts \
 *     <saipos.xlsx> <nemo.xlsx> [sold.xlsx] [--json preview-report.json]
 *
 * Does NOT connect to any database.
 * Does NOT write any customers, products, or aggregates.
 * Does NOT send any CRM messages.
 *
 * Outputs a full preview report to stdout and optionally to a JSON file.
 */

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

// ── Types ────────────────────────────────────────────────────────────────────

interface SaiposRow {
  nome: string | null;
  cpfCnpj: string | null;
  dataAniversario: Date | null;
  email: string | null;
  rawPhone: string;
  normalizedPhone: string | null;
  endereco: string | null;
  qtdPedidos: number | null;
  valorTotal: number | null;
  ticketMedio: number | null;
  ultimaCompra: Date | null;
  saldoTotal: number | null;
  saldoPeriodo: number | null;
  rowIndex: number;
}

interface NemoAddressGroup { street: string; city: string | null; state: string | null; zipCode: string | null; }

interface NemoRow {
  nome: string | null;
  cpf: string | null;
  rawPhone: string;
  normalizedPhone: string | null;
  email: string | null;
  addresses: NemoAddressGroup[];
  rowIndex: number;
}

interface ProductRow {
  rowType: "CATEGORY" | "PRODUCT";
  categoryName: string;
  productName: string | null;
  quantitySold: number;
  grossRevenue: number;
  percent: number | null;
}

interface Warning {
  code: string;
  message: string;
  count?: number;
  samples?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (/^\+[1-9]\d{7,14}$/.test(t)) return t;
  const d = t.replace(/\D/g, "");
  if (!d || d.length < 8) return null;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `+${d}`;
  if (d.length <= 15) return `+${d}`;
  return null;
}

function nc(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9\s/.]/g, " ").replace(/\s+/g, " ").trim();
}

function parseDecimal(raw: string): number | null {
  if (!raw?.trim()) return null;
  const n = parseFloat(raw.trim().replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function parseInt2(raw: string): number | null {
  if (!raw?.trim()) return null;
  const n = parseInt(raw.trim().replace(/\D/g, ""), 10);
  return isNaN(n) ? null : n;
}

function parseBRDate(raw: string | Date | undefined): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  const v = raw.trim();
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br?.[1] && br[2] && br[3]) {
    const d = new Date(`${br[3]}-${br[2].padStart(2,"0")}-${br[1].padStart(2,"0")}`);
    if (!isNaN(d.getTime())) return d;
  }
  const iso = new Date(v);
  return isNaN(iso.getTime()) ? null : iso;
}

interface ColInfo { rawHeader: string; normalizedBase: string; occurrence: number; colIndex: number; }

function buildColInfos(headerRow: unknown[]): ColInfo[] {
  const occ = new Map<string, number>();
  return headerRow.map((h, i) => {
    const raw = String(h ?? "").trim();
    const base = nc(raw.replace(/__\d+$/, ""));
    const o = (occ.get(base) ?? 0) + 1;
    occ.set(base, o);
    return { rawHeader: raw, normalizedBase: base, occurrence: o, colIndex: i };
  });
}

function findCol(cols: ColInfo[], keys: string[], occ = 1): number {
  return cols.find(c => keys.includes(c.normalizedBase) && c.occurrence === occ)?.colIndex ?? -1;
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
  return parseBRDate(String(v ?? ""));
}

// ── Saipos parser ─────────────────────────────────────────────────────────────

function parseSaipos(buffer: Buffer): SaiposRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("cliente")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName!];
  if (!ws) return [];
  const raw2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (raw2D.length < 2) return [];

  const cols = buildColInfos(raw2D[0] as unknown[]);
  const nomeIdx    = findCol(cols, ["nome"]);
  const cpfIdx     = findCol(cols, ["cpf/cnpj", "cpf cnpj", "cpf", "cnpj"]);
  const aniverIdx  = findCol(cols, ["data aniversario", "aniversario"]);
  const emailIdx   = findCol(cols, ["email"]);
  const phoneIdx   = findCol(cols, ["telefone", "fone", "celular"]);
  const endIdx     = findCol(cols, ["endereco", "logradouro", "rua"]);
  const qtdIdx     = findCol(cols, ["qtd. pedidos", "qtd pedidos", "quantidade pedidos", "pedidos"]);
  const totalIdx   = findCol(cols, ["valor total", "total gasto", "total"]);
  const ticketIdx  = findCol(cols, ["ticket medio", "ticket medico"]);
  const lastOrdIdx = findCol(cols, ["ultima compra", "ultimo pedido"]);
  const saldoTotalIdx = (() => {
    let i = findCol(cols, ["saldo financeiro total"]);
    if (i < 0) i = findCol(cols, ["saldo financeiro"], 1);
    return i;
  })();
  const saldoPeriodoIdx = (() => {
    let i = findCol(cols, ["saldo financeiro do periodo", "saldo financeiro periodo"]);
    if (i < 0) i = findCol(cols, ["saldo financeiro"], 2);
    return i;
  })();

  const rows: SaiposRow[] = [];
  for (let r = 1; r < raw2D.length; r++) {
    const row = raw2D[r] as unknown[];
    if (row.every(v => !v || String(v).trim() === "")) continue;
    const rawPhone = cellStr(row, phoneIdx);
    rows.push({
      nome: cellStr(row, nomeIdx) || null,
      cpfCnpj: cellStr(row, cpfIdx) || null,
      dataAniversario: cellDate(row, aniverIdx),
      email: cellStr(row, emailIdx).toLowerCase() || null,
      rawPhone, normalizedPhone: normalizePhone(rawPhone),
      endereco: cellStr(row, endIdx) || null,
      qtdPedidos: parseInt2(cellStr(row, qtdIdx)),
      valorTotal: parseDecimal(cellStr(row, totalIdx)),
      ticketMedio: parseDecimal(cellStr(row, ticketIdx)),
      ultimaCompra: cellDate(row, lastOrdIdx),
      saldoTotal: parseDecimal(cellStr(row, saldoTotalIdx)),
      saldoPeriodo: parseDecimal(cellStr(row, saldoPeriodoIdx)),
      rowIndex: r,
    });
  }
  return rows;
}

// ── Nemo parser ───────────────────────────────────────────────────────────────

const ADDR_KEYS: Record<string, string> = {
  "endereco": "street", "numero": "number", "bairro": "neighborhood",
  "cidade": "city", "complemento": "complement", "referencia": "reference",
  "estado": "state", "cep": "zipCode",
};

function parseNemo(buffer: Buffer): NemoRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("cliente")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName!];
  if (!ws) return [];
  const raw2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (raw2D.length < 2) return [];

  const cols = buildColInfos(raw2D[0] as unknown[]);
  const nomeIdx   = findCol(cols, ["nome"]);
  const cpfIdx    = findCol(cols, ["cpf"]);
  const phoneIdx  = findCol(cols, ["telefone", "fone", "celular"]);
  const emailIdx  = findCol(cols, ["email"]);

  const addrNorms = new Set(Object.keys(ADDR_KEYS));
  let maxGroups = 0;
  for (const c of cols) {
    if (addrNorms.has(c.normalizedBase)) maxGroups = Math.max(maxGroups, c.occurrence);
  }
  const groupMap: Record<string, number>[] = Array.from({ length: maxGroups }, () => ({}));
  for (const c of cols) {
    if (addrNorms.has(c.normalizedBase)) {
      const gi = c.occurrence - 1;
      const gm = groupMap[gi];
      if (gm) gm[ADDR_KEYS[c.normalizedBase]!] = c.colIndex;
    }
  }

  const rows: NemoRow[] = [];
  for (let r = 1; r < raw2D.length; r++) {
    const row = raw2D[r] as unknown[];
    if (row.every(v => !v || String(v).trim() === "")) continue;
    const addresses: NemoAddressGroup[] = [];
    for (const gm of groupMap) {
      const street = cellStr(row, gm["street"] ?? -1);
      if (!street) continue;
      addresses.push({
        street, city: cellStr(row, gm["city"] ?? -1) || null,
        state: cellStr(row, gm["state"] ?? -1) || null,
        zipCode: cellStr(row, gm["zipCode"] ?? -1) || null,
      });
    }
    const rawPhone = cellStr(row, phoneIdx);
    rows.push({
      nome: cellStr(row, nomeIdx) || null,
      cpf: cellStr(row, cpfIdx) || null,
      rawPhone, normalizedPhone: normalizePhone(rawPhone),
      email: cellStr(row, emailIdx).toLowerCase() || null,
      addresses, rowIndex: r,
    });
  }
  return rows;
}

// ── Sold items parser ─────────────────────────────────────────────────────────

interface SoldResult {
  periodStart: Date | null; periodEnd: Date | null; reportTypes: string | null;
  rows: ProductRow[];
  categoryCount: number; productCount: number;
  totalQuantity: number; totalRevenue: number;
}

function parseSold(buffer: Buffer): SoldResult {
  const empty: SoldResult = { periodStart: null, periodEnd: null, reportTypes: null, rows: [], categoryCount: 0, productCount: 0, totalQuantity: 0, totalRevenue: 0 };
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  if (!ws) return empty;
  const raw2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (raw2D.length < 2) return empty;

  let periodStart: Date | null = null, periodEnd: Date | null = null, reportTypes: string | null = null;
  let dataStartRow = 2;

  for (let r = 0; r < Math.min(5, raw2D.length); r++) {
    const line = (raw2D[r] as unknown[]).map(v => String(v ?? "").trim()).join(" ");
    const s = line.match(/Data\s+Inicial[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
    const e = line.match(/Data\s+Final[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
    const t = line.match(/Tipo[:\s]+(.+?)(?:Data|$)/i);
    if (s?.[1]) periodStart = parseBRDate(s[1]);
    if (e?.[1]) periodEnd   = parseBRDate(e[1]);
    if (t?.[1]) reportTypes = t[1].trim();
    if (r > 0 && line.match(/Quantidade|Qtd|Valor/i)) { dataStartRow = r + 1; break; }
  }

  let nameCol = 0, qtyCol = 1, revCol = 2, pctCol = 3;
  if (dataStartRow > 1) {
    const h = buildColInfos(raw2D[dataStartRow - 1] as unknown[]);
    const qi = findCol(h, ["quantidade", "qtd", "qtde"]);
    const ri = findCol(h, ["valor bruto", "valor total", "total", "valor"]);
    const pi = findCol(h, ["participacao", "participacao %", "%", "perc"]);
    if (qi >= 0) qtyCol = qi;
    if (ri >= 0) revCol = ri;
    if (pi >= 0) pctCol = pi;
  }

  const rows: ProductRow[] = [];
  let currentCategory = "";
  let categoryCount = 0, productCount = 0;

  for (let r = dataStartRow; r < raw2D.length; r++) {
    const row = raw2D[r] as unknown[];
    const rawName = cellStr(row, nameCol);
    if (!rawName) continue;
    const isProduct = rawName.startsWith("- ");
    const displayName = isProduct ? rawName.replace(/^-\s*/, "").trim() : rawName.trim();
    const qty = parseDecimal(cellStr(row, qtyCol)) ?? 0;
    const rev = parseDecimal(cellStr(row, revCol)) ?? 0;
    const pct = parseDecimal(cellStr(row, pctCol));
    if (!isProduct) {
      currentCategory = displayName; categoryCount++;
      rows.push({ rowType: "CATEGORY", categoryName: displayName, productName: null, quantitySold: qty, grossRevenue: rev, percent: pct });
    } else {
      if (!currentCategory) continue;
      productCount++;
      rows.push({ rowType: "PRODUCT", categoryName: currentCategory, productName: displayName, quantitySold: qty, grossRevenue: rev, percent: pct });
    }
  }

  const cats = rows.filter(r => r.rowType === "CATEGORY");
  const totalQuantity = cats.reduce((s, r) => s + r.quantitySold, 0);
  const totalRevenue  = cats.reduce((s, r) => s + r.grossRevenue, 0);

  return { periodStart, periodEnd, reportTypes, rows, categoryCount, productCount, totalQuantity, totalRevenue };
}

// ── Match ─────────────────────────────────────────────────────────────────────

interface MatchStats {
  saiposTotal: number; nemoTotal: number;
  saiposWithPhone: number; nemoWithPhone: number;
  uniqueSaiposPhones: number; uniqueNemoPhones: number;
  phoneMatches: number; saiposOnly: number; nemoOnly: number;
  noPhoneCount: number; duplicatePhoneGroupsSaipos: number; duplicatePhoneGroupsNemo: number;
  conflictCount: number; readyCount: number; needsReviewCount: number;
}

interface MatchReport {
  stats: MatchStats;
  warnings: Warning[];
  sampleMerged: Array<{ phone: string; name: string; status: string; sources: string[] }>;
  sampleNoPhone: Array<{ nome: string | null; rawPhone: string; email: string | null }>;
  topProducts: ProductRow[];
  periodStart: string | null; periodEnd: string | null;
  categoryCount: number; productCount: number;
  totalQuantity: number; totalRevenue: number;
}

function matchAll(saipos: SaiposRow[], nemo: NemoRow[], sold: SoldResult): MatchReport {
  const warnings: Warning[] = [];

  // ── Build phone maps ────────────────────────────────────────────────────────
  const saiposMap = new Map<string, SaiposRow[]>();
  for (const r of saipos) {
    if (!r.normalizedPhone) continue;
    const g = saiposMap.get(r.normalizedPhone) ?? [];
    g.push(r);
    saiposMap.set(r.normalizedPhone, g);
  }

  const nemoMap = new Map<string, NemoRow[]>();
  for (const r of nemo) {
    if (!r.normalizedPhone) continue;
    const g = nemoMap.get(r.normalizedPhone) ?? [];
    g.push(r);
    nemoMap.set(r.normalizedPhone, g);
  }

  // ── Duplicate phone groups ─────────────────────────────────────────────────
  const saiposDupGroups = [...saiposMap.values()].filter(g => g.length > 1);
  const nemoDupGroups   = [...nemoMap.values()].filter(g => g.length > 1);

  if (saiposDupGroups.length > 0) {
    warnings.push({
      code: "SAIPOS_DUPLICATE_PHONES",
      message: `${saiposDupGroups.length} telefone(s) aparecem em múltiplas linhas na base Saipos (deduplicados pelo melhor registro)`,
      count: saiposDupGroups.length,
      samples: saiposDupGroups.slice(0, 3).map(g => `${g[0]!.normalizedPhone} (${g.length}x)`),
    });
  }
  if (nemoDupGroups.length > 0) {
    warnings.push({
      code: "NEMO_DUPLICATE_PHONES",
      message: `${nemoDupGroups.length} telefone(s) aparecem em múltiplas linhas na base Nemo`,
      count: nemoDupGroups.length,
      samples: nemoDupGroups.slice(0, 3).map(g => `${g[0]!.normalizedPhone} (${g.length}x)`),
    });
  }

  // ── Name conflict check (same phone, different names) ─────────────────────
  const nameConflicts: string[] = [];
  for (const [phone, sGroup] of saiposMap) {
    const nGroup = nemoMap.get(phone);
    if (!nGroup) continue;
    const sName = sGroup[0]?.nome?.trim().toLowerCase();
    const nName = nGroup[0]?.nome?.trim().toLowerCase();
    if (sName && nName && sName !== nName && !sName.includes(nName) && !nName.includes(sName)) {
      nameConflicts.push(`${phone}: "${sGroup[0]?.nome}" vs "${nGroup[0]?.nome}"`);
    }
  }
  if (nameConflicts.length > 0) {
    warnings.push({
      code: "NAME_CONFLICT",
      message: `${nameConflicts.length} telefone(s) têm nomes diferentes entre Saipos e Nemo (Saipos é master)`,
      count: nameConflicts.length,
      samples: nameConflicts.slice(0, 5),
    });
  }

  // ── Document conflict check ───────────────────────────────────────────────
  const docConflicts: string[] = [];
  for (const [phone, sGroup] of saiposMap) {
    const nGroup = nemoMap.get(phone);
    if (!nGroup) continue;
    const sDoc = sGroup[0]?.cpfCnpj?.replace(/\D/g, "");
    const nDoc = nGroup[0]?.cpf?.replace(/\D/g, "");
    if (sDoc && nDoc && sDoc !== nDoc) {
      docConflicts.push(`${phone}: Saipos="${sDoc}" Nemo="${nDoc}"`);
    }
  }
  if (docConflicts.length > 0) {
    warnings.push({
      code: "DOCUMENT_CONFLICT",
      message: `${docConflicts.length} telefone(s) com documentos divergentes entre Saipos e Nemo`,
      count: docConflicts.length,
      samples: docConflicts.slice(0, 3),
    });
  }

  // ── Invalid date check ────────────────────────────────────────────────────
  const invalidDates = saipos.filter(r => {
    if (!r.ultimaCompra) return false;
    const y = r.ultimaCompra.getFullYear();
    return y < 2000 || y > 2030;
  }).length;
  if (invalidDates > 0) {
    warnings.push({ code: "INVALID_DATE", message: `${invalidDates} linha(s) com data de última compra fora do intervalo 2000-2030` });
  }

  // ── Invalid money check ───────────────────────────────────────────────────
  const invalidMoney = saipos.filter(r => r.valorTotal !== null && r.valorTotal < 0).length;
  if (invalidMoney > 0) {
    warnings.push({ code: "INVALID_MONEY", message: `${invalidMoney} linha(s) com valor total negativo` });
  }

  // ── Financial balance ambiguity ───────────────────────────────────────────
  const hasSaldoTotal   = saipos.filter(r => r.saldoTotal !== null).length;
  const hasSaldoPeriodo = saipos.filter(r => r.saldoPeriodo !== null).length;
  if (hasSaldoTotal === 0 && hasSaldoPeriodo === 0) {
    warnings.push({ code: "NO_FINANCIAL_BALANCE", message: "Nenhum valor de saldo financeiro detectado nas colunas da base Saipos (colunas podem ter nome diferente)" });
  } else if (hasSaldoTotal > 0 && hasSaldoPeriodo === 0) {
    warnings.push({ code: "SINGLE_SALDO_COLUMN", message: `Apenas 1 coluna de saldo detectada (${hasSaldoTotal} linhas com saldo total, 0 com saldo período). Verificar se a planilha tem 2 colunas "Saldo Financeiro".` });
  }

  // ── No-phone rows ─────────────────────────────────────────────────────────
  const noPhoneRows = saipos.filter(r => !r.normalizedPhone);
  const noPhoneWithEmail = noPhoneRows.filter(r => r.email).length;
  if (noPhoneRows.length > 0) {
    warnings.push({
      code: "NO_PHONE_SAIPOS",
      message: `${noPhoneRows.length} linha(s) Saipos sem telefone válido serão ignoradas na importação (${noPhoneWithEmail} têm email — não serão criados como clientes)`,
      count: noPhoneRows.length,
    });
  }

  // ── Sold period check ─────────────────────────────────────────────────────
  if (!sold.periodStart || !sold.periodEnd) {
    warnings.push({ code: "SOLD_NO_PERIOD", message: "Período do relatório ItensVendidos não detectado — datas ficarão nulas nos aggregates" });
  }

  // ── Build stats ───────────────────────────────────────────────────────────
  const saiposWithPhone = saipos.filter(r => r.normalizedPhone).length;
  const nemoWithPhone   = nemo.filter(r => r.normalizedPhone).length;
  const phoneMatches    = [...saiposMap.keys()].filter(p => nemoMap.has(p)).length;
  const saiposOnly      = saiposMap.size - phoneMatches;
  const nemoOnly        = nemoMap.size - phoneMatches;
  const readyCount      = saiposMap.size; // Saipos phone records = READY
  const needsReviewCount = nemoOnly;       // Nemo-only = NEEDS_REVIEW

  const stats: MatchStats = {
    saiposTotal: saipos.length,
    nemoTotal: nemo.length,
    saiposWithPhone,
    nemoWithPhone,
    uniqueSaiposPhones: saiposMap.size,
    uniqueNemoPhones: nemoMap.size,
    phoneMatches,
    saiposOnly,
    nemoOnly,
    noPhoneCount: noPhoneRows.length,
    duplicatePhoneGroupsSaipos: saiposDupGroups.length,
    duplicatePhoneGroupsNemo: nemoDupGroups.length,
    conflictCount: docConflicts.length,
    readyCount,
    needsReviewCount,
  };

  // ── Sample merged ─────────────────────────────────────────────────────────
  const sampleMerged: MatchReport["sampleMerged"] = [];
  let i = 0;
  for (const [phone, sGroup] of saiposMap) {
    if (i++ >= 5) break;
    const nGroup = nemoMap.get(phone);
    sampleMerged.push({
      phone,
      name: sGroup[0]?.nome ?? "Sem nome",
      status: "READY",
      sources: nGroup ? ["SAIPOS", "NEMO"] : ["SAIPOS"],
    });
  }
  for (const [phone, nGroup] of nemoMap) {
    if (saiposMap.has(phone)) continue;
    if (i++ >= 10) break;
    sampleMerged.push({ phone, name: nGroup[0]?.nome ?? "Sem nome", status: "NEEDS_REVIEW", sources: ["NEMO"] });
  }

  const sampleNoPhone = noPhoneRows.slice(0, 10).map(r => ({ nome: r.nome, rawPhone: r.rawPhone, email: r.email }));

  const topProducts = sold.rows
    .filter(r => r.rowType === "PRODUCT")
    .sort((a, b) => b.grossRevenue - a.grossRevenue)
    .slice(0, 10);

  return {
    stats, warnings, sampleMerged, sampleNoPhone, topProducts,
    periodStart: sold.periodStart?.toISOString().slice(0, 10) ?? null,
    periodEnd:   sold.periodEnd?.toISOString().slice(0, 10) ?? null,
    categoryCount: sold.categoryCount,
    productCount:  sold.productCount,
    totalQuantity: sold.totalQuantity,
    totalRevenue:  sold.totalRevenue,
  };
}

// ── Report printer ────────────────────────────────────────────────────────────

function hr(char = "─", len = 70) { return char.repeat(len); }
function fmt(n: number) { return n.toLocaleString("pt-BR"); }
function fmtBRL(n: number) { return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function printReport(report: MatchReport, elapsed: number) {
  const { stats, warnings } = report;
  console.log();
  console.log(hr("═"));
  console.log("  RELATÓRIO DE PREVIEW — IMPORTAÇÃO SAIPOS + NEMO");
  console.log(`  Gerado em: ${new Date().toLocaleString("pt-BR")}`);
  console.log(hr("═"));

  console.log();
  console.log("  ── CLIENTES ─────────────────────────────────────────────────");
  console.log(`  Saipos total de linhas       : ${fmt(stats.saiposTotal)}`);
  console.log(`  Nemo total de linhas         : ${fmt(stats.nemoTotal)}`);
  console.log(`  Saipos linhas com telefone   : ${fmt(stats.saiposWithPhone)}`);
  console.log(`  Nemo linhas com telefone     : ${fmt(stats.nemoWithPhone)}`);
  console.log(`  Saipos telefones únicos      : ${fmt(stats.uniqueSaiposPhones)}`);
  console.log(`  Nemo telefones únicos        : ${fmt(stats.uniqueNemoPhones)}`);
  console.log(`  Matches (mesmo telefone)     : ${fmt(stats.phoneMatches)}`);
  console.log(`  Saipos-only                  : ${fmt(stats.saiposOnly)}`);
  console.log(`  Nemo-only (NEEDS_REVIEW)     : ${fmt(stats.nemoOnly)}`);
  console.log(`  Sem telefone (ignorados)     : ${fmt(stats.noPhoneCount)}`);
  console.log(`  Grupos dup. telefone Saipos  : ${fmt(stats.duplicatePhoneGroupsSaipos)}`);
  console.log(`  Grupos dup. telefone Nemo    : ${fmt(stats.duplicatePhoneGroupsNemo)}`);
  console.log(`  Conflitos de documento       : ${fmt(stats.conflictCount)}`);
  console.log(`  ✅ Prontos para importar     : ${fmt(stats.readyCount)}`);
  console.log(`  ⚠️  Precisam de revisão      : ${fmt(stats.needsReviewCount)}`);

  console.log();
  console.log("  ── PRODUTOS AGREGADOS ───────────────────────────────────────");
  console.log(`  Período início               : ${report.periodStart ?? "não detectado"}`);
  console.log(`  Período fim                  : ${report.periodEnd   ?? "não detectado"}`);
  console.log(`  Categorias                   : ${fmt(report.categoryCount)}`);
  console.log(`  Produtos                     : ${fmt(report.productCount)}`);
  console.log(`  Quantidade total vendida     : ${fmt(report.totalQuantity)}`);
  console.log(`  Receita bruta total          : ${fmtBRL(report.totalRevenue)}`);

  if (report.topProducts.length > 0) {
    console.log();
    console.log("  Top 10 produtos por receita:");
    console.log(`  ${"Produto".padEnd(40)} ${"Qtd".padStart(8)} ${"Receita".padStart(14)}`);
    console.log(`  ${hr("-", 64)}`);
    for (const p of report.topProducts) {
      console.log(`  ${(p.productName ?? "(sem nome)").padEnd(40)} ${fmt(p.quantitySold).padStart(8)} ${fmtBRL(p.grossRevenue).padStart(14)}`);
    }
  }

  console.log();
  console.log("  ── AMOSTRA DE CLIENTES MESCLADOS ────────────────────────────");
  for (const r of report.sampleMerged.slice(0, 5)) {
    console.log(`  [${r.status}] ${r.phone} — ${r.name} (${r.sources.join("+")})`);
  }
  if (report.sampleNoPhone.length > 0) {
    console.log();
    console.log("  ── AMOSTRA SEM TELEFONE (não serão importados) ──────────────");
    for (const r of report.sampleNoPhone.slice(0, 5)) {
      console.log(`  "${r.nome ?? "(sem nome)"}" rawPhone="${r.rawPhone}" email=${r.email ?? "—"}`);
    }
  }

  console.log();
  console.log("  ── AVISOS ───────────────────────────────────────────────────");
  if (warnings.length === 0) {
    console.log("  ✅ Nenhum aviso");
  } else {
    for (const w of warnings) {
      const icon = w.code.includes("CONFLICT") || w.code === "INVALID_DATE" || w.code === "INVALID_MONEY" ? "❌" : "⚠️ ";
      console.log(`  ${icon} [${w.code}] ${w.message}`);
      if (w.samples?.length) {
        for (const s of w.samples) console.log(`       → ${s}`);
      }
    }
  }

  console.log();
  console.log("  ── CONFIRMAÇÃO DE SEGURANÇA ─────────────────────────────────");
  console.log("  ✅ Nenhum registro Customer criado ou modificado");
  console.log("  ✅ Nenhum Order criado");
  console.log("  ✅ Nenhum OrderItem criado");
  console.log("  ✅ Nenhum ProductSalesAggregate criado");
  console.log("  ✅ Nenhuma mensagem CRM enviada");
  console.log("  ✅ Nenhuma conexão com banco de dados utilizada");
  console.log(`  ✅ Tempo de execução: ${elapsed}ms`);

  console.log();
  const hasBlockers = warnings.some(w => w.code === "SOLD_NO_PERIOD") || stats.uniqueSaiposPhones === 0;
  const hasCritical = warnings.some(w => w.code.includes("CONFLICT") || w.code === "INVALID_DATE" || w.code === "INVALID_MONEY");
  if (hasBlockers) {
    console.log("  🔴 BLOQUEADORES ANTES DE EXECUTAR:");
    if (stats.uniqueSaiposPhones === 0) console.log("     • Nenhum telefone válido encontrado na base Saipos — verificar colunas");
    if (warnings.some(w => w.code === "SOLD_NO_PERIOD")) console.log("     • Período não detectado em ItensVendidos — aggregates ficarão sem data");
  } else if (hasCritical) {
    console.log("  🟡 PODE EXECUTAR COM RESSALVAS — verificar conflitos acima antes de prosseguir");
  } else {
    console.log("  🟢 SEGURO PARA EXECUTAR — nenhum bloqueador encontrado");
  }

  console.log();
  console.log(hr("═"));
}

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonFlag = args.indexOf("--json");
const jsonOut  = jsonFlag >= 0 ? args[jsonFlag + 1] : null;
const fileArgs = args.filter((_, i) => i !== jsonFlag && i !== jsonFlag + 1);

if (fileArgs.length < 2) {
  console.error("Uso: npx tsx scripts/preview-saipos-nemo.ts <saipos.xlsx> <nemo.xlsx> [sold.xlsx] [--json saida.json]");
  process.exit(1);
}

const saiposPath = path.resolve(fileArgs[0]!);
const nemoPath   = path.resolve(fileArgs[1]!);
const soldPath   = fileArgs[2] ? path.resolve(fileArgs[2]) : null;

for (const p of [saiposPath, nemoPath, ...(soldPath ? [soldPath] : [])]) {
  if (!fs.existsSync(p)) { console.error(`Arquivo não encontrado: ${p}`); process.exit(1); }
}

console.log("\nLendo arquivos...");
const t0 = Date.now();

const saiposRows = parseSaipos(fs.readFileSync(saiposPath));
console.log(`  Saipos: ${saiposRows.length} linhas`);

const nemoRows = parseNemo(fs.readFileSync(nemoPath));
console.log(`  Nemo:   ${nemoRows.length} linhas`);

const soldResult = soldPath
  ? parseSold(fs.readFileSync(soldPath))
  : { periodStart: null, periodEnd: null, reportTypes: null, rows: [], categoryCount: 0, productCount: 0, totalQuantity: 0, totalRevenue: 0 };
if (soldPath) console.log(`  Sold:   ${soldResult.rows.length} linhas (${soldResult.categoryCount} categorias, ${soldResult.productCount} produtos)`);

const report = matchAll(saiposRows, nemoRows, soldResult);
const elapsed = Date.now() - t0;

printReport(report, elapsed);

if (jsonOut) {
  fs.writeFileSync(path.resolve(jsonOut), JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2), "utf8");
  console.log(`\nRelatório JSON salvo em: ${jsonOut}\n`);
}
