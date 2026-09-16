"use client";

import { useCallback, useEffect, useState } from "react";

type Template = { id?: string; name?: string; status?: string; category?: string; language?: string; rejected_reason?: string };
type SubmitResult = { name: string; action: "submitted" | "existing" | "failed"; id?: string; status?: string; error?: string };

const LABEL: Record<string, string> = { APPROVED: "Aprovado", PENDING: "Em análise", REJECTED: "Rejeitado", PAUSED: "Pausado", DISABLED: "Desativado" };

export default function MetaColdTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<SubmitResult[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/foocci-crm/meta-templates", { cache: "no-store" });
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
      const res = await fetch("/api/admin/foocci-crm/meta-templates", { method: "POST" });
      const json = await res.json();
      setResults(json.results || []);
      if (!res.ok || !json.ok) throw new Error(json.error || "Um ou mais modelos não foram submetidos.");
      setMessage("Modelos enviados. A aprovação final é decidida pela Meta.");
      await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao submeter modelos."); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">Sala Comercial · CRM</p>
        <h1 className="mt-1 text-3xl font-bold">Templates Meta — descoberta de contato</h1>
        <p className="mt-2 text-sm text-zinc-600">Submete apenas os modelos oficiais da prospecção fria. Esta tela não dispara mensagens para leads.</p>
      </div>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="font-semibold">Aprovação na Meta</h2><p className="text-sm text-zinc-500">A operação é idempotente: modelos existentes não são duplicados.</p></div>
          <div className="flex gap-2">
            <button onClick={() => void refresh()} disabled={loading || submitting} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">Atualizar status</button>
            <button onClick={() => void submit()} disabled={loading || submitting} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Enviando…" : "Submeter à Meta"}</button>
          </div>
        </div>
        {message && <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm">{message}</div>}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4"><h2 className="font-semibold">Status dos novos modelos</h2></div>
        {loading ? <p className="p-5 text-sm text-zinc-500">Consultando a Meta…</p> : templates.length === 0 ? <p className="p-5 text-sm text-zinc-500">Nenhum dos novos modelos foi encontrado na Meta ainda.</p> : (
          <div className="divide-y">{templates.map(t => <div key={`${t.name}-${t.language}`} className="grid gap-2 px-5 py-4 md:grid-cols-4"><div className="font-medium">{t.name}</div><div className="text-sm">{t.category || "—"}</div><div className="text-sm">{t.language || "—"}</div><div><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold">{LABEL[String(t.status || "").toUpperCase()] || t.status || "—"}</span>{t.rejected_reason && <p className="mt-2 text-xs text-red-600">{t.rejected_reason}</p>}</div></div>)}</div>
        )}
      </section>

      {results.length > 0 && <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold">Última submissão</h2><div className="space-y-2">{results.map(r => <div key={r.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-50 p-3 text-sm"><span className="font-medium">{r.name}</span><span>{r.action === "submitted" ? "Enviado" : r.action === "existing" ? "Já existia" : `Falhou: ${r.error || "erro da Meta"}`}{r.status ? ` · ${LABEL[r.status.toUpperCase()] || r.status}` : ""}</span></div>)}</div></section>}
    </main>
  );
}
