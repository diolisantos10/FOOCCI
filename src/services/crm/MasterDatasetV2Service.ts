/**
 * MasterDatasetV2Service
 *
 * Generates Foocci_Master_Dataset_V2.xlsx — a cleaned, categorized workbook
 * derived from a parsed StoredReport (already validated via preview-compiled).
 *
 * Sheets produced:
 *   1. Clientes_Master_Unificado    — one row per customer, quality tiers
 *   2. Clientes_Sem_Telefone        — enrichment queue (importable + skipped)
 *   3. Enderecos_Normalizados       — normalized address rows
 *   4. Produtos_Agregados_Categorizados — products with smart category mapping
 *   5. Revisar                      — flagged issues / ambiguous records
 *   6. Resumo                       — KPI summary
 *
 * Safety guarantees:
 *   - Reads data only. Does NOT write to DB.
 *   - Does NOT create fake phones, orders, or customers.
 *   - "Diversos" / "Outros" is always mapped to SEM_CLASSIFICACAO, never kept.
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
  group: string;
  subgroup: string | null;
  keywords: string[];
}

const PRODUCT_RULES: ProductRule[] = [
  { group: "POKE",           subgroup: null,         keywords: ["poke"] },
  { group: "CEVICHE",        subgroup: null,         keywords: ["ceviche", "seviche"] },
  { group: "TEMAKI",         subgroup: null,         keywords: ["temaki"] },
  { group: "HOT ROLL",       subgroup: null,         keywords: ["hot roll", "hotroll"] },
  { group: "URAMAKI",        subgroup: null,         keywords: ["uramaki"] },
  { group: "NIGUIRI",        subgroup: null,         keywords: ["niguiri", "nigiri"] },
  { group: "HOSSOMAKI",      subgroup: null,         keywords: ["hossomaki", "hosso maki", "hossomak"] },
  { group: "SASHIMI",        subgroup: null,         keywords: ["sashimi"] },
  { group: "PRATOS QUENTES", subgroup: "YAKISOBA",   keywords: ["yakisoba"] },
  { group: "PRATOS QUENTES", subgroup: "RAMEN",      keywords: ["ramen"] },
  { group: "PRATOS QUENTES", subgroup: "YAKIMESHI",  keywords: ["yakimeshi", "yakimesi"] },
  { group: "PRATOS QUENTES", subgroup: null,         keywords: ["quente", "caldo"] },
  { group: "ENTRADAS",       subgroup: "GYOZA",      keywords: ["gyoza"] },
  { group: "ENTRADAS",       subgroup: "EDAMAME",    keywords: ["edamame"] },
  { group: "ENTRADAS",       subgroup: null,         keywords: ["entrada", "appetizer", "aperitiv"] },
  {
    group: "BEBIDAS",
    subgroup: null,
    keywords: [
      "bebida", "suco", "agua", "refrigerante", "cerveja", "vinho", "drink",
      "gelo", "limonada", "cha", "chope", "energetico", "coca", "pepsi",
      "guarana", "sprite", "fanta", "heineken", "budweiser", "skol",
      "itaipava", "stella", "kombucha", "gatorade", "isoton",
    ],
  },
  {
    group: "SOBREMESAS",
    subgroup: null,
    keywords: [
      "sobremesa", "sorvete", "mochi", "doce", "brigadeiro", "chocolate",
      "waffle", "crepe", "pudim", "cheesecake", "brownie",
    ],
  },
  { group: "COMBOS",     subgroup: null, keywords: ["combo", "kit", "festival", "combinado"] },
  { group: "TAXAS",      subgroup: null, keywords: ["entrega", "frete", "taxa de entrega", "delivery fee"] },
  { group: "DESCONTOS",  subgroup: null, keywords: ["desconto", "discount", "cupom", "coupon"] },
  // Explicit catch for "Diversos" / "Outros" — always lands in SEM_CLASSIFICACAO
  {
    group: "SEM_CLASSIFICACAO",
    subgroup: null,
    keywords: ["diversos", "outros", "other", "miscelane", "miscellaneous", "geral"],
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
  productGroup: string;
  productSubgroup: string | null;
  confidenceScore: number;
  wasAutoCategorized: boolean;
}

function categorize(categoryName: string, productName: string | null): CategorizeResult {
  const catNorm  = normText(categoryName);
  const prodNorm = normText(productName ?? "");
  const fullNorm = `${catNorm} ${prodNorm}`.trim();

  // Pass 1: exact category match (highest confidence)
  for (const rule of PRODUCT_RULES) {
    for (const kw of rule.keywords) {
      const kwNorm = normText(kw);
      if (catNorm === kwNorm || catNorm.startsWith(kwNorm + " ") || catNorm.endsWith(" " + kwNorm) || catNorm.includes(kwNorm)) {
        return {
          normalizedCategory: rule.group,
          productGroup:       rule.group,
          productSubgroup:    rule.subgroup,
          confidenceScore:    95,
          wasAutoCategorized: catNorm !== normText(rule.group),
        };
      }
    }
  }

  // Pass 2: product name match (medium confidence)
  if (prodNorm) {
    for (const rule of PRODUCT_RULES) {
      for (const kw of rule.keywords) {
        const kwNorm = normText(kw);
        if (prodNorm.includes(kwNorm)) {
          return {
            normalizedCategory: rule.group,
            productGroup:       rule.group,
            productSubgroup:    rule.subgroup,
            confidenceScore:    70,
            wasAutoCategorized: true,
          };
        }
      }
    }
  }

  // Pass 3: combined full-text (lower confidence)
  for (const rule of PRODUCT_RULES) {
    for (const kw of rule.keywords) {
      const kwNorm = normText(kw);
      if (fullNorm.includes(kwNorm)) {
        return {
          normalizedCategory: rule.group,
          productGroup:       rule.group,
          productSubgroup:    rule.subgroup,
          confidenceScore:    50,
          wasAutoCategorized: true,
        };
      }
    }
  }

  // No match — NEVER "Diversos", always SEM_CLASSIFICACAO
  return {
    normalizedCategory: "SEM_CLASSIFICACAO",
    productGroup:       "SEM_CLASSIFICACAO",
    productSubgroup:    null,
    confidenceScore:    0,
    wasAutoCategorized: false,
  };
}

// ── Quality tier ───────────────────────────────────────────────────────────────

type QualityTier = "A+" | "A" | "B" | "C" | "D";

function mergedTier(c: MergedCustomer): QualityTier {
  const hasDoc  = !!c.document;
  const hasEmail = !!c.email;
  const hasAddr  = c.addresses.length > 0;
  const hasOrders = (c.importedOrderCount ?? 0) > 0;
  if (hasDoc && hasEmail && hasAddr && hasOrders) return "A+";
  if ((hasDoc || hasEmail) && hasAddr) return "A";
  return "B";
}

function noPhoneTier(c: NoPhoneImportableCustomer): QualityTier {
  const hasDoc   = !!c.document;
  const hasEmail = !!c.email;
  if (hasDoc && hasEmail) return "C";
  if (hasDoc || hasEmail) return "C";
  return "D";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return typeof d === "string" ? d : "";
  return dt.toLocaleDateString("pt-BR");
}

function customerKey(c: MergedCustomer | NoPhoneImportableCustomer, idx: number): string {
  if ("phone" in c && c.phone) return c.phone;
  if (c.document) return `DOC-${c.document}`;
  if (c.email)    return `EMAIL-${c.email}`;
  return `NP-${String(idx).padStart(4, "0")}`;
}

function enrichmentPriority(orders: number | null, spent: number | null): string {
  const o = orders ?? 0;
  const s = spent  ?? 0;
  if (o >= 5 || s >= 500) return "ALTA";
  if (o >= 2 || s >= 100) return "MEDIA";
  return "BAIXA";
}

function recoveryStrategy(doc: string | null, email: string | null, hasAddress: boolean): string {
  if (doc)        return "DOCUMENT_LOOKUP";
  if (email)      return "WHATSAPP_MANUAL";
  if (hasAddress) return "DELIVERY_HISTORY";
  return "GOOGLE_MATCH";
}

function enrichStatus(c: MergedCustomer): string {
  const score = [!!c.document, !!c.email, !!c.birthDate, c.addresses.length > 0].filter(Boolean).length;
  if (score === 4) return "COMPLETE";
  if (score >= 2)  return "PARTIAL";
  return "NEEDS_ENRICHMENT";
}

function normalizedAddress(addr: NemoAddressGroup): string {
  return [addr.street, addr.number, addr.neighborhood, addr.city, addr.state, addr.zipCode]
    .filter(Boolean)
    .join(", ");
}

// ── Public types ───────────────────────────────────────────────────────────────

export interface V2WorkbookSummary {
  totalContactable:    number;
  totalNonContactable: number;
  totalSkipped:        number;
  tierCounts:          Record<QualityTier, number>;
  productCount:        number;
  categorizedCount:    number;
  uncategorizedCount:  number;
  issueCount:          number;
}

// ── Main builder ───────────────────────────────────────────────────────────────

export function buildV2Workbook(
  merged:            MergedCustomer[],
  noPhoneImportable: NoPhoneImportableCustomer[],
  noPhone:           NoPhoneCustomer[],
  soldRows:          ProductSalesRow[],
  soldMeta:          SoldItemsMeta,
): { buffer: Buffer; summary: V2WorkbookSummary } {
  const wb = XLSX.utils.book_new();
  const tierCounts: Record<QualityTier, number> = { "A+": 0, "A": 0, "B": 0, "C": 0, "D": 0 };

  // ── Sheet 1: Clientes_Master_Unificado ──────────────────────────────────────

  const masterRows: Record<string, unknown>[] = [];

  for (const c of merged) {
    const tier = mergedTier(c);
    tierCounts[tier]++;
    masterRows.push({
      customerKey:          c.phone,
      nameFinal:            c.name,
      phone:                c.phone,
      document:             c.document ?? "",
      email:                c.email ?? "",
      birthDate:            fmtDate(c.birthDate),
      crmContactable:       "SIM",
      contactStatus:        "CONTACTABLE",
      dataEnrichmentStatus: enrichStatus(c),
      sourceSystems:        c.sourceSystems.join("+"),
      totalImportedOrders:  c.importedOrderCount ?? "",
      totalImportedSpent:   c.importedTotalSpent ?? "",
      averageTicket:        c.averageTicket ?? "",
      lastOrderAt:          fmtDate(c.importedLastOrderAt),
      financialBalancePeriod: c.financialBalancePeriod ?? "",
      hasAddress:           c.addresses.length > 0 ? "SIM" : "NÃO",
      addressCount:         c.addresses.length,
      hasEmail:             c.email    ? "SIM" : "NÃO",
      hasDocument:          c.document ? "SIM" : "NÃO",
      hasBirthDate:         c.birthDate ? "SIM" : "NÃO",
      hasPhone:             "SIM",
      dedupStrategy:        "PHONE",
      needsReview:          c.importStatus !== "READY" ? "SIM" : "NÃO",
      notes:                c.notes ?? "",
      createdFrom:          c.sourceSystem,
      importConfidence:     tier === "A+" || tier === "A" ? "ALTA" : "MEDIA",
      customerQualityTier:  tier,
    });
  }

  for (let i = 0; i < noPhoneImportable.length; i++) {
    const c = noPhoneImportable[i]!;
    const tier = noPhoneTier(c);
    tierCounts[tier]++;
    masterRows.push({
      customerKey:          customerKey(c, i),
      nameFinal:            c.name,
      phone:                "",
      document:             c.document ?? "",
      email:                c.email ?? "",
      birthDate:            fmtDate(c.birthDate),
      crmContactable:       "NÃO",
      contactStatus:        "SEM_TELEFONE",
      dataEnrichmentStatus: "NEEDS_ENRICHMENT",
      sourceSystems:        c.sourceSystems.join("+"),
      totalImportedOrders:  c.importedOrderCount ?? "",
      totalImportedSpent:   c.importedTotalSpent ?? "",
      averageTicket:        c.averageTicket ?? "",
      lastOrderAt:          fmtDate(c.importedLastOrderAt),
      financialBalancePeriod: c.financialBalancePeriod ?? "",
      hasAddress:           c.addresses.length > 0 ? "SIM" : "NÃO",
      addressCount:         c.addresses.length,
      hasEmail:             c.email    ? "SIM" : "NÃO",
      hasDocument:          c.document ? "SIM" : "NÃO",
      hasBirthDate:         c.birthDate ? "SIM" : "NÃO",
      hasPhone:             "NÃO",
      dedupStrategy:        c.dedupStrategy,
      needsReview:          c.dedupStrategy === "NEEDS_REVIEW" ? "SIM" : "NÃO",
      notes:                c.notes ?? "",
      createdFrom:          c.sourceSystems.join("+"),
      importConfidence:     c.document ? "MEDIA" : c.email ? "MEDIA" : "BAIXA",
      customerQualityTier:  tier,
    });
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(masterRows), "Clientes_Master_Unificado");

  // ── Sheet 2: Clientes_Sem_Telefone ─────────────────────────────────────────

  const semTelRows: Record<string, unknown>[] = [];

  for (let i = 0; i < noPhoneImportable.length; i++) {
    const c = noPhoneImportable[i]!;
    semTelRows.push({
      customerKey:                  customerKey(c, i),
      nome:                         c.name,
      documento:                    c.document ?? "",
      email:                        c.email ?? "",
      qtdPedidos:                   c.importedOrderCount ?? "",
      totalGasto:                   c.importedTotalSpent ?? "",
      ultimaCompra:                 fmtDate(c.importedLastOrderAt),
      temEndereco:                  c.addresses.length > 0 ? "SIM" : "NÃO",
      dedupStrategy:                c.dedupStrategy,
      enrichmentPriority:           enrichmentPriority(c.importedOrderCount, c.importedTotalSpent),
      recommendedEnrichmentChannel: c.document ? "CRM" : c.email ? "EMAIL" : "MANUAL",
      possibleRecoveryStrategy:     recoveryStrategy(c.document, c.email, c.addresses.length > 0),
      needsReview:                  c.dedupStrategy === "NEEDS_REVIEW" ? "SIM" : "NÃO",
      statusImportacao:             "SERÁ_IMPORTADO",
    });
  }

  for (let i = 0; i < noPhone.length; i++) {
    const c = noPhone[i]!;
    semTelRows.push({
      customerKey:                  `SKIP-${String(i).padStart(4, "0")}`,
      nome:                         c.nome ?? "",
      documento:                    c.cpfCnpj ?? "",
      email:                        c.email ?? "",
      qtdPedidos:                   c.qtdPedidos ?? "",
      totalGasto:                   c.valorTotal ?? "",
      ultimaCompra:                 "",
      temEndereco:                  "NÃO",
      dedupStrategy:                "SKIPPED",
      enrichmentPriority:           enrichmentPriority(c.qtdPedidos, c.valorTotal),
      recommendedEnrichmentChannel: "MANUAL",
      possibleRecoveryStrategy:     recoveryStrategy(c.cpfCnpj, c.email, false),
      needsReview:                  "NÃO",
      statusImportacao:             "IGNORADO_DADOS_INSUFICIENTES",
    });
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(semTelRows.length > 0 ? semTelRows : [{ info: "Nenhum cliente sem telefone" }]), "Clientes_Sem_Telefone");

  // ── Sheet 3: Enderecos_Normalizados ────────────────────────────────────────

  const addrRows: Record<string, unknown>[] = [];

  for (const c of merged) {
    for (let i = 0; i < c.addresses.length; i++) {
      const addr = c.addresses[i]!;
      addrRows.push({
        customerKey:       c.phone,
        phone:             c.phone,
        name:              c.name,
        source:            c.sourceSystem,
        addressLine:       addr.street ?? "",
        number:            addr.number ?? "",
        district:          addr.neighborhood ?? "",
        city:              addr.city ?? "",
        state:             addr.state ?? "",
        zipCode:           addr.zipCode ?? "",
        complement:        addr.complement ?? "",
        reference:         addr.reference ?? "",
        isPrimary:         i === 0 ? "SIM" : "NÃO",
        normalizedAddress: normalizedAddress(addr),
      });
    }
  }

  for (let i = 0; i < noPhoneImportable.length; i++) {
    const c = noPhoneImportable[i]!;
    for (let j = 0; j < c.addresses.length; j++) {
      const addr = c.addresses[j]!;
      addrRows.push({
        customerKey:       customerKey(c, i),
        phone:             "",
        name:              c.name,
        source:            "SEM_TELEFONE",
        addressLine:       addr.street ?? "",
        number:            addr.number ?? "",
        district:          addr.neighborhood ?? "",
        city:              addr.city ?? "",
        state:             addr.state ?? "",
        zipCode:           addr.zipCode ?? "",
        complement:        addr.complement ?? "",
        reference:         addr.reference ?? "",
        isPrimary:         j === 0 ? "SIM" : "NÃO",
        normalizedAddress: normalizedAddress(addr),
      });
    }
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(addrRows.length > 0 ? addrRows : [{ info: "Nenhum endereço encontrado" }]),
    "Enderecos_Normalizados",
  );

  // ── Sheet 4: Produtos_Agregados_Categorizados ──────────────────────────────

  const productRows = soldRows.filter(r => r.rowType === "PRODUCT");
  let categorizedCount   = 0;
  let uncategorizedCount = 0;

  const catRows: Record<string, unknown>[] = productRows
    .map(row => {
      const cat = categorize(row.categoryName, row.productName);
      if (cat.normalizedCategory !== "SEM_CLASSIFICACAO") categorizedCount++;
      else uncategorizedCount++;
      return {
        categoryOriginal:      row.categoryName,
        productNameOriginal:   row.productName ?? "",
        normalizedCategory:    cat.normalizedCategory,
        normalizedProductName: row.productName ?? "",
        productGroup:          cat.productGroup,
        productSubgroup:       cat.productSubgroup ?? "",
        quantitySold:          row.quantitySold,
        grossRevenue:          row.grossRevenue,
        percent:               row.percent ?? "",
        confidenceScore:       cat.confidenceScore,
        wasAutoCategorized:    cat.wasAutoCategorized ? "SIM" : "NÃO",
      };
    })
    .sort((a, b) => (b.grossRevenue as number) - (a.grossRevenue as number));

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(catRows.length > 0 ? catRows : [{ info: "Nenhum produto encontrado" }]),
    "Produtos_Agregados_Categorizados",
  );

  // ── Sheet 5: Revisar ───────────────────────────────────────────────────────

  const reviewRows: Record<string, unknown>[] = [];

  for (const c of merged) {
    if (c.importStatus !== "READY") {
      reviewRows.push({
        issueType:           "CUSTOMER_NEEDS_REVIEW",
        severity:            "MEDIA",
        customerKey:         c.phone,
        customerName:        c.name,
        productName:         "",
        details:             `Cliente (${c.sourceSystem}) marcado como ${c.importStatus}`,
        suggestedResolution: "Verificar dados manualmente e confirmar ou corrigir",
      });
    }
  }

  for (let i = 0; i < noPhoneImportable.length; i++) {
    const c = noPhoneImportable[i]!;
    if (c.dedupStrategy === "NEEDS_REVIEW") {
      reviewRows.push({
        issueType:           "NO_PHONE_DUPLICATE_AMBIGUOUS",
        severity:            "ALTA",
        customerKey:         customerKey(c, i),
        customerName:        c.name,
        productName:         "",
        details:             `Possível duplicata sem telefone. Nome: "${c.name}". Sem CPF/CNPJ ou e-mail para desambiguação.`,
        suggestedResolution: "Buscar CPF/CNPJ ou telefone manualmente antes de importar",
      });
    }
  }

  // flag uncategorized products (limit to 50 so sheet stays readable)
  let semClassCount = 0;
  for (const row of productRows) {
    if (semClassCount >= 50) break;
    const cat = categorize(row.categoryName, row.productName);
    if (cat.normalizedCategory === "SEM_CLASSIFICACAO") {
      reviewRows.push({
        issueType:           "PRODUCT_NOT_CATEGORIZED",
        severity:            "BAIXA",
        customerKey:         "",
        customerName:        "",
        productName:         row.productName ?? row.categoryName,
        details:             `Produto "${row.productName ?? "(sem nome)"}" da categoria "${row.categoryName}" não categorizado. Receita: R$ ${row.grossRevenue.toFixed(2)}`,
        suggestedResolution: "Adicionar keyword ao PRODUCT_RULES em MasterDatasetV2Service.ts",
      });
      semClassCount++;
    }
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(reviewRows.length > 0 ? reviewRows : [{ info: "Nenhum problema encontrado" }]),
    "Revisar",
  );

  // ── Sheet 6: Resumo ────────────────────────────────────────────────────────

  const totalContactable    = merged.length;
  const totalNonContactable = noPhoneImportable.length;
  const totalSkipped        = noPhone.length;
  const totalCustomers      = totalContactable + totalNonContactable + totalSkipped;

  // Top categories by revenue
  const catRevMap = new Map<string, number>();
  for (const row of productRows) {
    const cat = categorize(row.categoryName, row.productName);
    catRevMap.set(cat.normalizedCategory, (catRevMap.get(cat.normalizedCategory) ?? 0) + row.grossRevenue);
  }
  const topCats = [...catRevMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Quality score (weighted average of tier weights)
  const tierWeights: Record<QualityTier, number> = { "A+": 100, "A": 80, "B": 60, "C": 40, "D": 20 };
  const totalWeighted = (Object.entries(tierCounts) as [QualityTier, number][])
    .reduce((s, [t, n]) => s + tierWeights[t] * n, 0);
  const qualityScore = totalCustomers > 0 ? Math.round(totalWeighted / totalCustomers) : 0;

  const resumoRows: Record<string, unknown>[] = [
    { metrica: "Data de geração",                                valor: new Date().toLocaleDateString("pt-BR") },
    { metrica: "",                                               valor: "" },
    { metrica: "── CLIENTES ──────────────────────────────────", valor: "" },
    { metrica: "Total de clientes",                              valor: totalCustomers },
    { metrica: "Clientes contatáveis (com telefone)",            valor: totalContactable },
    { metrica: "Não contatáveis (sem telefone, serão importados)", valor: totalNonContactable },
    { metrica: "Ignorados (dados insuficientes)",                valor: totalSkipped },
    { metrica: "",                                               valor: "" },
    { metrica: "── QUALIDADE ─────────────────────────────────", valor: "" },
    { metrica: "Tier A+ (telefone + doc + email + endereço + pedidos)", valor: tierCounts["A+"] },
    { metrica: "Tier A  (telefone + (doc ou email) + endereço)", valor: tierCounts["A"] },
    { metrica: "Tier B  (telefone, dados parciais)",             valor: tierCounts["B"] },
    { metrica: "Tier C  (sem telefone, com doc ou email)",       valor: tierCounts["C"] },
    { metrica: "Tier D  (sem telefone, sem identificador)",      valor: tierCounts["D"] },
    { metrica: "Score de qualidade do dataset (0-100)",          valor: qualityScore },
    { metrica: "",                                               valor: "" },
    { metrica: "── PRODUTOS ──────────────────────────────────", valor: "" },
    { metrica: "Total de produtos únicos",                       valor: productRows.length },
    { metrica: "Produtos categorizados",                         valor: categorizedCount },
    { metrica: "Produtos sem categoria (SEM_CLASSIFICACAO)",     valor: uncategorizedCount },
    {
      metrica: "Período (início)",
      valor: soldMeta.periodStart ? fmtDate(soldMeta.periodStart) : "—",
    },
    {
      metrica: "Período (fim)",
      valor: soldMeta.periodEnd ? fmtDate(soldMeta.periodEnd) : "—",
    },
    { metrica: "",                                               valor: "" },
    { metrica: "── ISSUES ────────────────────────────────────", valor: "" },
    { metrica: "Total de itens para revisar",                    valor: reviewRows.length },
    { metrica: "",                                               valor: "" },
    { metrica: "── TOP CATEGORIAS POR RECEITA ─────────────────", valor: "" },
    ...topCats.map(([cat, rev], i) => ({
      metrica: `Top ${i + 1}: ${cat}`,
      valor:   `R$ ${rev.toFixed(2)}`,
    })),
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoRows), "Resumo");

  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

  return {
    buffer,
    summary: {
      totalContactable,
      totalNonContactable,
      totalSkipped,
      tierCounts,
      productCount:      productRows.length,
      categorizedCount,
      uncategorizedCount,
      issueCount:        reviewRows.length,
    },
  };
}
