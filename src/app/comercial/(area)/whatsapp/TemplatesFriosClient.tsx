"use client";

import { useCallback, useEffect, useState } from "react";

type Template = { id?: string; name?: string; body?: string; status?: string; category?: string; language?: string; rejected_reason?: string };
type SubmitResult = { name: string; action: "submitted" | "existing" | "failed"; id?: string; status?: string; error?: string };

const LABEL: Record<string, string> = { APPROVED: "Aprovado", PENDING: "Em análise", REJECTED: "Rejeitado", PAUSED: "Pausado", DISABLED: "Desativado", NOT_SUBMITTED: "Ainda não submetido" };
const API = "/api/admin/sala-de-vendas/whatsapp/templates-frios";

export function TemplatesFriosClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<SubmitResult[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true); setMessage("");
    try {
      const res = await fetch(API, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Falha ao consultar a Meta.");
      setTemplates(json.templates || []);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao consultar a Meta."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submit() {
    setSubmitting(true); setMessage(""); setResults([]);
    try {
      const res = await fetch(API, { method: "POST" });
      const json = await res.json();
      setResults(json.results || []);
      if (!res.ok || !json.ok) throw new Error(json.error || "Um ou mais modelos não foram submetidos.");
      setMessage("Modelos enviados. A aprovação final é decidida pela Meta.");
      await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao submeter modelos."); }
    finally { setSubmitting(false); }
  }

  return (
    <section className="mt-5 rounded-2xl border border-line bg-paper p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">Templates da prospecção fria</h2>
          <p className="mt-1 max-w-[68ch] text-[12.5px] leading-relaxed text-muted">Confira exatamente os três textos antes de enviá-los para análise. Este botão não dispara mensagem para nenhum lead.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void refresh()} disabled={loading || submitting} className="rounded-full border border-line2 bg-paper px-3.5 py-1.5 text-[12.5px] font-medium text-ink2 hover:bg-chip disabled:opacity-50">Atualizar status</button>
          <button type="button" onClick={() => void submit()} disabled={loading || submitting || templates.length === 0} className="rounded-full bg-orange-600 px-3.5 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50">{submitting ? "Enviando…" : "Submeter à Meta"}</button>
        </div>
      </header>

      {message ? <p className="mt-3 text-[12.5px] text-amber-700">{message}</p> : null}
      {loading ? <p className="mt-3 text-[13px] text-muted">Consultando a Meta…</p> : templates.length === 0 ? <p className="mt-3 text-[13px] text-muted">Não foi possível carregar o catálogo oficial.</p> : (
        <ul className="mt-3.5 space-y-2">{templates.map(t => <li key={`${t.name}-${t.language}`} className="rounded-xl border border-line2 bg-canvas p-3"><div className="flex flex-wrap items-center gap-2"><span className="text-[13.5px] font-medium text-ink">{t.name}</span><span className="text-[11.5px] text-muted">{t.language || "—"}</span><span className="text-[11.5px] text-muted">· {t.category || "—"}</span><span className="rounded-full bg-chip px-2 py-[1px] text-[11px] text-ink2">{LABEL[String(t.status || "").toUpperCase()] || t.status || "—"}</span></div>{t.body ? <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink2">{t.body}</p> : null}{t.rejected_reason ? <p className="mt-1.5 text-[11.5px] text-red-600">{t.rejected_reason}</p> : null}</li>)}</ul>
      )}

      {results.length > 0 ? <div className="mt-3 border-t border-line pt-3"><p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">Última submissão</p><ul className="mt-2 space-y-1.5">{results.map(r => <li key={r.name} className="text-[12.5px] text-ink2"><strong className="font-medium">{r.name}</strong> — {r.action === "submitted" ? "Enviado" : r.action === "existing" ? "Já existia" : `Falhou: ${r.error || "erro da Meta"}`}{r.status ? ` · ${LABEL[r.status.toUpperCase()] || r.status}` : ""}</li>)}</ul></div> : null}
    </section>
  );
}
