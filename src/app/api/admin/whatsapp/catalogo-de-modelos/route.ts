/**
 * POST /api/admin/whatsapp/catalogo-de-modelos  — submete o catálogo à Meta
 * GET  /api/admin/whatsapp/catalogo-de-modelos  — mostra catálogo × Meta
 *
 * ── POR QUE ESTA PORTA EXISTE ───────────────────────────────────────────────
 *
 * A rota logada (`/api/admin/sala-de-vendas/whatsapp/templates-frios`) exige o
 * cookie `foocci-internal-session`, e **nenhuma sala de agente tem login**. Foi
 * por isso que os quatro modelos do estágio 2 ficaram com situação `null`:
 * escritos, e nunca submetidos. O texto nunca foi o gargalo — a credencial era.
 *
 * ── SEGREDO PRÓPRIO, E POR QUE NÃO SE REUSA NENHUM ──────────────────────────
 *
 * `FOOCCI_WHATSAPP_TEMPLATES_KEY`, exclusiva. Não é `CRON_SECRET`, `ADMIN_SECRET`,
 * `RAIOX_*`, `CORRENTE_COMERCIAL_SECRET` nem `FOOCCI_META_LEADS_BACKFILL_KEY`.
 * Quem tem esta chave **cria modelo em nome da marca dentro da Meta** — texto
 * que sai para cliente com o nome do Foocci em cima. Poder assim não pega
 * carona em chave que existe para outra coisa (ADR-003).
 *
 * **Fail-closed:** chave não configurada = 503 e nada roda. Ausência de
 * configuração nunca é permissão.
 *
 * ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
 *
 * Não monta payload nenhum: chama `submeterCatalogoNaMeta`, a MESMA função da
 * rota logada. Um caminho de escrita para a Meta, dois porteiros.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  credenciaisDaMeta,
  listarModelosNaMeta,
  catalogoCruzadoComAMeta,
  submeterCatalogoNaMeta,
} from "@/services/whatsapp/submeterCatalogo";
import { maskGraphResponse } from "@/services/whatsapp/providers/metaPayload";
import { conferirChaveDoCatalogo } from "@/services/whatsapp/chaveDoCatalogo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const barrado = conferirChaveDoCatalogo(req);
  if (barrado) return barrado;
  const cfg = credenciaisDaMeta();
  if (!cfg) return NextResponse.json({ ok: false, error: "Credenciais comerciais da Meta não configuradas." }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, templates: catalogoCruzadoComAMeta(await listarModelosNaMeta(cfg)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const barrado = conferirChaveDoCatalogo(req);
  if (barrado) return barrado;
  const cfg = credenciaisDaMeta();
  if (!cfg) return NextResponse.json({ ok: false, error: "Credenciais comerciais da Meta não configuradas." }, { status: 503 });
  try {
    const results = await submeterCatalogoNaMeta(cfg);
    return NextResponse.json(
      {
        ok: results.every((r) => r.action !== "failed"),
        criados: results.filter((r) => r.action === "submitted"),
        jaExistiam: results.filter((r) => r.action === "existing"),
        recusados: results.filter((r) => r.action === "failed"),
        results,
      },
      { status: results.some((r) => r.action === "failed") ? 502 : 200 },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) }, { status: 502 });
  }
}
