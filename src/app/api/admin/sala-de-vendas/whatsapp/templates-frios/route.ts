import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas, vePelaOperacaoToda, somenteLeitura } from "../../_guarda";
import {
  credenciaisDaMeta,
  listarModelosNaMeta,
  catalogoCruzadoComAMeta,
  submeterCatalogoNaMeta,
} from "@/services/whatsapp/submeterCatalogo";
import { maskGraphResponse } from "@/services/whatsapp/providers/metaPayload";

export const dynamic = "force-dynamic";

/**
 * ⚠️ A MONTAGEM E A SUBMISSÃO NÃO MORAM MAIS AQUI — foram para
 * `services/whatsapp/submeterCatalogo.ts`, e esta rota passou a ser só o
 * PORTEIRO de sessão humana. O outro porteiro é a chave dedicada, em
 * `/api/admin/whatsapp/catalogo-de-modelos`. Um caminho de escrita, dois
 * porteiros: duplicar a montagem é como um modelo nasce com exemplo faltando
 * de um lado só, e a Meta só conta isso na hora do disparo.
 */

async function autorizar(req: NextRequest, acao: string, escrita = false) {
  const portao = await guardarSalaDeVendas(req, acao);
  if (!portao.ok) return { resposta: portao.resposta };
  if (!vePelaOperacaoToda(portao.sessao)) return { resposta: NextResponse.json({ ok: false, error: "Só quem enxerga a operação inteira gerencia os templates frios." }, { status: 403 }) };
  if (escrita && somenteLeitura(portao.sessao)) return { resposta: NextResponse.json({ ok: false, error: "O auditor lê e não escreve." }, { status: 403 }) };
  return { resposta: null };
}

export async function GET(req: NextRequest) {
  const auth = await autorizar(req, "ver_templates_frios_da_sala");
  if (auth.resposta) return auth.resposta;
  const cfg = credenciaisDaMeta();
  if (!cfg) return NextResponse.json({ ok: false, error: "Credenciais comerciais da Meta não configuradas." }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, templates: catalogoCruzadoComAMeta(await listarModelosNaMeta(cfg)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Falha ao consultar Meta." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizar(req, "submeter_templates_frios_da_sala", true);
  if (auth.resposta) return auth.resposta;
  const cfg = credenciaisDaMeta();
  if (!cfg) return NextResponse.json({ ok: false, error: "Credenciais comerciais da Meta não configuradas." }, { status: 503 });
  try {
    const results = await submeterCatalogoNaMeta(cfg);
    return NextResponse.json(
      { ok: results.every(r => r.action !== "failed"), results },
      { status: results.some(r => r.action === "failed") ? 502 : 200 },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) }, { status: 502 });
  }
}
