import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { ImportService } from "@/services/crm/ImportService";

const bodySchema = z.object({
  rows: z.array(z.record(z.string())).min(1).max(50_000),
  mapping: z.object({
    phone: z.string().min(1),
    name: z.string().optional(),
    email: z.string().optional(),
    birthday: z.string().optional(),
  }),
  dryRun: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { rows, mapping, dryRun } = parsed.data;

  const result = await ImportService.process(
    ctx.restaurantId,
    rows,
    mapping,
    dryRun
  );

  return NextResponse.json({ data: result });
}
