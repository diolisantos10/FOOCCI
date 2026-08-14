/**
 * GET /api/admin/meta/waba-lookup?wabaId=...&restaurantId=... — admin, SOMENTE LEITURA.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * O `diag` só enxerga a WABA que está gravada na config do restaurante. Quando o
 * restaurante tem DUAS contas de WhatsApp — uma com o número do sistema e outra com o
 * número que fica no aparelho do atendente — a segunda é invisível para nós, e a
 * pergunta "dá para unir as duas?" fica sem base para ser respondida.
 *
 * Esta rota lê UMA WABA qualquer, pelo id, usando o token do restaurante (que é
 * WABA-wide dentro do portfólio). Devolve a conta, o portfólio dono, o estado de
 * revisão e a lista de números com `status` / `platform_type` / `is_on_biz_app`.
 *
 * ⚠️ GUARDRAIL 1 NA RESPOSTA: permissão negada aqui **não** prova que as contas não
 * podem ser unidas — prova apenas que ESTE token não enxerga aquela conta. Por isso o
 * erro da Meta volta inteiro, rotulado como leitura que faltou, e nunca como veredito.
 *
 * Nada é alterado. Nenhum token aparece na resposta.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, badRequest, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { metaGraphUrl } from "@/services/whatsapp/metaFlag";
import { maskGraphResponse } from "@/services/whatsapp/providers/metaPayload";

async function graph(path: string, token: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(metaGraphUrl(path), { headers: { Authorization: `Bearer ${token}` } });
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  } catch (e) {
    return { error: { message: maskGraphResponse(e instanceof Error ? e.message : String(e)) } };
  }
}

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  try {
    const wabaId = req.nextUrl.searchParams.get("wabaId")?.trim();
    if (!wabaId || !/^\d{5,}$/.test(wabaId)) return badRequest("Informe wabaId (só dígitos).");

    // Qual credencial usar: a do restaurante pedido, ou a primeira que existir.
    const pedido = req.nextUrl.searchParams.get("restaurantId")?.trim();
    const alvo = pedido
      ? { restaurantId: pedido }
      : await prisma.metaWhatsAppConfig.findFirst({ select: { restaurantId: true } });
    if (!alvo) return badRequest("Nenhuma configuração de WhatsApp para emprestar credencial.");

    const cfg = await MetaConfigService.getResolved(alvo.restaurantId);
    if (!cfg) return badRequest("A configuração existe mas a credencial não abriu.");

    const waba = await graph(
      `${wabaId}?fields=id,name,account_review_status,business_verification_status,owner_business_info,on_behalf_of_business_info,timezone_id`,
      cfg.accessToken,
    );
    if (waba.error) {
      return ok({
        wabaId,
        usouCredencialDe: alvo.restaurantId,
        error: waba.error,
        leituraQueFaltou:
          "Este token não enxerga esta conta. Isso NÃO significa que as contas não podem ser unidas —"
          + " significa que falta uma credencial com alcance no portfólio (usuário de sistema do portfólio)"
          + " ou que a conta pertence a outro portfólio.",
      });
    }

    const phones = await graph(
      `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,status,platform_type,account_mode,code_verification_status,name_status,is_on_biz_app,quality_rating`,
      cfg.accessToken,
    );

    return ok({
      wabaId,
      usouCredencialDe: alvo.restaurantId,
      waba,
      phones: (phones as { data?: unknown[] }).data ?? [],
      phonesError: (phones as { error?: unknown }).error ?? null,
    });
  } catch (err) {
    console.error("[GET /api/admin/meta/waba-lookup]", err);
    return serverError();
  }
}
