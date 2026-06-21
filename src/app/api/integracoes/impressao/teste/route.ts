/**
 * POST /api/integracoes/impressao/teste — enqueue a TEST print job for a station.
 *
 * Tenant-scoped (panel/session). Proves the full path cloud → Carteiro → printer:
 * we create a PENDING PrintJob for the station's assigned printer; the agent picks
 * it up on its next poll and prints it. No printing happens here.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function testTicket(stationName: string, printerName: string): string {
  const now = new Date().toLocaleString("pt-BR");
  return [
    "================================",
    "       COMANDA DE TESTE",
    "            F O O C C I",
    "================================",
    `Estacao:    ${stationName}`,
    `Impressora: ${printerName}`,
    "--------------------------------",
    "  2x  Yakisoba de Frango",
    "  1x  Coca-Cola Lata",
    "--------------------------------",
    now,
    "================================",
    "  Saiu pelo FOOCCI -> Carteiro.",
    "  O cano esta FUNCIONANDO! :)",
    "================================",
    "",
    "",
    "",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  try {
    const body = (await req.json().catch(() => ({}))) as { stationId?: unknown };
    const stationId = typeof body.stationId === "string" ? body.stationId : "";
    if (!stationId) return badRequest("Estação não informada.");

    const station = await prisma.printStation.findFirst({
      where: { id: stationId, restaurantId: ctx.restaurantId },
    });
    if (!station) return badRequest("Estação não encontrada.");
    if (!station.printerName || !station.printerName.trim())
      return badRequest("Esta estação ainda não tem uma impressora definida.");

    await prisma.printJob.create({
      data: {
        restaurantId: ctx.restaurantId,
        stationKey: station.key,
        printerName: station.printerName.trim(),
        title: `TESTE — ${station.name}`,
        body: testTicket(station.name, station.printerName.trim()),
      },
    });

    return ok({ queued: true });
  } catch (err) {
    console.error("[POST integracoes/impressao/teste]", err);
    return serverError();
  }
}
