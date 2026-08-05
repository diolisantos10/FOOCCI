"use client";

import { useState } from "react";
import { appendTranscript, useVoiceInput, VoiceButton, VoiceStatus } from "@/components/voice";

/**
 * CrmCampaignAI — o lojista descreve (texto ou voz) a campanha que quer, e a IA
 * monta o rascunho. Nada é criado sem ele confirmar. Segue o DESIGN.md.
 *
 * Microfone: gancho único (`@/components/voice`). Tinha implementação própria
 * que desenhava o botão mesmo em navegador sem microfone e mandava o áudio
 * direto para a IA. Agora a fala vira texto no campo e o lojista confere antes
 * de mandar montar.
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
  const [busy, setBusy] = useState<null | "draft" | "create">(null);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const voice = useVoiceInput((t) => setText((prev) => appendTranscript(prev, t)), {
    fileName: "campanha.webm",
  });

  const montarTexto = async () => {
    if (!text.trim()) { setErr("Escreva ou fale o que você quer."); return; }
    setBusy("draft"); setErr(null); setOkMsg(null); setDraft(null);
    try {
      const r = await fetch("/api/crm/agent/draft-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "não deu");
      setDraft(j.draft as Draft);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não consegui montar. Tente reformular.");
    } finally {
      setBusy(null);
    }
  };

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

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5">
      <div className="flex items-center gap-2">
        <span className="text-lg">✨</span>
        <p className="text-sm font-semibold text-ink">Criar campanha com IA</p>
      </div>
      <p className="mt-0.5 text-xs text-muted">Descreva (ou fale) o que você quer — ex.: “recuperar quem sumiu faz 30 dias com 10% de desconto” — e a IA monta pra você.</p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-end gap-1 rounded-xl border border-line2 bg-paper px-1.5 py-1 transition-colors focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Escreva aqui a campanha que você quer…"
            className="min-w-0 flex-1 resize-none border-0 bg-transparent px-1.5 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:!ring-0"
          />
          <VoiceButton voice={voice} label="Ditar a campanha por voz" disabled={busy === "draft"} />
        </div>
        <button
          type="button"
          onClick={() => void montarTexto()}
          disabled={busy === "draft"}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-brand-500 bg-brand-500 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 disabled:opacity-50 sm:self-start"
        >
          {busy === "draft" ? "Montando…" : "Montar"}
        </button>
      </div>

      <VoiceStatus voice={voice} />
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
