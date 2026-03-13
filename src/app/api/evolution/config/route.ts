/**
 * GET  /api/evolution/config  — return masked config view (OWNER/MANAGER only)
 * PUT  /api/evolution/config  — upsert config with encrypted secrets (OWNER only)
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { upsertEvolutionConfigSchema } from "@/validators/evolution";
import {
  ok,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
} from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await EvolutionConfigService.getView(ctx.restaurantId);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return serverError(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/evolution/config]", err);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    // Only OWNER may update integration credentials
    if (ctx.role !== "OWNER") {
      return forbidden("Only restaurant owners can update Evolution config.");
    }

    const body = await req.json();
    const parsed = upsertEvolutionConfigSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await EvolutionConfigService.upsert(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[PUT /api/evolution/config]", err);
    return serverError();
  }
}
