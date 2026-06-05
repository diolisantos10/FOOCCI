"use client";

/**
 * Private preview gate — branded password screen shown by the /site layout when
 * the visitor has no valid preview cookie. Premium minimal: white background,
 * near-black text, orange CTA. Posts to the /site/acesso route handler and, on
 * success, reloads so the layout re-renders the real site.
 *
 * Never receives the password — only a `configured` flag from the server.
 */

import { useState } from "react";
import Image from "next/image";

export function PreviewGate({ configured, next = "/site" }: { configured: boolean; next?: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/site/acesso", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ password }),
      });
      if (res.ok) {
        window.location.assign(next);
        return;
      }
      setError(
        res.status === 503
          ? "Prévia ainda não configurada. Tente novamente em instantes."
          : "Senha incorreta. Verifique e tente novamente.",
      );
    } catch {
      setError("Não foi possível validar agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-5 py-16">
      <div className="w-full max-w-sm">
        {/* Mascot + wordmark */}
        <div className="mb-8 flex flex-col items-center">
          <span className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-50 ring-1 ring-gray-900/[0.03]">
            <Image src="/brand/foocci/foocci-mascot.png" alt="" aria-hidden width={196} height={321} className="h-16 w-auto" />
          </span>
          <span className="flex items-center gap-2.5">
            <Image src="/brand/foocci/foocci-wordmark.png" alt="Foocci" width={200} height={50} priority className="h-7 w-auto" />
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
              em breve
            </span>
          </span>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm ring-1 ring-gray-900/[0.03]">
          <h1 className="text-xl font-semibold tracking-tight text-[#0B0B0B]">
            Prévia privada da Foocci
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Este ambiente é uma prévia interna do site da Foocci em fase de pré-lançamento.
          </p>

          {configured ? (
            <form onSubmit={onSubmit} className="mt-6">
              <label htmlFor="preview-password" className="block text-sm font-medium text-gray-700">
                Senha de acesso
              </label>
              <input
                id="preview-password"
                name="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
                className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />

              {error && (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !password.trim()}
                className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-brand-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Validando…" : "Acessar prévia"}
              </button>
            </form>
          ) : (
            <div className="mt-6 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Prévia ainda não configurada. Defina a variável de ambiente
              <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-[12px] text-gray-700">
                MARKETING_PREVIEW_PASSWORD
              </code>
              para liberar o acesso.
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">Acesso restrito · Foocci</p>
      </div>
    </main>
  );
}
