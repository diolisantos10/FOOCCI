/**
 * /api/menu/items/[id]/placements
 *
 * POST  — link item to an additional category via MenuItemPlacement
 * DELETE — remove a placement (item stays in its original category)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized } from "@/lib/api-response";

const categoryIdSchema = z.object({ categoryId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const { id: itemId } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = categoryIdSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const { categoryId } = parsed.data;

  const [item, category] = await Promise.all([
    prisma.menuItem.findFirst({
      where: { id: itemId, category: { restaurantId: ctx.restaurantId } },
      select: { id: true },
    }),
    prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId: ctx.restaurantId },
      select: { id: true },
    }),
  ]);

  if (!item || !category) {
    return NextResponse.json({ error: "Item ou categoria não encontrado" }, { status: 404 });
  }

  const placement = await prisma.menuItemPlacement.upsert({
    where: { itemId_categoryId: { itemId, categoryId } },
    create: { itemId, categoryId },
    update: {},
    select: { id: true, itemId: true, categoryId: true },
  });

  return NextResponse.json({ data: placement }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const { id: itemId } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = categoryIdSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const { categoryId } = parsed.data;

  const placement = await prisma.menuItemPlacement.findFirst({
    where: {
      itemId,
      categoryId,
      item: { category: { restaurantId: ctx.restaurantId } },
    },
    select: { id: true },
  });

  if (!placement) {
    return NextResponse.json({ error: "Placement não encontrado" }, { status: 404 });
  }

  await prisma.menuItemPlacement.delete({ where: { id: placement.id } });
  return NextResponse.json({ success: true });
}
