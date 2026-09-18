import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas, vePelaOperacaoToda, somenteLeitura } from "../../_guarda";
import { COLD_GREETING_TEMPLATES } from "@/services/sales/coldContactDiscovery";
import { ESTAGIO_2_TEMPLATES, exemplosNaOrdem } from "@/services/sales/estagio2Templates";
import { metaGraphUrl } from "@/services/whatsapp/metaFlag";
import { maskGraphResponse } from "@/services/whatsapp/providers/metaPayload";

export const dynamic = "force-dynamic";

type MetaTemplate = { id?: string; name?: string; status?: string; category?: string; language?: string; rejected_reason?: string };

function config() {
  const wabaId = process.env.FOOCCI_SALES_WABA_ID?.trim();
  const accessToken = process.env.FOOCCI_SALES_ACCESS_TOKEN?.trim();
  return wabaId && accessToken ? { wabaId, accessToken } : null;
}

async function listMetaTemplates(cfg: { wabaId: string; accessToken: string }) {
  const url = `${metaGraphUrl(`${cfg.wabaId}/message_templates`)}?fields=id,name,status,category,language,rejected_reason&limit=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.accessToken}` }, cache: "no-store" });
  const json = await res.json().catch(() => ({})) as { data?: MetaTemplate[]; error?: { message?: string } };
  if (!res.ok) throw new Error(maskGraphResponse(json.error?.message ?? "Falha ao consultar modelos na Meta."));
  return json.data ?? [];
}

/**
 * O CATÁLOGO DA CASA CRUZADO COM O QUE A META TEM.
 *
 * Os dois estágios saem na mesma lista, marcados: o estágio 1 é o número frio
 * (três textos curtos que atravessam o porteiro), o estágio 2 é a conversa nova
 * com quem decide. `status: "NOT_SUBMITTED"` significa que a casa tem o texto e
 * a Meta ainda não — e isso NÃO é "reprovado": é "nunca enviado".
 */
function catalogo(meta: MetaTemplate[]) {
  const byName = new Map(meta.map(t => [t.name, t]));
  const daMeta = (nome: string) => ({
    status: byName.get(nome)?.status ?? "NOT_SUBMITTED",
    id: byName.get(nome)?.id,
    rejected_reason: byName.get(nome)?.rejected_reason,
  });
  return [
    ...COLD_GREETING_TEMPLATES.map(t => ({
      estagio: 1 as const,
      name: t.name,
      body: t.body,
      language: t.language,
      category: t.category,
      variaveis: t.restaurantNameParam ? 1 : 0,
      ...daMeta(t.name),
    })),
    ...ESTAGIO_2_TEMPLATES.map(m => ({
      estagio: 2 as const,
      name: m.name,
      body: m.body,
      language: m.language,
      category: m.category,
      variaveis: m.variaveis.length,
      ...daMeta(m.name),
    })),
  ];
}

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
  const cfg = config();
  if (!cfg) return NextResponse.json({ ok: false, error: "Credenciais comerciais da Meta não configuradas." }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, templates: catalogo(await listMetaTemplates(cfg)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Falha ao consultar Meta." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizar(req, "submeter_templates_frios_da_sala", true);
  if (auth.resposta) return auth.resposta;
  const cfg = config();
  if (!cfg) return NextResponse.json({ ok: false, error: "Credenciais comerciais da Meta não configuradas." }, { status: 503 });
  try {
    const existing = await listMetaTemplates(cfg);
    const byName = new Map(existing.map(t => [t.name, t]));
    const results: Array<{ name: string; action: "submitted" | "existing" | "failed"; id?: string; status?: string; error?: string }> = [];
    /**
     * ⚠️ UM SÓ CAMINHO DE ESCRITA PARA A META, e ele é este.
     *
     * Os dois estágios são submetidos pelo MESMO laço de propósito: um segundo
     * caminho de criação é como um modelo nasce com exemplo faltando num lado e
     * não no outro — e a Meta só conta isso na hora do disparo.
     */
    const aSubmeter: Array<{ name: string; language: string; category: string; text: string; examples: string[] }> = [
      ...COLD_GREETING_TEMPLATES.map(t => ({
        name: t.name,
        language: t.language,
        category: t.category as string,
        text: t.body,
        examples: t.restaurantNameParam ? ["Restaurante Exemplo"] : [],
      })),
      ...ESTAGIO_2_TEMPLATES.map(m => ({
        name: m.name,
        language: m.language,
        category: m.category as string,
        text: m.body,
        examples: exemplosNaOrdem(m),
      })),
    ];

    for (const template of aSubmeter) {
      const current = byName.get(template.name);
      if (current) { results.push({ name: template.name, action: "existing", id: current.id, status: current.status }); continue; }
      const components: Array<Record<string, unknown>> = [{ type: "BODY", text: template.text, ...(template.examples.length ? { example: { body_text: [template.examples] } } : {}) }];
      const res = await fetch(metaGraphUrl(`${cfg.wabaId}/message_templates`), { method: "POST", headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: template.name, language: template.language, category: template.category, components }) });
      const json = await res.json().catch(() => ({})) as { id?: unknown; status?: unknown; error?: { message?: string; error_user_msg?: string } };
      if (res.ok) results.push({ name: template.name, action: "submitted", id: json.id == null ? undefined : String(json.id), status: json.status == null ? "PENDING" : String(json.status) });
      else results.push({ name: template.name, action: "failed", error: maskGraphResponse(json.error?.error_user_msg ?? json.error?.message ?? "Falha ao submeter modelo.") });
    }
    return NextResponse.json({ ok: results.every(r => r.action !== "failed"), results }, { status: results.some(r => r.action === "failed") ? 502 : 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) }, { status: 502 });
  }
}
