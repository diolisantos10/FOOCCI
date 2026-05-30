/**
 * POST /api/admin/ai/waiter-tests/run
 *
 * Runs the deterministic Waiter test suite against a restaurant's live catalog.
 * No OpenAI calls. No DB writes. No WhatsApp messages. Pure evaluation.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Body:
 *   restaurantId  — required; the restaurant to test against
 *   groups?       — optional string[]; if omitted, all groups run
 *
 * Response:
 *   { ok: true,  report: EvalReport }
 *   { ok: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { WAITER_TEST_CASES } from "@/services/ai/waiter/testing/waiterScenarios";
import { evaluateAll } from "@/services/ai/waiter/testing/waiterEvaluator";
import type { V2CatalogItem } from "@/services/ai/WaiterBrainV2";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let restaurantId: string;
  let groups: string[] | undefined;

  try {
    const body = await req.json() as { restaurantId?: unknown; groups?: unknown };
    if (typeof body.restaurantId !== "string" || !body.restaurantId.trim()) {
      return NextResponse.json({ ok: false, error: "restaurantId is required" }, { status: 400 });
    }
    restaurantId = body.restaurantId.trim();
    if (Array.isArray(body.groups) && body.groups.every((g) => typeof g === "string")) {
      groups = body.groups as string[];
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Resolve restaurant
  const restaurant = await prisma.restaurant.findUnique({
    where:  { id: restaurantId },
    select: { id: true, name: true },
  });
  if (!restaurant) {
    return NextResponse.json({ ok: false, error: `Restaurant not found: ${restaurantId}` }, { status: 404 });
  }

  // Fetch live catalog (same query as /api/pedido/[slug]/route.ts)
  const catalogRows = await prisma.menuItem.findMany({
    where: {
      isActive:       true,
      isAvailable:    true,
      showInDelivery: true,
      category:       { restaurantId },
    },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, name: true, price: true, description: true, sortOrder: true,
      servingSize: true, portionInfo: true,
      tagFunil: true, perfilPaladar: true, harmonizacaoSugerida: true,
      alergenosDetalhados: true, storytellingIA: true,
      category: { select: { name: true } },
    },
  });

  if (catalogRows.length === 0) {
    return NextResponse.json({ ok: false, error: "Restaurant has no active menu items" }, { status: 422 });
  }

  const catalog: V2CatalogItem[] = catalogRows.map((i) => ({
    id:                   i.id,
    name:                 i.name,
    categoryName:         (i.category as { name: string } | null)?.name ?? "",
    price:                Number(i.price),
    sortOrder:            i.sortOrder ?? undefined,
    description:          i.description ?? null,
    servingSize:          (i.servingSize as number | null) ?? null,
    portionInfo:          (i.portionInfo as string | null) ?? null,
    tagFunil:             i.tagFunil ?? null,
    perfilPaladar:        i.perfilPaladar ?? null,
    harmonizacaoSugerida: i.harmonizacaoSugerida ?? null,
    alergenosDetalhados:  i.alergenosDetalhados ?? null,
    storytellingIA:       i.storytellingIA ?? null,
  }));

  // Filter to requested groups
  const cases = groups && groups.length > 0
    ? WAITER_TEST_CASES.filter((tc) => groups!.includes(tc.group))
    : WAITER_TEST_CASES;

  if (cases.length === 0) {
    return NextResponse.json({ ok: false, error: "No test cases matched the requested groups" }, { status: 400 });
  }

  const startedAt = new Date();
  const report    = evaluateAll(cases, catalog, restaurant.id, restaurant.name, startedAt);

  return NextResponse.json({ ok: true, report });
}
