"use client";

import { useState } from "react";

/**
 * Re-sends an order's station tickets to the Carteiro (kitchen comandas + caixa
 * nota). For when paper ran out or the setup changed — distinct from the browser
 * "Imprimir" which prints to the OS default printer.
 */
export function ReprintButton({ orderId }: { orderId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function reprint() {
    setState("loading");
    setMsg(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/reprint`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        const n = data.data?.jobs ?? 0;
        setState("ok");
        setMsg(`Enviado para ${n} impressora(s)`);
      } else {
        setState("err");
        setMsg(data?.error ?? "Falha ao reimprimir.");
      }
    } catch {
      setState("err");
      setMsg("Falha de conexão.");
    }
    setTimeout(() => { setState("idle"); setMsg(null); }, 5000);
  }

  return (
    <div className="flex items-center gap-2">
      {msg && (
        <span className={`text-xs ${state === "err" ? "text-red-500" : "text-green-600"}`}>{msg}</span>
      )}
      <button
        type="button"
        onClick={reprint}
        disabled={state === "loading"}
        title="Reenviar a comanda da cozinha e a nota do caixa para as impressoras"
        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition"
      >
        {state === "loading" ? "Enviando…" : state === "ok" ? "Enviado ✓" : "🖨️ Reimprimir nas impressoras"}
      </button>
    </div>
  );
}
