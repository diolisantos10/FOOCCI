/**
 * PATCH /api/admin/restaurants/[id] — toggle isActive or update plan
 *
 * Protected by x-admin-secret header (must match ADMIN_SECRET env var).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";

function checkAdminSecret(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: "This endpoint is disabled. Set ADMIN_SECRET to enable it." },
      { status: 403 }
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const patchSchema = z.object({
  name:     z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  plan:     z.enum(["STARTER", "GROWTH", "PRO"]).optional(),
  // AI Waiter override: true = grant regardless of plan (grandfather/courtesy),
  // false = revoke regardless of plan, null = follow the plan. Without this field
  // the override column is unmanageable — flipping it would need direct SQL.
  aiWaiterEnabled: z.boolean().nullable().optional(),
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
      ...(parsed.data.name     !== undefined && { name:     parsed.data.name }),
      ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      ...(parsed.data.plan     !== undefined && { plan:     parsed.data.plan }),
      ...(parsed.data.aiWaiterEnabled !== undefined && { aiWaiterEnabled: parsed.data.aiWaiterEnabled }),
    },
    select: {
      id: true, name: true, isActive: true, plan: true, aiWaiterEnabled: true, updatedAt: true,
    },
  });

  return NextResponse.json({ restaurant: updated });
}
