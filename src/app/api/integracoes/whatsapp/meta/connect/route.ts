/**
 * POST /api/integracoes/whatsapp/meta/connect — finalize Meta Embedded Signup.
 *
 * Body: { code?, accessToken?, wabaId, phoneNumberId, displayPhoneNumber?, businessId?, configId? }
 * - The Embedded Signup SDK returns wabaId + phoneNumberId (message event) and a code
 *   (FB.login). We exchange the code for a server-side token, store everything
 *   encrypted, then health-check. Raw token never leaves the server.
 *
 * OWNER/MANAGER only. Does not switch the active provider — that is an explicit step.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { isMetaWhatsAppEnabled } from "@/services/whatsapp/metaFlag";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { exchangeCodeForToken, fetchPhoneDetails, inspectTokenExpiry, subscribeAppToWaba } from "@/services/whatsapp/MetaOnboardingService";
import { MetaWhatsAppCloudProvider } from "@/services/whatsapp/providers/MetaWhatsAppCloudProvider";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
  if (!isMetaWhatsAppEnabled()) return badRequest("Esta integração não está disponível no momento. Fale com o suporte Foocci.");

  try {
    const body = (await req.json().catch(() => ({}))) as {
      code?: string; accessToken?: string; wabaId?: string; phoneNumberId?: string;
      displayPhoneNumber?: string; businessId?: string; configId?: string; coexistence?: boolean;
    };
    if (!body.wabaId || !body.phoneNumberId) {
      return badRequest("Não foi possível identificar o número WhatsApp. Tente novamente ou fale com o suporte Foocci.");
    }

    let accessToken = body.accessToken;
    if (!accessToken && body.code) {
      const ex = await exchangeCodeForToken(body.code);
      if (!ex.ok) return badRequest(ex.error);
      accessToken = ex.accessToken;
    }
    if (!accessToken) return badRequest("Não foi possível obter a autorização da Meta. Tente novamente.");

    // Guard against a number already connected to ANOTHER restaurant (e.g. a stale
    // row after a merchant reconnected elsewhere). A unique constraint on
    // phoneNumberId would otherwise surface as an opaque 500 here.
    const owner = await MetaConfigService.getByPhoneNumberId(body.phoneNumberId);
    if (owner && owner.restaurantId !== ctx.restaurantId) {
      return badRequest("Este número de WhatsApp já está conectado em outra conta Foocci. Fale com o suporte Foocci para liberar.");
    }

    const details = await fetchPhoneDetails(accessToken, body.phoneNumberId);
    const { expiresAt } = await inspectTokenExpiry(accessToken);

    // ASSINAR O NOSSO APP NA WABA DO LOJISTA. Sem isto a Meta não entrega mensagem
    // nenhuma para nós — o número conecta, envia, e NUNCA recebe.
    //
    // 🔴 O RESULTADO ERA DESCARTADO. Estava assim:
    //     try { await subscribeAppToWaba(...) } catch { /* non-fatal */ }
    // e `subscribeAppToWaba` **não lança**: ela devolve `{ ok:false, error }`. O
    // `catch` não pegava nada e o `{ok:false}` ia para o lixo. Resultado para um
    // restaurante novo: a tela responde "conectado", o selo fica verde, e nenhuma
    // mensagem de cliente chega — sem erro, sem log, sem pista. É exatamente o mesmo
    // defeito que manteve o Instagram mudo por 22 dias, no canal que mais importa.
    //
    // Continua NÃO bloqueante (guardrail 5): as credenciais já estão salvas e a falha
    // é recuperável. O que muda é que ela passa a ser DITA — gravada no config e
    // devolvida na resposta.
    const sub = await subscribeAppToWaba(accessToken, body.wabaId).catch(
      (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "falha ao assinar a conta" }),
    );

    await MetaConfigService.upsert({
      restaurantId:       ctx.restaurantId,
      wabaId:             body.wabaId,
      phoneNumberId:      body.phoneNumberId,
      displayPhoneNumber: body.displayPhoneNumber ?? details.displayPhoneNumber,
      businessId:         body.businessId ?? null,
      configId:           body.configId ?? null,
      accessToken,
      tokenExpiresAt:     expiresAt,
      // Coexistence numbers are already registered on the phone — persist the flag so
      // the register endpoint refuses to evict them.
      coexistence:        body.coexistence === true,
    });

    // Best-effort health check — credentials are already saved. A transient failure
    // here must NOT block the success response; the UI reflects live status on reload.
    let healthOk = false;
    let healthDetail: string | null = null;
    try {
      const health = await new MetaWhatsAppCloudProvider().healthCheck(ctx.restaurantId);
      healthOk  = health.connected;
      healthDetail = health.detail ?? null;
    } catch { /* non-fatal */ }

    // A evidência tem de sobreviver ao deploy e chegar a quem pode agir. Sem assinatura
    // o canal está mudo, e "conectado" sozinho seria uma meia-verdade cara.
    if (!sub.ok) {
      await MetaConfigService.setHealth(ctx.restaurantId, {
        lastError:
          "O WhatsApp conectou, mas o Foocci não conseguiu se inscrever para RECEBER as mensagens"
          + ` — a Meta respondeu: "${sub.error ?? "motivo não informado"}".`
          + " Enviar funciona; receber, não. Reconecte ou fale com o suporte Foocci.",
      });
    }

    return ok({
      connected: true,
      healthCheckPassed: healthOk,
      healthDetail,
      // `inboundReady:false` = conectado para ENVIAR e mudo para RECEBER. Quem consome
      // esta resposta não pode tratar `connected:true` como "está tudo certo".
      inboundReady: sub.ok,
      inboundError: sub.ok ? null : (sub.error ?? "não foi possível assinar a conta na Meta"),
      meta: await MetaConfigService.getPublic(ctx.restaurantId),
    });
  } catch (err) {
    console.error("[POST meta/connect]", err);
    return serverError();
  }
}
