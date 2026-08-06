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
 * receita do CRM. O **QR da mesa** segue pulável (quem já está sentado no salão
 * não deve ser barrado para ver o cardápio) e, desde 05/08, a **vitrine de
 * demonstração** também — ver `src/lib/identificacao-loja.ts`.
 *
 * ─── Quando é dispensável, é dispensável DE VERDADE ──────────────────────────
 * Com `required=false` o painel fecha pelos TRÊS gestos que qualquer pessoa já
 * tentou num modal: o "×", a tecla Esc e o toque fora. Antes só existia o link
 * "Pular identificação" no rodapé — Esc e clique fora não faziam nada, e o modal
 * que ignora Esc lê como tela travada, não como escolha. Os três caminhos chamam
 * o MESMO `onClose(null)`: uma saída só, três portas.
 *
 * Com `required=true` nada disso existe — nem o "×", nem o Esc, nem o clique
 * fora. A obrigatoriedade da Loja de cliente continua intacta.
 */

import { useEffect, useRef, useState, FormEvent } from "react";
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

  /** Dispensável = existe saída. Uma variável só, para os três gestos não divergirem. */
  const dispensavel = !required;

  /* O foco volta para o campo pendente quando o toque no botão não passa. */
  const campoRef = useRef<HTMLInputElement>(null);

  /* Esc fecha — a expectativa universal de modal. Não fecha durante o envio: a
     requisição de identificação já está a caminho e sumir com a tela no meio
     deixaria a pessoa sem saber se foi ou não. */
  useEffect(() => {
    if (!dispensavel) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose(null);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [dispensavel, loading, onClose]);

  async function handlePhoneSubmit(e: FormEvent) {
    e.preventDefault();
    const ph = phoneInput.trim();
    /* Botão HABILITADO + validação no toque (padrão da casa desde 05/08): no
       celular, botão desabilitado não tem como dizer o que falta. */
    if (ph.replace(/\D/g, "").length < 10) { setError("Informe um WhatsApp válido."); campoRef.current?.focus(); return; }
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
    if (name.length < 2) { setError("Informe seu nome."); campoRef.current?.focus(); return; }
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

  /* Foco = cor do RESTAURANTE, e com `!`: a regra base de `globals.css` tem sete
     `:not` (0,7,1) e ganha de qualquer `focus:border-*` de classe — o
     `focus:border-orange-400` daqui só funcionava por coincidir com ela, e numa
     loja white-label o laranja do painel não é a cor de ninguém. */
  const inputCls = "w-full rounded-xl border border-line2 bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:outline-none focus:!border-[var(--brand-primary)] focus:!ring-[color-mix(in_srgb,var(--brand-primary)_22%,white)] disabled:opacity-60";
  const btnCls   = "w-full rounded-xl py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50";

  return (
    /* ─── Por que o overlay rola ──────────────────────────────────────────────
     * `items-end`/`items-center` centraliza pelo EIXO, e quando o painel é mais
     * alto que a janela o excedente sai pelo TOPO — sem barra de rolagem, sem
     * gesto, inalcançável. Medido a 375px com o teclado aberto (janela de 283px,
     * painel de 376px): o topo ficava em **-93px**, levando junto o título, a
     * frase que explica o pedido de telefone e o próprio "×" que serve de saída.
     * `overflow-y-auto` no fundo + `max-h-full` no painel devolvem o topo. */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      /* Clique fora fecha — só onde há saída, e nunca no meio do envio. */
      onClick={dispensavel && !loading ? () => onClose(null) : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step === "phone" ? "Identificação rápida" : "Novo cadastro"}
        className="relative max-h-full w-full overflow-y-auto rounded-t-3xl bg-paper shadow-2xl sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A alcinha do topo é o gesto universal de "arraste para fechar". Numa
            tela que não fecha, ela promete uma saída que não existe. */}
        {dispensavel && (
          <div className="flex justify-center pt-3 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-line2" />
          </div>
        )}

        <div className="relative mx-6 mt-5 rounded-2xl px-5 py-4 text-white shadow-sm" style={{ backgroundColor: "var(--brand-primary)" }}>
          {/* O "×", dentro da faixa da marca. A alcinha acima só aparece no
              celular e é gesto, não botão — no computador não havia NADA visível
              dizendo que dava para sair. */}
          {dispensavel && (
            <button
              type="button"
              onClick={() => onClose(null)}
              disabled={loading}
              aria-label="Fechar e continuar sem se identificar"
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xl font-semibold leading-none text-white transition hover:bg-white/30 active:scale-95 disabled:opacity-40"
            >
              ×
            </button>
          )}
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
            {step === "phone" ? "Identificação rápida" : "Novo cadastro"}
          </p>
          <p className={`mt-0.5 text-base font-semibold leading-snug${dispensavel ? " pr-8" : ""}`}>
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
                <label className="mb-1.5 block text-xs font-semibold text-ink2">Seu WhatsApp</label>
                <input type="tel" inputMode="numeric" autoComplete="tel" ref={campoRef}
                  value={phoneInput} onChange={(e) => { setPhoneInput(e.target.value); setError(null); }}
                  placeholder="(11) 99999-9999" disabled={loading} style={{ fontSize: "16px" }} className={inputCls} />
              </div>
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className={btnCls}
                style={{ backgroundColor: "var(--brand-primary)" }}>
                {loading ? "Verificando…" : "Continuar →"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleNameSubmit} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink2">Seu nome</label>
                <input type="text" inputMode="text" autoCapitalize="words" autoFocus ref={campoRef}
                  value={nameInput} onChange={(e) => { setNameInput(e.target.value); setError(null); }}
                  placeholder="Ex: João Silva" disabled={loading} style={{ fontSize: "16px" }} className={inputCls} />
              </div>
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className={btnCls}
                style={{ backgroundColor: "var(--brand-primary)" }}>
                {loading ? "Salvando…" : "Continuar →"}
              </button>
            </form>
          )}
          {required ? (
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
              Usamos seu WhatsApp só para identificar o pedido e seus cupons.
            </p>
          ) : (
            <button type="button" onClick={() => onClose(null)}
              className="mt-3 w-full py-2 text-xs text-muted transition-colors hover:text-ink2">
              Pular identificação
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
