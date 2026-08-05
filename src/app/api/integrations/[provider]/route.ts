/**
 * GET    /api/integrations/[provider]  — masked config view
 * PUT    /api/integrations/[provider]  — upsert credentials
 * DELETE /api/integrations/[provider]  — disconnect integration
 *
 * WhatsApp ("whatsapp") é SOMENTE LEITURA aqui. Conectar e desconectar o WhatsApp
 * vive em `/api/integracoes/whatsapp/meta/*` — desde 04/08/2026 o canal é o
 * aplicativo homologado da Meta, cuja credencial não é digitada num formulário
 * genérico (é OAuth + phone_number_id). Até então esta rota gravava e apagava
 * credencial da Evolution; a Evolution saiu do Foocci por ordem do CEO.
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

    // WhatsApp não se configura por aqui: recusa DECLARADA apontando o caminho
    // certo. Silêncio ou 404 genérico faria o lojista achar que salvou algo.
    if (provider === "whatsapp") {
      return badRequest(
        "O WhatsApp é configurado em Integrações → WhatsApp (conta oficial da Meta), não por esta rota.",
      );
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

    // Desconectar o WhatsApp é ato da Meta (revoga token + limpa a conta) e vive
    // em POST /api/integracoes/whatsapp/meta/disconnect.
    if (provider === "whatsapp") {
      return badRequest(
        "Para desconectar o WhatsApp use Integrações → WhatsApp → Desconectar (conta oficial da Meta).",
      );
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
