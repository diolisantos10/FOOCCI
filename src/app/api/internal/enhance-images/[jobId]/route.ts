/**
 * GET  /api/internal/enhance-images/[jobId]   — job detail
 * PATCH /api/internal/enhance-images/[jobId]  — approve | reject | rollback | regenerate
 *
 * Auth: tenant JWT (OWNER/MANAGER) + admin secret for rollback/regenerate.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, badRequest, notFound, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  approveEnhancement,
  rejectEnhancement,
  rollbackEnhancement,
} from "@/services/imageEnhancement/ImageEnhancementService";
import { runEnhancementJob } from "@/services/imageEnhancement/ImageEnhancementService";

const patchSchema = z.object({
  action:      z.enum(["approve", "reject", "rollback", "regenerate"]),
  processMode: z.enum(["enhance", "upscale", "enhance+upscale"]).optional(),
});

export async function GET(req: NextRequest, { params }: { params: { jobId: string } }) {
  const ctx     = getTenantContext(req);
  const isAdmin = checkAdminRequest(req);
  if (!ctx && !isAdmin) return unauthorized();

  const job = await prisma.menuItemImageEnhancement.findUnique({
    where:   { id: params.jobId },
    include: {
      menuItem: {
        select: {
          id:       true,
          name:     true,
          imageUrl: true,
          category: { select: { name: true } },
        },
      },
    },
  });

  if (!job) return notFound();
  if (ctx && !isAdmin && ctx.restaurantId !== job.restaurantId) return unauthorized();

  return ok(job);
}

export async function PATCH(req: NextRequest, { params }: { params: { jobId: string } }) {
  const ctx     = getTenantContext(req);
  const isAdmin = checkAdminRequest(req);
  if (!ctx && !isAdmin) return unauthorized();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON"); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join("; "));

  // Fetch job to get restaurantId
  const job = await prisma.menuItemImageEnhancement.findUnique({
    where: { id: params.jobId },
  });
  if (!job) return notFound();
  if (ctx && !isAdmin && ctx.restaurantId !== job.restaurantId) return unauthorized();

  const { action, processMode = "enhance+upscale" } = parsed.data;

  try {
    if (action === "approve") {
      const res = await approveEnhancement(params.jobId, job.restaurantId);
      return res.ok ? ok(res) : badRequest(res.error);
    }

    if (action === "reject") {
      const res = await rejectEnhancement(params.jobId, job.restaurantId);
      return res.ok ? ok({ message: "Rejected" }) : badRequest(res.error);
    }

    if (action === "rollback") {
      if (!isAdmin && ctx?.role !== "OWNER") return unauthorized();
      const res = await rollbackEnhancement(params.jobId, job.restaurantId);
      return res.ok ? ok({ message: "Rolled back to original" }) : badRequest(res.error);
    }

    if (action === "regenerate") {
      const stats = await runEnhancementJob({
        restaurantId:   job.restaurantId,
        productIds:     [job.menuItemId],
        dryRun:         false,
        processMode,
        forceReprocess: true,   // user explicitly requested regeneration
      });
      return ok({ stats });
    }

    return badRequest("Unknown action");
  } catch (err) {
    console.error("[PATCH /api/internal/enhance-images/[jobId]]", err);
    return serverError();
  }
}
