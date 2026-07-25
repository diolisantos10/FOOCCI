/**
 * POST /api/settings/fiscal/certificate — o lojista sobe o A1 (.pfx) dele.
 * Body: { fileBase64: string; fileName?: string; senha: string }
 * A Foocci registra a empresa dele no gateway (conta-mãe) e guarda a referência.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { FiscalConfigService } from "@/services/fiscal/FiscalConfigService";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = (await req.json().catch(() => ({}))) as { fileBase64?: string; fileName?: string; senha?: string };
    const fileBase64 = (body.fileBase64 ?? "").trim();
    const fileName = (body.fileName ?? "certificado.pfx").trim();
    const senha = body.senha ?? "";
    if (!fileBase64) return badRequest("Envie o arquivo do certificado (.pfx).");
    if (!senha) return badRequest("Informe a senha do certificado.");
    if (fileBase64.length > 3_000_000) return badRequest("Arquivo muito grande.");

    const result = await FiscalConfigService.uploadCertificate(ctx.restaurantId, { fileBase64, fileName, senha });
    if (!result.ok) return badRequest(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/settings/fiscal/certificate]", err);
    return serverError();
  }
}
