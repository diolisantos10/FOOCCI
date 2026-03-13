/**
 * GET   /api/users  – list users in the tenant
 * POST  /api/users  – create a new user (OWNER/MANAGER only)
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { createUserSchema } from "@/validators/user";
import { UserService } from "@/services/user/UserService";
import {
  ok,
  created,
  badRequest,
  unauthorized,
  forbidden,
  conflict,
  serverError,
} from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await UserService.list(ctx.restaurantId);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/users]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) {
      return forbidden("Only owners and managers can create users");
    }

    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest("Validation failed", parsed.error.flatten());
    }

    const result = await UserService.create(ctx.restaurantId, parsed.data);

    if (!result.ok) {
      if (result.status === 409) return conflict(result.error);
      return badRequest(result.error);
    }

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/users]", err);
    return serverError();
  }
}
