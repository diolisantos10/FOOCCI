/**
 * MasterDatasetV2Service
 *
 * Generates Foocci_Master_Dataset_V2.xlsx — a cleaned, categorized workbook
 * derived from a parsed StoredReport (already validated via preview-compiled).
 *
 * 10 sheets:
 *   1.  Resumo_V2                       — KPI summary
 *   2.  Clientes_Master_Unificado       — one row per customer, quality tiers A+/A/B/C/D
 *   3.  Clientes_Sem_Telefone           — enrichment queue (importable + skipped)
 *   4.  Enderecos_Normalizados          — normalized address rows
 *   5.  Produtos_Agregados_Categorizados — aggregate sales with smart category mapping
 *   6.  Produtos_Revisar                — products needing human review
 *   7.  Clientes_Revisar                — customers needing human review
 *   8.  Merge_Audit                     — matching transparency
 *   9.  Warnings_V2                     — all warnings aggregated
 *   10. README_V2                       — documentation
 *
 * Safety:
 *   - Read-only. Does NOT write to DB.
 *   - Does NOT create fake phones, orders, customers, or CRM messages.
 *   - "Diversos" is always mapped to SEM_CLASSIFICACAO, never kept as-is.
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

// ── Product categorization rules ───────────────────────────────────────────────

interface ProductRule {
  group:    string;
  subgroup: string | null;
  ruleName: string;
  keywords: string[];
}

// Rules are tried in order. First keyword match wins.
// "Diversos"/"Outros" always → SEM_CLASSIFICACAO (explicit rule, never left as DIVERSOS).
const PRODUCT_RULES: ProductRule[] = [
  { group: "POKE",               subgroup: null,        ruleName: "keyword:poke",          keywords: ["poke"] },
  { group: "CEVICHE",            subgroup: null,        ruleName: "keyword:ceviche",        keywords: ["ceviche", "seviche"] },
  { group: "TEMAKI",             subgroup: null,        ruleName: "keyword:temaki",         keywords: ["temaki"] },
  { group: "HOT ROLL",           subgroup: null,        ruleName: "keyword:hot_roll",       keywords: ["hot roll", "hot holl"] },
  { group: "URAMAKI",            subgroup: null,        ruleName: "keyword:uramaki",        keywords: ["uramaki"] },
  { group: "NIGUIRI",            subgroup: null,        ruleName: "keyword:niguiri",        keywords: ["niguiri", "nigiri"] },
  { group: "HOSSOMAKI",          subgroup: null,        ruleName: "keyword:hossomaki",      keywords: ["hossomaki", "hosomaki", "hosso maki"] },
  { group: "SASHIMI",            subgroup: null,        ruleName: "keyword:sashimi",        keywords: ["sashimi"] },
  { group: "PRATOS QUENTES",     subgroup: "YAKISOBA",  ruleName: "keyword:yakisoba",       keywords: ["yakisoba"] },
  { group: "PRATOS QUENTES",     subgroup: "RAMEN",     ruleName: "keyword:ramen",          keywords: ["ramen"] },
  { group: "PRATOS QUENTES",     subgroup: "YAKIMESHI", ruleName: "keyword:yakimeshi",      keywords: ["yakimeshi", "yakimesi"] },
  { group: "PRATOS QUENTES",     subgroup: null,        ruleName: "keyword:grelhado",       keywords: ["grelhado", "grelhada"] },
  { group: "PRATOS QUENTES",     subgroup: null,        ruleName: "keyword:quente",         keywords: ["quente", "caldo"] },
  { group: "PRATOS EXECUTIVOS",  subgroup: null,        ruleName: "keyword:executivo",      keywords: ["executivo", "prato executivo", "executiva"] },
  { group: "FESTIVAL / RODIZIO", subgroup: null,        ruleName: "keyword:festival",       keywords: ["festival", "rodizio"] },
  { group: "ENTRADAS",           subgroup: "GYOZA",     ruleName: "keyword:gyoza",          keywords: ["gyoza"] },
  { group: "ENTRADAS",           subgroup: "EDAMAME",   ruleName: "keyword:edamame",        keywords: ["edamame"] },
  { group: "ENTRADAS",           subgroup: null,        ruleName: "keyword:entrada",        keywords: ["entrada", "appetizer"] },
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
  { group: "COMBOS",          subgroup: null, ruleName: "keyword:combo",    keywords: ["combo", "kit", "combinado"] },
  { group: "ADICIONAIS",      subgroup: null, ruleName: "keyword:adicional", keywords: ["molho", "adicional", "extra", "acompanhamento"] },
  { group: "TAXAS / SERVICOS", subgroup: null, ruleName: "keyword:taxa",    keywords: ["entrega", "frete", "taxa", "embalagem", "delivery fee", "servico"] },
  { group: "DESCONTOS",       subgroup: null, ruleName: "keyword:desconto", keywords: ["desconto", "discount", "cupom", "coupon"] },
  // Explicit catch: NEVER keep "Diversos" — always SEM_CLASSIFICACAO
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
  productGroup:       string;
  productSubgroup:    string | null;
  confidenceScore:    number;   // 0.0 – 1.0
  wasAutoCategorized: boolean;
  categoryRule:       string;
}

function categorize(categoryName: string, productName: string | null): CategorizeResult {
  const catNorm  = normText(categoryName);
  const prodNorm = normText(productName ?? "");
  const fullNorm = `${catNorm} ${prodNorm}`.trim();

  function tryMatch(text: string, conf: number, autocat: boolean): CategorizeResult | null {
    for (const rule of PRODUCT_RULES) {
      for (const kw of rule.keywords) {
        if (text.includes(normText(kw))) {
          return {
            normalizedCategory: rule.group,
            productGroup:       rule.group,
            productSubgroup:    rule.subgroup,
            confidenceScore:    conf,
            wasAutoCategorized: autocat,
            categoryRule:       rule.ruleName,
          };
        }
      }
    }
    return null;
  }

  // Pass 1: category name alone (0.95)
  const m1 = tryMatch(catNorm, 0.95, false);
  if (m1) { m1.wasAutoCategorized = catNorm !== normText(m1.normalizedCategory); return m1; }

  // Pass 2: product name alone (0.80)
  if (prodNorm) {
    const m2 = tryMatch(prodNorm, 0.80, true);
    if (m2) return m2;
  }

  // Pass 3: combined text (0.60)
  const m3 = tryMatch(fullNorm, 0.60, true);
  if (m3) return m3;

  return {
    normalizedCategory: "SEM_CLASSIFICACAO",
    productGroup:       "SEM_CLASSIFICACAO",
    productSubgroup:    null,
    confidenceScore:    0.30,
    wasAutoCategorized: false,
    categoryRule:       "fallback:no_match",
  };
}

// ── Quality tier ───────────────────────────────────────────────────────────────

type QualityTier = "A+" | "A" | "B" | "C" | "D";

function mergedTier(c: MergedCustomer): QualityTier {
  const hasDoc    = !!c.document;
  const hasAddr   = c.addresses.length > 0;
  const hasOrders = (c.importedOrderCount ?? 0) > 0;
  if (hasDoc && hasAddr && hasOrders) return "A+";
  if (hasOrders || (c.email && hasAddr)) return "A";
  return "B";
}

function noPhoneTier(c: NoPhoneImportableCustomer): QualityTier {
  if (c.document && c.email) return "C";
  if (c.document || c.email) return "C";
  if (c.addresses.length > 0 || (c.importedOrderCount ?? 0) > 0) return "D";
  return "D";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return typeof d === "string" ? d : "";
  return dt.toLocaleDateString("pt-BR");
}

function ck(c: MergedCustomer | NoPhoneImportableCustomer, idx: number): string {
  if ("phone" in c && c.phone) return c.phone;
  if (c.document) return `DOC-${c.document}`;
  if (c.email)    return `EMAIL-${c.email}`;
  return `NP-${String(idx).padStart(4, "0")}`;
}

function enrichPriority(orders: number | null, spent: number | null): string {
  const o = orders ?? 0;
  const s = spent  ?? 0;
  if (o >= 5 || s >= 500) return "ALTA";
  if (o >= 2 || s >= 100) return "MEDIA";
  return "BAIXA";
}

function recoveryStrategy(doc: string | null, email: string | null, hasAddr: boolean): string {
  if (doc)     return "DOCUMENT_LOOKUP";
  if (email)   return "EMAIL_LOOKUP";
  if (hasAddr) return "ADDRESS_LOOKUP";
  return "GOOGLE_MATCH";
}

function enrichStatus(c: MergedCustomer): string {
  const n = [!!c.document, !!c.email, !!c.birthDate, c.addresses.length > 0].filter(Boolean).length;
  if (n === 4) return "COMPLETE";
  if (n >= 2)  return "PARTIAL";
  return "NEEDS_ENRICHMENT";
}

function normAddr(addr: NemoAddressGroup): string {
  return [addr.street, addr.number, addr.neighborhood, addr.city, addr.state, addr.zipCode]
    .filter(Boolean).join(", ");
}

// ── Public audit report type ───────────────────────────────────────────────────

export interface V2AuditReport {
  fileCreated:   string;
  sheetsCreated: string[];
  customers: {
    total:          number;
    contactable:    number;
    noPhoneImportable: number;
    noPhoneSkipped: number;
    needsReview:    number;
    tiers:          Record<QualityTier, number>;
  };
  mergeAudit: {
    phoneMatches: number;
    saiposOnly:   number;
    nemoOnly:     number;
    noPhoneDedup: number;
  };
  addresses: {
    total:      number;
    linked:     number;
    unlinked:   number;
  };
  products: {
    totalRows:        number;
    categoryRows:     number;
    productRows:      number;
    categorizedCount: number;
    semClassCount:    number;
    diversosRemaining: number;
    totalQuantity:    number;
    totalRevenue:     number;
    topCategories:    Array<{ category: string; revenue: number }>;
    recategorizedFromDiversos: number;
    lowConfidenceCount: number;
  };
  review: {
    clientesRevisarCount: number;
    produtosRevisarCount: number;
    warningsCount:        number;
  };
  safety: {
    importExecuted:    false;
    customersCreated:  0;
    ordersCreated:     0;
    orderItemsCreated: 0;
    aggregatesCreated: 0;
    crmMessagesSent:   0;
  };
  recommendation: "SAFE_TO_PREVIEW" | "NEEDS_REVIEW_BEFORE_PREVIEW" | "DO_NOT_USE";
}

// ── Main builder ───────────────────────────────────────────────────────────────

export function buildV2Workbook(
  merged:            MergedCustomer[],
  noPhoneImportable: NoPhoneImportableCustomer[],
  noPhone:           NoPhoneCustomer[],
  soldRows:          ProductSalesRow[],
  soldMeta:          SoldItemsMeta,
): { buffer: Buffer; audit: V2AuditReport } {
  const wb = XLSX.utils.book_new();
  const tierCounts: Record<QualityTier, number> = { "A+": 0, "A": 0, "B": 0, "C": 0, "D": 0 };

  // ── Pre-compute product categorization ─────────────────────────────────────

  const allProductRows  = soldRows.filter(r => r.rowType === "PRODUCT");
  const allCategoryRows = soldRows.filter(r => r.rowType === "CATEGORY");

  const catCache = new Map<string, CategorizeResult>();
  function getCat(row: ProductSalesRow): CategorizeResult {
    const key = `${row.categoryName}::${row.productName ?? ""}`;
    if (!catCache.has(key)) catCache.set(key, categorize(row.categoryName, row.productName));
    return catCache.get(key)!;
  }

  let categorizedCount = 0;
  let uncategorizedCount = 0;
  let diversosRemaining = 0;
  let recategorizedFromDiversos = 0;
  let lowConfidenceCount = 0;

  for (const row of allProductRows) {
    const r = getCat(row);
    const wasDiversos = normText(row.categoryName).includes("divers") || normText(row.categoryName).includes("outros");
    if (r.normalizedCategory !== "SEM_CLASSIFICACAO") {
      categorizedCount++;
      if (wasDiversos) recategorizedFromDiversos++;
    } else {
      uncategorizedCount++;
      if (wasDiversos) diversosRemaining++;
    }
    if (r.confidenceScore <= 0.60) lowConfidenceCount++;
  }

  // ── Pre-compute no-phone duplicate map ─────────────────────────────────────

  const noPhoneByName = new Map<string, string[]>();
  for (let i = 0; i < noPhoneImportable.length; i++) {
    const c = noPhoneImportable[i]!;
    const normN = normText(c.name);
    const keys  = noPhoneByName.get(normN) ?? [];
    keys.push(ck(c, i));
    noPhoneByName.set(normN, keys);
  }

  // ── Sheet 2: Clientes_Master_Unificado ──────────────────────────────────────

  const masterRows: Record<string, unknown>[] = [];

  for (const c of merged) {
    const tier = mergedTier(c);
    tierCounts[tier]++;
    masterRows.push({
      customerKey:            c.phone,
      nameFinal:              c.name,
      phone:                  c.phone,
      document:               c.document ?? "",
      email:                  c.email ?? "",
      birthDate:              fmtDate(c.birthDate),
      crmContactable:         "SIM",
      contactStatus:          "CONTACTABLE",
      dataEnrichmentStatus:   enrichStatus(c),
      customerQualityTier:    tier,
      sourceSystems:          c.sourceSystems.join("+"),
      totalImportedOrders:    c.importedOrderCount ?? "",
      importedTotalSpent:     c.importedTotalSpent ?? "",
      averageTicket:          c.averageTicket ?? "",
      importedLastOrderAt:    fmtDate(c.importedLastOrderAt),
      financialBalanceTotal:  c.financialBalance ?? "",
      financialBalancePeriod: c.financialBalancePeriod ?? "",
      hasPhone:               "SIM",
      hasEmail:               c.email     ? "SIM" : "NAO",
      hasDocument:            c.document  ? "SIM" : "NAO",
      hasBirthDate:           c.birthDate ? "SIM" : "NAO",
      hasAddress:             c.addresses.length > 0 ? "SIM" : "NAO",
      addressCount:           c.addresses.length,
      dedupStrategy:          "PHONE",
      importConfidence:       tier === "A+" || tier === "A" ? "ALTA" : "MEDIA",
      needsReview:            c.importStatus !== "READY" ? "SIM" : "NAO",
      notes:                  c.notes ?? "",
      aliases:                "",
      createdFrom:            c.sourceSystem,
    });
  }

  for (let i = 0; i < noPhoneImportable.length; i++) {
    const c = noPhoneImportable[i]!;
    const tier = noPhoneTier(c);
    tierCounts[tier]++;
    masterRows.push({
      customerKey:            ck(c, i),
      nameFinal:              c.name,
      phone:                  "",
      document:               c.document ?? "",
      email:                  c.email ?? "",
      birthDate:              fmtDate(c.birthDate),
      crmContactable:         "NAO",
      contactStatus:          "SEM_TELEFONE",
      dataEnrichmentStatus:   "NEEDS_ENRICHMENT",
      customerQualityTier:    tier,
      sourceSystems:          c.sourceSystems.join("+"),
      totalImportedOrders:    c.importedOrderCount ?? "",
      importedTotalSpent:     c.importedTotalSpent ?? "",
      averageTicket:          c.averageTicket ?? "",
      importedLastOrderAt:    fmtDate(c.importedLastOrderAt),
      financialBalanceTotal:  c.financialBalance ?? "",
      financialBalancePeriod: c.financialBalancePeriod ?? "",
      hasPhone:               "NAO",
      hasEmail:               c.email     ? "SIM" : "NAO",
      hasDocument:            c.document  ? "SIM" : "NAO",
      hasBirthDate:           c.birthDate ? "SIM" : "NAO",
      hasAddress:             c.addresses.length > 0 ? "SIM" : "NAO",
      addressCount:           c.addresses.length,
      dedupStrategy:          c.dedupStrategy,
      importConfidence:       c.document ? "MEDIA" : c.email ? "MEDIA" : "BAIXA",
      needsReview:            c.dedupStrategy === "NEEDS_REVIEW" ? "SIM" : "NAO",
      notes:                  c.notes ?? "",
      aliases:                "",
      createdFrom:            c.sourceSystems.join("+"),
    });
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(masterRows), "Clientes_Master_Unificado");

  // ── Sheet 3: Clientes_Sem_Telefone ──────────────────────────────────────────

  const semTelRows: Record<string, unknown>[] = [];

  for (let i = 0; i < noPhoneImportable.length; i++) {
    const c    = noPhoneImportable[i]!;
    const addr0 = c.addresses[0];
    const normN = normText(c.name);
    const dupes = (noPhoneByName.get(normN) ?? []).filter(k => k !== ck(c, i)).join("; ");
    semTelRows.push({
      customerKey:                  ck(c, i),
      name:                         c.name,
      document:                     c.document ?? "",
      email:                        c.email ?? "",
      address:                      addr0?.street ?? "",
      city:                         addr0?.city ?? "",
      state:                        addr0?.state ?? "",
      sourceSystems:                c.sourceSystems.join("+"),
      crmContactable:               "NAO",
      contactStatus:                "SEM_TELEFONE",
      dataEnrichmentStatus:         "NEEDS_ENRICHMENT",
      enrichmentPriority:           enrichPriority(c.importedOrderCount, c.importedTotalSpent),
      recommendedEnrichmentChannel: c.document ? "CRM" : c.email ? "EMAIL" : "MANUAL",
      possibleRecoveryStrategy:     recoveryStrategy(c.document, c.email, c.addresses.length > 0),
      dedupStrategy:                c.dedupStrategy,
      possibleDuplicates:           dupes || "—",
      needsReview:                  c.dedupStrategy === "NEEDS_REVIEW" ? "SIM" : "NAO",
      notes:                        c.notes ?? "",
    });
  }

  for (let i = 0; i < noPhone.length; i++) {
    const c = noPhone[i]!;
    semTelRows.push({
      customerKey:                  `SKIP-${String(i).padStart(4, "0")}`,
      name:                         c.nome ?? "",
      document:                     c.cpfCnpj ?? "",
      email:                        c.email ?? "",
      address:                      "",
      city:                         "",
      state:                        "",
      sourceSystems:                "SAIPOS",
      crmContactable:               "NAO",
      contactStatus:                "SEM_TELEFONE",
      dataEnrichmentStatus:         "NEEDS_ENRICHMENT",
      enrichmentPriority:           enrichPriority(c.qtdPedidos, c.valorTotal),
      recommendedEnrichmentChannel: "MANUAL",
      possibleRecoveryStrategy:     recoveryStrategy(c.cpfCnpj, c.email, false),
      dedupStrategy:                "SKIPPED",
      possibleDuplicates:           "—",
      needsReview:                  "NAO",
      notes:                        "Ignorado por dados insuficientes",
    });
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(semTelRows.length > 0 ? semTelRows : [{ info: "Nenhum cliente sem telefone" }]),
    "Clientes_Sem_Telefone",
  );

  // ── Sheet 4: Enderecos_Normalizados ────────────────────────────────────────

  const addrRows: Record<string, unknown>[] = [];
  const addrDedup = new Set<string>();
  let linkedAddrCount = 0;

  function addAddr(
    custKey: string,
    phone: string,
    name: string,
    source: string,
    addr: NemoAddressGroup,
    isPrimary: boolean,
    linked: boolean,
  ) {
    const raw = normAddr(addr);
    if (!raw) return;
    const dedupKey = `${custKey}::${normText(raw)}`;
    if (addrDedup.has(dedupKey)) return;
    addrDedup.add(dedupKey);
    if (linked) linkedAddrCount++;
    addrRows.push({
      customerKey:       custKey,
      phone,
      name,
      source,
      sourceRow:         "",
      addressLine:       addr.street ?? "",
      number:            addr.number ?? "",
      district:          addr.neighborhood ?? "",
      city:              addr.city ?? "",
      state:             addr.state ?? "",
      zipCode:           addr.zipCode ?? "",
      complement:        addr.complement ?? "",
      reference:         addr.reference ?? "",
      rawAddress:        raw,
      normalizedAddress: raw,
      isPrimary:         isPrimary ? "SIM" : "NAO",
      needsReview:       (!addr.street) ? "SIM" : "NAO",
    });
  }

  for (const c of merged) {
    for (let i = 0; i < c.addresses.length; i++) {
      addAddr(c.phone, c.phone, c.name, c.sourceSystem, c.addresses[i]!, i === 0, true);
    }
  }
  for (let i = 0; i < noPhoneImportable.length; i++) {
    const c = noPhoneImportable[i]!;
    for (let j = 0; j < c.addresses.length; j++) {
      addAddr(ck(c, i), "", c.name, "SEM_TELEFONE", c.addresses[j]!, j === 0, true);
    }
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(addrRows.length > 0 ? addrRows : [{ info: "Nenhum endereco encontrado" }]),
    "Enderecos_Normalizados",
  );

  const totalAddresses  = addrRows.length;
  const unlinkedAddresses = addrRows.filter(r => r.needsReview === "SIM").length;

  // ── Sheet 5: Produtos_Agregados_Categorizados ──────────────────────────────

  const periodStart = fmtDate(soldMeta.periodStart);
  const periodEnd   = fmtDate(soldMeta.periodEnd);

  const prodCatRows: Record<string, unknown>[] = [];
  for (const row of soldRows) {
    const r = getCat(row);
    prodCatRows.push({
      rowType:               row.rowType,
      sourceSystem:          "SAIPOS",
      periodStart,
      periodEnd,
      originalCategoryName:  row.categoryName,
      normalizedCategory:    r.normalizedCategory,
      productName:           row.productName ?? "",
      normalizedProductName: row.productName ?? "",
      productGroup:          r.productGroup,
      productSubgroup:       r.productSubgroup ?? "",
      quantitySold:          row.quantitySold,
      grossRevenue:          row.grossRevenue,
      percent:               row.percent ?? "",
      confidenceScore:       r.confidenceScore,
      wasAutoCategorized:    r.wasAutoCategorized ? "SIM" : "NAO",
      categoryRule:          r.categoryRule,
      needsReview:           r.confidenceScore <= 0.30 ? "SIM" : "NAO",
      notes:                 row.rowType === "CATEGORY" ? "Linha de categoria (total)" : "",
    });
  }
  prodCatRows.sort((a, b) => (b.grossRevenue as number) - (a.grossRevenue as number));

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(prodCatRows.length > 0 ? prodCatRows : [{ info: "Nenhum produto" }]),
    "Produtos_Agregados_Categorizados",
  );

  // ── Sheet 6: Produtos_Revisar ──────────────────────────────────────────────

  const prodRevisarRows: Record<string, unknown>[] = [];

  for (const row of allProductRows) {
    const r = getCat(row);
    const wasDiversos   = normText(row.categoryName).includes("divers");
    const isSemClass    = r.normalizedCategory === "SEM_CLASSIFICACAO";
    const isLowConf     = r.confidenceScore <= 0.60 && !isSemClass;
    const missingName   = !row.productName?.trim();
    const isTaxa        = r.normalizedCategory === "TAXAS / SERVICOS";
    const recatFromDiv  = wasDiversos && !isSemClass;

    let issueType = "";
    let severity  = "";
    let reason    = "";

    if (missingName && isSemClass) {
      issueType = "MISSING_PRODUCT_NAME";
      severity  = "MEDIA";
      reason    = "Linha sem nome de produto e sem categoria reconhecida";
    } else if (isSemClass) {
      issueType = "NOT_CATEGORIZED";
      severity  = "BAIXA";
      reason    = "Produto nao categorizado automaticamente";
    } else if (recatFromDiv) {
      issueType = "RECATEGORIZED_FROM_DIVERSOS";
      severity  = "INFO";
      reason    = `Movido de "Diversos" para ${r.normalizedCategory} (conf=${(r.confidenceScore * 100).toFixed(0)}%)`;
    } else if (isLowConf) {
      issueType = "LOW_CONFIDENCE";
      severity  = "BAIXA";
      reason    = `Confianca ${(r.confidenceScore * 100).toFixed(0)}% — verificar se categoria esta correta`;
    } else if (isTaxa) {
      issueType = "TAXA_SERVICO";
      severity  = "INFO";
      reason    = "Taxa/servico — verificar se deve ser excluido dos agregados de produto";
    }

    if (!issueType) continue;

    prodRevisarRows.push({
      issueType,
      severity,
      originalCategoryName: row.categoryName,
      productName:          row.productName ?? "",
      suggestedCategory:    r.normalizedCategory,
      reason,
      quantitySold:         row.quantitySold,
      grossRevenue:         row.grossRevenue,
      suggestedResolution:  isSemClass
        ? "Adicionar keyword ao PRODUCT_RULES em MasterDatasetV2Service.ts"
        : "Verificar e confirmar a categoria",
    });
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(prodRevisarRows.length > 0 ? prodRevisarRows : [{ info: "Nenhum produto para revisar" }]),
    "Produtos_Revisar",
  );

  // ── Sheet 7: Clientes_Revisar ──────────────────────────────────────────────

  const clientRevisarRows: Record<string, unknown>[] = [];

  for (const c of merged) {
    if (c.importStatus === "DUPLICATE_CONFLICT") {
      clientRevisarRows.push({
        issueType:          "DUPLICATE_CONFLICT",
        severity:           "ALTA",
        customerKey:        c.phone,
        name:               c.name,
        phone:              c.phone,
        document:           c.document ?? "",
        email:              c.email ?? "",
        details:            `Cliente ${c.sourceSystem} com conflito de duplicata`,
        suggestedResolution: "Verificar e mesclar ou corrigir manualmente",
      });
    } else if (c.importStatus === "NEEDS_REVIEW") {
      clientRevisarRows.push({
        issueType:          "NEEDS_REVIEW",
        severity:           "MEDIA",
        customerKey:        c.phone,
        name:               c.name,
        phone:              c.phone,
        document:           c.document ?? "",
        email:              c.email ?? "",
        details:            `Cliente ${c.sourceSystem} marcado para revisao`,
        suggestedResolution: "Verificar dados e confirmar ou corrigir",
      });
    }
  }

  for (let i = 0; i < noPhoneImportable.length; i++) {
    const c = noPhoneImportable[i]!;
    if (c.dedupStrategy === "NEEDS_REVIEW") {
      clientRevisarRows.push({
        issueType:          "NO_PHONE_AMBIGUOUS_DEDUP",
        severity:           "ALTA",
        customerKey:        ck(c, i),
        name:               c.name,
        phone:              "",
        document:           c.document ?? "",
        email:              c.email ?? "",
        details:            `Possivel duplicata sem telefone. Nome: "${c.name}". Sem CPF/CNPJ ou e-mail para desambiguacao.`,
        suggestedResolution: "Buscar CPF/CNPJ ou telefone manualmente antes de importar",
      });
    }
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(clientRevisarRows.length > 0 ? clientRevisarRows : [{ info: "Nenhum cliente para revisar" }]),
    "Clientes_Revisar",
  );

  // ── Sheet 8: Merge_Audit ───────────────────────────────────────────────────

  const mergeAuditRows: Record<string, unknown>[] = [];
  let phoneMatches = 0;
  let saiposOnly   = 0;
  let nemoOnly     = 0;

  for (const c of merged) {
    const hasSaipos   = c.sourceSystems.includes("SAIPOS");
    const hasNemo     = c.sourceSystems.includes("NEMO");
    const matchMethod = hasSaipos && hasNemo ? "PHONE_MATCH" : hasSaipos ? "SAIPOS_ONLY" : "NEMO_ONLY";
    const confidence  = hasSaipos && hasNemo ? 0.99 : hasSaipos ? 0.90 : 0.75;
    if (matchMethod === "PHONE_MATCH") phoneMatches++;
    else if (matchMethod === "SAIPOS_ONLY") saiposOnly++;
    else nemoOnly++;

    mergeAuditRows.push({
      customerKey:    c.phone,
      sourceSystems:  c.sourceSystems.join("+"),
      saiposRows:     hasSaipos ? "SIM" : "NAO",
      nemoRows:       hasNemo   ? "SIM" : "NAO",
      matchMethod,
      confidence,
      chosenName:     c.name,
      aliases:        "",
      chosenPhone:    c.phone,
      chosenDocument: c.document ?? "",
      chosenEmail:    c.email ?? "",
      conflicts:      c.importStatus !== "READY" ? c.importStatus : "NENHUM",
      notes:          c.notes ?? "",
    });
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(mergeAuditRows.length > 0 ? mergeAuditRows : [{ info: "Nenhum registro de merge" }]),
    "Merge_Audit",
  );

  // ── Sheet 9: Warnings_V2 ──────────────────────────────────────────────────

  const warningRows: Array<Record<string, unknown>> = [];

  const needsReviewMerged = merged.filter(c => c.importStatus !== "READY");
  const ambigDedup        = noPhoneImportable.filter(c => c.dedupStrategy === "NEEDS_REVIEW");
  const semClassProds     = allProductRows.filter(r => getCat(r).normalizedCategory === "SEM_CLASSIFICACAO");
  const lowConfProds      = allProductRows.filter(r => getCat(r).confidenceScore <= 0.60);

  if (needsReviewMerged.length > 0) {
    warningRows.push({
      severity: "MEDIA", area: "CLIENTES",
      message:  "Clientes contatáveis marcados NEEDS_REVIEW ou DUPLICATE_CONFLICT",
      count:    needsReviewMerged.length,
      examples: needsReviewMerged.slice(0, 3).map(c => c.name).join("; "),
      recommendedAction: "Ver aba Clientes_Revisar antes de importar",
    });
  }
  if (ambigDedup.length > 0) {
    warningRows.push({
      severity: "ALTA", area: "CLIENTES",
      message:  "Clientes sem telefone com deduplicação ambígua (mesmo nome, sem doc/email)",
      count:    ambigDedup.length,
      examples: ambigDedup.slice(0, 3).map(c => c.name).join("; "),
      recommendedAction: "Buscar CPF/CNPJ manualmente. Ver Clientes_Revisar.",
    });
  }
  if (noPhoneImportable.length > 0) {
    warningRows.push({
      severity: "INFO", area: "CLIENTES",
      message:  `${noPhoneImportable.length} clientes sem telefone serao importados como NAO CONTATÁVEIS`,
      count:    noPhoneImportable.length,
      examples: noPhoneImportable.slice(0, 3).map(c => c.name).join("; "),
      recommendedAction: "Estes clientes NAO entram em campanhas WhatsApp. Enriquecimento de telefone necessario.",
    });
  }
  if (semClassProds.length > 0) {
    warningRows.push({
      severity: "BAIXA", area: "PRODUTOS",
      message:  "Produtos sem categoria (SEM_CLASSIFICACAO)",
      count:    semClassProds.length,
      examples: semClassProds.slice(0, 3).map(r => r.productName ?? r.categoryName).join("; "),
      recommendedAction: "Adicionar keywords ao PRODUCT_RULES em MasterDatasetV2Service.ts",
    });
  }
  if (lowConfProds.length > 0) {
    warningRows.push({
      severity: "BAIXA", area: "PRODUTOS",
      message:  "Produtos categorizados com confiança <= 60%",
      count:    lowConfProds.length,
      examples: lowConfProds.slice(0, 3).map(r => r.productName ?? r.categoryName).join("; "),
      recommendedAction: "Ver aba Produtos_Revisar",
    });
  }
  warningRows.push({
    severity: "INFO", area: "SEGURANCA",
    message:  "PRODUTO AGREGADO NAO PROVA RELACAO CLIENTE-PRODUTO. Nao criar Orders/OrderItems a partir destes dados.",
    count:    allProductRows.length,
    examples: "",
    recommendedAction: "Jamais inferir que um cliente comprou um produto especifico com base nos agregados.",
  });
  warningRows.push({
    severity: "INFO", area: "SEGURANCA",
    message:  "Clientes sem telefone sao REGISTROS DE ENRIQUECIMENTO. crmContactable=false.",
    count:    noPhoneImportable.length + noPhone.length,
    examples: "",
    recommendedAction: "Nenhuma mensagem WhatsApp sera enviada para eles ate receberem telefone valido.",
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(warningRows), "Warnings_V2");

  // ── Sheet 10: README_V2 ────────────────────────────────────────────────────

  const readmeRows: Record<string, unknown>[] = [
    { aba: "Resumo_V2",                       descricao: "KPIs finais. Ponto de partida para revisao humana." },
    { aba: "Clientes_Master_Unificado",        descricao: "Uma linha por cliente (contatáveis + sem telefone). Tier A+/A/B/C/D." },
    { aba: "Clientes_Sem_Telefone",            descricao: "Fila de enriquecimento. crmContactable=false. NAO entram em campanhas WhatsApp." },
    { aba: "Enderecos_Normalizados",           descricao: "Enderecos normalizados. Múltiplas linhas por cliente sao possíveis." },
    { aba: "Produtos_Agregados_Categorizados", descricao: "Dados agregados de vendas. NAO representa historico de compras por cliente. NAO criar Orders/OrderItems." },
    { aba: "Produtos_Revisar",                 descricao: "Produtos que precisam revisao: SEM_CLASSIFICACAO, confianca baixa, nomes ausentes." },
    { aba: "Clientes_Revisar",                 descricao: "Clientes que precisam revisao: duplicatas, conflitos, dedup ambígua." },
    { aba: "Merge_Audit",                      descricao: "Auditoria do processo de merge Saipos+Nemo. Transparencia do matching." },
    { aba: "Warnings_V2",                      descricao: "Todos os alertas agregados por severidade." },
    { aba: "README_V2",                        descricao: "Este arquivo de documentacao." },
    { aba: "", descricao: "" },
    { aba: "=== AVISOS CRITICOS ===",          descricao: "" },
    { aba: "1. PRODUTO AGREGADO",              descricao: "Os dados de Produtos_Agregados sao TOTAIS por categoria/produto no periodo. Eles NAO comprovam que um cliente especifico comprou um produto especifico. JAMAIS criar Orders, OrderItems ou historico cliente-produto a partir destes dados." },
    { aba: "2. CLIENTES SEM TELEFONE",         descricao: "Clientes em Clientes_Sem_Telefone sao REGISTROS DE ENRIQUECIMENTO. crmContactable=false. Nenhuma mensagem WhatsApp sera enviada para eles." },
    { aba: "3. NAO INVENTAR TELEFONES",        descricao: "Jamais criar telefone ficticio, GUEST phone ou phone placeholder para clientes sem telefone." },
    { aba: "4. IMPORTACAO",                    descricao: "Este workbook e para REVISAO HUMANA. A importacao final deve ser feita via preview-compiled no sistema CRM." },
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readmeRows), "README_V2");

  // ── Sheet 1: Resumo_V2 (built last, placed first) ──────────────────────────

  const catRevMap = new Map<string, number>();
  for (const row of allProductRows) {
    const r = getCat(row);
    catRevMap.set(r.normalizedCategory, (catRevMap.get(r.normalizedCategory) ?? 0) + row.grossRevenue);
  }
  const topCats  = [...catRevMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topProds = [...allProductRows].sort((a, b) => b.grossRevenue - a.grossRevenue).slice(0, 10);

  const totalCust = merged.length + noPhoneImportable.length + noPhone.length;
  const tierWeights: Record<QualityTier, number> = { "A+": 100, "A": 80, "B": 60, "C": 40, "D": 20 };
  const totalW = (Object.entries(tierCounts) as [QualityTier, number][])
    .reduce((s, [t, n]) => s + tierWeights[t] * n, 0);
  const qualityScore = totalCust > 0 ? Math.round(totalW / totalCust) : 0;

  const allCustomers = [...merged, ...noPhoneImportable];
  const risks: string[] = [];
  if (ambigDedup.length > 0)         risks.push(`${ambigDedup.length} clientes sem telefone com dedup ambigu`);
  if (needsReviewMerged.length > 0)  risks.push(`${needsReviewMerged.length} clientes contatáveis precisam revisao`);
  if (uncategorizedCount > 50)       risks.push(`${uncategorizedCount} produtos sem categoria`);
  if (risks.length === 0)            risks.push("Nenhum risco critico identificado");

  const totalQty = allProductRows.reduce((s, r) => s + r.quantitySold, 0);
  const totalRev = allProductRows.reduce((s, r) => s + r.grossRevenue, 0);

  const resumoRows: Record<string, unknown>[] = [
    { metrica: "FOOCCI — MASTER DATASET V2",                              valor: new Date().toLocaleDateString("pt-BR") },
    { metrica: "",                                                         valor: "" },
    { metrica: "=== CLIENTES ===",                                        valor: "" },
    { metrica: "Total de clientes",                                        valor: totalCust },
    { metrica: "Clientes contatáveis (com telefone)",                      valor: merged.length },
    { metrica: "Nao contatáveis importáveis (sem telefone)",               valor: noPhoneImportable.length },
    { metrica: "Ignorados (dados insuficientes)",                          valor: noPhone.length },
    { metrica: "Com documento",                                            valor: allCustomers.filter(c => c.document).length },
    { metrica: "Com e-mail",                                               valor: allCustomers.filter(c => c.email).length },
    { metrica: "Com endereco",                                             valor: allCustomers.filter(c => c.addresses.length > 0).length },
    { metrica: "Com qtd. pedidos importada",                               valor: merged.filter(c => (c.importedOrderCount ?? 0) > 0).length },
    { metrica: "Com total gasto importado",                                valor: merged.filter(c => (c.importedTotalSpent ?? 0) > 0).length },
    { metrica: "Precisam revisao",                                         valor: clientRevisarRows.length },
    { metrica: "Precisam enriquecimento de telefone",                      valor: noPhoneImportable.length },
    { metrica: "",                                                         valor: "" },
    { metrica: "=== QUALIDADE ===",                                       valor: "" },
    { metrica: "Tier A+ (tel + doc + end + pedidos)",                      valor: tierCounts["A+"] },
    { metrica: "Tier A  (tel + pedidos ou email+end)",                     valor: tierCounts["A"] },
    { metrica: "Tier B  (tel, dados parciais)",                            valor: tierCounts["B"] },
    { metrica: "Tier C  (sem tel, com doc ou email)",                      valor: tierCounts["C"] },
    { metrica: "Tier D  (sem tel, sem identificador confiável)",           valor: tierCounts["D"] },
    { metrica: "Score de qualidade do dataset (0-100)",                    valor: qualityScore },
    { metrica: "Maiores riscos",                                           valor: risks.join(" | ") },
    { metrica: "Proximo passo",                                            valor: clientRevisarRows.length > 50 ? "Revisar Clientes_Revisar antes de importar" : "Dataset pronto para preview de importacao" },
    { metrica: "",                                                         valor: "" },
    { metrica: "=== PRODUTOS ===",                                        valor: "" },
    { metrica: "Total de linhas agregadas",                                valor: soldRows.length },
    { metrica: "Linhas de categoria",                                      valor: allCategoryRows.length },
    { metrica: "Linhas de produto",                                        valor: allProductRows.length },
    { metrica: "Categorias normalizadas distintas",                        valor: catRevMap.size },
    { metrica: "Produtos categorizados automaticamente",                   valor: categorizedCount },
    { metrica: "Produtos ainda SEM_CLASSIFICACAO",                         valor: uncategorizedCount },
    { metrica: "Produtos recategorizados de Diversos",                     valor: recategorizedFromDiversos },
    { metrica: "Produtos Diversos ainda nao identificados",                valor: diversosRemaining },
    { metrica: "Produtos com confianca <= 60%",                           valor: lowConfidenceCount },
    { metrica: "Total quantidade agregada",                                valor: totalQty },
    { metrica: "Total receita bruta agregada",                             valor: `R$ ${totalRev.toFixed(2)}` },
    { metrica: "Periodo (inicio)",                                         valor: periodStart || "—" },
    { metrica: "Periodo (fim)",                                            valor: periodEnd   || "—" },
    { metrica: "",                                                         valor: "" },
    { metrica: "=== TOP 10 CATEGORIAS POR RECEITA ===",                   valor: "" },
    ...topCats.map(([cat, rev], i) => ({ metrica: `#${i + 1} ${cat}`, valor: `R$ ${rev.toFixed(2)}` })),
    { metrica: "",                                                         valor: "" },
    { metrica: "=== TOP 10 PRODUTOS POR RECEITA ===",                     valor: "" },
    ...topProds.map((r, i) => ({
      metrica: `#${i + 1} ${r.productName ?? "(sem nome)"}`,
      valor:   `R$ ${r.grossRevenue.toFixed(2)} (${r.quantitySold} un.)`,
    })),
    { metrica: "",                                                         valor: "" },
    { metrica: "=== ENDERECOS ===",                                       valor: "" },
    { metrica: "Total de linhas de endereco",                              valor: totalAddresses },
    { metrica: "Enderecos vinculados",                                     valor: linkedAddrCount },
    { metrica: "Enderecos sem vinculo / revisao",                          valor: unlinkedAddresses },
    { metrica: "",                                                         valor: "" },
    { metrica: "=== ISSUES ===",                                          valor: "" },
    { metrica: "Clientes_Revisar",                                         valor: clientRevisarRows.length },
    { metrica: "Produtos_Revisar",                                         valor: prodRevisarRows.length },
    { metrica: "Warnings_V2",                                              valor: warningRows.length },
  ];

  // Build final workbook with Resumo_V2 as first sheet
  const wbFinal = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbFinal, XLSX.utils.json_to_sheet(resumoRows), "Resumo_V2");
  for (const name of wb.SheetNames) {
    XLSX.utils.book_append_sheet(wbFinal, wb.Sheets[name]!, name);
  }

  const buffer = Buffer.from(XLSX.write(wbFinal, { type: "buffer", bookType: "xlsx" }));

  // ── Audit report ───────────────────────────────────────────────────────────

  const hasCritical =
    merged.filter(c => c.importStatus === "DUPLICATE_CONFLICT").length > 0 ||
    ambigDedup.length > 200;

  const recommendation: V2AuditReport["recommendation"] =
    hasCritical ? "NEEDS_REVIEW_BEFORE_PREVIEW" : "SAFE_TO_PREVIEW";

  const audit: V2AuditReport = {
    fileCreated:   "Foocci_Master_Dataset_V2.xlsx",
    sheetsCreated: wbFinal.SheetNames,
    customers: {
      total:             totalCust,
      contactable:       merged.length,
      noPhoneImportable: noPhoneImportable.length,
      noPhoneSkipped:    noPhone.length,
      needsReview:       clientRevisarRows.length,
      tiers:             { ...tierCounts },
    },
    mergeAudit: { phoneMatches, saiposOnly, nemoOnly, noPhoneDedup: noPhoneImportable.length },
    addresses: {
      total:    totalAddresses,
      linked:   linkedAddrCount,
      unlinked: unlinkedAddresses,
    },
    products: {
      totalRows:                 soldRows.length,
      categoryRows:              allCategoryRows.length,
      productRows:               allProductRows.length,
      categorizedCount,
      semClassCount:             uncategorizedCount,
      diversosRemaining,
      totalQuantity:             totalQty,
      totalRevenue:              totalRev,
      topCategories:             topCats.map(([category, revenue]) => ({ category, revenue })),
      recategorizedFromDiversos,
      lowConfidenceCount,
    },
    review: {
      clientesRevisarCount: clientRevisarRows.length,
      produtosRevisarCount: prodRevisarRows.length,
      warningsCount:        warningRows.length,
    },
    safety: {
      importExecuted:    false,
      customersCreated:  0,
      ordersCreated:     0,
      orderItemsCreated: 0,
      aggregatesCreated: 0,
      crmMessagesSent:   0,
    },
    recommendation,
  };

  return { buffer, audit };
}
