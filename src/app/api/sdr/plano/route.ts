/**
 * POST /api/sdr/plano — o calendário, a partir da entrevista guardada.
 *
 * Não existe jeito de mandar o estado por fora: o plano sai do que foi REALMENTE
 * perguntado e gravado na entrevista. Aceitar um estado avulso aqui seria uma
 * porta lateral em volta da trava — e a trava é a coisa toda.
 *
 * Sondagem em aberto devolve 200 com `liberado: false` e o motivo. Não é erro
 * de quem chamou; é a resposta certa. Quem consome mostra o motivo ao SDR e
 * volta para a entrevista.
 *
 * Body:
 *   clienteId  string   obrigatório
 *   semanas?   number   quantas semanas o calendário cobre (padrão 4)
 *   inicioEm?  string   data de início, se for diferente da respondida
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { planoDoCliente } from "@/services/brain/sdr/SdrService";

const schema = z.object({
  clienteId: z.string().min(1, "clienteId é obrigatório"),
  semanas:   z.number().int().min(1).max(26).optional(),
  inicioEm:  z.string().optional(),
  agenciaId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join("; "));

  const ctx = getTenantContext(req);
  const agenciaId = ctx
    ? ctx.restaurantId
    : checkAdminRequest(req) && parsed.data.agenciaId?.trim() ? parsed.data.agenciaId.trim() : null;
  if (!agenciaId) return unauthorized();

  try {
    const { plano, texto } = await planoDoCliente({
      agenciaId,
      clienteId: parsed.data.clienteId,
      ...(parsed.data.semanas  !== undefined ? { semanas: parsed.data.semanas }   : {}),
      ...(parsed.data.inicioEm !== undefined ? { inicioEm: parsed.data.inicioEm } : {}),
    });
    return ok({ ...plano, texto });
  } catch (err) {
    console.error("[POST /api/sdr/plano]", err);
    return serverError();
  }
}
