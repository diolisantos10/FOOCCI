/**
 * GET    /api/users/[id]              – get user profile
 * PATCH  /api/users/[id]              – update user
 * DELETE /api/users/[id]              – deactivate user (soft delete)
 * PATCH  /api/users/[id]/password     – change own password
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { updateUserSchema, changePasswordSchema } from "@/validators/user";
import { UserService } from "@/services/user/UserService";
import {
  ok,
  noContent,
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

    const result = await UserService.getById(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/users/[id]]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    // Users can edit themselves; managers/owners can edit others
    const isSelf = ctx.userId === params.id;
    const canManageOthers = ["OWNER", "MANAGER"].includes(ctx.role);

    if (!isSelf && !canManageOthers) {
      return forbidden("You can only update your own profile");
    }

    const body = await req.json();

    // If changing password use the dedicated endpoint
    if ("currentPassword" in body) {
      const parsed = changePasswordSchema.safeParse(body);
      if (!parsed.success) {
        return badRequest("Validation failed", parsed.error.flatten());
      }

      const result = await UserService.changePassword(
        ctx.restaurantId,
        params.id,
        parsed.data
      );

      if (!result.ok) return badRequest(result.error);
      return ok(result.data);
    }

    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Validation failed", parsed.error.flatten());
    }

    // Non-managers cannot change their own role
    if (parsed.data.role && !canManageOthers) {
      return forbidden("You cannot change your own role");
    }

    const result = await UserService.update(
      ctx.restaurantId,
      params.id,
      parsed.data
    );

    if (!result.ok) return notFound(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/users/[id]]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) {
      return forbidden("Insufficient permissions");
    }

    const result = await UserService.deactivate(
      ctx.restaurantId,
      params.id,
      ctx.userId
    );

    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return badRequest(result.error);
    }

    return noContent();
  } catch (err) {
    console.error("[DELETE /api/users/[id]]", err);
    return serverError();
  }
}
