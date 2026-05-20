/**
 * PATCH  /api/tracking-links/[id] — update tracking link
 * DELETE /api/tracking-links/[id] — delete tracking link
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";
import { generateUniqueShortCode } from "@/lib/shortCode";

const patchSchema = z.object({
  name:                 z.string().min(1).max(100).optional(),
  isActive:             z.boolean().optional(),
  campaign:             z.string().max(100).nullable().optional(),
  content:              z.string().max(100).nullable().optional(),
  term:                 z.string().max(100).nullable().optional(),
  regenerateShortCode:  z.boolean().optional(), // if true, generates a new shortCode
});

type Params = { params: Promise<{ id: string }> };

async function resolveLink(req: NextRequest, id: string) {
  const ctx = getTenantContext(req);
  if (!ctx) return { ctx: null, link: null };
  const link = await prisma.trackingLink.findUnique({ where: { id } });
  if (!link || link.restaurantId !== ctx.restaurantId) return { ctx, link: null };
  return { ctx, link };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { ctx, link } = await resolveLink(req, id);
    if (!ctx) return unauthorized();
    if (!link) return notFound();

    const raw    = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const { regenerateShortCode, ...fields } = parsed.data;

    const updateData: Record<string, unknown> = { ...fields };
    if (regenerateShortCode) {
      updateData.shortCode = await generateUniqueShortCode();
    }

    const updated = await prisma.trackingLink.update({
      where: { id },
      data:  updateData,
    });
    return ok(updated);
  } catch (err) {
    console.error("[PATCH /api/tracking-links/[id]]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { ctx, link } = await resolveLink(req, id);
    if (!ctx) return unauthorized();
    if (!link) return notFound();

    await prisma.trackingLink.delete({ where: { id } });
    return NextResponse.json({ success: true }, { status: 204 });
  } catch (err) {
    console.error("[DELETE /api/tracking-links/[id]]", err);
    return serverError();
  }
}
