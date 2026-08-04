/**
 * POST /api/qr/[slug]/identify
 *
 * Public endpoint — no authentication required.
 * Looks up a customer by phone. If name is provided and the customer
 * is new, creates them in the CRM so the data flows automatically.
 *
 * Body: { phone: string; name?: string }
 *
 * Response:
 *   { found: true,  name: string }   — existing customer (greeting only)
 *   { found: false, name: string }   — new customer created
 *   { found: false }                 — unknown (no name provided)
 *
 * SECURITY (CR C1): like /pedido/[slug]/identify-customer, this must NOT return the
 * customerId or any history from just a phone + slug. The customerId is no longer a
 * bearer credential for PII (profile/address now require a signed proof of phone
 * possession). The visit is still logged server-side using the resolved id.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { phoneCandidates, toE164, customerFirstName, CUSTOMER_LOOKUP_ORDER } from "@/lib/phone";

const VISIT_SOURCES = new Set([
  "instagram", "whatsapp", "google", "qrcode", "crm", "manual", "direct", "other",
]);

/**
 * Log one identified visit (MenuEvent). This is the canonical "visita" signal:
 * it fires exactly when someone passes the mandatory phone screen (manual submit
 * or auto-identify for a returning customer). Server-side, so it can't be blocked
 * by ad-blockers and never misses like the old client beacon. One row per entry,
 * so a customer who enters 10× counts as 10 visits — matching the KPI spec.
 * Fire-and-forget: never blocks or fails the identify response.
 */
function logVisit(restaurantId: string, customerId: string, rawSource?: unknown): void {
  const source = typeof rawSource === "string" && VISIT_SOURCES.has(rawSource) ? rawSource : "direct";
  void prisma.menuEvent
    .create({ data: { restaurantId, source, customerId } })
    .catch(() => { /* best-effort analytics — never throw */ });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `qr-identify:${ip}`, limit: 20, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter) as NextResponse;

  try {
    const body = await req.json().catch(() => ({}));
    const rawPhone = String(body.phone ?? "").trim();
    const rawName  = String(body.name  ?? "").trim();

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

    // Try to find existing customer
    const existing = await prisma.customer.findFirst({
      where: {
        restaurantId: restaurant.id,
        phone: { in: candidates },
        isActive: true,
      },
      orderBy: CUSTOMER_LOOKUP_ORDER, // duplicata sem histórico nunca vence o cadastro rico
      select: { id: true, name: true },
    });

    if (existing) {
      logVisit(restaurant.id, existing.id, body.source);
      let firstName = customerFirstName(existing.name);
      // Cadastro com nome-fantasma (vazio ou igual ao telefone) e o cliente
      // informou o nome real agora → corrige o cadastro em vez de ignorar.
      if (!firstName && rawName.length >= 2) {
        await prisma.customer
          .update({ where: { id: existing.id }, data: { name: rawName } })
          .catch(() => { /* best-effort — a identificação não pode falhar por isso */ });
        firstName = rawName.split(/\s+/)[0]!;
      }
      // Sem nome legível → found sem name; o front pede o nome e reenvia.
      // Greeting only — NO customerId (see the security note above).
      return NextResponse.json({ found: true, name: firstName ?? undefined });
    }

    // New customer — create in CRM if name was provided
    if (rawName.length >= 2) {
      const e164 = toE164(rawPhone);
      const created = await prisma.customer.create({
        data: {
          restaurantId: restaurant.id,
          name: rawName,
          phone: e164,
          isActive: true,
        },
        select: { id: true },
      }).catch(() => null);

      if (created?.id) logVisit(restaurant.id, created.id, body.source);
      const firstName = rawName.trim().split(/\s+/)[0]!;
      return NextResponse.json({
        found: false,
        name: firstName,
      });
    }

    return NextResponse.json({ found: false });
  } catch (err) {
    console.error("[POST /api/qr/[slug]/identify]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
