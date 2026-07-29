/**
 * /api/sdr/entrevista — a sondagem conduzida, com memória.
 *
 * GET  → onde a entrevista parou e o que perguntar agora.
 * POST → manda a resposta do cliente, recebe o próximo bloco de perguntas.
 *
 * O ciclo é este, e ele fecha sozinho:
 *
 *   1. GET devolve `perguntar` (as perguntas redigidas) e `chavesPerguntadas`.
 *   2. O SDR pergunta ao cliente.
 *   3. POST devolve a resposta do cliente JUNTO com `perguntadasAgora` —
 *      as mesmas chaves do passo 1.
 *   4. Volta ao 1 até `podePropor` virar true.
 *
 * O passo 3 é o que sustenta a regra da casa: devolver as chaves registra que
 * a agência PERGUNTOU, tendo o cliente respondido ou não. Falta de resposta não
 * trava a proposta; falta de pergunta trava.
 *
 * Body do POST:
 *   clienteId          string    obrigatório — quem está sendo entrevistado
 *   resposta?          string    o que o cliente disse, em português solto
 *   perguntadasAgora?  string[]  as chaves do bloco anterior
 *   quantas?           number    quantas perguntas devolver (padrão 3)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { abrirEntrevista, conduzirTurno } from "@/services/brain/sdr/SdrService";

export const maxDuration = 60;

const schema = z.object({
  clienteId:        z.string().min(1, "clienteId é obrigatório"),
  resposta:         z.string().optional(),
  perguntadasAgora: z.array(z.string()).optional(),
  quantas:          z.number().int().min(1).max(10).optional(),
  agenciaId:        z.string().optional(),
});

/** A agência é o tenant. Admin pode declarar por fora; ninguém mais. */
function resolverAgencia(req: NextRequest, declarada: string | undefined): string | null {
  const ctx = getTenantContext(req);
  if (ctx) return ctx.restaurantId;
  return checkAdminRequest(req) && declarada?.trim() ? declarada.trim() : null;
}

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("clienteId")?.trim();
  if (!clienteId) return badRequest("clienteId é obrigatório");

  const agenciaId = resolverAgencia(req, req.nextUrl.searchParams.get("agenciaId") ?? undefined);
  if (!agenciaId) return unauthorized();

  const quantasCru = Number(req.nextUrl.searchParams.get("quantas"));
  const quantas = Number.isFinite(quantasCru) && quantasCru > 0 ? Math.min(quantasCru, 10) : 3;

  try {
    const e = await abrirEntrevista(agenciaId, clienteId, quantas);
    return ok({
      existe: e.existe,
      podePropor: e.avaliacao.podePropor,
      motivo: e.avaliacao.motivo,
      cobertura: e.avaliacao.cobertura,
      veredito: e.avaliacao.veredito,
      perguntar: e.perguntar,
      chavesPerguntadas: e.chavesPerguntadas,
      servicos: e.avaliacao.servicos,
      naoPerguntado: e.avaliacao.naoPerguntado,
      aguardandoCliente: e.avaliacao.aguardandoCliente,
    });
  } catch (err) {
    console.error("[GET /api/sdr/entrevista]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join("; "));

  const agenciaId = resolverAgencia(req, parsed.data.agenciaId);
  if (!agenciaId) return unauthorized();

  try {
    const r = await conduzirTurno({
      agenciaId,
      clienteId: parsed.data.clienteId,
      ...(parsed.data.resposta         !== undefined ? { resposta: parsed.data.resposta } : {}),
      ...(parsed.data.perguntadasAgora !== undefined ? { perguntadasAgora: parsed.data.perguntadasAgora } : {}),
      ...(parsed.data.quantas          !== undefined ? { quantas: parsed.data.quantas } : {}),
    });
    return ok({
      entendido: r.entendido,
      servicosDetectados: r.servicosDetectados,
      semResposta: r.semResposta,
      perguntar: r.perguntar,
      chavesPerguntadas: r.chavesPerguntadas,
      podePropor: r.podePropor,
      cobertura: r.cobertura,
      veredito: r.veredito,
      ...(r.semIA ? { semIA: true } : {}),
    });
  } catch (err) {
    console.error("[POST /api/sdr/entrevista]", err);
    return serverError();
  }
}
