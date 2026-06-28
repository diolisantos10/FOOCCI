/**
 * POST /api/admin/manual/release-to-agent
 * Admin-only. Makes every PUBLISHED chapter visible to the help assistant
 * (sets agentVisibility=true on all isPublished chapters that aren't yet).
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    if (!checkAdminRequest(req)) return unauthorized();

    const result = await prisma.operationalManualChapter.updateMany({
      where: { isPublished: true, agentVisibility: false },
      data: { agentVisibility: true },
    });

    return ok({ released: result.count });
  } catch (err) {
    console.error("[POST /api/admin/manual/release-to-agent]", err);
    return serverError();
  }
}
