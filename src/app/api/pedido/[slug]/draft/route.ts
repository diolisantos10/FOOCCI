/**
 * POST /api/pedido/[slug]/draft
 *
 * Persists an identified customer's /pedido cart into OrderDraft so Foocci can
 * later detect abandoned carts and (in Phase 3) send recovery messages.
 *
 * Rules:
 *   - Only creates/updates a draft when the customer is identifiable (customerId or phone).
 *   - Anonymous visitors are silently ignored — no draft, no error.
 *   - menuItemIds are validated against the restaurant (cross-tenant safety).
 *   - Items that don't belong to this restaurant are silently dropped.
 *   - If the customer already has an OPEN draft, it is updated (items replaced).
 *   - Never creates a real Order or Payment.
 *   - Never sends WhatsApp or CRM messages.
 *
 * Phase 2 (future): a cron job marks stale OPEN drafts as ABANDONED.
 * Phase 3 (future): an automation sends a recovery message to eligible customers.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { phoneCandidates } from "@/lib/phone";

// ── Schemas ───────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity:   z.number().int().positive().max(99),
  unitPrice:  z.number().nonnegative(),
  notes:      z.string().max(500).optional(),
});

const bodySchema = z.object({
  customerId:      z.string().optional(),
  phone:           z.string().optional(),
  items:           z.array(itemSchema).max(50),
  subtotal:        z.number().nonnegative(),
  deliveryFee:     z.number().nonnegative().default(0),
  fulfillmentType: z.enum(["DELIVERY", "PICKUP"]).default("DELIVERY"),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where:  { slug },
    select: { id: true },
  });
  if (!restaurant) {
    return NextResponse.json({ ok: false, reason: "restaurant_not_found" }, { status: 404 });
  }
  const restaurantId = restaurant.id;

  const raw    = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "invalid_payload" }, { status: 400 });
  }

  const { customerId: clientCustomerId, phone, items, subtotal, deliveryFee, fulfillmentType } = parsed.data;

  // Empty cart — nothing to save
  if (items.length === 0) {
    return NextResponse.json({ ok: false, reason: "empty_cart" });
  }

  // ── Resolve customer ──────────────────────────────────────────────────────
  let customerId: string | null = null;

  if (clientCustomerId) {
    // Validate the customer belongs to this restaurant (cross-tenant guard)
    const customer = await prisma.customer.findFirst({
      where:  { id: clientCustomerId, restaurantId },
      select: { id: true },
    });
    if (customer) customerId = customer.id;
  }

  if (!customerId && phone) {
    // Match against all plausible normalized variants (E.164, raw, ±9th digit)
    // so a WhatsApp-origin phone attaches to the existing rich customer record
    // instead of failing and dropping the draft (the skippedNoPhone root cause).
    const candidates = phoneCandidates(phone);
    if (candidates.length > 0) {
      const customer = await prisma.customer.findFirst({
        where:  { restaurantId, phone: { in: candidates } },
        select: { id: true },
      });
      if (customer) customerId = customer.id;
    }
    // Fallback: loose substring match for any legacy format the variants miss.
    if (!customerId) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length >= 8) {
        const customer = await prisma.customer.findFirst({
          where:  { restaurantId, phone: { contains: digits } },
          select: { id: true },
        });
        if (customer) customerId = customer.id;
      }
    }
  }

  if (!customerId) {
    // Anonymous visitor — skip silently, never create a draft
    return NextResponse.json({ ok: false, reason: "no_customer" });
  }

  // ── Validate items belong to this restaurant ──────────────────────────────
  const menuItemIds = [...new Set(items.map((i) => i.menuItemId))];
  const validMenuItems = await prisma.menuItem.findMany({
    where:  { id: { in: menuItemIds }, category: { restaurantId } },
    select: { id: true },
  });
  const validIds = new Set(validMenuItems.map((m) => m.id));
  const validItems = items.filter((i) => validIds.has(i.menuItemId));

  if (validItems.length === 0) {
    return NextResponse.json({ ok: false, reason: "no_valid_items" });
  }

  const totalAmount = subtotal + deliveryFee;

  // ── Upsert: find existing OPEN draft or create a new one ─────────────────
  const existing = await prisma.orderDraft.findFirst({
    where:   { restaurantId, customerId, status: "OPEN" },
    orderBy: { updatedAt: "desc" },
    select:  { id: true },
  });

  let draftId: string;

  if (existing) {
    // Replace items atomically and update totals
    await prisma.$transaction([
      prisma.orderDraftItem.deleteMany({ where: { orderDraftId: existing.id } }),
      prisma.orderDraftItem.createMany({
        data: validItems.map((i) => ({
          orderDraftId: existing.id,
          menuItemId:   i.menuItemId,
          quantity:     i.quantity,
          unitPrice:    new Decimal(i.unitPrice),
          notes:        i.notes ?? null,
        })),
      }),
      prisma.orderDraft.update({
        where: { id: existing.id },
        data: {
          subtotal:        new Decimal(subtotal),
          deliveryFee:     new Decimal(deliveryFee),
          totalAmount:     new Decimal(totalAmount),
          fulfillmentType: fulfillmentType,
        },
      }),
    ]);
    draftId = existing.id;
  } else {
    const draft = await prisma.orderDraft.create({
      data: {
        restaurantId,
        customerId,
        status:          "OPEN",
        fulfillmentType: fulfillmentType,
        subtotal:        new Decimal(subtotal),
        deliveryFee:     new Decimal(deliveryFee),
        totalAmount:     new Decimal(totalAmount),
        items: {
          create: validItems.map((i) => ({
            menuItemId: i.menuItemId,
            quantity:   i.quantity,
            unitPrice:  new Decimal(i.unitPrice),
            notes:      i.notes ?? null,
          })),
        },
      },
      select: { id: true },
    });
    draftId = draft.id;
  }

  return NextResponse.json({ ok: true, draftId, status: "OPEN" });
}
