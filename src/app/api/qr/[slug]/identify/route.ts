/**
 * POST /api/qr/[slug]/identify
 *
 * Public endpoint — no authentication required.
 * Looks up a customer by phone number within the restaurant's tenant.
 *
 * Body: { phone: string }
 *
 * Response:
 *   { found: true,  name: string }   — existing customer
 *   { found: false }                  — new / unknown customer
 *
 * Only the customer's first name is returned. No other PII is exposed.
 * The lookup itself does not create any record.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Produce a list of phone string candidates to match against E.164 stored values.
 * Handles the most common Brazilian input patterns.
 */
function phoneCandidates(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return [];

  const set = new Set<string>();

  // Already includes country code 55
  if (digits.length >= 12 && digits.startsWith("55")) {
    set.add(`+${digits}`);        // +5511999999999
    set.add(digits);              //  5511999999999
  }

  // 11 digits: DDD (2) + mobile with 9 (9) = 11
  if (digits.length === 11) {
    set.add(`+55${digits}`);      // +5511999999999
    set.add(digits);              //  11999999999
  }

  // 10 digits: DDD (2) + landline/old mobile (8) = 10
  if (digits.length === 10) {
    set.add(`+55${digits}`);
    // Also try with the 9th digit inserted after DDD
    set.add(`+55${digits.slice(0, 2)}9${digits.slice(2)}`);
  }

  // Always include raw digits as a last-resort fallback
  set.add(digits);

  return [...set];
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawPhone = String(body.phone ?? "").trim();

    const candidates = phoneCandidates(rawPhone);
    if (candidates.length === 0) {
      return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: params.slug },
      select: { id: true },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const customer = await prisma.customer.findFirst({
      where: {
        restaurantId: restaurant.id,
        phone: { in: candidates },
        isActive: true,
      },
      select: { name: true },
    });

    if (customer) {
      // Return only the first name — no PII overexposure
      const firstName = customer.name.trim().split(/\s+/)[0];
      return NextResponse.json({ found: true, name: firstName });
    }

    return NextResponse.json({ found: false });
  } catch (err) {
    console.error("[POST /api/qr/[slug]/identify]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
