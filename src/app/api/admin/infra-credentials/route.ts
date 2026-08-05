/**
 * GET  /api/admin/infra-credentials — o que está guardado no cofre (SEM os tokens).
 * PUT  /api/admin/infra-credentials — guarda ou troca o token de um serviço.
 *
 * Admin-only via `checkAdminRequest`. `/api/admin/**` está em PUBLIC_PATHS de propósito
 * (a autenticação é por cookie/segredo de admin, não por NextAuth), então a guarda é
 * responsabilidade DESTA rota — e `src/security/routeGuards.test.ts` quebra o build se
 * ela sumir.
 *
 * A resposta do GET NUNCA contém um token. Ela mostra: se existe, os 4 últimos
 * caracteres, quem salvou, quando, o resultado da validação e a trilha de uso. É
 * escrita-só por construção: o serviço não expõe função nenhuma que devolva o valor a
 * uma resposta HTTP.
 *
 * O PUT valida contra o serviço ANTES de gravar. Token recusado volta 400 com a frase
 * que a tela mostra — nunca é guardado "para corrigir depois".
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, badRequest, serverError } from "@/lib/api-response";
import {
  InfraCredentialService,
  InvalidCredentialError,
  CredentialInputError,
} from "@/services/infra/InfraCredentialService";

export const dynamic = "force-dynamic";

async function payload() {
  const [credentials, access] = await Promise.all([
    InfraCredentialService.list(),
    InfraCredentialService.recentAccess(20),
  ]);
  return { credentials, access };
}

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  try {
    return ok(await payload());
  } catch (err) {
    console.error("[GET /api/admin/infra-credentials]", err);
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

  const service = typeof body.service === "string" ? body.service : "";
  const token = typeof body.token === "string" ? body.token : "";
  const label = typeof body.label === "string" ? body.label : undefined;

  if (!service) return badRequest("Diga de qual serviço é este código.");
  if (!token.trim()) return badRequest("Cole o código do serviço antes de salvar.");

  try {
    const result = await InfraCredentialService.save({ service, label, token, savedBy: "admin" });
    return ok({ ...(await payload()), saved: result.view, validation: {
      status: result.validationStatus,
      detail: result.validationDetail,
    } });
  } catch (err) {
    if (err instanceof InvalidCredentialError) {
      // 400 com a razão em português: o CEO precisa saber que NÃO foi guardado.
      return badRequest(err.message, { rejected: true });
    }
    if (err instanceof CredentialInputError) {
      return badRequest(err.message);
    }
    // O erro vai para o log (guardrail 6: alerta sem evidência é ruído) mas NUNCA para
    // a resposta — `serverError` já não repassa detalhe ao cliente. O texto em claro não
    // circula por aqui: o que chega ao Prisma já é ciphertext, e a única exceção que
    // `encrypt()` lança é sobre a ENCRYPTION_KEY ausente.
    console.error("[PUT /api/admin/infra-credentials]", err);
    return serverError(
      "Não consegui guardar. Verifique se a chave de criptografia (ENCRYPTION_KEY) está configurada no servidor.",
    );
  }
}
