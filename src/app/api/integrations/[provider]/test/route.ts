/**
 * POST /api/integrations/[provider]/test
 *
 * Executes a lightweight connection check for the given integration.
 * Auth required. Any authenticated user can trigger a test (read-only operation).
 *
 * Returns: { success: boolean, message: string }
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";
import { isValidProvider } from "@/validators/integrations";
import { IntegrationService } from "@/services/integrations/IntegrationService";

type Params = { params: { provider: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { provider } = params;
    if (provider !== "whatsapp" && !isValidProvider(provider)) {
      return notFound(`Unknown provider: ${provider}`);
    }

    const result = await IntegrationService.test(
      provider as Parameters<typeof IntegrationService.test>[0],
      ctx.restaurantId
    );
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error(`[POST /api/integrations/${params.provider}/test]`, err);
    return serverError();
  }
}
