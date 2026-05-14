/**
 * POST /api/crm/saipos-nemo/generate-v2-importavel
 *
 * Body: { jobId: string }
 *
 * Loads a previously-previewed ImportJob (type "saipos_nemo_compiled"),
 * generates Foocci_Master_Dataset_V2_IMPORTAVEL.xlsx — a workbook with
 * parser-compatible sheet names and column headers that CAN be uploaded
 * to preview-compiled for a second-pass review.
 *
 * Also returns real counts as JSON in the X-V2-Audit response header.
 *
 * Does NOT write any customer or product data to DB.
 * Does NOT execute the import.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { buildV2ImportableWorkbook } from "@/services/crm/MasterDatasetV2ImportableService";
import type { StoredReport } from "@/services/crm/SaiposNemoImportService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { jobId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { jobId } = body;
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "jobId é obrigatório" }, { status: 400 });
  }

  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    select: { id: true, restaurantId: true, reportJson: true, type: true },
  });

  if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  if (job.restaurantId !== ctx.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (job.type !== "saipos_nemo_compiled") {
    return NextResponse.json({ error: "Job não é do tipo saipos_nemo_compiled" }, { status: 400 });
  }
  if (!job.reportJson) {
    return NextResponse.json({ error: "Job sem dados de relatório. Execute o preview primeiro." }, { status: 400 });
  }

  try {
    const report = job.reportJson as unknown as StoredReport;

    const { buffer, audit } = buildV2ImportableWorkbook(
      report.merged            ?? [],
      report.noPhoneImportable ?? [],
      report.noPhone           ?? [],
      report.soldRows          ?? [],
      report.soldMeta          ?? { periodStart: null, periodEnd: null, reportTypes: null },
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Foocci_Master_Dataset_V2_IMPORTAVEL.xlsx"',
        "Cache-Control":       "no-store",
        "X-V2-Audit":          JSON.stringify({
          safeToUploadToPreviewCompiled: audit.safeToUploadToPreviewCompiled,
          customers:                     audit.customers,
          addresses:                     audit.addresses,
          products: {
            inputProductRows:         audit.products.inputProductRows,
            v2ProductRows:            audit.products.v2ProductRows,
            v2CategoryRows:           audit.products.v2CategoryRows,
            categorizedToV2:          audit.products.categorizedToV2,
            semClassCount:            audit.products.semClassCount,
            recategorizedFromDiversos: audit.products.recategorizedFromDiversos,
            lowConfidenceCount:       audit.products.lowConfidenceCount,
            totalQuantity:            audit.products.totalQuantity,
            totalRevenue:             audit.products.totalRevenue,
            topCategories:            audit.products.topCategories,
          },
        }),
      },
    });
  } catch (err) {
    console.error("[saipos-nemo/generate-v2-importavel]", err);
    return NextResponse.json({ error: "Falha ao gerar dataset V2 importável" }, { status: 500 });
  }
}
