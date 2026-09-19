/**
 * Meta Lead Ads — webhook `leadgen`. A URL que o CEO cola na tela
 * "Integração de leads" da Meta.
 *
 * GET  — devolve `hub.challenge` quando o verify token bate (a Meta faz isso
 *        uma vez, na hora de salvar a URL na tela dela).
 * POST — recebe o aviso de formulário preenchido, valida a assinatura, busca os
 *        dados na Graph e entrega o lead à porta única `importarMetaLead`.
 *
 * ── O QUE ISTO SUBSTITUI, E POR QUE ─────────────────────────────────────────
 * Hoje o lead do anúncio cai numa planilha do Google e espera alguém empurrar.
 * Foi assim que quatro leads quentes ficaram parados — um deles 36 horas. O
 * webhook entrega o lead no instante do envio do formulário; a planilha deixa
 * de ser o caminho e vira cópia de segurança (ver
 * `docs/integrations/meta-leads-webhook.md`).
 *
 * ── AS TRAVAS, E NENHUMA DELAS É AVISO ──────────────────────────────────────
 * · **Assinatura obrigatória**, comparação em tempo constante, com o MESMO
 *   validador do webhook do WhatsApp (`validateMetaSignature`).
 * · **Fail-closed**: sem `META_APP_SECRET` a rota responde 401 e NÃO processa.
 *   Aceitar corpo não assinado aqui deixaria qualquer um da internet fabricar
 *   lead — e lead fabricado é abordagem disparada para um número de terceiro.
 * · **200 rápido para a Meta**: ela desativa a inscrição de quem demora. Mas
 *   200 só é dado DEPOIS que cada `leadgen_id` está gravado — ou como lead, ou
 *   como pendente. Rápido, sim; esquecido, nunca.
 */

import { NextRequest, NextResponse } from "next/server";
import { MetaAppCredentialsService } from "@/services/meta/MetaAppCredentialsService";
import { verifyMetaChallenge, validateMetaSignature } from "@/services/whatsapp/providers/metaWebhook";
import { eventosLeadgen } from "@/services/meta-leads/leadgenWebhook";
import { receberEventoLeadgen } from "@/services/meta-leads/recepcaoDoLeadgen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const creds = await MetaAppCredentialsService.getResolved();
  const desafio = verifyMetaChallenge(
    { mode: sp.get("hub.mode"), token: sp.get("hub.verify_token"), challenge: sp.get("hub.challenge") },
    creds.webhookVerifyToken,
  );
  if (desafio != null) return new NextResponse(desafio, { status: 200 });
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const bruto = await req.text();

  const segredo = (await MetaAppCredentialsService.getResolved()).appSecret;
  if (!segredo) {
    console.error("[webhook/meta/leads] META_APP_SECRET ausente — recusando corpo não verificável (fail-closed)");
    return NextResponse.json({ ok: false, error: "webhook not configured" }, { status: 401 });
  }
  if (!validateMetaSignature(bruto, req.headers.get("x-hub-signature-256"), segredo)) {
    console.warn("[webhook/meta/leads] assinatura inválida — recusado");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(bruto); } catch { return NextResponse.json({ ok: true }, { status: 200 }); }

  const eventos = eventosLeadgen(payload);
  if (eventos.length === 0) return NextResponse.json({ ok: true, leads: 0 }, { status: 200 });

  let criados = 0;
  let pendentes = 0;
  for (const evento of eventos) {
    try {
      const r = await receberEventoLeadgen(evento);
      if (r.status === "pendente") {
        pendentes += 1;
        console.error(`[webhook/meta/leads] lead ${r.leadgenId} NÃO nasceu e ficou pendente: ${r.motivo}`);
      } else {
        if (r.status === "criado") criados += 1;
        console.info(`[webhook/meta/leads] leadgen ${r.leadgenId} → ${r.status}`);
      }
    } catch (err) {
      /* Uma exceção aqui já foi tratada lá dentro (o pendente é gravado antes de
       * qualquer retorno). Este catch existe para que um evento ruim não impeça
       * os OUTROS do mesmo envelope de serem processados. */
      pendentes += 1;
      console.error(`[webhook/meta/leads] erro inesperado no evento ${evento.leadgenId}`, err);
    }
  }

  return NextResponse.json({ ok: true, leads: eventos.length, criados, pendentes }, { status: 200 });
}
