/**
 * GET /api/admin/diagnostics/cart-drafts
 *
 * Read-only diagnostic: shows recent OrderDrafts for all restaurants matching
 * a slug fragment, with per-draft customer phone validation.
 *
 * Designed to root-cause "why does a fresh test cart not become recoverable?"
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params:
 *   slug  — slug/name fragment (default: "sushi-cazza")
 *   limit — max drafts per restaurant (default: 10, max: 50)
 *
 * Safe:
 *   - Read-only. No mutations.
 *   - Phones masked to last-4 digits.
 *   - Never returns apiKey, webhookSecret, or DATABASE_URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import { isGuestIdentifier } from "@/lib/guest";

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "(none)";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-4)}`;
}

function isPhoneValid(phone: string | null | undefined): boolean {
  if (!phone) return false;
  if (isGuestIdentifier(phone)) return false;
  const digits = phone.replace(/\D/g, "");
  return /^\d{10,15}$/.test(digits);
}

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp         = req.nextUrl.searchParams;
  const slugFilter = (sp.get("slug") ?? "sushi-cazza").toLowerCase().trim();
  const limit      = Math.min(Number(sp.get("limit") ?? "10"), 50);

  try {
    // ── 1. Find restaurants matching slug ───────────────────────────────────────
    const restaurants = await prisma.restaurant.findMany({
      where: {
        OR: [
          { slug: { contains: slugFilter, mode: "insensitive" } },
          { name: { contains: slugFilter, mode: "insensitive" } },
        ],
      },
      select: { id: true, slug: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    // ── 2. Config de WhatsApp por restaurante ─────────────────────────────────
    // Canal único desde 04/08/2026: a Meta. Antes esta consulta lia
    // `evolutionConfig` — que hoje só guarda linhas mortas e faria o diagnóstico
    // dizer "tem WhatsApp" para quem não tem mais.
    const waConfigs = await prisma.metaWhatsAppConfig.findMany({
      where:  { restaurantId: { in: restaurants.map((r) => r.id) } },
      select: { restaurantId: true, phoneNumberId: true, connectionStatus: true },
    });
    // ── 3. Fetch recent drafts per restaurant ──────────────────────────────────
    const draftsPerRestaurant = await Promise.all(
      restaurants.map(async (r) => {
        const wa    = waConfigs.find((e) => e.restaurantId === r.id);
        const drafts = await prisma.orderDraft.findMany({
          where:   { restaurantId: r.id },
          orderBy: { updatedAt: "desc" },
          take:    limit,
          select: {
            id:               true,
            restaurantId:     true,
            customerId:       true,
            status:           true,
            updatedAt:        true,
            recoveryAttempts: true,
            lastRecoveryAt:   true,
            _count:           { select: { items: true } },
            customer: {
              select: {
                id:    true,
                phone: true,
                name:  true,
              },
            },
          },
        });

        return {
          restaurantId:       r.id,
          slug:               r.slug,
          name:               r.name,
          hasWhatsAppConfig:  !!wa,
          // "CONNECTED" é a ÚNICA prova de conexão — qualquer outro estado (ou
          // ausência) NÃO pode ser lido como conectado (guardrail 1).
          whatsappConnected:  wa ? wa.connectionStatus === "CONNECTED" : null,
          phoneNumberId:      wa?.phoneNumberId ?? null,
          drafts: drafts.map((d) => ({
            draftId:          d.id,
            restaurantId:     d.restaurantId,
            customerId:       d.customerId,
            customerName:     d.customer?.name ?? null,
            customerPhoneMasked: maskPhone(d.customer?.phone),
            phoneExists:      !!d.customer?.phone,
            phoneIsGuest:     d.customer?.phone ? isGuestIdentifier(d.customer.phone) : false,
            phoneValid:       isPhoneValid(d.customer?.phone),
            status:           d.status,
            itemCount:        d._count.items,
            updatedAt:        d.updatedAt.toISOString(),
            recoveryAttempts: d.recoveryAttempts,
            lastRecoveryAt:   d.lastRecoveryAt?.toISOString() ?? null,
            recoveryEligible: (
              d.status === "OPEN" &&
              d._count.items > 0 &&
              d.recoveryAttempts === 0 &&
              isPhoneValid(d.customer?.phone)
            ),
            skipReason: (() => {
              if (d.status !== "OPEN")          return "status_not_open";
              if (d._count.items === 0)          return "no_items";
              if (d.recoveryAttempts > 0)        return "already_attempted";
              if (!d.customer?.phone)            return "no_phone";
              if (isGuestIdentifier(d.customer.phone)) return "guest_phone";
              if (!isPhoneValid(d.customer?.phone))    return "invalid_phone";
              if (!wa)                                  return "no_whatsapp_config";
              return null;
            })(),
          })),
        };
      }),
    );

    // ── 4. Root-cause summary ────────────────────────────────────────────────────
    const canonicalRestaurant   = draftsPerRestaurant.find((r) => r.hasWhatsAppConfig);
    const legacyRestaurants     = draftsPerRestaurant.filter((r) => !r.hasWhatsAppConfig);
    const slugOwner             = draftsPerRestaurant.find((r) => r.slug === slugFilter);

    const rootCause = (() => {
      if (!slugOwner) {
        return `No restaurant with slug "${slugFilter}" found.`;
      }
      if (slugOwner.hasWhatsAppConfig) {
        return `Slug "${slugFilter}" correctly points to the WhatsApp-configured restaurant. ` +
               `Check individual draft skipReason fields.`;
      }
      if (canonicalRestaurant) {
        return (
          `Slug "${slugFilter}" points to legacy restaurant (${slugOwner.restaurantId}, sem config de WhatsApp). ` +
          `The canonical restaurant (${canonicalRestaurant.restaurantId}) has slug "${canonicalRestaurant.slug}". ` +
          `Customer records created via WhatsApp webhook exist on the canonical restaurant. ` +
          `When /pedido/${slugFilter} is loaded, customer lookup uses restaurantId="${slugOwner.restaurantId}" ` +
          `so the customer is not found → draft API returns no_customer → NO draft is created. ` +
          `Fix: swap slugs so "${slugFilter}" points to ${canonicalRestaurant.restaurantId}.`
        );
      }
      return "Nenhum restaurante com config de WhatsApp no conjunto encontrado.";
    })();

    // suppress unused variable warning
    void legacyRestaurants;

    return NextResponse.json({
      ok:         true,
      queriedAt:  new Date().toISOString(),
      slugFilter,
      restaurants: draftsPerRestaurant,
      rootCause,
    });
  } catch (err) {
    console.error("[GET /api/admin/diagnostics/cart-drafts]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
