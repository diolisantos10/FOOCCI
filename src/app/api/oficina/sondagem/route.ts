/**
 * POST /api/oficina/sondagem — o que o SDR ainda precisa descobrir.
 *
 * Manda o que já se sabe (a ficha do cliente + os serviços que ele escolheu);
 * recebe de volta as próximas perguntas e — o que mais importa — se a proposta
 * já pode sair.
 *
 * Existe por causa de uma falha real: um planejamento de reels entregue sem
 * nunca se ter perguntado de onde viria o vídeo nem que formato a cliente
 * queria. A trava aqui é `podePropor`, e ela tem uma regra específica:
 *
 *   falta de RESPOSTA não trava — falta de PERGUNTA trava.
 *
 * Por isso `perguntadas` existe: é como o SDR declara "isto eu já perguntei, o
 * cliente é que ainda não respondeu". Aí a proposta sai com a pendência escrita.
 *
 * Body:
 *   ficha?       objeto   { chave: valor } do que já foi respondido
 *   perguntadas? string[] chaves já perguntadas e ainda sem resposta
 *   servicos?    array    [{ chave, origemDoInsumo?, quemExecuta?, definicoes? }]
 *   quantas?     number   quantas próximas perguntas devolver (padrão 3)
 *
 * GET devolve o catálogo e a ficha em branco — é o roteiro da entrevista.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import {
  avaliarSondagem,
  podePropor,
  proximasPerguntas,
  CAMPOS_DA_FICHA,
  CATALOGO_DE_SERVICOS,
  type EstadoDaSondagem,
} from "@/services/brain/oficina/Sondagem";

const servicoSchema = z.object({
  chave:          z.string().min(1),
  origemDoInsumo: z.enum(["cliente", "agencia", "misto"]).nullable().optional(),
  quemExecuta:    z.string().nullable().optional(),
  definicoes:     z.record(z.string()).optional(),
});

const schema = z.object({
  ficha:       z.record(z.union([z.string(), z.array(z.string()), z.boolean(), z.null()])).default({}),
  perguntadas: z.array(z.string()).default([]),
  servicos:    z.array(servicoSchema).default([]),
  quantas:     z.number().int().min(1).max(20).optional(),
});

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req) && !getTenantContext(req)) return unauthorized();
  return ok({ ficha: CAMPOS_DA_FICHA, catalogo: CATALOGO_DE_SERVICOS });
}

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req) && !getTenantContext(req)) return unauthorized();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join("; "));

  try {
    const estado: EstadoDaSondagem = {
      ficha:       parsed.data.ficha,
      perguntadas: parsed.data.perguntadas,
      servicos:    parsed.data.servicos,
    };
    const a = avaliarSondagem(estado);
    return ok({
      podePropor: podePropor(estado),
      cobertura:  a.cobertura,
      veredito:   a.veredito,
      motivo:     a.motivo,
      perguntar:  proximasPerguntas(estado, parsed.data.quantas ?? 3),
      servicos:   a.servicos,
      // Separados de propósito: um é falha da agência, o outro é espera do cliente.
      naoPerguntado:     a.naoPerguntado,
      aguardandoCliente: a.aguardandoCliente,
    });
  } catch (err) {
    console.error("[POST /api/oficina/sondagem]", err);
    return serverError();
  }
}
