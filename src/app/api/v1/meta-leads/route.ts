import { NextRequest, NextResponse } from "next/server";
import { importarMetaLead, metaLeadSchema } from "@/services/meta-leads/importarMetaLead";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/meta-leads
 *
 * Entrada máquina-a-máquina dos leads do Meta Lead Ads.
 * `/api/v1/*` já é liberado pelo middleware para integrações externas; a
 * autenticação de verdade acontece AQUI, com um segredo exclusivo e fail-closed.
 *
 * ⚠️ A REGRA DE NASCIMENTO NÃO MORA MAIS AQUI. Ela foi para
 * `src/services/meta-leads/importarMetaLead.ts` em 18/09/2026, quando passaram a
 * existir três caminhos de entrada para o mesmo lead (este webhook, o comando de
 * resgate `/api/admin/meta-leads/backfill` e a sincronização da planilha do
 * Google). Três cópias da regra viram três verdades sobre a origem do lead, e a
 * que diverge é sempre a que ninguém lembra de atualizar. Esta rota agora só
 * autentica, valida a forma e entrega.
 */

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.FOOCCI_META_LEADS_KEY;
  if (!esperado) return false;
  return req.headers.get("x-foocci-integration-key") === esperado;
}

export async function POST(req: NextRequest) {
  if (!process.env.FOOCCI_META_LEADS_KEY) {
    console.error("[meta-leads] FOOCCI_META_LEADS_KEY não configurada");
    return NextResponse.json({ error: "Integração não configurada." }, { status: 503 });
  }

  if (!autorizado(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const bruto = await req.json().catch(() => null);
  const parsed = metaLeadSchema.safeParse(bruto);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload inválido." },
      { status: 400 },
    );
  }

  try {
    /* `exigirDataDeChegada: false` SÓ AQUI, e é uma escolha, não um descuido.
     * No webhook quem manda é a Meta, em tempo real: se o `created_time` vier
     * ilegível, recusar custaria o lead inteiro para ganhar precisão de
     * segundos. O retorno diz `dataAproximada: true` quando isso acontecer —
     * a aproximação é declarada, nunca silenciosa. Na planilha e no comando de
     * resgate, onde a data pode estar horas atrás, a exigência é o contrário. */
    const r = await importarMetaLead(parsed.data, { exigirDataDeChegada: false });

    if (r.status === "recusado") {
      return NextResponse.json({ error: r.motivo }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      leadId: r.leadId,
      codigo: r.codigo,
      stage: r.stage,
      fonte: r.fonte,
      deduplicated: r.status !== "criado",
      idempotentReplay: r.status === "jaExistia",
      promovidoDeContatoFrio: r.status === "promovido" ? r.virouLead : false,
    });
  } catch (error) {
    console.error("[meta-leads] falha ao importar lead:", error);
    return NextResponse.json(
      { error: "Falha ao registrar o lead no Foocci Comercial." },
      { status: 500 },
    );
  }
}
