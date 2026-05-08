import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { ok, created, badRequest, unauthorized, serverError } from "@/lib/api-response";

const VALID_OBJECTIVES = [
  "RECUPERAR", "RECOMPRA", "TICKET", "BEBIDA",
  "SOBREMESA", "AVALIACAO", "VIP", "ANIVERSARIO", "OUTRO",
] as const;

const VALID_SEGMENTS = [
  "TODOS", "QUENTE", "MORNO", "FRIO", "NOVOS", "RECORRENTES",
  "VIP", "PRIMEIRO_PEDIDO", "INATIVO_X_DIAS", "PRODUTO_ESPECIFICO",
  "SEM_BEBIDA", "SEM_SOBREMESA", "PERSONALIZADO",
] as const;

const VALID_CHANNELS = ["WHATSAPP", "MANUAL", "CRM_AGENT"] as const;

const createSchema = z.object({
  name:          z.string().min(1, "Nome é obrigatório").max(120),
  objective:     z.enum(VALID_OBJECTIVES, { errorMap: () => ({ message: "Objetivo inválido" }) }),
  targetSegment: z.enum(VALID_SEGMENTS,   { errorMap: () => ({ message: "Segmento inválido" }) }),
  channel:       z.enum(VALID_CHANNELS,   { errorMap: () => ({ message: "Canal inválido" }) }).default("WHATSAPP"),
  message:       z.string().min(1, "Mensagem é obrigatória").max(4000),
  notes:         z.string().max(2000).optional().nullable(),
});

export type CreateCustomActionInput = z.infer<typeof createSchema>;

export type CustomActionRow = {
  id:            string;
  name:          string;
  objective:     string;
  targetSegment: string;
  channel:       string;
  message:       string;
  notes:         string | null;
  status:        string;
  createdAt:     string;
};

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const rows = await prisma.cRMCustomAction.findMany({
      where:   { restaurantId: ctx.restaurantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, objective: true,
        targetSegment: true, channel: true,
        message: true, notes: true, status: true, createdAt: true,
      },
    });

    const data: CustomActionRow[] = rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }));

    return ok(data);
  } catch (err) {
    console.error("[GET /api/crm/custom-actions]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(
        "Dados inválidos",
        parsed.error.flatten().fieldErrors,
      );
    }

    const { name, objective, targetSegment, channel, message, notes } = parsed.data;

    const row = await prisma.cRMCustomAction.create({
      data: {
        restaurantId:  ctx.restaurantId,
        name,
        objective,
        targetSegment,
        channel,
        message,
        notes:         notes ?? null,
        status:        "DRAFT",
      },
      select: {
        id: true, name: true, objective: true,
        targetSegment: true, channel: true,
        message: true, notes: true, status: true, createdAt: true,
      },
    });

    const data: CustomActionRow = { ...row, createdAt: row.createdAt.toISOString() };
    return created(data);
  } catch (err) {
    console.error("[POST /api/crm/custom-actions]", err);
    return serverError();
  }
}
