/**
 * POST /api/crm/saipos-nemo/preview-compiled
 *
 * Accepts a single compiled workbook file (multipart/form-data):
 *   - compiledFile — Foocci_Base_Compilada_Saipos_Nemo.xlsx
 *
 * The compiled workbook must contain:
 *   - Clientes_Master   — contactable merged customers (with phone)
 *   - Sem_Telefone      — no-phone customers pre-classified
 *   - Produtos_Agregados — aggregate sales data (optional)
 *
 * Returns a preview report + jobId.
 * Does NOT write any customer or product data to DB.
 * The parsed data is stored in ImportJob.reportJson for the execute step
 * (reuses the same /api/crm/saipos-nemo/execute endpoint).
 *
 * Safety: no-phone customers are flagged crmContactable=false in execute.
 * They never enter WhatsApp campaigns.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  parseCompiledWorkbook,
  buildPreview,
  type StoredReport,
} from "@/services/crm/SaiposNemoImportService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Form data inválido" }, { status: 400 });
  }

  const compiledFile = formData.get("compiledFile");

  if (!compiledFile || typeof compiledFile === "string") {
    return NextResponse.json(
      { error: "Arquivo compilado não enviado. Use o campo 'compiledFile' com o arquivo Foocci_Base_Compilada_Saipos_Nemo.xlsx" },
      { status: 400 }
    );
  }

  try {
    const compiledBuf = Buffer.from(await (compiledFile as File).arrayBuffer());
    const parsed = parseCompiledWorkbook(compiledBuf);

    // Build sold result shape for buildPreview
    const soldResult = {
      meta: parsed.soldMeta,
      rows: parsed.soldRows,
      categoryCount:     parsed.soldRows.filter(r => r.rowType === "CATEGORY").length,
      productCount:      parsed.soldRows.filter(r => r.rowType === "PRODUCT").length,
      totalQuantity:     parsed.soldRows.filter(r => r.rowType === "PRODUCT").reduce((s, r) => s + r.quantitySold, 0),
      totalRevenue:      parsed.soldRows.filter(r => r.rowType === "PRODUCT").reduce((s, r) => s + r.grossRevenue, 0),
      originalRowCount:     parsed.soldRows.length,
      consolidatedRowCount: 0,
      duplicateGroups:  [],
    };

    // Build MatchResult shape for buildPreview
    const matchResult = {
      merged:            parsed.merged,
      noPhone:           parsed.noPhone,
      noPhoneImportable: parsed.noPhoneImportable,
      stats:             parsed.stats,
    };

    const preview = buildPreview(matchResult, soldResult, "COMPILED_WORKBOOK");

    // Store parsed data in ImportJob so the existing execute endpoint can run it
    const storedReport: StoredReport = {
      merged:            parsed.merged,
      noPhone:           parsed.noPhone,
      noPhoneImportable: parsed.noPhoneImportable,
      soldRows:          parsed.soldRows,
      soldMeta:          parsed.soldMeta,
      preview,
    };

    const job = await prisma.importJob.create({
      data: {
        restaurantId: ctx.restaurantId,
        type:         "saipos_nemo_compiled",
        filename:     (compiledFile as File).name,
        status:       "VALIDATING",
        totalRows:    parsed.merged.length + parsed.noPhoneImportable.length + parsed.noPhone.length,
        validRows:    parsed.merged.length + parsed.noPhoneImportable.length,
        errorRows:    parsed.noPhone.length,
        reportJson:   JSON.parse(JSON.stringify(storedReport)),
      },
    });

    return NextResponse.json({ jobId: job.id, preview, debug: parsed.debug });
  } catch (err) {
    console.error("[saipos-nemo/preview-compiled]", err);
    return NextResponse.json({ error: "Falha ao processar arquivo compilado" }, { status: 500 });
  }
}
