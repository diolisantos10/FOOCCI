import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../_guard";
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

export async function GET(req: NextRequest) {
  const bloqueio = guardAdmin(req);
  if (bloqueio) return bloqueio;
  const cfg = config();
  if (!cfg) return NextResponse.json({ ok: false, error: "Credenciais comerciais da Meta não configuradas." }, { status: 503 });
  try {
    const all = await listMetaTemplates(cfg);
    const names = new Set(COLD_GREETING_TEMPLATES.map(t => t.name));
    return NextResponse.json({ ok: true, templates: all.filter(t => t.name && names.has(t.name)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Falha ao consultar Meta." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const bloqueio = guardAdmin(req);
  if (bloqueio) return bloqueio;
  const cfg = config();
  if (!cfg) return NextResponse.json({ ok: false, error: "Credenciais comerciais da Meta não configuradas." }, { status: 503 });

  try {
    const existing = await listMetaTemplates(cfg);
    const byName = new Map(existing.map(t => [t.name, t]));
    const results: Array<{ name: string; action: "submitted" | "existing" | "failed"; id?: string; status?: string; error?: string }> = [];

    for (const template of COLD_GREETING_TEMPLATES) {
      const current = byName.get(template.name);
      if (current) {
        results.push({ name: template.name, action: "existing", id: current.id, status: current.status });
        continue;
      }
      const components: Array<Record<string, unknown>> = [{
        type: "BODY",
        text: template.body,
        ...(template.restaurantNameParam ? { example: { body_text: [["Restaurante Exemplo"]] } } : {}),
      }];
      const res = await fetch(metaGraphUrl(`${cfg.wabaId}/message_templates`), {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: template.name, language: template.language, category: template.category, components }),
      });
      const json = await res.json().catch(() => ({})) as { id?: unknown; status?: unknown; error?: { message?: string; error_user_msg?: string } };
      if (res.ok) {
        results.push({ name: template.name, action: "submitted", id: json.id == null ? undefined : String(json.id), status: json.status == null ? "PENDING" : String(json.status) });
      } else {
        results.push({ name: template.name, action: "failed", error: maskGraphResponse(json.error?.error_user_msg ?? json.error?.message ?? "Falha ao submeter modelo.") });
      }
    }
    return NextResponse.json({ ok: results.every(r => r.action !== "failed"), results }, { status: results.some(r => r.action === "failed") ? 502 : 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) }, { status: 502 });
  }
}
