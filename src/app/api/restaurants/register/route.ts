/**
 * POST /api/restaurants/register
 *
 * Public endpoint – creates a new restaurant tenant + owner account.
 * No auth required. Rate-limiting should be applied at the infra level
 * (or via Upstash Redis in Phase 2).
 */

import { NextRequest } from "next/server";
import { createRestaurantSchema } from "@/validators/restaurant";
import { RestaurantService } from "@/services/restaurant/RestaurantService";
import {
  created,
  badRequest,
  conflict,
  serverError,
} from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createRestaurantSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest("Validation failed", parsed.error.flatten());
    }

    const result = await RestaurantService.register(parsed.data);

    if (!result.ok) {
      if (result.status === 409) return conflict(result.error);
      return badRequest(result.error);
    }

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/restaurants/register]", err);
    return serverError();
  }
}
