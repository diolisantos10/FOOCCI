/**
 * POST /api/restaurants/register
 *
 * Public endpoint – creates a new restaurant tenant + owner account.
 * No auth required. Rate-limited at the application level.
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
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit: 5 registrations / 15 minutes per IP
  const ip = getClientIp(req);
  const rl = rateLimit({
    key: `register:${ip}`,
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

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
