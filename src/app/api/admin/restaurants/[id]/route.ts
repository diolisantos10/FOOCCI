/**
 * PATCH /api/admin/restaurants/[id] — toggle isActive or update plan
 *
 * Protected by x-admin-secret header (must match ADMIN_SECRET env var).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

function checkAdminSecret(req: NextRequest): NextResponse | null {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "This endpoint is disabled. Set ADMIN_SECRET to enable it." },
      { status: 403 }
    );
  }
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (provided !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  plan: z.enum(["STARTER", "GROWTH", "PRO"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAdminSecret(req);
  if (authError) return authError;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const exists = await prisma.restaurant.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!exists) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const updated = await prisma.restaurant.update({
    where: { id },
    data: {
      ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      ...(parsed.data.plan !== undefined && { plan: parsed.data.plan }),
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      plan: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ restaurant: updated });
}
