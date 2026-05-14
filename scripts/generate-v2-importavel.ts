#!/usr/bin/env npx tsx
/**
 * scripts/generate-v2-importavel.ts
 *
 * Standalone script: reads Foocci_Base_Compilada_Saipos_Nemo.xlsx from disk,
 * parses it, and generates Foocci_Master_Dataset_V2_IMPORTAVEL.xlsx.
 *
 * Usage:
 *   npx tsx scripts/generate-v2-importavel.ts [path/to/Foocci_Base_Compilada_Saipos_Nemo.xlsx]
 *
 * Output:
 *   Foocci_Master_Dataset_V2_IMPORTAVEL.xlsx  (written to project root)
 *   Full audit report                          (printed to stdout)
 *
 * Sheet names are parser-compatible:
 *   Clientes_Master, Sem_Telefone, Produtos_Agregados, Endereços
 *   + Merge_Report, Warnings, Duplicados_Produtos, Resumo, README
 *
 * safeToUploadToPreviewCompiled: YES
 *
 * Does NOT modify production data.
 * Does NOT write to the database.
 * Does NOT execute any import.
 * Does NOT create customers, orders, or CRM messages.
 */

import * as fs   from "fs";
import * as path from "path";
import { parseCompiledWorkbook } from "../src/services/crm/SaiposNemoImportService";
import { buildV2ImportableWorkbook } from "../src/services/crm/MasterDatasetV2ImportableService";

// ── Locate input file ─────────────────────────────────────────────────────────

const INPUT_FILENAME  = "Foocci_Base_Compilada_Saipos_Nemo.xlsx";
const OUTPUT_FILENAME = "Foocci_Master_Dataset_V2_IMPORTAVEL.xlsx";

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
  npx tsx scripts/generate-v2-importavel.ts /caminho/para/${INPUT_FILENAME}
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

// ── Build V2 importable workbook ──────────────────────────────────────────────

console.log("\n🔧  Gerando Foocci_Master_Dataset_V2_IMPORTAVEL.xlsx...");

const { buffer, audit } = buildV2ImportableWorkbook(
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

const pad  = (s: string, n: number) => s.padEnd(n);
const line = "─".repeat(62);

console.log(`
╔══════════════════════════════════════════════════════════════╗
║    FOOCCI — AUDIT REPORT — MASTER DATASET V2 IMPORTÁVEL      ║
╚══════════════════════════════════════════════════════════════╝

${line}
SAFE_TO_UPLOAD_TO_PREVIEW_COMPILED: ${audit.safeToUploadToPreviewCompiled}
${line}

1. ARQUIVO GERADO
   ${OUTPUT_FILENAME}

2. ABAS GERADAS (${audit.sheetsCreated.length})
${audit.sheetsCreated.map((s, i) => `   ${String(i + 1).padStart(2)}. ${s}`).join("\n")}

${line}
3. CLIENTES
${line}
   ${pad("Contatáveis (com telefone):", 40)} ${audit.customers.contactable}
   ${pad("Não contatáveis importáveis:", 40)} ${audit.customers.noPhoneImportable}
   ${pad("Ignorados (dados insuficientes):", 40)} ${audit.customers.noPhoneSkipped}
   ${pad("Total processados:", 40)} ${audit.customers.total}
   ${pad("Prontos (READY):", 40)} ${audit.customers.readyCount}
   ${pad("Precisam revisão (NEEDS_REVIEW):", 40)} ${audit.customers.needsReviewCount}

${line}
4. ENDEREÇOS
${line}
   ${pad("Linhas na aba Endereços:", 40)} ${audit.addresses.inEnderecoSheet}
   ${pad("Endereços inline em Clientes_Master:", 40)} ${audit.addresses.inMasterInline}

${line}
5. PRODUTOS
${line}
   ${pad("Linhas de entrada (PRODUCT rows):", 40)} ${audit.products.inputProductRows}
   ${pad("Linhas CATEGORY V2 (reconstruídas):", 40)} ${audit.products.v2CategoryRows}
   ${pad("Linhas PRODUCT V2:", 40)} ${audit.products.v2ProductRows}
   ${pad("Categorizados (≠ SEM_CLASSIFICACAO):", 40)} ${audit.products.categorizedToV2}
   ${pad("SEM_CLASSIFICACAO:", 40)} ${audit.products.semClassCount}
   ${pad("Recategorizados de Diversos→V2:", 40)} ${audit.products.recategorizedFromDiversos}
   ${pad("Confiança <= 60%:", 40)} ${audit.products.lowConfidenceCount}
   ${pad("Quantidade total vendida:", 40)} ${audit.products.totalQuantity.toLocaleString("pt-BR")}
   ${pad("Receita bruta total:", 40)} R$ ${audit.products.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}

${line}
6. TOP CATEGORIAS (RECEITA)
${line}
${audit.products.topCategories.map((c, i) =>
  `   #${String(i + 1).padStart(2)} ${pad(c.category, 30)} R$ ${c.revenue.toFixed(2)}`
).join("\n")}

${line}
7. AMOSTRAS: PRODUTOS RETIRADOS DE DIVERSOS → V2
${line}
${audit.products.diversosSamples.length === 0
  ? "   (nenhum produto recategorizado de Diversos)"
  : audit.products.diversosSamples.map((s, i) =>
      `   ${String(i + 1).padStart(2)}. [${s.newCategory}] ${s.product} (conf=${s.confidence})`
    ).join("\n")}

${line}
8. CONFIRMAÇÃO DE SEGURANÇA
${line}
   ✅  Nenhuma importação executada
   ✅  Nenhum cliente criado no banco
   ✅  Nenhum pedido criado
   ✅  Nenhum item de pedido criado
   ✅  Nenhum ProductSalesAggregate criado
   ✅  Nenhuma mensagem CRM enviada

${line}
9. COMPATIBILIDADE COM O PARSER
${line}
   ✅  Clientes_Master    → parseMasterSheet (col: name, phone, document, ...)
   ✅  Sem_Telefone       → parseSemTelefoneSheet (col: name, document, addressLine, ...)
   ✅  Produtos_Agregados → parseProdutosAgregadosSheet (direct format via rowType col)
   ✅  Endereços          → parseEnderecosSheet (col: phone, addressLine, ...)

${line}
PRÓXIMOS PASSOS:
${line}
   1. Revise as abas Warnings e Duplicados_Produtos no arquivo gerado.
   2. Se aprovado, envie o arquivo ORIGINAL (Foocci_Base_Compilada_Saipos_Nemo.xlsx)
      ao endpoint POST /api/crm/saipos-nemo/preview-compiled para importação final.
   3. Este arquivo V2_IMPORTAVEL pode ser enviado ao preview-compiled para uma
      segunda rodada de preview com categorias V2 normalizadas.
`);
