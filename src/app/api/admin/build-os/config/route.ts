/**
 * GET   /api/admin/build-os/config — effective Build OS status + raw config.
 * PATCH /api/admin/build-os/config — update DB config (enable/mode/fallback).
 *
 * Internal only (ADMIN_SECRET). No public route. No Claude/GitHub/LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import {
  getEffectiveBuildOsStatus,
  getBuildOSConfigRow,
  updateBuildOSConfig,
} from "@/services/buildos/BuildOSConfigService";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Admin access not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const [status, row] = await Promise.all([getEffectiveBuildOsStatus(), getBuildOSConfigRow()]);
  return NextResponse.json({
    status,
    config: row
      ? {
          isEnabled: row.isEnabled,
          mode: row.mode,
          defaultProjectId: row.defaultProjectId,
          allowEnvAuthorizedPhonesFallback: row.allowEnvAuthorizedPhonesFallback,
          whatsappInstanceName: row.whatsappInstanceName,
          whatsappEnabled: row.whatsappEnabled,
          legacyRestaurantInstanceFallbackEnabled: row.legacyRestaurantInstanceFallbackEnabled,
        }
      : null,
  });
}

const patchSchema = z.object({
  isEnabled: z.boolean().optional(),
  mode: z.enum(["INTERNAL_ONLY", "PRODUCT"]).optional(),
  defaultProjectId: z.string().nullable().optional(),
  allowEnvAuthorizedPhonesFallback: z.boolean().optional(),
  // Build OS WhatsApp Master/Admin channel (separate from restaurant WhatsApp).
  whatsappInstanceName: z.string().max(120).nullable().optional(),
  whatsappEnabled: z.boolean().optional(),
  legacyRestaurantInstanceFallbackEnabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  await updateBuildOSConfig(parsed.data);
  const status = await getEffectiveBuildOsStatus();
  return NextResponse.json({ ok: true, status });
}
