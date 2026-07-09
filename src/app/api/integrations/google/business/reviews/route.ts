/**
 * GET /api/integrations/google/business/reviews
 *
 * Returns recent Google reviews for the selected Meu Negócio location. Degrades
 * gracefully (available:false) when the legacy v4 reviews API isn't yet
 * allowlisted for the Foocci project. OWNER/MANAGER only.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { getValidAccessToken } from "@/services/google/googleOAuth";
import { getGoogleConfig, recordSync, recordError } from "@/services/google/GoogleConfigService";
import { fetchReviews, replyToReview } from "@/services/google/googleBusinessProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") return forbidden();

  try {
    const row = await getGoogleConfig(ctx.restaurantId);
    if (!row?.connected) return badRequest("Conecte sua conta Google primeiro.");
    if (!row.businessLocationId || !row.businessAccountId) {
      return badRequest("Selecione um local do Google Meu Negócio primeiro.");
    }

    const token = await getValidAccessToken(ctx.restaurantId);
    if (!token) return badRequest("Não foi possível autenticar com o Google. Reconecte sua conta.");

    const summary = await fetchReviews(token, row.businessAccountId, row.businessLocationId);
    if (summary.available) await recordSync(ctx.restaurantId);
    return ok(summary);
  } catch (e) {
    console.error("[GET google/business/reviews]", e);
    await recordError(ctx.restaurantId, e instanceof Error ? e.message : "reviews_failed");
    return serverError();
  }
}

/**
 * POST /api/integrations/google/business/reviews  { reviewName, comment }
 * Publishes (or updates) the owner reply to a Google review. OWNER/MANAGER only.
 */
export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") return forbidden();

  try {
    const body = (await req.json().catch(() => ({}))) as { reviewName?: string; comment?: string };
    const reviewName = body.reviewName?.trim();
    const comment    = body.comment?.trim();
    if (!reviewName || !reviewName.includes("/reviews/")) return badRequest("Avaliação inválida.");
    if (!comment) return badRequest("Escreva uma resposta.");
    if (comment.length > 4096) return badRequest("Resposta muito longa (máx. 4096 caracteres).");

    const row = await getGoogleConfig(ctx.restaurantId);
    if (!row?.connected) return badRequest("Conecte sua conta Google primeiro.");

    const token = await getValidAccessToken(ctx.restaurantId);
    if (!token) return badRequest("Não foi possível autenticar com o Google. Reconecte sua conta.");

    const result = await replyToReview(token, reviewName, comment);
    if (!result.ok) return badRequest(result.reason ?? "Não foi possível enviar a resposta.");
    await recordSync(ctx.restaurantId);
    return ok({ reply: comment });
  } catch (e) {
    console.error("[POST google/business/reviews]", e);
    await recordError(ctx.restaurantId, e instanceof Error ? e.message : "reply_failed");
    return serverError();
  }
}
