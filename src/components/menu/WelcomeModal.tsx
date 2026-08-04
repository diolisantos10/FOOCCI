"use client";

/**
 * WelcomeModal — identificação por telefone na entrada do cardápio.
 * Movido verbatim de src/app/qr/[slug]/QRMenuClient.tsx; usado pelo QR (mesa)
 * e pela Loja (/pedido sem IA). Ambos falam com /api/qr/[slug]/identify e
 * gravam o MESMO sessionStorage `foocci-customer-<slug>` — assim a identidade
 * atravessa as duas superfícies na mesma sessão.
 *
 * Passo 1 = só o WhatsApp; passo 2 = nome (apenas cliente novo).
 *
 * `required` define se dá para entrar sem se identificar (decisão do CEO em
 * 04/08): na **Loja** e no **chat com IA** a identificação é obrigatória — é ali
 * que nasce pedido, cupom e histórico, e cliente anônimo quebra a atribuição de
 * receita do CRM. Só o **QR da mesa** segue pulável: quem já está sentado no
 * salão não deve ser barrado para ver o cardápio.
 */

import { useState, FormEvent } from "react";
import { fmtPhone } from "./format";
import type { CustomerIdentity } from "./types";

export function WelcomeModal({
  slug,
  onClose,
  required = false,
}: {
  slug: string;
  /** Recebe `null` só quando o cliente pula — impossível com `required`. */
  onClose: (identity: CustomerIdentity | null) => void;
  /** Sem saída: esconde o "Pular identificação". Padrão: pulável (mesa). */
  required?: boolean;
}) {
  const [step,           setStep]           = useState<"phone" | "name">("phone");
  const [phoneInput,     setPhoneInput]     = useState("");
  const [nameInput,      setNameInput]      = useState("");
  const [collectedPhone, setCollectedPhone] = useState("");
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  async function handlePhoneSubmit(e: FormEvent) {
    e.preventDefault();
    const ph = phoneInput.trim();
    if (ph.replace(/\D/g, "").length < 10) { setError("Informe um WhatsApp válido."); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/qr/${slug}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: ph }),
      });
      const data: { found: boolean; name?: string; customerId?: string } = await res.json();
      const displayPh = fmtPhone(ph);
      if (data.found && data.name) {
        // Existing customer — no name needed
        try {
          sessionStorage.setItem(`foocci-customer-${slug}`,
            JSON.stringify({ phone: ph, name: data.name, customerId: data.customerId, displayPhone: displayPh }));
        } catch { /* ignore */ }
        onClose({ name: data.name, displayPhone: displayPh, phone: ph, customerId: data.customerId });
      } else {
        setCollectedPhone(ph);
        setStep("name");
      }
    } catch { setError("Erro ao verificar. Tente novamente."); }
    finally    { setLoading(false); }
  }

  async function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (name.length < 2) { setError("Informe seu nome."); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/qr/${slug}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: collectedPhone, name }),
      });
      const data: { found: boolean; name?: string; customerId?: string } = await res.json();
      const firstName  = data.name ?? name.split(/\s+/)[0]!;
      const displayPh  = fmtPhone(collectedPhone);
      try {
        sessionStorage.setItem(`foocci-customer-${slug}`,
          JSON.stringify({ phone: collectedPhone, name: firstName, customerId: data.customerId, displayPhone: displayPh }));
      } catch { /* ignore */ }
      onClose({ name: firstName, displayPhone: displayPh, phone: collectedPhone, customerId: data.customerId });
    } catch { setError("Erro ao salvar. Tente novamente."); }
    finally    { setLoading(false); }
  }

  const inputCls = "w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:opacity-60";
  const btnCls   = "w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* A alcinha do topo é o gesto universal de "arraste para fechar". Numa
            tela que não fecha, ela promete uma saída que não existe. */}
        {!required && (
          <div className="flex justify-center pt-3 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-gray-200" />
          </div>
        )}

        <div className="mx-6 mt-5 rounded-2xl px-5 py-4 text-white shadow-sm" style={{ backgroundColor: "var(--brand-primary)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
            {step === "phone" ? "Identificação rápida" : "Novo cadastro"}
          </p>
          <p className="mt-0.5 text-base font-bold leading-snug">
            {step === "phone"
              ? required
                // Sem saída: o texto diz o porquê. "Informe seu WhatsApp" sem
                // motivo, numa tela que não fecha, lê como cobrança de dado.
                ? "Pra fazer seu pedido, informe seu WhatsApp. 📱"
                : "Pra personalizar seu atendimento, informe seu WhatsApp. 📱"
              : "Como podemos te chamar? 😊"}
          </p>
        </div>

        <div className="px-6 pb-7 pt-5">
          {step === "phone" ? (
            <form onSubmit={handlePhoneSubmit} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Seu WhatsApp</label>
                <input type="tel" inputMode="numeric" autoComplete="tel"
                  value={phoneInput} onChange={(e) => { setPhoneInput(e.target.value); setError(null); }}
                  placeholder="(11) 99999-9999" disabled={loading} style={{ fontSize: "16px" }} className={inputCls} />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={!phoneInput.trim() || loading} className={btnCls}
                style={{ backgroundColor: "var(--brand-primary)" }}>
                {loading ? "Verificando…" : "Continuar →"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleNameSubmit} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Seu nome</label>
                <input type="text" inputMode="text" autoCapitalize="words" autoFocus
                  value={nameInput} onChange={(e) => { setNameInput(e.target.value); setError(null); }}
                  placeholder="Ex: João Silva" disabled={loading} style={{ fontSize: "16px" }} className={inputCls} />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={!nameInput.trim() || loading} className={btnCls}
                style={{ backgroundColor: "var(--brand-primary)" }}>
                {loading ? "Salvando…" : "Continuar →"}
              </button>
            </form>
          )}
          {required ? (
            <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-400">
              Usamos seu WhatsApp só para identificar o pedido e seus cupons.
            </p>
          ) : (
            <button type="button" onClick={() => onClose(null)}
              className="mt-3 w-full py-2 text-xs text-gray-400 transition-colors hover:text-gray-600">
              Pular identificação
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
