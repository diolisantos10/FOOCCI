#!/usr/bin/env npx tsx
/**
 * scripts/generate-v2.ts
 *
 * Standalone script: reads Foocci_Base_Compilada_Saipos_Nemo.xlsx from disk,
 * parses it, and generates Foocci_Master_Dataset_V2.xlsx with 10 sheets.
 *
 * Usage:
 *   npx tsx scripts/generate-v2.ts [path/to/Foocci_Base_Compilada_Saipos_Nemo.xlsx]
 *
 * If no path is given, the script searches common locations automatically.
 *
 * Output:
 *   Foocci_Master_Dataset_V2.xlsx  (written to project root)
 *   Full audit report              (printed to stdout)
 *
 * Does NOT modify production data.
 * Does NOT write to the database.
 * Does NOT execute any import.
 * Does NOT create customers, orders, or CRM messages.
 */

import * as fs   from "fs";
import * as path from "path";
import { parseCompiledWorkbook } from "../src/services/crm/SaiposNemoImportService";
import { buildV2Workbook }       from "../src/services/crm/MasterDatasetV2Service";

// ── Locate input file ─────────────────────────────────────────────────────────

const INPUT_FILENAME  = "Foocci_Base_Compilada_Saipos_Nemo.xlsx";
const OUTPUT_FILENAME = "Foocci_Master_Dataset_V2.xlsx";

const candidates: string[] = [
  process.argv[2],
  path.join(process.cwd(), INPUT_FILENAME),
  path.join(process.cwd(), "uploads", INPUT_FILENAME),
  path.join(process.cwd(), "tmp",     INPUT_FILENAME),
  path.join("/tmp",                   INPUT_FILENAME),
].filter((p): p is string => typeof p === "string");

let inputPath: string | null = null;
for (const c of candidates) {
  if (fs.existsSync(c)) { inputPath = c; break; }
}

if (!inputPath) {
  console.error(`
╔══════════════════════════════════════════════════════════════╗
║                   ARQUIVO NAO ENCONTRADO                     ║
╚══════════════════════════════════════════════════════════════╝

Esperado: ${INPUT_FILENAME}

Por favor, coloque o arquivo em um dos seguintes locais:
${candidates.map(c => `  • ${c}`).join("\n")}

Ou passe o caminho como argumento:
  npx tsx scripts/generate-v2.ts /caminho/para/${INPUT_FILENAME}
`);
  process.exit(1);
}

// ── Parse compiled workbook ───────────────────────────────────────────────────

console.log(`\n📂  Lendo: ${inputPath}`);
const inputBuffer = fs.readFileSync(inputPath);

console.log("📊  Parseando workbook compilado...");
const parsed = parseCompiledWorkbook(inputBuffer);

console.log("✅  Parse concluído:");
console.log(`    Clientes contatáveis:    ${parsed.merged.length}`);
console.log(`    Não contatáveis:         ${parsed.noPhoneImportable.length}`);
console.log(`    Ignorados (insuf.):      ${parsed.noPhone.length}`);
console.log(`    Linhas de produto:       ${parsed.soldRows.length}`);

// ── Build V2 workbook ─────────────────────────────────────────────────────────

console.log("\n🔧  Gerando Foocci_Master_Dataset_V2.xlsx...");

const { buffer, audit } = buildV2Workbook(
  parsed.merged,
  parsed.noPhoneImportable,
  parsed.noPhone,
  parsed.soldRows,
  parsed.soldMeta,
);

// ── Write output ──────────────────────────────────────────────────────────────

const outputPath = path.join(process.cwd(), OUTPUT_FILENAME);

if (fs.existsSync(outputPath)) {
  const backup = outputPath.replace(".xlsx", `_backup_${Date.now()}.xlsx`);
  fs.renameSync(outputPath, backup);
  console.log(`📦  Backup do arquivo anterior: ${path.basename(backup)}`);
}

fs.writeFileSync(outputPath, buffer);
console.log(`\n✅  ARQUIVO GERADO: ${outputPath}`);

// ── Print audit report ────────────────────────────────────────────────────────

const pad = (s: string, n: number) => s.padEnd(n);
const line = "─".repeat(62);

console.log(`
╔══════════════════════════════════════════════════════════════╗
║         FOOCCI — AUDIT REPORT — MASTER DATASET V2            ║
╚══════════════════════════════════════════════════════════════╝

1. ARQUIVO GERADO
   ${audit.fileCreated}

2. ABAS GERADAS (${audit.sheetsCreated.length})
${audit.sheetsCreated.map((s, i) => `   ${String(i + 1).padStart(2)}. ${s}`).join("\n")}

${line}
3. CLIENTES
${line}
   ${pad("Total de clientes:", 40)} ${audit.customers.total}
   ${pad("Contatáveis (com telefone):", 40)} ${audit.customers.contactable}
   ${pad("Não contatáveis importáveis:", 40)} ${audit.customers.noPhoneImportable}
   ${pad("Ignorados (dados insuficientes):", 40)} ${audit.customers.noPhoneSkipped}
   ${pad("Precisam revisão:", 40)} ${audit.customers.needsReview}

   TIERS DE QUALIDADE:
   ${pad("  Tier A+ (tel+doc+end+pedidos):", 40)} ${audit.customers.tiers["A+"]}
   ${pad("  Tier A  (tel+pedidos ou email+end):", 40)} ${audit.customers.tiers["A"]}
   ${pad("  Tier B  (tel, dados parciais):", 40)} ${audit.customers.tiers["B"]}
   ${pad("  Tier C  (sem tel, com doc ou email):", 40)} ${audit.customers.tiers["C"]}
   ${pad("  Tier D  (sem tel, sem identificador):", 40)} ${audit.customers.tiers["D"]}

${line}
4. MERGE SAIPOS + NEMO
${line}
   ${pad("Matches por telefone (Saipos+Nemo):", 40)} ${audit.mergeAudit.phoneMatches}
   ${pad("Saipos sem match Nemo:", 40)} ${audit.mergeAudit.saiposOnly}
   ${pad("Nemo sem match Saipos:", 40)} ${audit.mergeAudit.nemoOnly}
   ${pad("Deduplicação sem telefone:", 40)} ${audit.mergeAudit.noPhoneDedup}

${line}
5. ENDEREÇOS
${line}
   ${pad("Total:", 40)} ${audit.addresses.total}
   ${pad("Vinculados a clientes:", 40)} ${audit.addresses.linked}
   ${pad("Sem vínculo / revisão:", 40)} ${audit.addresses.unlinked}

${line}
6. PRODUTOS
${line}
   ${pad("Total de linhas:", 40)} ${audit.products.totalRows}
   ${pad("  Categorias:", 40)} ${audit.products.categoryRows}
   ${pad("  Produtos:", 40)} ${audit.products.productRows}
   ${pad("Categorizados:", 40)} ${audit.products.categorizedCount}
   ${pad("SEM_CLASSIFICACAO:", 40)} ${audit.products.semClassCount}
   ${pad("Recategorizados de Diversos:", 40)} ${audit.products.recategorizedFromDiversos}
   ${pad("Diversos ainda não identificados:", 40)} ${audit.products.diversosRemaining}
   ${pad("Confiança <= 60%:", 40)} ${audit.products.lowConfidenceCount}
   ${pad("Total quantidade agregada:", 40)} ${audit.products.totalQuantity.toLocaleString("pt-BR")}
   ${pad("Total receita bruta:", 40)} R$ ${audit.products.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}

${line}
7. TOP CATEGORIAS POR RECEITA
${line}
${audit.products.topCategories.map((c, i) =>
  `   #${String(i + 1).padStart(2)} ${pad(c.category, 30)} R$ ${c.revenue.toFixed(2)}`
).join("\n")}

${line}
8. REVISÃO
${line}
   ${pad("Clientes_Revisar:", 40)} ${audit.review.clientesRevisarCount} itens
   ${pad("Produtos_Revisar:", 40)} ${audit.review.produtosRevisarCount} itens
   ${pad("Warnings_V2:", 40)} ${audit.review.warningsCount} alertas

${line}
9. CONFIRMAÇÃO DE SEGURANÇA
${line}
   ✅  Nenhuma importação executada
   ✅  Nenhum cliente criado no banco
   ✅  Nenhum pedido criado
   ✅  Nenhum item de pedido criado
   ✅  Nenhum ProductSalesAggregate criado
   ✅  Nenhuma mensagem CRM enviada

${line}
10. RECOMENDAÇÃO: ${audit.recommendation}
${line}
${audit.recommendation === "SAFE_TO_PREVIEW"
  ? `   ✅  Dataset pode ser submetido ao endpoint preview-compiled para revisão\n      final antes da importação.`
  : `   ⚠️   Revise os itens em Clientes_Revisar e Warnings_V2 antes de\n      prosseguir com a importação.`}

${line}
ASSUMPTIONS / UNRESOLVED ISSUES:
${line}
   • "aliases" column is empty: the parsed StoredReport retains only the
     chosen name per customer. Original alternate names are preserved in
     the "notes" field of each record.
   • "sourceRow" in Enderecos_Normalizados is empty: row indices are not
     preserved through the merge pipeline.
   • Import should be done via POST /api/crm/saipos-nemo/preview-compiled,
     NOT by uploading this V2 workbook directly. The V2 is for review only.
   • Safe to upload V2 to preview-compiled? NO — the V2 workbook does not
     match the expected compiled workbook format. Use the original
     Foocci_Base_Compilada_Saipos_Nemo.xlsx for the import step.
`);
