/**
 * POST /api/internal/geocode-repair
 *
 * One-time repair for restaurants with distance-mode delivery, a stored address,
 * and NULL GPS coordinates. Geocodes each and saves the result.
 *
 * Query param: ?dryRun=true  — report what would be processed without writing
 * Auth: requires INTERNAL_API_KEY header matching env var INTERNAL_API_KEY
 *
 * Rate: processes one restaurant at a time with 1.1s delay between requests
 * to respect Nominatim's 1 req/s policy.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/geocoding";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-internal-api-key");
  const expectedKey = process.env.INTERNAL_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";

  // Find all restaurants with distance-mode delivery, address data, but no GPS coords
  const candidates = await prisma.restaurant.findMany({
    where: {
      deliveryConfig: { mode: "distance" },
      storeProfile: {
        latitude:  null,
        longitude: null,
        city:      { not: null },
      },
    },
    select: {
      id:   true,
      slug: true,
      storeProfile: {
        select: { cep: true, street: true, streetNumber: true, neighborhood: true, city: true, state: true },
      },
    },
  });

  const results: { slug: string; status: "ok" | "failed" | "no_address" | "dry_run" }[] = [];

  for (const r of candidates) {
    const sp = r.storeProfile;
    const hasAddress = !!(sp?.city && (sp?.cep || sp?.street));

    if (!hasAddress) {
      results.push({ slug: r.slug, status: "no_address" });
      continue;
    }

    if (dryRun) {
      results.push({ slug: r.slug, status: "dry_run" });
      continue;
    }

    console.info("[store-geocode] attempting", { restaurantId: r.id });
    const coords = await geocodeAddress({
      cep:          sp?.cep          ?? undefined,
      street:       sp?.street       ?? undefined,
      number:       sp?.streetNumber ?? undefined,
      neighborhood: sp?.neighborhood ?? undefined,
      city:         sp?.city         ?? undefined,
      state:        sp?.state        ?? undefined,
    });

    if (coords) {
      await prisma.storeProfile.update({
        where: { restaurantId: r.id },
        data:  { latitude: coords.lat, longitude: coords.lng },
      });
      console.info("[store-geocode] success", { restaurantId: r.id });
      results.push({ slug: r.slug, status: "ok" });
    } else {
      console.warn("[store-geocode] failed", { restaurantId: r.id });
      results.push({ slug: r.slug, status: "failed" });
    }

    // Respect Nominatim 1 req/s limit
    await sleep(1_100);
  }

  return NextResponse.json({
    dryRun,
    processed: candidates.length,
    results,
    ok:     results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "failed").length,
  });
}
