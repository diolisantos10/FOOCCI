/**
 * GET /api/internal/media-inventory?restaurantIds=a,b,c
 *
 * "Quais pratos destes clientes têm foto, e quais não têm?"
 *
 * Só leitura — nenhuma escrita, nenhuma IA, nenhum provider. É o retrato que se
 * olha ANTES de prometer calendário de criativo: diz de quanto insumo próprio
 * cada cliente dispõe e lista, nome por nome, o que precisa de foto.
 *
 * Aceita ADMIN_SECRET (vários restaurantes) ou JWT do lojista (só o dele).
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { inventariarVarios } from "@/services/imageEnhancement/mediaInventory";

/** Teto de restaurantes por chamada — evita varrer a base inteira sem querer. */
const TETO_DE_RESTAURANTES = 20;

export async function GET(req: NextRequest) {
  const isAdmin = checkAdminRequest(req);
  const ctx     = getTenantContext(req);

  if (!isAdmin && !ctx) return unauthorized();

  const bruto = req.nextUrl.searchParams.get("restaurantIds") ?? req.nextUrl.searchParams.get("restaurantId");
  const pedidos = (bruto ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  // Lojista sem parâmetro vê o próprio restaurante; com parâmetro, só o dele.
  const ids = isAdmin
    ? pedidos
    : ctx
      ? [ctx.restaurantId]
      : [];

  if (ids.length === 0) return badRequest("restaurantIds é obrigatório (separe por vírgula)");
  if (ids.length > TETO_DE_RESTAURANTES) {
    return badRequest(`no máximo ${TETO_DE_RESTAURANTES} restaurantes por chamada`);
  }

  try {
    const { inventarios, naoEncontrados } = await inventariarVarios(ids);

    const total       = inventarios.reduce((s, i) => s + i.total, 0);
    const comFoto     = inventarios.reduce((s, i) => s + i.comFoto, 0);
    const semFoto     = inventarios.reduce((s, i) => s + i.semFoto, 0);
    const coberturaGeral = total === 0 ? 0 : Math.round((comFoto / total) * 100);

    return ok({
      resumo: { restaurantes: inventarios.length, total, comFoto, semFoto, coberturaGeral },
      inventarios,
      naoEncontrados,
    });
  } catch (err) {
    console.error("[GET /api/internal/media-inventory]", err);
    return serverError();
  }
}
