"use client";

import { useRef, useState } from "react";

/**
 * CrmCampaignAI — o lojista descreve (texto ou voz) a campanha que quer, e a IA
 * monta o rascunho. Nada é criado sem ele confirmar. Segue o DESIGN.md.
 */

interface Draft {
  name: string;
  objective: string;
  targetSegment: string;
  messageTemplate: string;
  couponPercent: number | null;
  notes: string;
}

const SEGMENT_LABEL: Record<string, string> = {
  FRIO: "Clientes frios", MORNO: "Clientes mornos", QUENTE: "Clientes quentes",
  VIP: "VIPs", PRIMEIRO_PEDIDO: "1º pedido", RECORRENTE_SUMIDO: "Recorrentes sumidos", TODOS: "Todos",
};

export default function CrmCampaignAI({ onCreated }: { onCreated?: () => void }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<null | "draft" | "create" | "rec">(null);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const askDraft = async (body: BodyInit, isForm: boolean) => {
    setBusy("draft"); setErr(null); setOkMsg(null); setDraft(null);
    try {
      const r = await fetch("/api/crm/agent/draft-campaign", { method: "POST", body, ...(isForm ? {} : { headers: { "Content-Type": "application/json" } }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "não deu");
      if (typeof j.transcript === "string" && j.transcript && !text) setText(j.transcript);
      setDraft(j.draft as Draft);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não consegui montar. Tente reformular.");
    } finally {
      setBusy(null);
    }
  };

  const montarTexto = () => {
    if (!text.trim()) { setErr("Escreva ou fale o que você quer."); return; }
    void askDraft(JSON.stringify({ text: text.trim() }), false);
  };

  const startRec = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "pedido.webm");
        void askDraft(form, true);
      };
      recRef.current = mr;
      mr.start();
      setBusy("rec");
    } catch {
      setErr("Não consegui acessar o microfone.");
    }
  };

  const stopRec = () => { recRef.current?.stop(); recRef.current = null; setBusy(null); };

  const criar = async () => {
    if (!draft) return;
    setBusy("create"); setErr(null);
    try {
      const r = await fetch("/api/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          targetSegment: draft.targetSegment,
          messageTemplate: draft.messageTemplate,
          objective: draft.objective,
        }),
      });
      if (!r.ok) throw new Error("falha ao criar");
      setOkMsg("Campanha criada como rascunho! Você já pode revisar e ativar na lista abaixo.");
      setDraft(null); setText("");
      onCreated?.();
    } catch {
      setErr("Não consegui criar a campanha agora.");
    } finally {
      setBusy(null);
    }
  };

  const recording = busy === "rec";

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5">
      <div className="flex items-center gap-2">
        <span className="text-lg">✨</span>
        <p className="text-sm font-semibold text-ink">Criar campanha com IA</p>
      </div>
      <p className="mt-0.5 text-xs text-muted">Descreva (ou fale) o que você quer — ex.: “recuperar quem sumiu faz 30 dias com 10% de desconto” — e a IA monta pra você.</p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Escreva aqui a campanha que você quer…"
          className="flex-1 resize-none rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <div className="flex gap-2 sm:flex-col">
          <button
            type="button"
            onClick={recording ? stopRec : startRec}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-semibold transition-colors ${recording ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100" : "border-line2 bg-paper text-ink hover:bg-[#FAFAF8]"}`}
          >
            {recording ? "⏹ Parar" : "🎤 Falar"}
          </button>
          <button
            type="button"
            onClick={montarTexto}
            disabled={busy === "draft"}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand-500 bg-brand-500 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {busy === "draft" ? "Montando…" : "Montar"}
          </button>
        </div>
      </div>

      {recording && <p className="mt-2 text-xs text-red-600">🔴 Gravando… fale o que você quer e toque em “Parar”.</p>}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      {okMsg && <p className="mt-2 text-xs text-green-700">✓ {okMsg}</p>}

      {draft && (
        <div className="mt-3 rounded-xl border border-line bg-paper p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Rascunho da IA</p>
          <p className="mt-1 text-sm font-semibold text-ink">{draft.name}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-600">{SEGMENT_LABEL[draft.targetSegment] ?? draft.targetSegment}</span>
            <span className="inline-flex items-center rounded-full bg-[#F4F4F2] px-2.5 py-1 text-[11.5px] font-semibold text-ink2">{draft.objective}</span>
            {draft.couponPercent != null && (
              <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-[11.5px] font-semibold text-green-700">cupom {draft.couponPercent}%</span>
            )}
          </div>
          <p className="mt-2 rounded-lg border border-line bg-[#FAFAF8] px-3 py-2 text-xs text-ink2">{draft.messageTemplate}</p>
          {draft.couponPercent != null && (
            <p className="mt-1.5 text-[11px] text-muted">💡 Você pediu {draft.couponPercent}% de desconto — crie o cupom na aba de cupons e ligue na campanha.</p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-transparent px-3 py-2 text-[13px] font-semibold text-ink2 transition-colors hover:bg-[#F4F4F2]">Descartar</button>
            <button
              type="button"
              onClick={criar}
              disabled={busy === "create"}
              className="rounded-xl border border-brand-500 bg-brand-500 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {busy === "create" ? "Criando…" : "Criar campanha"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
