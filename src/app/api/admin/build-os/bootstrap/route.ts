/**
 * POST /api/admin/build-os/bootstrap — initialize/repair Build OS from the admin UI.
 *
 * Runs INSIDE the app/Railway environment, where DATABASE_URL already exists —
 * the operator never provides or sees it. Internal only (ADMIN_SECRET), same
 * guard as the other admin routes. Idempotent + additive (never deletes). No
 * Claude/GitHub/LLM relay, no execution.
 *
 * Body: { phone: string; name?: string; role?: string; dryRun?: boolean }
 *   dryRun=true  → plan only, NO writes.
 *   dryRun=false → applies (enable config, ensure Foocci, upsert operator).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { auditLog } from "@/lib/audit";
import {
  prepareBootstrapPlan,
  runBootstrap,
} from "@/services/buildos/BuildOSBootstrapService";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Admin access not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const bodySchema = z.object({
  phone: z.string().min(6).max(40),
  name: z.string().max(120).optional(),
  role: z.string().max(40).optional(),
  dryRun: z.boolean().optional(),
});

/** Mask a phone for audit logs (keeps country + last 4). */
function maskPhone(phone: string): string {
  if (phone.length <= 6) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
}

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { phone, name, role, dryRun } = parsed.data;

  // Validate/normalize up front so bad input fails clearly (also for dry-run).
  let plan;
  try {
    plan = prepareBootstrapPlan({ phone, name, role, dryRun });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Telefone inválido." },
      { status: 400 },
    );
  }

  try {
    const result = await runBootstrap({ phone, name, role, dryRun });

    // Audit only real applies (dry-run writes nothing). Phone is masked.
    if (!result.dryRun) {
      auditLog({
        action: "buildos.bootstrap",
        meta: {
          phone: maskPhone(plan.normalizedPhone),
          name: plan.name,
          role: plan.role,
          configEnabled: result.configEnabled ?? null,
          senderAction: result.senderAction ?? null,
          projectsCreated: result.projectSeed?.created ?? null,
          projectsUpdated: result.projectSeed?.updated ?? null,
        },
      });
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    // Most likely cause in a non-app environment: no database connection.
    const msg = err instanceof Error ? err.message : "Falha ao executar o bootstrap.";
    return NextResponse.json(
      { error: "Falha ao aplicar o bootstrap (o banco está disponível neste ambiente?).", detail: msg.slice(0, 160) },
      { status: 500 },
    );
  }
}
