/**
 * GET  /api/admin/meta/credentials — masked view of the app-level Meta credentials.
 * PUT  /api/admin/meta/credentials — save credentials (only the fields sent).
 *
 * Admin-only. The GET response NEVER contains a usable secret — only `abcd...wxyz`
 * previews plus, for each field, whether the live value comes from the database, from a
 * Railway env var, or is missing entirely. "Configured" must be readable as a fact, not
 * inferred from a green badge.
 *
 * A blank field on PUT means "leave unchanged", not "clear" — otherwise opening the
 * screen (which can only show masked secrets) and pressing Save would wipe every
 * credential the operator could not see. Clearing is explicit, via `clear: [...]`.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, badRequest, serverError } from "@/lib/api-response";
import { MetaAppCredentialsService } from "@/services/meta/MetaAppCredentialsService";

/** Only these may be written or cleared — an unknown key must never reach Prisma. */
const WRITABLE_FIELDS = [
  "appId",
  "appSecret",
  "configId",
  "coexistenceConfigId",
  "webhookVerifyToken",
  "graphVersion",
  "igAppId",
  "igAppSecret",
  "igWebhookVerifyToken",
  "systemUserToken",
] as const;

type WritableField = (typeof WRITABLE_FIELDS)[number];

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  try {
    return ok(await MetaAppCredentialsService.getMasked());
  } catch (err) {
    console.error("[GET /api/admin/meta/credentials]", err);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Corpo da requisição inválido.");
  }

  const input: Record<string, string> = {};
  for (const field of WRITABLE_FIELDS) {
    const value = body[field];
    if (typeof value === "string") input[field] = value;
    else if (value !== undefined && value !== null) {
      return badRequest(`Campo "${field}" precisa ser texto.`);
    }
  }

  const rawClear = Array.isArray(body.clear) ? body.clear : [];
  const clearFields: string[] = [];
  for (const field of rawClear) {
    if (typeof field !== "string" || !WRITABLE_FIELDS.includes(field as WritableField)) {
      return badRequest(`Campo "${String(field)}" não pode ser limpo.`);
    }
    clearFields.push(field);
  }

  if (Object.keys(input).length === 0 && clearFields.length === 0) {
    return badRequest("Nenhum campo enviado.");
  }

  try {
    await MetaAppCredentialsService.save(input, clearFields);
    // Re-read so the screen reflects what was actually stored, not what was submitted.
    return ok(await MetaAppCredentialsService.getMasked());
  } catch (err) {
    console.error("[PUT /api/admin/meta/credentials]", err);
    return serverError("Não consegui salvar. Verifique se ENCRYPTION_KEY está configurada.");
  }
}
