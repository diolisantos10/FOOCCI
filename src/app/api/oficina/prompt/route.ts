/**
 * POST /api/oficina/prompt — a porta da Oficina, para QUALQUER meio.
 *
 * A Oficina é a especialista em prompt do Brain: entrega o comando de altíssimo
 * nível para que cada projeto entregue o melhor possível na demanda dele.
 * Imagem é UM dos meios — tem também legenda, mensagem, anúncio, roteiro,
 * e-mail, título, resposta de atendimento e descrição de produto.
 *
 * Quem EXECUTA o comando é o projeto que chamou. Aqui a resposta para no
 * comando, e é de propósito.
 *
 * Body:
 *   texto       string    obrigatório — o pedido em português
 *   meio?       "texto" | "imagem"   força em vez de deixar detectar
 *   verdade?    string[]  fatos que a peça pode citar (sem isto, sai genérico)
 *   publico?    string
 *   tom?        string    a voz da marca
 *   proibicoes? string[]  o que esta marca nunca diz
 *   quantos?    number    quantas opções (1–12, padrão 3)
 *   negocio? ofertas? insumos? detalhes? cenario? formato?   (contexto de imagem)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { atender } from "@/services/brain/oficina/PortaDaOficina";

export const maxDuration = 60;

const schema = z.object({
  texto:      z.string().min(2, "texto é obrigatório"),
  meio:       z.enum(["texto", "imagem"]).optional(),
  verdade:    z.array(z.string()).optional(),
  publico:    z.string().optional(),
  tom:        z.string().optional(),
  proibicoes: z.array(z.string()).optional(),
  quantos:    z.number().int().min(1).max(12).optional(),
  negocio:    z.string().optional(),
  ofertas:    z.array(z.string()).optional(),
  insumos:    z.array(z.string()).optional(),
  detalhes:   z.string().optional(),
  cenario:    z.string().optional(),
  formato:    z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req) && !getTenantContext(req)) return unauthorized();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join("; "));

  try {
    const r = await atender(parsed.data);
    return ok({
      meio: r.meio,
      leitura: r.leitura,
      ...(r.textos ? { prompts: r.textos } : {}),
      ...(r.imagem ? { imagem: r.imagem } : {}),
    });
  } catch (err) {
    console.error("[POST /api/oficina/prompt]", err);
    return serverError();
  }
}
