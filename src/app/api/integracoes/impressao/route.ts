/**
 * /api/integracoes/impressao — print station ↔ printer mapping (tenant-scoped).
 *
 * The panel (Integrações → Impressão) reads/writes which printer serves each
 * station (Caixa, Cozinha 1–5, Copa, Cupom…). The local print agent ("Carteiro")
 * later consumes this mapping to route each ticket to the right printer.
 *
 * Pure config I/O — no printing happens here (that runs on the restaurant's PC).
 * Default stations are lazily created on first read.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { getOrCreateAgent, isOnline } from "@/services/print/PrintAgentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_STATIONS = [
  { key: "CAIXA", name: "Caixa", position: 0 },
  { key: "COZINHA_1", name: "Cozinha 1", position: 1 },
  { key: "COZINHA_2", name: "Cozinha 2", position: 2 },
  { key: "COZINHA_3", name: "Cozinha 3", position: 3 },
  { key: "COZINHA_4", name: "Cozinha 4", position: 4 },
  { key: "COZINHA_5", name: "Cozinha 5", position: 5 },
  { key: "COPA", name: "Copa", position: 6 },
  { key: "CUPOM", name: "Cupom", position: 7 },
] as const;

interface StationView {
  id: string;
  key: string;
  name: string;
  printerName: string | null;
  enabled: boolean;
  position: number;
}

async function loadStations(restaurantId: string): Promise<StationView[]> {
  let rows = await prisma.printStation.findMany({
    where: { restaurantId },
    orderBy: { position: "asc" },
  });
  if (rows.length === 0) {
    await prisma.printStation.createMany({
      data: DEFAULT_STATIONS.map((s) => ({ ...s, restaurantId })),
      skipDuplicates: true,
    });
    rows = await prisma.printStation.findMany({
      where: { restaurantId },
      orderBy: { position: "asc" },
    });
  }
  return rows.map((s) => ({
    id: s.id,
    key: s.key,
    name: s.name,
    printerName: s.printerName,
    enabled: s.enabled,
    position: s.position,
  }));
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  try {
    const [stations, agent] = await Promise.all([
      loadStations(ctx.restaurantId),
      getOrCreateAgent(ctx.restaurantId),
    ]);
    return ok({
      stations,
      agent: {
        online: isOnline(agent),
        lastSeenAt: agent.lastSeenAt,
        printers: agent.reportedPrinters,
        pairingCode: agent.pairingCode,
        version: agent.agentVersion,
      },
    });
  } catch (err) {
    console.error("[GET integracoes/impressao]", err);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER")
    return forbidden("Apenas o proprietário ou gerente pode alterar a impressão.");

  try {
    const body = (await req.json().catch(() => ({}))) as { stations?: unknown };
    if (!Array.isArray(body.stations)) return badRequest("Lista de estações inválida.");

    const rows = body.stations as Array<{
      id?: unknown;
      name?: unknown;
      printerName?: unknown;
      enabled?: unknown;
    }>;

    const ops = rows.flatMap((s) => {
      if (typeof s.id !== "string" || !s.id) return [];
      const data: { name?: string; printerName?: string | null; enabled?: boolean } = {};
      if (typeof s.name === "string" && s.name.trim()) data.name = s.name.trim().slice(0, 80);
      if (typeof s.printerName === "string") {
        const p = s.printerName.trim();
        data.printerName = p ? p.slice(0, 200) : null;
      }
      if (typeof s.enabled === "boolean") data.enabled = s.enabled;
      if (Object.keys(data).length === 0) return [];
      // updateMany scoped by restaurantId → no cross-tenant writes.
      return [prisma.printStation.updateMany({ where: { id: s.id, restaurantId: ctx.restaurantId }, data })];
    });

    if (ops.length > 0) await prisma.$transaction(ops);

    return ok({ stations: await loadStations(ctx.restaurantId) });
  } catch (err) {
    console.error("[PUT integracoes/impressao]", err);
    return serverError();
  }
}
