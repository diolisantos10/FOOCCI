"use client";

import { useState, useEffect } from "react";

// ── Local type mirrors of ReviewRequestService / ReviewRequestSendService ──────

interface ReviewLink { platform: "GOOGLE" | "IFOOD"; url: string }
interface ReviewDecision {
  eligible: boolean;
  reasons: string[];
  blocks: string[];
  preferredPlatform: "GOOGLE" | "IFOOD" | null;
  preferredReviewLink: string | null;
  availableLinks: ReviewLink[];
  draftMessage: string | null;
  safetyDecision: { sendable: boolean; reason: string | null; detail?: string } | null;
}
interface ReviewSendResult {
  status: "sent" | "failed" | "skipped";
  platform: "GOOGLE" | "IFOOD" | null;
  reviewLink: string | null;
  messageText: string | null;
  blockReasons: string[];
  reasons: string[];
  error?: string;
}

// ── ReviewRequestModal ─────────────────────────────────────────────────────────
// Human-confirmed send modal.
// Opens for a specific customer, evaluates eligibility, lets the operator
// edit/confirm the message, and sends only on explicit "Confirmar e enviar".

export function ReviewRequestModal({
  customer,
  onClose,
}: {
  customer: { id: string; name: string; phone: string };
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [platform, setPlatform] = useState<"GOOGLE" | "IFOOD" | "AUTO">("AUTO");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReviewSendResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Load eligibility + draft on open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/crm/review-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: customer.id }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json?.error ?? "Não foi possível avaliar a elegibilidade.");
          return;
        }
        const d = json.data as ReviewDecision;
        setDecision(d);
        setMessage(d.draftMessage ?? "");
        setPlatform(d.preferredPlatform ?? "AUTO");
      } catch {
        if (!cancelled) setError("Erro de conexão.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customer.id]);

  const selectedLink =
    platform === "AUTO"
      ? decision?.preferredReviewLink ?? null
      : decision?.availableLinks.find((l) => l.platform === platform)?.url ?? null;

  const safetyOk = decision?.safetyDecision ? decision.safetyDecision.sendable : true;
  const linkMissing = !!message.trim() && !!selectedLink && !message.includes(selectedLink);
  const canSend =
    !loading && !sending && !!decision?.eligible && safetyOk && !!selectedLink &&
    !!message.trim() && !linkMissing && !result;

  async function confirmSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/review-request/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          platform,
          message: message.trim(),
          confirm: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json?.error ?? "Falha ao enviar.");
        return;
      }
      setResult(json.data as ReviewSendResult);
    } catch {
      setError("Erro de conexão ao enviar.");
    } finally {
      setSending(false);
    }
  }

  function copyMsg() {
    if (!message) return;
    void navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const blockers = decision?.eligible === false ? decision.reasons : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-paper p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-ink">⭐ Pedir avaliação</h3>
            <p className="text-xs text-muted">{customer.name} · {customer.phone}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink2 text-lg leading-none">×</button>
        </div>

        {loading && <div className="h-24 animate-pulse rounded-lg bg-[#F4F4F2]" />}
        {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        {!loading && result && (
          <div className={`rounded-xl border p-4 text-sm ${
            result.status === "sent" ? "border-green-200 bg-green-50 text-green-800"
            : result.status === "failed" ? "border-red-200 bg-red-50 text-red-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
          }`}>
            <p className="font-semibold">
              {result.status === "sent" ? "✅ Pedido de avaliação enviado!"
              : result.status === "failed" ? "❌ Falha no envio"
              : "⚠️ Envio não realizado"}
            </p>
            {result.status !== "sent" && (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {(result.blockReasons.length ? result.blockReasons : result.reasons).map((r, i) => <li key={i}>{r}</li>)}
                {result.error && <li>{result.error}</li>}
              </ul>
            )}
            <button onClick={onClose} className="mt-3 w-full rounded-lg bg-ink py-2 text-xs font-semibold text-white">
              Fechar
            </button>
          </div>
        )}

        {!loading && decision && !result && (
          <div className="space-y-3">
            {/* Eligibility + safety status */}
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                decision.eligible ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                {decision.eligible ? "Elegível" : "Bloqueado"}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                safetyOk ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                {safetyOk ? "Seguro" : "Bloqueio de segurança"}
              </span>
            </div>

            {blockers.length > 0 && (
              <ul className="list-disc pl-4 text-[11px] text-red-600">
                {blockers.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}

            {/* Platform selector — only configured links */}
            {decision.availableLinks.length > 0 && (
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted">Plataforma</label>
                <div className="mt-1 flex gap-2">
                  {decision.availableLinks.map((l) => (
                    <button
                      key={l.platform}
                      onClick={() => setPlatform(l.platform)}
                      className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                        (platform === l.platform || (platform === "AUTO" && decision.preferredPlatform === l.platform))
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-line2 text-ink2 hover:bg-[#FAFAF8]"
                      }`}
                    >
                      {l.platform === "GOOGLE" ? "Google" : "iFood"}
                    </button>
                  ))}
                </div>
                {selectedLink && (
                  <p className="mt-1 truncate text-[10px] text-muted">{selectedLink}</p>
                )}
              </div>
            )}

            {/* Editable message */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted">Mensagem</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-line2 p-2 text-xs text-ink focus:border-brand-400 focus:outline-none"
              />
              {linkMissing && (
                <p className="text-[10px] text-red-600">A mensagem precisa conter o link de avaliação.</p>
              )}
              <button onClick={copyMsg} className="mt-1 rounded-md border border-line2 px-2 py-1 text-[10px] font-semibold text-ink2 hover:bg-[#FAFAF8]">
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={confirmSend}
                disabled={!canSend}
                className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
              >
                {sending ? "Enviando…" : "Confirmar e enviar"}
              </button>
              <button onClick={onClose} className="rounded-lg border border-line2 px-4 py-2 text-xs font-semibold text-ink2 hover:bg-[#FAFAF8]">
                Cancelar
              </button>
            </div>
            <p className="text-[10px] text-muted">O envio só acontece após sua confirmação. Nenhum envio automático.</p>
          </div>
        )}
      </div>
    </div>
  );
}
