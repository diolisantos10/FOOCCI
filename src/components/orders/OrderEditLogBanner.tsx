"use client";

import { useState } from "react";

interface EditLog {
  id:              string;
  createdAt:       string;
  previousItemName: string;
  newItemName:     string;
  priceDiff:       number;
  newTotal:        number;
  reason:          string;
  paymentResolved: boolean;
}

interface Props {
  orderId: string;
  logs:    EditLog[];
}

const REASON_LABELS: Record<string, string> = {
  CLIENTE_PEDIU:        "Cliente pediu troca",
  PRODUTO_INDISPONIVEL: "Produto indisponível",
  ERRO_SABOR:           "Erro no sabor/produto",
  ERRO_OPERACIONAL:     "Erro operacional",
  OUTRO:                "Outro",
};

export function OrderEditLogBanner({ orderId, logs }: Props) {
  const [resolving, setResolving] = useState<string | null>(null);
  const [localResolved, setLocalResolved] = useState<Set<string>>(new Set());

  if (logs.length === 0) return null;

  const pendingLogs = logs.filter(
    (l) => Math.abs(l.priceDiff) >= 0.01 && !l.paymentResolved && !localResolved.has(l.id)
  );

  async function markResolved(logId: string) {
    setResolving(logId);
    try {
      const res = await fetch(`/api/orders/${orderId}/edit-log/${logId}/resolve-payment`, {
        method: "POST",
      });
      if (res.ok) {
        setLocalResolved((prev) => new Set([...prev, logId]));
      }
    } catch {
      // ignore
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-amber-800">Histórico de alterações</p>
      {logs.map((log) => {
        const resolved = log.paymentResolved || localResolved.has(log.id);
        return (
          <div key={log.id} className="text-sm space-y-1 border-t border-amber-100 pt-3 first:border-0 first:pt-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-amber-900">
                  <span className="line-through text-gray-500">{log.previousItemName}</span>
                  {" → "}
                  <span className="font-medium">{log.newItemName}</span>
                </p>
                <p className="text-xs text-amber-700">
                  {REASON_LABELS[log.reason] ?? log.reason} · {new Date(log.createdAt).toLocaleString("pt-BR")}
                </p>
                {Math.abs(log.priceDiff) >= 0.01 && (
                  <p className={`text-xs font-medium mt-0.5 ${log.priceDiff > 0 ? "text-orange-700" : "text-green-700"}`}>
                    {log.priceDiff > 0
                      ? `Ajuste de pagamento pendente: R$ ${log.priceDiff.toFixed(2)}`
                      : `Valor a devolver/absorver: R$ ${Math.abs(log.priceDiff).toFixed(2)}`}
                  </p>
                )}
              </div>
              {!resolved && Math.abs(log.priceDiff) >= 0.01 && (
                <button
                  onClick={() => markResolved(log.id)}
                  disabled={resolving === log.id}
                  className="shrink-0 rounded-lg border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition"
                >
                  {resolving === log.id ? "…" : "Marcar resolvido"}
                </button>
              )}
              {resolved && Math.abs(log.priceDiff) >= 0.01 && (
                <span className="shrink-0 text-xs text-green-600 font-medium">✓ Resolvido</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
