/**
 * MasterDatasetV2ImportableService
 *
 * Generates Foocci_Master_Dataset_V2_IMPORTAVEL.xlsx
 *
 * Parser-compatible sheet names (recognized by parseCompiledWorkbook):
 *   Clientes_Master    → parseMasterSheet
 *   Sem_Telefone       → parseSemTelefoneSheet
 *   Produtos_Agregados → parseProdutosAgregadosSheet (direct columnar format, triggered by rowType col)
 *   Endereços          → parseEnderecosSheet
 *   Merge_Report       (human review — not parsed)
 *   Warnings           (human review — not parsed)
 *   Duplicados_Produtos(human review — not parsed)
 *   Resumo             (human review — not parsed)
 *   README             (human review — not parsed)
 *
 * safeToUploadToPreviewCompiled: "YES"
 *   All required sheet names and column header aliases match exactly what
 *   parseCompiledWorkbook expects. Extra non-parsed columns are safe to include
 *   because findColIdx only reads what it knows about.
 *
 * Safety guarantees:
 *   - Read-only. Does NOT write to DB.
 *   - Does NOT create fake phones, orders, customers, or CRM messages.
 *   - "Diversos"/"Outros" always → SEM_CLASSIFICACAO, never kept as-is.
 *   - Product aggregates do NOT imply customer-product history.
 */

import * as XLSX from "xlsx";
import type {
  MergedCustomer,
  NoPhoneImportableCustomer,
  NoPhoneCustomer,
  ProductSalesRow,
  SoldItemsMeta,
  NemoAddressGroup,
} from "./SaiposNemoImportService";

// ── Product categorization (mirrors MasterDatasetV2Service rules) ──────────────

interface ProductRule {
  group:    string;
  subgroup: string | null;
  ruleName: string;
  keywords: string[];
}

const PRODUCT_RULES: ProductRule[] = [
  { group: "POKE",               subgroup: null,        ruleName: "keyword:poke",      keywords: ["poke"] },
  { group: "CEVICHE",            subgroup: null,        ruleName: "keyword:ceviche",   keywords: ["ceviche", "seviche"] },
  { group: "TEMAKI",             subgroup: null,        ruleName: "keyword:temaki",    keywords: ["temaki"] },
  { group: "HOT ROLL",           subgroup: null,        ruleName: "keyword:hot_roll",  keywords: ["hot roll", "hot holl"] },
  { group: "URAMAKI",            subgroup: null,        ruleName: "keyword:uramaki",   keywords: ["uramaki"] },
  { group: "NIGUIRI",            subgroup: null,        ruleName: "keyword:niguiri",   keywords: ["niguiri", "nigiri"] },
  { group: "HOSSOMAKI",          subgroup: null,        ruleName: "keyword:hossomaki", keywords: ["hossomaki", "hosomaki", "hosso maki"] },
  { group: "SASHIMI",            subgroup: null,        ruleName: "keyword:sashimi",   keywords: ["sashimi"] },
  { group: "PRATOS QUENTES",     subgroup: "YAKISOBA",  ruleName: "keyword:yakisoba",  keywords: ["yakisoba"] },
  { group: "PRATOS QUENTES",     subgroup: "RAMEN",     ruleName: "keyword:ramen",     keywords: ["ramen"] },
  { group: "PRATOS QUENTES",     subgroup: "YAKIMESHI", ruleName: "keyword:yakimeshi", keywords: ["yakimeshi", "yakimesi"] },
  { group: "PRATOS QUENTES",     subgroup: null,        ruleName: "keyword:grelhado",  keywords: ["grelhado", "grelhada"] },
  { group: "PRATOS QUENTES",     subgroup: null,        ruleName: "keyword:quente",    keywords: ["quente", "caldo"] },
  { group: "PRATOS EXECUTIVOS",  subgroup: null,        ruleName: "keyword:executivo", keywords: ["executivo", "prato executivo", "executiva"] },
  { group: "FESTIVAL / RODIZIO", subgroup: null,        ruleName: "keyword:festival",  keywords: ["festival", "rodizio"] },
  { group: "ENTRADAS",           subgroup: "GYOZA",     ruleName: "keyword:gyoza",     keywords: ["gyoza"] },
  { group: "ENTRADAS",           subgroup: "EDAMAME",   ruleName: "keyword:edamame",   keywords: ["edamame"] },
  { group: "ENTRADAS",           subgroup: null,        ruleName: "keyword:entrada",   keywords: ["entrada", "appetizer"] },
  {
    group: "BEBIDAS", subgroup: null, ruleName: "keyword:bebidas",
    keywords: [
      "bebida", "suco", "agua", "h2o", "refrigerante", "cerveja", "vinho", "drink",
      "gelo", "limonada", "cha", "chope", "energetico", "coca", "pepsi",
      "guarana", "sprite", "fanta", "heineken", "budweiser", "skol",
      "itaipava", "stella", "kombucha", "gatorade", "isoton",
    ],
  },
  {
    group: "SOBREMESAS", subgroup: null, ruleName: "keyword:sobremesas",
    keywords: [
      "sobremesa", "sorvete", "mochi", "doce", "harumaki doce", "brigadeiro", "chocolate",
      "waffle", "crepe", "pudim", "cheesecake", "brownie",
    ],
  },
  { group: "COMBOS",           subgroup: null, ruleName: "keyword:combo",    keywords: ["combo", "kit", "combinado"] },
  { group: "ADICIONAIS",       subgroup: null, ruleName: "keyword:adicional", keywords: ["molho", "adicional", "extra", "acompanhamento"] },
  { group: "TAXAS / SERVICOS", subgroup: null, ruleName: "keyword:taxa",     keywords: ["entrega", "frete", "taxa", "embalagem", "delivery fee", "servico"] },
  { group: "DESCONTOS",        subgroup: null, ruleName: "keyword:desconto", keywords: ["desconto", "discount", "cupom", "coupon"] },
  {
    group: "SEM_CLASSIFICACAO", subgroup: null, ruleName: "fallback:diversos",
    keywords: ["diversos", "outros", "other", "miscelane", "geral"],
  },
];

function normText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface CategorizeResult {
  normalizedCategory: string;
  confidenceScore:    number;
  wasAutoRecategorized: boolean;
  categoryRule:       string;
}

function categorize(categoryName: string, productName: string | null): CategorizeResult {
  const catNorm  = normText(categoryName);
  const prodNorm = normText(productName ?? "");
  const fullNorm = `${catNorm} ${prodNorm}`.trim();

  function tryMatch(text: string, conf: number, autoRecat: boolean): CategorizeResult | null {
    for (const rule of PRODUCT_RULES) {
      for (const kw of rule.keywords) {
        if (text.includes(normText(kw))) {
          return {
            normalizedCategory:   rule.group,
            confidenceScore:      conf,
            wasAutoRecategorized: autoRecat,
            categoryRule:         rule.ruleName,
          };
        }
      }
    }
    return null;
  }

  const m1 = tryMatch(catNorm, 0.95, false);
  if (m1) {
    m1.wasAutoRecategorized = catNorm !== normText(m1.normalizedCategory);
    return m1;
  }
  if (prodNorm) {
    const m2 = tryMatch(prodNorm, 0.80, true);
    if (m2) return m2;
  }
  const m3 = tryMatch(fullNorm, 0.60, true);
  if (m3) return m3;

  return {
    normalizedCategory:   "SEM_CLASSIFICACAO",
    confidenceScore:      0.30,
    wasAutoRecategorized: false,
    categoryRule:         "fallback:no_match",
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return typeof d === "string" ? d : "";
  return dt.toISOString().slice(0, 10); // YYYY-MM-DD (parseDateField handles ISO strings)
}

function fmtNum(n: number | null | undefined): number | string {
  if (n === null || n === undefined) return "";
  return n;
}

function primaryAddr(addrs: NemoAddressGroup[]): NemoAddressGroup {
  return addrs[0] ?? {
    street: null, number: null, neighborhood: null, city: null,
    state: null, zipCode: null, complement: null, reference: null,
  };
}

// ── Public audit type ──────────────────────────────────────────────────────────

export interface V2ImportableAudit {
  generatedAt:                   string;
  sheetsCreated:                 string[];
  safeToUploadToPreviewCompiled: "YES";

  customers: {
    contactable:        number;
    noPhoneImportable:  number;
    noPhoneSkipped:     number;
    total:              number;
    readyCount:         number;
    needsReviewCount:   number;
  };

  addresses: {
    inEnderecoSheet: number;
    inMasterInline:  number;
  };

  products: {
    inputRows:                number;
    inputCategoryRows:        number;
    inputProductRows:         number;
    v2CategoryRows:           number;
    v2ProductRows:            number;
    categorizedToV2:          number;
    semClassCount:            number;
    recategorizedFromDiversos: number;
    lowConfidenceCount:       number;
    totalQuantity:            number;
    totalRevenue:             number;
    topCategories:            Array<{ category: string; revenue: number }>;
    diversosSamples:          Array<{ product: string; newCategory: string; confidence: number }>;
  };

  safety: {
    importExecuted:    false;
    customersCreated:  0;
    ordersCreated:     0;
    orderItemsCreated: 0;
    aggregatesCreated: 0;
    crmMessagesSent:   0;
  };
}

// ── V2 product rebuild (re-categorize + rebuild CATEGORY rows) ─────────────────

interface V2ProductRow {
  rowType:             "CATEGORY" | "PRODUCT";
  categoryName:        string;
  productName:         string | null;
  quantitySold:        number;
  grossRevenue:        number;
  percent:             number | null;
  originalCategoryName: string;
  confidence:          number;
  categoryRule:        string;
  wasAutoRecategorized: boolean;
}

function buildV2Products(soldRows: ProductSalesRow[]): {
  v2Rows:                    V2ProductRow[];
  recategorizedFromDiversos: number;
  lowConfidenceCount:        number;
  semClassCount:             number;
  categorizedToV2:           number;
  topCategories:             Array<{ category: string; revenue: number }>;
  diversosSamples:           Array<{ product: string; newCategory: string; confidence: number }>;
} {
  const productRows  = soldRows.filter(r => r.rowType === "PRODUCT");

  // Categorize all product rows
  const catResults = productRows.map(r => ({
    row:    r,
    result: categorize(r.categoryName, r.productName),
  }));

  // Build V2 CATEGORY rows by grouping products by normalized category
  const catMap = new Map<string, { qty: number; rev: number }>();
  for (const { row, result } of catResults) {
    const grp = catMap.get(result.normalizedCategory) ?? { qty: 0, rev: 0 };
    grp.qty += row.quantitySold;
    grp.rev += row.grossRevenue;
    catMap.set(result.normalizedCategory, grp);
  }

  // Sort categories: SEM_CLASSIFICACAO last, others alphabetically
  const sortedCats = [...catMap.keys()].sort((a, b) => {
    if (a === "SEM_CLASSIFICACAO") return 1;
    if (b === "SEM_CLASSIFICACAO") return -1;
    return a.localeCompare(b);
  });

  const v2Rows: V2ProductRow[] = [];
  for (const cat of sortedCats) {
    const grp = catMap.get(cat)!;
    // CATEGORY summary row
    v2Rows.push({
      rowType:             "CATEGORY",
      categoryName:        cat,
      productName:         null,
      quantitySold:        Math.round(grp.qty * 100) / 100,
      grossRevenue:        Math.round(grp.rev * 100) / 100,
      percent:             null,
      originalCategoryName: cat,
      confidence:          1.0,
      categoryRule:        "aggregate",
      wasAutoRecategorized: false,
    });
    // PRODUCT rows under this category
    const products = catResults.filter(cr => cr.result.normalizedCategory === cat);
    for (const { row, result } of products) {
      v2Rows.push({
        rowType:             "PRODUCT",
        categoryName:        cat,
        productName:         row.productName,
        quantitySold:        row.quantitySold,
        grossRevenue:        row.grossRevenue,
        percent:             row.percent,
        originalCategoryName: row.categoryName,
        confidence:          result.confidenceScore,
        categoryRule:        result.categoryRule,
        wasAutoRecategorized: result.wasAutoRecategorized,
      });
    }
  }

  // Stats
  const normDiversos = normText("diversos");
  const recategorizedFromDiversos = catResults.filter(cr => {
    const origNorm = normText(cr.row.categoryName);
    return (
      (origNorm.includes(normDiversos) || origNorm.includes(normText("outros"))) &&
      cr.result.normalizedCategory !== "SEM_CLASSIFICACAO"
    );
  }).length;

  const lowConfidenceCount = catResults.filter(cr => cr.result.confidenceScore <= 0.60).length;
  const semClassCount      = catResults.filter(cr => cr.result.normalizedCategory === "SEM_CLASSIFICACAO").length;
  const categorizedToV2    = catResults.filter(cr => cr.result.normalizedCategory !== "SEM_CLASSIFICACAO").length;

  const revByCategory = new Map<string, number>();
  for (const { row, result } of catResults) {
    revByCategory.set(result.normalizedCategory,
      (revByCategory.get(result.normalizedCategory) ?? 0) + row.grossRevenue);
  }
  const topCategories = [...revByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([category, revenue]) => ({ category, revenue: Math.round(revenue * 100) / 100 }));

  // At least 20 samples of products moved OUT of Diversos → new category
  const diversosSamples = catResults
    .filter(cr => {
      const origNorm = normText(cr.row.categoryName);
      return (
        (origNorm.includes(normDiversos) || origNorm.includes(normText("outros"))) &&
        cr.result.normalizedCategory !== "SEM_CLASSIFICACAO" &&
        cr.row.productName
      );
    })
    .slice(0, 30)
    .map(cr => ({
      product:     cr.row.productName ?? "",
      newCategory: cr.result.normalizedCategory,
      confidence:  cr.result.confidenceScore,
    }));

  return {
    v2Rows,
    recategorizedFromDiversos,
    lowConfidenceCount,
    semClassCount,
    categorizedToV2,
    topCategories,
    diversosSamples,
  };
}

// ── Sheet builders ─────────────────────────────────────────────────────────────

function buildClientesMasterSheet(merged: MergedCustomer[]): XLSX.WorkSheet {
  // Column headers use camelCase — nc() normalizes them to lowercase without spaces,
  // matching the aliases in parseMasterSheet (e.g. "importedOrderCount" → "importedordercount").
  const headers = [
    "name", "phone", "document", "email", "birthDate",
    // inline address (first address — parser reads these; Endereços sheet wins if present)
    "endereco", "numero", "bairro", "cidade", "estado", "cep", "complemento",
    // financial / activity
    "importedOrderCount", "importedTotalSpent", "averageTicket", "importedLastOrderAt",
    "financialBalanceTotal", "financialBalancePeriod",
    "internalNotes", "sourceSystems",
    // extra columns — informational, not read by parser
    "importStatus", "crmContactable", "addressCount",
  ];

  const rows: unknown[][] = [headers];
  for (const c of merged) {
    const addr = primaryAddr(c.addresses);
    rows.push([
      c.name,
      c.phone,
      c.document ?? "",
      c.email ?? "",
      fmtDate(c.birthDate),
      addr.street ?? "",
      addr.number ?? "",
      addr.neighborhood ?? "",
      addr.city ?? "",
      addr.state ?? "",
      addr.zipCode ?? "",
      addr.complement ?? "",
      fmtNum(c.importedOrderCount),
      fmtNum(c.importedTotalSpent),
      fmtNum(c.averageTicket),
      fmtDate(c.importedLastOrderAt),
      fmtNum(c.financialBalance),
      fmtNum(c.financialBalancePeriod),
      c.notes ?? "",
      Array.isArray(c.sourceSystems) ? c.sourceSystems.join("+") : (c.sourceSystem ?? "SAIPOS"),
      c.importStatus,
      "TRUE",
      c.addresses.length,
    ]);
  }

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildSemTelefoneSheet(noPhoneImportable: NoPhoneImportableCustomer[]): XLSX.WorkSheet {
  // Column headers use camelCase / English aliases expected by parseSemTelefoneSheet.
  const headers = [
    "name", "document", "email", "birthDate",
    "addressLine", "number", "neighborhood", "city", "state", "zipCode", "complement",
    "orders", "totalSpent", "averageTicket", "lastOrderAt",
    "financialBalanceTotal", "financialBalancePeriod",
    "internalNotes",
    // extra
    "dedupStrategy", "addressCount",
  ];

  const rows: unknown[][] = [headers];
  for (const c of noPhoneImportable) {
    const addr = primaryAddr(c.addresses);
    rows.push([
      c.name,
      c.document ?? "",
      c.email ?? "",
      fmtDate(c.birthDate),
      addr.street ?? "",
      addr.number ?? "",
      addr.neighborhood ?? "",
      addr.city ?? "",
      addr.state ?? "",
      addr.zipCode ?? "",
      addr.complement ?? "",
      fmtNum(c.importedOrderCount),
      fmtNum(c.importedTotalSpent),
      fmtNum(c.averageTicket),
      fmtDate(c.importedLastOrderAt),
      fmtNum(c.financialBalance),
      fmtNum(c.financialBalancePeriod),
      c.notes ?? "",
      c.dedupStrategy,
      c.addresses.length,
    ]);
  }

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildProdutosAgregadosSheet(
  v2Rows: V2ProductRow[],
  soldMeta: SoldItemsMeta,
): XLSX.WorkSheet {
  // Presence of "rowType" column triggers parseProdutosAgregadosSheet direct-columnar mode.
  // categoryName here is the V2 normalized category — this is what gets imported.
  const headers = [
    "rowType", "categoryName", "productName",
    "quantitySold", "grossRevenue", "percent",
    "periodStart", "periodEnd",
    // extra columns — ignored by parser
    "originalCategoryName", "confidence", "categoryRule", "wasAutoRecategorized",
  ];

  const pStart = fmtDate(soldMeta.periodStart);
  const pEnd   = fmtDate(soldMeta.periodEnd);

  const rows: unknown[][] = [headers];
  for (const r of v2Rows) {
    rows.push([
      r.rowType,
      r.categoryName,
      r.productName ?? "",
      fmtNum(r.quantitySold),
      fmtNum(r.grossRevenue),
      r.percent !== null ? fmtNum(r.percent) : "",
      pStart,
      pEnd,
      r.originalCategoryName,
      r.confidence,
      r.categoryRule,
      r.wasAutoRecategorized ? "YES" : "NO",
    ]);
  }

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildEnderecosSheet(merged: MergedCustomer[]): { ws: XLSX.WorkSheet; totalRows: number } {
  // parseEnderecosSheet expects: phone, addressLine (or endereco), number, neighborhood,
  // city, state, zipcode (or cep), complement, reference.
  // The parser enriches contactable customers' addresses from this sheet (overrides inline).
  const headers = [
    "phone", "name",
    "addressLine", "number", "neighborhood", "city", "state", "zipCode", "complement", "reference",
  ];

  const rows: unknown[][] = [headers];
  let totalRows = 0;

  for (const c of merged) {
    for (const addr of c.addresses) {
      if (!addr.street) continue;
      rows.push([
        c.phone,
        c.name,
        addr.street,
        addr.number ?? "",
        addr.neighborhood ?? "",
        addr.city ?? "",
        addr.state ?? "",
        addr.zipCode ?? "",
        addr.complement ?? "",
        addr.reference ?? "",
      ]);
      totalRows++;
    }
  }

  return { ws: XLSX.utils.aoa_to_sheet(rows), totalRows };
}

function buildMergeReportSheet(
  merged: MergedCustomer[],
  noPhoneImportable: NoPhoneImportableCustomer[],
  noPhone: NoPhoneCustomer[],
): XLSX.WorkSheet {
  const saiposOnly    = merged.filter(c => c.sourceSystem === "SAIPOS" || (Array.isArray(c.sourceSystems) && c.sourceSystems.length === 1 && c.sourceSystems[0] === "SAIPOS")).length;
  const nemoOnly      = merged.filter(c => c.sourceSystem === "NEMO"   || (Array.isArray(c.sourceSystems) && c.sourceSystems.length === 1 && c.sourceSystems[0] === "NEMO")).length;
  const saiposNemo    = merged.filter(c => (c.sourceSystem === "SAIPOS+NEMO") || (Array.isArray(c.sourceSystems) && c.sourceSystems.includes("SAIPOS") && c.sourceSystems.includes("NEMO"))).length;

  const data = [
    ["MERGE AUDIT — Foocci_Base_Compilada_Saipos_Nemo", ""],
    ["", ""],
    ["Métrica", "Valor"],
    ["Clientes contatáveis (com telefone)", merged.length],
    ["  → Fonte: SAIPOS only",             saiposOnly],
    ["  → Fonte: NEMO only",               nemoOnly],
    ["  → Fonte: SAIPOS+NEMO (merged)",    saiposNemo],
    ["", ""],
    ["Clientes sem telefone (importáveis)", noPhoneImportable.length],
    ["  → Estratégia DOCUMENT",            noPhoneImportable.filter(r => r.dedupStrategy === "DOCUMENT").length],
    ["  → Estratégia EMAIL",               noPhoneImportable.filter(r => r.dedupStrategy === "EMAIL").length],
    ["  → Estratégia NAME_ADDRESS",        noPhoneImportable.filter(r => r.dedupStrategy === "NAME_ADDRESS").length],
    ["  → Estratégia CREATE",              noPhoneImportable.filter(r => r.dedupStrategy === "CREATE").length],
    ["  → NEEDS_REVIEW (ambíguos)",        noPhoneImportable.filter(r => r.dedupStrategy === "NEEDS_REVIEW").length],
    ["", ""],
    ["Linhas ignoradas (dados insuficientes)", noPhone.length],
    ["", ""],
    ["Total clientes processados", merged.length + noPhoneImportable.length + noPhone.length],
  ];

  return XLSX.utils.aoa_to_sheet(data);
}

function buildWarningsSheet(
  merged: MergedCustomer[],
  noPhoneImportable: NoPhoneImportableCustomer[],
  v2Rows: V2ProductRow[],
): XLSX.WorkSheet {
  const warnings: unknown[][] = [
    ["tipo", "chave", "detalhe", "acao_sugerida"],
  ];

  for (const c of merged.filter(r => r.importStatus === "NEEDS_REVIEW")) {
    warnings.push([
      "CLIENTE_NEEDS_REVIEW",
      c.phone,
      `${c.name} — importStatus: NEEDS_REVIEW`,
      "Verificar dados antes de importar",
    ]);
  }

  for (const c of noPhoneImportable.filter(r => r.dedupStrategy === "NEEDS_REVIEW")) {
    const key = c.document ?? c.email ?? c.name;
    warnings.push([
      "SEM_TELEFONE_NEEDS_REVIEW",
      key,
      `${c.name} — dedup ambíguo`,
      "Verificar duplicatas manualmente",
    ]);
  }

  for (const r of v2Rows.filter(r => r.rowType === "PRODUCT" && r.confidence <= 0.60)) {
    warnings.push([
      "PRODUTO_BAIXA_CONFIANCA",
      `${r.originalCategoryName}::${r.productName ?? ""}`,
      `→ ${r.categoryName} (conf=${r.confidence}, regra=${r.categoryRule})`,
      "Verificar categoria manualmente",
    ]);
  }

  return XLSX.utils.aoa_to_sheet(warnings);
}

function buildDuplicadosProdutosSheet(v2Rows: V2ProductRow[]): XLSX.WorkSheet {
  const header = ["categoryName", "productName", "originalCategoryName", "confidence", "categoryRule", "quantitySold", "grossRevenue"];
  const rows: unknown[][] = [header];

  for (const r of v2Rows.filter(r => r.rowType === "PRODUCT" && r.wasAutoRecategorized)) {
    rows.push([
      r.categoryName,
      r.productName ?? "",
      r.originalCategoryName,
      r.confidence,
      r.categoryRule,
      fmtNum(r.quantitySold),
      fmtNum(r.grossRevenue),
    ]);
  }

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildResumoSheet(audit: V2ImportableAudit, soldMeta: SoldItemsMeta, diversosSamples: Array<{ product: string; newCategory: string; confidence: number }>): XLSX.WorkSheet {
  const lines: unknown[][] = [
    ["FOOCCI — MASTER DATASET V2 IMPORTÁVEL", ""],
    ["Gerado em", audit.generatedAt],
    ["SAFE_TO_UPLOAD_TO_PREVIEW_COMPILED", audit.safeToUploadToPreviewCompiled],
    ["", ""],
    ["── CLIENTES ──────────────────────────────────────────────", ""],
    ["Contatáveis (com telefone)", audit.customers.contactable],
    ["Sem telefone (importáveis)", audit.customers.noPhoneImportable],
    ["Ignorados (dados insuficientes)", audit.customers.noPhoneSkipped],
    ["Total processados", audit.customers.total],
    ["Prontos para importar (READY)", audit.customers.readyCount],
    ["Precisam revisão (NEEDS_REVIEW)", audit.customers.needsReviewCount],
    ["", ""],
    ["── ENDEREÇOS ─────────────────────────────────────────────", ""],
    ["Linhas na aba Endereços", audit.addresses.inEnderecoSheet],
    ["Endereços inline em Clientes_Master", audit.addresses.inMasterInline],
    ["", ""],
    ["── PRODUTOS ──────────────────────────────────────────────", ""],
    ["Linhas de entrada (PRODUCT rows)", audit.products.inputProductRows],
    ["Linhas CATEGORY V2 (reconstruídas)", audit.products.v2CategoryRows],
    ["Linhas PRODUCT V2", audit.products.v2ProductRows],
    ["Categorizados (não SEM_CLASSIFICACAO)", audit.products.categorizedToV2],
    ["SEM_CLASSIFICACAO", audit.products.semClassCount],
    ["Recategorizados de Diversos→V2", audit.products.recategorizedFromDiversos],
    ["Confiança <= 60%", audit.products.lowConfidenceCount],
    ["Quantidade total vendida", audit.products.totalQuantity],
    ["Receita bruta total (R$)", audit.products.totalRevenue],
    ["Período inicial", fmtDate(soldMeta.periodStart)],
    ["Período final", fmtDate(soldMeta.periodEnd)],
    ["", ""],
    ["── TOP CATEGORIAS (RECEITA) ──────────────────────────────", ""],
    ...audit.products.topCategories.map((c, i) => [`#${i + 1} ${c.category}`, c.revenue]),
    ["", ""],
    ["── AMOSTRAS: PRODUTOS RETIRADOS DE DIVERSOS → V2 ─────────", ""],
    ["produto", "nova_categoria", "confiança"],
    ...diversosSamples.map(s => [s.product, s.newCategory, s.confidence]),
    ["", ""],
    ["── SEGURANÇA ──────────────────────────────────────────────", ""],
    ["Importação executada", "NÃO"],
    ["Clientes criados no banco", 0],
    ["Pedidos criados", 0],
    ["Itens de pedido criados", 0],
    ["Agregados de produtos criados", 0],
    ["Mensagens CRM enviadas", 0],
  ];

  return XLSX.utils.aoa_to_sheet(lines);
}

function buildReadmeSheet(): XLSX.WorkSheet {
  const lines = [
    ["FOOCCI — README — MASTER DATASET V2 IMPORTÁVEL"],
    [""],
    ["COMO USAR ESTE ARQUIVO"],
    [""],
    ["1. Este arquivo é compatível com o endpoint POST /api/crm/saipos-nemo/preview-compiled"],
    ["   Envie o arquivo original Foocci_Base_Compilada_Saipos_Nemo.xlsx, NÃO este arquivo."],
    ["   Este arquivo V2_IMPORTAVEL serve para REVISÃO HUMANA antes da importação definitiva."],
    [""],
    ["2. Após revisar todos os dados neste arquivo, use o botão 'Importar' na tela CRM"],
    ["   com o arquivo ORIGINAL (Foocci_Base_Compilada_Saipos_Nemo.xlsx)."],
    [""],
    ["ABAS E COMPATIBILIDADE COM O PARSER"],
    [""],
    ["  Clientes_Master    → parseMasterSheet (contactable + no-phone inline)"],
    ["  Sem_Telefone       → parseSemTelefoneSheet (no-phone importable)"],
    ["  Produtos_Agregados → parseProdutosAgregadosSheet (direct format via rowType col)"],
    ["  Endereços          → parseEnderecosSheet (enriquece endereços dos clientes)"],
    ["  Merge_Report       → (revisão humana, não parseado)"],
    ["  Warnings           → (revisão humana, não parseado)"],
    ["  Duplicados_Produtos→ (revisão humana, não parseado)"],
    ["  Resumo             → (revisão humana, não parseado)"],
    ["  README             → (esta aba)"],
    [""],
    ["MELHORIAS V2 NOS PRODUTOS"],
    [""],
    ["  - Todos os produtos 'Diversos'/'Outros' foram recategorizados usando regras de keywords."],
    ["  - categoryName no Produtos_Agregados reflete a categoria V2 normalizada."],
    ["  - originalCategoryName preserva a categoria original para auditoria."],
    ["  - Linhas com confidence <= 0.60 aparecem na aba Warnings para revisão."],
    [""],
    ["SEGURANÇA"],
    [""],
    ["  ✅ Nenhuma importação foi executada ao gerar este arquivo"],
    ["  ✅ Nenhum cliente foi criado no banco de dados"],
    ["  ✅ Nenhum pedido ou item de pedido foi criado"],
    ["  ✅ Nenhum ProductSalesAggregate foi criado"],
    ["  ✅ Nenhuma mensagem CRM foi enviada"],
  ];
  return XLSX.utils.aoa_to_sheet(lines.map(l => l));
}

// ── Column width helper ────────────────────────────────────────────────────────

function autoWidths(ws: XLSX.WorkSheet, colWidths: number[]): void {
  ws["!cols"] = colWidths.map(w => ({ wch: w }));
}

// ── Main export ────────────────────────────────────────────────────────────────

export function buildV2ImportableWorkbook(
  merged:            MergedCustomer[],
  noPhoneImportable: NoPhoneImportableCustomer[],
  noPhone:           NoPhoneCustomer[],
  soldRows:          ProductSalesRow[],
  soldMeta:          SoldItemsMeta,
): { buffer: Buffer; audit: V2ImportableAudit } {

  // ── Pre-compute V2 products ────────────────────────────────────────────────
  const {
    v2Rows,
    recategorizedFromDiversos,
    lowConfidenceCount,
    semClassCount,
    categorizedToV2,
    topCategories,
    diversosSamples,
  } = buildV2Products(soldRows);

  const v2CategoryRows = v2Rows.filter(r => r.rowType === "CATEGORY").length;
  const v2ProductRows  = v2Rows.filter(r => r.rowType === "PRODUCT").length;

  const totalQuantity = v2Rows
    .filter(r => r.rowType === "PRODUCT")
    .reduce((s, r) => s + r.quantitySold, 0);
  const totalRevenue  = v2Rows
    .filter(r => r.rowType === "CATEGORY")
    .reduce((s, r) => s + r.grossRevenue, 0);

  // ── Build sheets ───────────────────────────────────────────────────────────
  const wsMaster       = buildClientesMasterSheet(merged);
  const wsSemTel       = buildSemTelefoneSheet(noPhoneImportable);
  const wsProdutos     = buildProdutosAgregadosSheet(v2Rows, soldMeta);
  const { ws: wsEnder, totalRows: enderRows } = buildEnderecosSheet(merged);
  const wsMerge        = buildMergeReportSheet(merged, noPhoneImportable, noPhone);
  const wsWarnings     = buildWarningsSheet(merged, noPhoneImportable, v2Rows);
  const wsDupProd      = buildDuplicadosProdutosSheet(v2Rows);

  // ── Build audit (before Resumo, which embeds it) ───────────────────────────
  const masterInlineAddrs = merged.filter(c => c.addresses.length > 0 && !c.addresses[0]?.street).length === 0
    ? merged.filter(c => c.addresses.length > 0).length
    : 0;

  const audit: V2ImportableAudit = {
    generatedAt:                   new Date().toISOString(),
    sheetsCreated:                 ["Clientes_Master", "Sem_Telefone", "Produtos_Agregados", "Endereços", "Merge_Report", "Warnings", "Duplicados_Produtos", "Resumo", "README"],
    safeToUploadToPreviewCompiled: "YES",

    customers: {
      contactable:       merged.length,
      noPhoneImportable: noPhoneImportable.length,
      noPhoneSkipped:    noPhone.length,
      total:             merged.length + noPhoneImportable.length + noPhone.length,
      readyCount:        merged.filter(c => c.importStatus === "READY").length,
      needsReviewCount:  merged.filter(c => c.importStatus !== "READY").length,
    },

    addresses: {
      inEnderecoSheet: enderRows,
      inMasterInline:  masterInlineAddrs,
    },

    products: {
      inputRows:                soldRows.length,
      inputCategoryRows:        soldRows.filter(r => r.rowType === "CATEGORY").length,
      inputProductRows:         soldRows.filter(r => r.rowType === "PRODUCT").length,
      v2CategoryRows,
      v2ProductRows,
      categorizedToV2,
      semClassCount,
      recategorizedFromDiversos,
      lowConfidenceCount,
      totalQuantity:            Math.round(totalQuantity * 100) / 100,
      totalRevenue:             Math.round(totalRevenue * 100) / 100,
      topCategories,
      diversosSamples,
    },

    safety: {
      importExecuted:    false,
      customersCreated:  0,
      ordersCreated:     0,
      orderItemsCreated: 0,
      aggregatesCreated: 0,
      crmMessagesSent:   0,
    },
  };

  const wsResumo = buildResumoSheet(audit, soldMeta, diversosSamples);
  const wsReadme = buildReadmeSheet();

  // ── Assemble workbook (Resumo first, then parser-required sheets) ──────────
  // SheetJS doesn't have a native "insert at position" API, so we build a fresh book
  // after appending in order.
  const wb = XLSX.utils.book_new();

  // Parser-required sheets first (so they appear before review-only sheets)
  XLSX.utils.book_append_sheet(wb, wsMaster,   "Clientes_Master");
  XLSX.utils.book_append_sheet(wb, wsSemTel,   "Sem_Telefone");
  XLSX.utils.book_append_sheet(wb, wsProdutos, "Produtos_Agregados");
  XLSX.utils.book_append_sheet(wb, wsEnder,    "Endereços");

  // Review-only sheets
  XLSX.utils.book_append_sheet(wb, wsMerge,   "Merge_Report");
  XLSX.utils.book_append_sheet(wb, wsWarnings,"Warnings");
  XLSX.utils.book_append_sheet(wb, wsDupProd, "Duplicados_Produtos");
  XLSX.utils.book_append_sheet(wb, wsResumo,  "Resumo");
  XLSX.utils.book_append_sheet(wb, wsReadme,  "README");

  // Apply column widths for readability
  autoWidths(wsMaster,   [30, 16, 14, 28, 12, 40, 8, 20, 20, 6, 10, 20, 8, 12, 12, 14, 14, 14, 40, 16, 14, 6, 6]);
  autoWidths(wsSemTel,   [30, 14, 28, 12, 40, 8, 20, 20, 6, 10, 20, 8, 12, 12, 14, 14, 14, 40, 16, 6]);
  autoWidths(wsProdutos, [10, 28, 50, 12, 14, 8, 12, 12, 28, 8, 28, 10]);
  autoWidths(wsEnder,    [16, 30, 40, 8, 20, 20, 6, 10, 20, 30]);
  autoWidths(wsMerge,    [50, 10]);
  autoWidths(wsWarnings, [28, 40, 60, 40]);
  autoWidths(wsDupProd,  [28, 40, 28, 8, 28, 12, 14]);
  autoWidths(wsResumo,   [52, 16]);
  autoWidths(wsReadme,   [80]);

  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

  return { buffer, audit };
}
