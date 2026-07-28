/**
 * POST /api/oficina/sondagem — o que o SDR ainda precisa descobrir.
 *
 * Manda o que já se sabe; recebe de volta a próxima pergunta, o que ainda
 * falta, e — o que mais importa — QUAIS ENTREGÁVEIS já estão sustentados e
 * quais não podem ser prometidos ainda.
 *
 * Existe por causa de uma falha real: um planejamento de reels entregue sem
 * nunca se ter perguntado se a cliente consegue gravar reels. A trava aqui é
 * `podeEntregar`: enquanto faltar essencial, o plano não sai.
 *
 * Body:
 *   respostas  objeto  { chave: valor } do que já foi respondido. {} no começo.
 *   quantas?   number  quantas próximas perguntas devolver (padrão 3)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { avaliarSondagem, podeEntregarPlano, proximasPerguntas } from "@/services/brain/oficina/Sondagem";

const schema = z.object({
  respostas: z.record(z.union([z.string(), z.array(z.string()), z.boolean(), z.null()])).default({}),
  quantas:   z.number().int().min(1).max(10).optional(),
});

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req) && !getTenantContext(req)) return unauthorized();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join("; "));

  try {
    const estado = { respostas: parsed.data.respostas };
    const a = avaliarSondagem(estado);
    return ok({
      completa: a.completa,
      cobertura: a.cobertura,
      veredito: a.veredito,
      podeEntregarPlano: podeEntregarPlano(estado),
      perguntar: proximasPerguntas(estado, parsed.data.quantas ?? 3),
      entregaveis: a.entregaveis,
      lacunas: a.lacunas,
    });
  } catch (err) {
    console.error("[POST /api/oficina/sondagem]", err);
    return serverError();
  }
}
