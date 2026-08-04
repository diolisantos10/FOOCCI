/**
 * DELETE /api/admin/infra-credentials/[service] — apaga o token guardado.
 *
 * Admin-only (`checkAdminRequest`; o gate de `src/security/routeGuards.test.ts` cobra).
 *
 * Exige `?confirmar=1`. A tela já pergunta "tem certeza?", mas confirmação que só existe
 * na tela é aviso, não trava — e apagar a chave-mestra por um clique errado (ou por um
 * DELETE disparado sem querer) é caro. A trava fica no servidor.
 *
 * A trilha de acessos NÃO é apagada junto: o registro de quem já usou o token sobrevive
 * ao token (ON DELETE SET NULL na migração).
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, badRequest, notFound, serverError } from "@/lib/api-response";
import { InfraCredentialService } from "@/services/infra/InfraCredentialService";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { service: string } },
) {
  if (!checkAdminRequest(req)) return unauthorized();

  if (req.nextUrl.searchParams.get("confirmar") !== "1") {
    return badRequest("Remoção exige confirmação explícita.");
  }

  try {
    const removed = await InfraCredentialService.remove(params.service, "admin");
    if (!removed) return notFound("Não havia credencial guardada para este serviço.");

    const [credentials, access] = await Promise.all([
      InfraCredentialService.list(),
      InfraCredentialService.recentAccess(20),
    ]);
    return ok({ credentials, access });
  } catch (err) {
    console.error("[DELETE /api/admin/infra-credentials/[service]]", err);
    return serverError("Não consegui remover a credencial.");
  }
}
