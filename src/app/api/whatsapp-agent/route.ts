import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { upsertAgentConfigSchema } from "@/validators/whatsapp-agent";
import { WhatsAppAgentConfigService } from "@/services/whatsapp/WhatsAppAgentConfigService";
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

    const result = await WhatsAppAgentConfigService.getByRestaurantId(
      ctx.restaurantId
    );
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/whatsapp-agent]", err);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = upsertAgentConfigSchema.safeParse(body);
    if (!parsed.success)
      return badRequest("Validation failed", parsed.error.flatten());

    const result = await WhatsAppAgentConfigService.upsert(
      ctx.restaurantId,
      parsed.data
    );
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[PUT /api/whatsapp-agent]", err);
    return serverError();
  }
}
