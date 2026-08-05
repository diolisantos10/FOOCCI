"use client";

/**
 * SupportTechChat — a aba "Ajuda técnica" do balãozinho. O lojista relata um
 * problema (texto ou voz) e o Agente de Suporte devolve um diagnóstico:
 * o que provavelmente está acontecendo, o próximo passo e se escala para humano.
 *
 * Shadow-safe: o endpoint (/api/support/tech) NUNCA executa remediação — só
 * diagnostica. Segue o DESIGN.md (laranja + tokens ink/muted/line, rounded-2xl).
 *
 * Microfone: usa o gancho único (`@/components/voice`). Esta tela tinha uma
 * implementação própria que mandava o áudio direto para /api/support/tech —
 * o relato saía sem a pessoa ler o que a máquina entendeu. Agora a fala vira
 * texto NO CAMPO e o lojista confere antes de pedir o diagnóstico.
 */

import { useState } from "react";
import { appendTranscript, useVoiceInput, VoiceButton, VoiceStatus } from "@/components/voice";
import { SendIcon } from "./icons";

interface Diagnosis {
  classification: "INCIDENT" | "NO_INCIDENT_DETECTED" | "NEEDS_MORE_INFO";
  suspectedSubsystem: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  explanation: string;
  proposedActionLabel: string | null;
  canExecuteNow: boolean;
  escalate: boolean;
  runbook: string[];
}

const SEVERITY_STYLE: Record<string, string> = {
  LOW: "bg-[#F4F4F2] text-ink2",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-amber-100 text-amber-800",
  CRITICAL: "bg-red-100 text-red-700",
};

const EXAMPLES = [
  "Os pedidos pararam de chegar no WhatsApp",
  "O sistema está fora do ar",
  "As campanhas não estão saindo",
];

export default function SupportTechChat() {
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const voice = useVoiceInput((text) => setReport((r) => appendTranscript(r, text)), {
    fileName: "relato.webm",
  });

  // Só texto sobe daqui: a voz já virou texto no campo e passou pelos olhos do
  // lojista. O endpoint continua aceitando áudio para quem o chama por outro caminho.
  async function diagnose(text: string) {
    setLoading(true); setErr(null); setDiag(null);
    try {
      const r = await fetch("/api/support/tech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: text }),
      });
      const j = (await r.json()) as { ok: boolean; diagnosis?: Diagnosis; error?: string };
      if (!r.ok || !j.ok || !j.diagnosis) { setErr(j.error ?? "Não consegui diagnosticar agora."); return; }
      setDiag(j.diagnosis);
    } catch {
      setErr("Falha de conexão — tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  const submitText = () => {
    const text = report.trim();
    if (!text || loading) return;
    void diagnose(text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        {/* Cabeçalho do agente */}
        <div className="rounded-2xl border border-line bg-paper p-3.5">
          <p className="text-[13.5px] font-semibold text-ink">🛠️ Assistência técnica</p>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">
            Descreva o problema (ou fale) que eu verifico os sinais do sistema, explico o que
            está acontecendo e digo o próximo passo. Um engenheiro de plantão, 24h.
          </p>
        </div>

        {/* Exemplos */}
        {!diag && !loading && (
          <div className="flex flex-col gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setReport(ex)}
                className="rounded-xl border border-line bg-paper px-3 py-2 text-left text-[12.5px] text-ink2 transition-colors hover:border-brand-200 hover:bg-brand-50"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="rounded-2xl border border-line bg-paper p-3.5 text-[12.5px] text-muted">
            Verificando os sinais do sistema…
          </div>
        )}

        {err && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-[12.5px] text-red-700">{err}</div>
        )}

        {/* Diagnóstico */}
        {diag && (
          <div className="rounded-2xl border border-brand-100 bg-brand-50 p-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-brand-600">Diagnóstico</span>
              {diag.severity && (
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${SEVERITY_STYLE[diag.severity]}`}>
                  {diag.severity}
                </span>
              )}
              {diag.suspectedSubsystem && (
                <span className="rounded-full bg-paper px-2 py-0.5 text-[10.5px] font-semibold text-ink2 border border-line">
                  {diag.suspectedSubsystem}
                </span>
              )}
            </div>

            <p className="mt-2 whitespace-pre-line text-[13px] leading-snug text-ink">{diag.explanation}</p>

            {diag.runbook.length > 0 && (
              <div className="mt-3 rounded-xl border border-line bg-paper px-3 py-2.5">
                <p className="text-[11px] font-semibold text-ink2">Passo a passo</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[11.5px] text-ink2">
                  {diag.runbook.map((step, i) => <li key={i}>{step}</li>)}
                </ol>
              </div>
            )}

            {diag.proposedActionLabel && (
              <p className="mt-2 text-[11.5px] text-ink2">
                Ação candidata: <span className="font-semibold">{diag.proposedActionLabel}</span>
                {!diag.canExecuteNow && " — em modo seguro (não executada automaticamente)."}
              </p>
            )}

            {diag.escalate && (
              <p className="mt-2 rounded-xl border border-line bg-paper px-3 py-2 text-[11.5px] text-ink2">
                🧑‍🔧 Vou deixar isto encaminhado para a equipe com o diagnóstico pronto.
              </p>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Campo de escrita — mesma peça do modo Assistente (consistência do DESIGN.md) */}
      <div className="shrink-0 border-t border-line bg-paper px-4 pb-3 pt-3 sm:px-5">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-line2 bg-canvas px-2 py-1.5 transition-colors focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
            <textarea
              value={report}
              onChange={(e) => setReport(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitText(); } }}
              rows={1}
              placeholder="Descreva o problema…"
              className="max-h-32 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[14px] leading-snug text-ink placeholder:text-muted focus:outline-none focus:!ring-0"
            />
            <VoiceButton voice={voice} label="Relatar o problema por voz" disabled={loading} />
            <button
              type="button"
              onClick={submitText}
              disabled={loading || !report.trim()}
              aria-label="Enviar relato"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 disabled:opacity-40 disabled:shadow-none"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
          <VoiceStatus voice={voice} />
          <p className="mt-2 text-center text-[11px] leading-snug text-muted">
            O diagnóstico é uma leitura dos sinais do sistema — nada é executado sem você.
          </p>
        </div>
      </div>
    </div>
  );
}
