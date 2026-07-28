/**
 * POST /api/oficina/foto — o pedido vira COMANDO de foto de altíssimo nível.
 *
 * A Oficina é a especialista em prompt do Brain. Ela entrega o comando pronto;
 * QUEM EXECUTA é o projeto que chamou. O Foocci não produz imagem — ele é canal
 * de vendas, o marketing dele é feito pela agência. Então aqui a resposta para
 * em "toma o comando", e é de propósito.
 *
 *   pedido em português → política → comando forjado
 *
 * Body:
 *   pedido        string   obrigatório — "foto do nosso hambúrguer"
 *   detalhes?     string   o que é verdade sobre o assunto (ingredientes, cores)
 *   cenario?      string   onde a cena acontece
 *   formato?      string   "4:5" | "9:16" | "1:1" …
 *   opcoes?       number   quantas variações forjar (1–12, padrão 3)
 *   categoria?    "prato" | "ambiente" | "grafismo" | "pessoa"  (padrão: prato)
 *   temMidiaPropria? boolean  o cliente já tem foto disso?
 *   autorizadoPor?   string   QUEM do cliente pediu a imagem gerada
 *
 * Grátis e instantâneo quando o pedido nomeia o assunto (nenhuma IA é chamada).
 * Pedido amplo monta uma pauta, e aí sim a IA entra — uma vez, pra achar QUAIS
 * fotos servem ao objetivo.
 *
 * A regra de ouro continua valendo — só que a autorização entra como um campo
 * do pedido, não como um fluxo de tela. Quem responde por ela é quem preenche.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { atenderPedidoDeFoto } from "@/services/brain/oficina/AtendenteDeFoto";
import { decidirImagem, SELO_ILUSTRATIVO } from "@/services/brain/oficina/PoliticaDeImagem";

export const maxDuration = 60;

const schema = z.object({
  pedido:          z.string().min(2, "pedido é obrigatório"),
  detalhes:        z.string().optional(),
  cenario:         z.string().optional(),
  formato:         z.string().optional(),
  opcoes:          z.number().int().min(1).max(12).optional(),
  negocio:         z.string().optional(),
  ofertas:         z.array(z.string()).optional(),
  publico:         z.string().optional(),
  insumos:         z.array(z.string()).optional(),
  modo:            z.enum(["direto", "pauta"]).optional(),
  categoria:       z.enum(["prato", "ambiente", "grafismo", "pessoa"]).optional(),
  temMidiaPropria: z.boolean().optional(),
  autorizadoPor:   z.string().optional(),
  restaurantId:    z.string().optional(),
});

export async function POST(req: NextRequest) {
  const isAdmin = checkAdminRequest(req);
  const ctx     = getTenantContext(req);
  if (!isAdmin && !ctx) return unauthorized();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join("; "));

  const {
    pedido, detalhes, cenario, formato, opcoes = 3,
    categoria = "prato", temMidiaPropria = false, autorizadoPor,
  } = parsed.data;

  const restaurantId = ctx?.restaurantId ?? parsed.data.restaurantId;
  if (!restaurantId) return badRequest("restaurantId é obrigatório para admin");
  if (ctx && !isAdmin && parsed.data.restaurantId && parsed.data.restaurantId !== ctx.restaurantId) {
    return unauthorized();
  }

  // 1. A política decide o caminho ANTES de forjar qualquer coisa.
  const decisao = decidirImagem({
    categoria,
    temMidiaPropria,
    escopoPedido: pedido,
    autorizacao: autorizadoPor?.trim()
      ? { por: autorizadoPor.trim(), em: new Date().toISOString(), escopo: pedido }
      : null,
  });

  if (decisao.caminho === "bloqueado") {
    return ok({ decisao, prompts: [], motivo: decisao.motivo, saida: decisao.saida });
  }

  // 2. Realce é outro caminho — a foto do cliente ganha, e ela não se gera.
  if (decisao.caminho === "realce") {
    return ok({
      decisao,
      prompts: [],
      motivo: "O cliente já tem foto deste assunto — use o realce da foto real, não gere uma nova.",
      comoFazer: "POST /api/internal/enhance-images com o restaurantId e o productId",
    });
  }

  // 3. A porta única lê o pedido e decide: comando direto ou pauta de fotos.
  const atendimento = await atenderPedidoDeFoto({
    texto: pedido,
    quantos: opcoes,
    ...(parsed.data.negocio !== undefined ? { negocio: parsed.data.negocio } : {}),
    ...(parsed.data.ofertas !== undefined ? { ofertas: parsed.data.ofertas } : {}),
    ...(parsed.data.publico !== undefined ? { publico: parsed.data.publico } : {}),
    ...(parsed.data.insumos !== undefined ? { insumos: parsed.data.insumos } : {}),
    ...(parsed.data.modo    !== undefined ? { modo: parsed.data.modo }       : {}),
    ...(detalhes !== undefined ? { detalhes } : {}),
    ...(cenario  !== undefined ? { cenario }  : {}),
    ...(formato  !== undefined ? { formato }  : {}),
  });

  const forjados = atendimento.modo === "direto"
    ? (atendimento.opcoes ?? [])
    : (atendimento.pauta ?? []).map((i) => i.comando);

  const base = {
    decisao,
    modo: atendimento.modo,
    leitura: atendimento.leitura,
    ...(atendimento.reserva ? { pautaDeReserva: true } : {}),
    tipoDetectado: forjados[0]?.tipo,
    ...(decisao.exigeSelo ? { selo: SELO_ILUSTRATIVO } : {}),
    ...(atendimento.modo === "pauta"
      ? { pauta: (atendimento.pauta ?? []).map((i) => ({ ...i.conceito, prompt: i.comando.prompt })) }
      : {}),
    prompts: forjados.map((f) => ({ prompt: f.prompt, negativo: f.negativo, receita: f.receita })),
  };

  return ok(base);
}
