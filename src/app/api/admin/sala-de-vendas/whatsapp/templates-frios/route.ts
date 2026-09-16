import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas, vePelaOperacaoToda, somenteLeitura } from "../../_guarda";
import { COLD_GREETING_TEMPLATES } from "@/services/sales/coldContactDiscovery";
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

function catalogo(meta: MetaTemplate[]) {
  const byName = new Map(meta.map(t => [t.name, t]));
  return COLD_GREETING_TEMPLATES.map(t => ({
    name: t.name,
    body: t.body,
    language: t.language,
    category: t.category,
    status: byName.get(t.name)?.status ?? "NOT_SUBMITTED",
    id: byName.get(t.name)?.id,
    rejected_reason: byName.get(t.name)?.rejected_reason,
  }));
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
    for (const template of COLD_GREETING_TEMPLATES) {
      const current = byName.get(template.name);
      if (current) { results.push({ name: template.name, action: "existing", id: current.id, status: current.status }); continue; }
      const components: Array<Record<string, unknown>> = [{ type: "BODY", text: template.body, ...(template.restaurantNameParam ? { example: { body_text: [["Restaurante Exemplo"]] } } : {}) }];
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
