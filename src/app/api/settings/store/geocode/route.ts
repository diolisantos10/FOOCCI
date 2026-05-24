/**
 * POST /api/settings/store/geocode
 *
 * Manual "Recalcular localização da loja" action for restaurant owners/managers.
 * Uses the existing store address to geocode and update StoreProfile.latitude/longitude.
 * Owners never enter GPS coordinates manually.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { RestaurantSettingsService } from "@/services/settings/RestaurantSettingsService";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const result = await RestaurantSettingsService.geocodeStoreAddress(ctx.restaurantId);

    if (!result.ok) {
      return ok({
        success: false,
        message: "Não foi possível calcular a localização. Verifique se o endereço da loja está completo (CEP, cidade, estado).",
      });
    }

    return ok({
      success: true,
      message: "Localização calculada com sucesso.",
      lat: result.lat,
      lng: result.lng,
    });
  } catch (err) {
    console.error("[POST /api/settings/store/geocode]", err);
    return serverError();
  }
}
