"use client";

import { useState } from "react";

interface Props {
  orderId:      string;
  saiposStatus: string | null;
}

export function SaiposManualButton({ orderId, saiposStatus }: Props) {
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<{ success: boolean; message: string } | null>(null);

  const alreadyManual = saiposStatus === "MANUALLY_REGISTERED";

  const handleMark = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch("/api/integrations/saipos/mark-manual", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ orderId }),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; message?: string; error?: string };
      if (res.ok && data.success) {
        setResult({ success: true, message: data.message ?? "Marcado como lançado manualmente." });
      } else {
        setResult({ success: false, message: data.error ?? data.message ?? "Erro ao marcar." });
      }
    } catch {
      setResult({ success: false, message: "Erro de rede." });
    } finally {
      setLoading(false);
    }
  };

  if (alreadyManual) {
    return (
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
        ✓ Lançado manualmente na Saipos
      </span>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleMark}
        disabled={loading}
        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40 transition"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-700 border-t-transparent" />
            Salvando…
          </span>
        ) : "Marcar como lançado manualmente"}
      </button>
      {result && (
        <p className={`text-xs font-medium ${result.success ? "text-green-700" : "text-red-600"}`}>
          {result.success ? "✓" : "⚠"} {result.message}
        </p>
      )}
    </div>
  );
}
