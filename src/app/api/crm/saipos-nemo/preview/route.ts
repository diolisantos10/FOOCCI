/**
 * POST /api/crm/saipos-nemo/preview
 *
 * Accepts up to 3 files (multipart/form-data):
 *   - saiposFile   — BASE CLIENTES SAIPOS.xlsx
 *   - nemoFile     — RelatórioClientesDetalhado NEMO.xlsx
 *   - soldFile     — ItensVendidos SAIPOS.xlsx (optional)
 *
 * Returns a preview report + jobId.
 * Does NOT write any customer or product data to DB.
 * The parsed/merged data is stored in ImportJob.reportJson for the execute step.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  parseSaiposFile,
  parseNemoFile,
  parseSoldItemsFile,
  matchAndMerge,
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

  const saiposFile = formData.get("saiposFile");
  const nemoFile   = formData.get("nemoFile");
  const soldFile   = formData.get("soldFile");

  if (!saiposFile || typeof saiposFile === "string") {
    return NextResponse.json({ error: "Arquivo de clientes Saipos não enviado" }, { status: 400 });
  }
  if (!nemoFile || typeof nemoFile === "string") {
    return NextResponse.json({ error: "Arquivo de clientes Nemo não enviado" }, { status: 400 });
  }

  try {
    const saiposBuf = Buffer.from(await (saiposFile as File).arrayBuffer());
    const nemoBuf   = Buffer.from(await (nemoFile as File).arrayBuffer());
    const soldBuf   = soldFile && typeof soldFile !== "string"
      ? Buffer.from(await (soldFile as File).arrayBuffer())
      : null;

    const saiposRows = parseSaiposFile(saiposBuf);
    const nemoRows   = parseNemoFile(nemoBuf);
    const soldResult = soldBuf
      ? parseSoldItemsFile(soldBuf)
      : { meta: { periodStart: null, periodEnd: null, reportTypes: null }, rows: [], categoryCount: 0, productCount: 0, totalQuantity: 0, totalRevenue: 0 };

    const matchResult = matchAndMerge(saiposRows, nemoRows);
    const preview     = buildPreview(matchResult, soldResult);

    // Store parsed data in ImportJob so execute can run without re-parsing files
    const storedReport: StoredReport = {
      merged:   matchResult.merged,
      noPhone:  matchResult.noPhone,
      soldRows: soldResult.rows,
      soldMeta: soldResult.meta,
      preview,
    };

    const job = await prisma.importJob.create({
      data: {
        restaurantId: ctx.restaurantId,
        type:         "saipos_nemo",
        filename:     [
          (saiposFile as File).name,
          (nemoFile as File).name,
          soldFile && typeof soldFile !== "string" ? (soldFile as File).name : "",
        ].filter(Boolean).join(", "),
        status:       "VALIDATING",
        totalRows:    matchResult.merged.length + matchResult.noPhone.length,
        validRows:    matchResult.merged.length,
        errorRows:    matchResult.noPhone.length,
        reportJson:   JSON.parse(JSON.stringify(storedReport)),
      },
    });

    return NextResponse.json({ jobId: job.id, preview });
  } catch (err) {
    console.error("[saipos-nemo/preview]", err);
    return NextResponse.json({ error: "Falha ao processar arquivos" }, { status: 500 });
  }
}
