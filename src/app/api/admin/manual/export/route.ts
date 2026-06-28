/**
 * GET /api/admin/manual/export
 * Admin-only. Dumps EVERY manual chapter currently in the database (including
 * ones typed directly in the admin) so their content can be audited and pulled
 * back into code. Returns slug, title, area, flags, version and full content.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    if (!checkAdminRequest(req)) return unauthorized();

    const chapters = await prisma.operationalManualChapter.findMany({
      orderBy: [{ area: "asc" }, { slug: "asc" }],
      select: {
        slug: true,
        title: true,
        area: true,
        status: true,
        isPublished: true,
        agentVisibility: true,
        version: true,
        content: true,
        updatedAt: true,
      },
    });

    return ok({
      count: chapters.length,
      published: chapters.filter((c) => c.isPublished).length,
      agentVisible: chapters.filter((c) => c.agentVisibility).length,
      chapters,
    });
  } catch (err) {
    console.error("[GET /api/admin/manual/export]", err);
    return serverError();
  }
}
