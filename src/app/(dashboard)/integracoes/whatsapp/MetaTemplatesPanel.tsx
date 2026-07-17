"use client";

/**
 * MetaTemplatesPanel — manage the Meta message templates used for CRM campaigns.
 *
 * Shown only when the official Meta WhatsApp is connected. Marketing to cold audiences
 * (outside the 24h window) REQUIRES an approved template, so the owner can:
 *   1. "Sincronizar" — pull templates + approval status from Meta.
 *   2. Map each approved template to a campaign type, so CRM campaigns of that type
 *      send through it automatically. No tokens or technical IDs are ever shown.
 */

import { useCallback, useEffect, useState } from "react";

interface MetaTemplate {
  id:                 string;
  templateName:       string;
  languageCode:       string;
  category:           string;
  status:             string;
  bodyVariables:      number;
  mappedCampaignType: string | null;
}

// CRM objectives a template can fulfil (mirrors Campaign.objective).
const CRM_OBJECTIVES: Array<{ value: string; label: string }> = [
  { value: "",          label: "— não usar em campanha —" },
  { value: "RECUPERAR", label: "Recuperar clientes sumidos" },
  { value: "RECOMPRA",  label: "Recompra" },
  { value: "TICKET",    label: "Aumentar ticket" },
  { value: "BEBIDA",    label: "Bebidas" },
  { value: "SOBREMESA", label: "Sobremesas" },
  { value: "AVALIACAO", label: "Pedir avaliação" },
  { value: "VIP",       label: "VIP" },
  { value: "OUTRO",     label: "Outro" },
];

function statusStyle(status: string): { label: string; cls: string } {
  switch (status) {
    case "APPROVED": return { label: "Aprovado",  cls: "bg-green-50 text-green-700" };
    case "PENDING":  return { label: "Em análise", cls: "bg-amber-50 text-amber-700" };
    case "REJECTED": return { label: "Rejeitado", cls: "bg-red-50 text-red-600" };
    default:         return { label: "Inativo",   cls: "bg-[#F4F4F2] text-muted" };
  }
}

export function MetaTemplatesPanel() {
  const [templates, setTemplates] = useState<MetaTemplate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };

  const load = useCallback(() => {
    fetch("/api/integracoes/whatsapp/meta/templates")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => setTemplates((j.data?.templates ?? []) as MetaTemplate[]))
      .catch(() => setTemplates([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function sync() {
    setBusy("sync");
    try {
      const res = await fetch("/api/integracoes/whatsapp/meta/templates", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setTemplates((j.data?.templates ?? []) as MetaTemplate[]);
        flash(true, `Modelos sincronizados (${j.data?.synced ?? 0}).`);
      } else {
        flash(false, j?.error ?? "Não foi possível sincronizar os modelos.");
      }
    } catch { flash(false, "Sem conexão. Tente novamente."); }
    finally { setBusy(null); }
  }

  async function createDefaults() {
    setBusy("create");
    try {
      const res = await fetch("/api/integracoes/whatsapp/meta/templates", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-defaults" }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setTemplates((j.data?.templates ?? []) as MetaTemplate[]);
        const created = j.data?.created ?? 0;
        const existed = j.data?.existed ?? 0;
        const failed  = j.data?.failed ?? 0;
        const parts = [
          created > 0 ? `${created} enviado${created === 1 ? "" : "s"} para análise` : null,
          existed > 0 ? `${existed} já existia${existed === 1 ? "" : "m"}` : null,
          failed  > 0 ? `${failed} com erro` : null,
        ].filter(Boolean);
        flash(failed === 0, parts.length ? parts.join(" · ") : "Nenhum modelo criado.");
      } else {
        flash(false, j?.error ?? "Não foi possível criar os modelos.");
      }
    } catch { flash(false, "Sem conexão. Tente novamente."); }
    finally { setBusy(null); }
  }

  async function map(t: MetaTemplate, value: string) {
    setBusy(t.id);
    try {
      const res = await fetch("/api/integracoes/whatsapp/meta/templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "map", templateName: t.templateName, languageCode: t.languageCode, mappedCampaignType: value || null }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) { setTemplates((j.data?.templates ?? []) as MetaTemplate[]); }
      else flash(false, j?.error ?? "Não foi possível salvar.");
    } catch { flash(false, "Sem conexão."); }
    finally { setBusy(null); }
  }

  if (templates === null) return null;

  return (
    <div className="mt-3 rounded-lg border border-line2 bg-[#FAFAF8]/60 px-3 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-ink">Modelos de mensagem (campanhas)</p>
          <p className="text-[11px] text-muted">
            Para enviar campanhas pelo WhatsApp oficial, a Meta exige modelos aprovados. Sincronize e indique
            em qual tipo de campanha cada modelo deve ser usado.
          </p>
        </div>
        <div className="ml-3 flex flex-shrink-0 items-center gap-2">
          <button type="button" disabled={busy !== null} onClick={createDefaults}
            className="rounded-lg bg-ink px-3 py-1.5 text-[11px] font-semibold text-paper hover:opacity-90 disabled:opacity-50">
            {busy === "create" ? "Criando…" : "Criar modelos automaticamente"}
          </button>
          <button type="button" disabled={busy !== null} onClick={sync}
            className="rounded-lg border border-line2 bg-paper px-3 py-1.5 text-[11px] font-semibold text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50">
            {busy === "sync" ? "Sincronizando…" : "Sincronizar"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted">
        <strong className="font-semibold text-ink2">Criar modelos automaticamente</strong> pega as suas campanhas
        ativas e envia cada mensagem para análise da Meta, já no formato certo. A Meta revisa (de minutos a 24h);
        depois é só usar nas campanhas.
      </p>

      {msg && (
        <div className={`mt-2 rounded-md px-2.5 py-1.5 text-[11px] ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</div>
      )}

      {templates.length === 0 ? (
        <p className="mt-3 text-[11px] text-muted">
          Nenhum modelo ainda. Clique em “Criar modelos automaticamente” para enviar as suas campanhas ativas
          para análise da Meta — ou crie manualmente no painel da Meta e clique em “Sincronizar”.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {templates.map((t) => {
            const st = statusStyle(t.status);
            return (
              <li key={t.id} className="rounded-lg border border-line2 bg-paper px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink">{t.templateName}</p>
                    <p className="text-[10px] text-muted">
                      {t.languageCode} · {t.bodyVariables} variáve{t.bodyVariables === 1 ? "l" : "is"}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                {t.status === "APPROVED" && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-muted">Usar em:</span>
                    <select
                      value={t.mappedCampaignType ?? ""}
                      disabled={busy === t.id}
                      onChange={(e) => map(t, e.target.value)}
                      className="flex-1 rounded-md border border-line2 bg-paper px-2 py-1 text-[11px] disabled:opacity-50"
                    >
                      {CRM_OBJECTIVES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
