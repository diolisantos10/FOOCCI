/**
 * GET  /api/brand-config  — return current brand voice config
 * PUT  /api/brand-config  — upsert brand voice config (OWNER / MANAGER)
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { BrandConfigService } from "@/services/ai/BrandConfigService";
import { upsertBrandConfigSchema } from "@/validators/brand-config";
import {
  ok,
  badRequest,
  unauthorized,
  notFound,
  serverError,
} from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await BrandConfigService.getByRestaurantId(ctx.restaurantId);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return serverError(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/brand-config]", err);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (ctx.role === "STAFF") {
      return badRequest("Apenas OWNER ou MANAGER podem atualizar a configuração de IA.");
    }

    const body = await req.json();
    const parsed = upsertBrandConfigSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await BrandConfigService.upsert(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[PUT /api/brand-config]", err);
    return serverError();
  }
}
