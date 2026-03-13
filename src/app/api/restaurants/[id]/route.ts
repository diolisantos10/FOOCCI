/**
 * GET    /api/restaurants/[id]  – fetch restaurant details
 * PATCH  /api/restaurants/[id]  – update restaurant settings
 *
 * Protected: requires auth. Only the owning tenant can access.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { updateRestaurantSchema } from "@/validators/restaurant";
import { RestaurantService } from "@/services/restaurant/RestaurantService";
import {
  ok,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
} from "@/lib/api-response";

type RouteParams = { params: { id: string } };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    // Users can only read their own restaurant
    if (ctx.restaurantId !== params.id) return forbidden();

    const result = await RestaurantService.getById(params.id);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/restaurants/[id]]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (ctx.restaurantId !== params.id) return forbidden();

    // Only owners and managers can update restaurant settings
    if (!["OWNER", "MANAGER"].includes(ctx.role)) {
      return forbidden("Insufficient permissions");
    }

    const body = await req.json();
    const parsed = updateRestaurantSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest("Validation failed", parsed.error.flatten());
    }

    const result = await RestaurantService.update(params.id, parsed.data);
    if (!result.ok) {
      return notFound(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/restaurants/[id]]", err);
    return serverError();
  }
}
