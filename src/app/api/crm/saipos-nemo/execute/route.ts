/**
 * POST /api/crm/saipos-nemo/execute
 *
 * Body: { jobId: string }
 *
 * Reads the parsed/merged data stored in ImportJob.reportJson (by preview step),
 * executes the full import (customer upserts + product aggregates),
 * and returns a result summary.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  executeImport,
  type StoredReport,
} from "@/services/crm/SaiposNemoImportService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { jobId?: string };
  try {
    body = (await req.json()) as { jobId?: string };
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { jobId } = body;
  if (!jobId) return NextResponse.json({ error: "jobId obrigatório" }, { status: 400 });

  // Load the import job (scoped to this restaurant for tenant safety)
  const job = await prisma.importJob.findFirst({
    where: { id: jobId, restaurantId: ctx.restaurantId },
  });
  if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  if (job.status === "IMPORTING") {
    return NextResponse.json({ error: "Importação já em andamento" }, { status: 409 });
  }
  if (job.status === "COMPLETED") {
    return NextResponse.json({ error: "Este job já foi executado" }, { status: 409 });
  }

  // Mark as importing
  await prisma.importJob.update({
    where: { id: jobId },
    data:  { status: "IMPORTING" },
  });

  try {
    const report = job.reportJson as unknown as StoredReport;
    if (!report?.merged) {
      throw new Error("reportJson inválido no job");
    }

    const result = await executeImport(ctx.restaurantId, report);

    // Update job with results
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status:            "COMPLETED",
        completedAt:       new Date(),
        createdCustomers:  result.contactableCustomersCreated + result.nonContactableCustomersCreated,
        updatedCustomers:  result.contactableCustomersUpdated + result.nonContactableCustomersUpdated,
        skippedDuplicates: result.noPhoneSkippedInsufficientData,
        createdItems:      result.productAggregatesCreated,
      },
    });

    return NextResponse.json({ result });
  } catch (err) {
    console.error("[saipos-nemo/execute]", err);
    await prisma.importJob.update({
      where: { id: jobId },
      data:  { status: "FAILED" },
    }).catch(() => {});
    const message = err instanceof Error ? err.message : "Falha durante importação";
    return NextResponse.json(
      {
        error:              message,
        stage:              "execute",
        partialDataCreated: true,
        hint:               "Clientes podem ter sido criados parcialmente. Verifique os logs do servidor.",
      },
      { status: 500 },
    );
  }
}
