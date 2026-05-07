"use client";

import { useState } from "react";

interface Props {
  orderId:       string;
  saiposSentAt:  string | null;
  saiposStatus:  string | null;
}

export function SaiposRetryButton({ orderId, saiposSentAt, saiposStatus }: Props) {
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<{ sent: boolean; message: string } | null>(null);

  const alreadySent = Boolean(saiposSentAt);

  const handleRetry = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch("/api/integrations/saipos/retry", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ orderId }),
      });
      const data = await res.json().catch(() => ({})) as { sent?: boolean; message?: string };
      setResult({ sent: Boolean(data.sent), message: data.message ?? "Erro desconhecido." });
    } catch {
      setResult({ sent: false, message: "Erro de rede ao tentar reenviar." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleRetry}
          disabled={loading || alreadySent}
          className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-40 transition"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
              Enviando…
            </span>
          ) : alreadySent ? "Já enviado" : "Reenviar para Saipos"}
        </button>

        {saiposStatus && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            saiposStatus === "SENT"
              ? "bg-green-100 text-green-700"
              : saiposStatus === "PENDING_SAIPOS_VALIDATION"
              ? "bg-amber-100 text-amber-700"
              : saiposStatus === "FAILED"
              ? "bg-red-100 text-red-600"
              : "bg-gray-100 text-gray-600"
          }`}>
            {saiposStatus === "PENDING_SAIPOS_VALIDATION" ? "Validação pendente" : saiposStatus}
          </span>
        )}
      </div>

      {result && (
        <p className={`text-xs font-medium ${result.sent ? "text-green-700" : "text-red-600"}`}>
          {result.sent ? "✓" : "⚠"} {result.message}
        </p>
      )}
    </div>
  );
}
