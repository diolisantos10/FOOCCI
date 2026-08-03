"use client";

/**
 * O bloco interativo do aceite: nome completo + botão. Os três estados
 * obrigatórios: enviando (botão trava), erro (mensagem com o motivo), sucesso
 * (próximo passo — pagar ou aguardar contato).
 */

import { useState } from "react";

export function AcceptClient({
  token,
  alreadyAccepted,
  paymentUrl,
}: {
  token: string;
  alreadyAccepted: boolean;
  paymentUrl: string | null;
}) {
  const [nome, setNome] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(alreadyAccepted ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(paymentUrl);

  async function accept() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/billing/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nome }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; paymentUrl?: string | null } | null;
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? "Não foi possível registrar o aceite. Tente de novo.");
        setState("error");
        return;
      }
      setPayUrl(body.paymentUrl ?? null);
      setState("done");
    } catch {
      setError("Falha de conexão. Verifique a internet e tente de novo.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-6 rounded-2xl border border-line bg-paper p-6 text-center">
        <div className="text-2xl">✅</div>
        <h2 className="mt-2 text-base font-semibold text-ink">Termo aceito</h2>
        {payUrl ? (
          <>
            <p className="mt-2 text-sm text-ink2">Falta só ativar a cobrança recorrente:</p>
            <a
              href={payUrl}
              className="mt-4 inline-block rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Ativar assinatura
            </a>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink2">
            Aceite registrado. A Foocci entra em contato pelo WhatsApp para combinar o pagamento e ativar sua conta.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-line bg-paper p-6">
      <label className="block text-sm font-semibold text-ink" htmlFor="nome">
        Seu nome completo (responsável pela contratação)
      </label>
      <input
        id="nome"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome e sobrenome"
        className="mt-2 w-full rounded-xl border border-line px-4 py-3 text-sm focus:border-brand-500 focus:outline-none"
      />
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <button
        onClick={accept}
        disabled={state === "sending" || nome.trim().length < 2}
        className="mt-4 w-full rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {state === "sending" ? "Registrando…" : "Li e aceito o Termo de Contratação"}
      </button>
      <p className="mt-3 text-center text-xs text-muted">
        O aceite registra data, hora, IP e a versão do Termo — vale como assinatura eletrônica.
      </p>
    </div>
  );
}
