/**
 * GET    /api/integrations/[provider]  — masked config view
 * PUT    /api/integrations/[provider]  — upsert credentials
 * DELETE /api/integrations/[provider]  — disconnect integration
 *
 * WhatsApp uses "whatsapp" as the provider key and delegates to
 * the existing EvolutionConfigService.
 *
 * Stone, Mercado Pago, and Tipos use the generic IntegrationConfig table.
 *
 * Security:
 *   - Auth required (middleware injects tenant headers)
 *   - PUT/DELETE restricted to OWNER role
 *   - restaurantId always sourced from session, never from client
 *   - Secrets stored AES-256-GCM encrypted; never returned in plaintext
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import {
  ok,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
} from "@/lib/api-response";
import {
  isValidProvider,
  parseProviderConfig,
} from "@/validators/integrations";
import { IntegrationService } from "@/services/integrations/IntegrationService";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { upsertEvolutionConfigSchema } from "@/validators/evolution";
import { auditLog } from "@/lib/audit";

type Params = { params: { provider: string } };

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { provider } = params;
    if (provider !== "whatsapp" && !isValidProvider(provider)) {
      return notFound(`Unknown provider: ${provider}`);
    }

    const result = await IntegrationService.getView(
      provider as Parameters<typeof IntegrationService.getView>[0],
      ctx.restaurantId
    );
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error(`[GET /api/integrations/${params.provider}]`, err);
    return serverError();
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Apenas o proprietário pode atualizar integrações.");

    const { provider } = params;
    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Corpo da requisição inválido.");

    // WhatsApp delegates to EvolutionConfigService
    if (provider === "whatsapp") {
      const parsed = upsertEvolutionConfigSchema.safeParse(body);
      if (!parsed.success) return badRequest("Validação falhou.", parsed.error.flatten());

      const result = await EvolutionConfigService.upsert(ctx.restaurantId, parsed.data);
      if (!result.ok) return serverError(result.error);

      auditLog({ action: "integration.update", restaurantId: ctx.restaurantId, userId: ctx.userId, meta: { integration: "whatsapp" } });
      return ok(result.data);
    }

    if (!isValidProvider(provider)) return notFound(`Unknown provider: ${provider}`);

    const parsed = parseProviderConfig(provider, body);
    if (!parsed.success) return badRequest("Validação falhou.", parsed.error.flatten());

    const result = await IntegrationService.upsert(provider, ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);

    auditLog({ action: "integration.update", restaurantId: ctx.restaurantId, userId: ctx.userId, meta: { integration: provider } });
    return ok(result.data);
  } catch (err) {
    console.error(`[PUT /api/integrations/${params.provider}]`, err);
    return serverError();
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Apenas o proprietário pode desconectar integrações.");

    const { provider } = params;

    if (provider === "whatsapp") {
      const result = await EvolutionConfigService.deactivate(ctx.restaurantId);
      if (!result.ok) return serverError(result.error);
      auditLog({ action: "integration.update", restaurantId: ctx.restaurantId, userId: ctx.userId, meta: { integration: "whatsapp", action: "disconnect" } });
      return ok({ disconnected: true });
    }

    if (!isValidProvider(provider)) return notFound(`Unknown provider: ${provider}`);

    const result = await IntegrationService.disconnect(provider, ctx.restaurantId);
    if (!result.ok) return serverError(result.error);

    auditLog({ action: "integration.update", restaurantId: ctx.restaurantId, userId: ctx.userId, meta: { integration: provider, action: "disconnect" } });
    return ok({ disconnected: true });
  } catch (err) {
    console.error(`[DELETE /api/integrations/${params.provider}]`, err);
    return serverError();
  }
}
