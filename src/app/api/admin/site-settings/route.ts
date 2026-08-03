/**
 * GET / PUT /api/admin/site-settings — analytics of Foocci's own commercial site.
 *
 * Admin-only. These values are not secrets (they ship to every browser), so the GET
 * returns them in full — the operator has to be able to see what they are editing.
 *
 * A saved value only takes effect if it PASSES VALIDATION in SiteSettingsService: the
 * ids are interpolated into a <script> on the public site, so a malformed one is
 * dropped rather than rendered. The response says whether each stored value is
 * currently active, so "I pasted it and nothing happened" is answerable from the screen.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, badRequest, serverError } from "@/lib/api-response";
import { SiteSettingsService } from "@/services/site/SiteSettingsService";

const FIELDS = ["gaMeasurementId", "metaPixelId", "googleSiteVerification"] as const;
type Field = (typeof FIELDS)[number];

async function payload() {
  const [stored, resolved] = await Promise.all([
    SiteSettingsService.getStored(),
    SiteSettingsService.getResolved(),
  ]);
  return {
    stored,
    // What is actually live on the site right now, after validation + env fallback.
    active: resolved,
    valid: {
      gaMeasurementId: !!resolved.gaMeasurementId,
      metaPixelId: !!resolved.metaPixelId,
      googleSiteVerification: !!resolved.googleSiteVerification,
    },
  };
}

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  try {
    return ok(await payload());
  } catch (err) {
    console.error("[GET /api/admin/site-settings]", err);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Corpo inválido.");
  }

  const input: Partial<Record<Field, string>> = {};
  for (const f of FIELDS) {
    const v = body[f];
    if (typeof v === "string") input[f] = v;
    else if (v !== undefined && v !== null) return badRequest(`Campo "${f}" precisa ser texto.`);
  }

  if (Object.keys(input).length === 0) return badRequest("Nenhum campo enviado.");

  try {
    await SiteSettingsService.save(input);
    return ok(await payload());
  } catch (err) {
    console.error("[PUT /api/admin/site-settings]", err);
    return serverError("Não consegui salvar.");
  }
}
