"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length >= 10) return `+55${digits}`;
  return `+${digits}`;
}

const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TODAY = new Date().toISOString().slice(0, 10);

type FormState = {
  name:      string;
  phone:     string;
  email:     string;
  birthDate: string;
  notes:     string;
};

const EMPTY: FormState = { name: "", phone: "", email: "", birthDate: "", notes: "" };

export function NewCustomerButton({ onCreated }: { onCreated?: (id: string) => void } = {}) {
  const router   = useRouter();
  const nameRef  = useRef<HTMLInputElement>(null);
  const [open,    setOpen]    = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState("");
  const [form,    setForm]    = useState<FormState>(EMPTY);
  // createdId is set on success so we can show confirmation before acting
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Focus name field when modal opens
  useEffect(() => {
    if (open && !createdId) {
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open, createdId]);

  // After brief success display: navigate to profile OR call onCreated callback
  useEffect(() => {
    if (!createdId) return;
    const t = setTimeout(() => {
      if (onCreated) {
        onCreated(createdId);
        setOpen(false);
        reset();
      } else {
        router.push(`/customers/${createdId}`);
      }
    }, 1400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdId]);

  function patch(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function reset() {
    setForm(EMPTY);
    setError("");
    setCreatedId(null);
  }

  function close() {
    if (createdId) {
      if (onCreated) {
        onCreated(createdId);
        setOpen(false);
        reset();
      } else {
        router.push(`/customers/${createdId}`);
      }
      return;
    }
    setOpen(false);
    reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Client-side validation
    if (!form.name.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Informe um telefone válido.");
      return;
    }
    const phone = normalizePhone(form.phone.trim());
    if (!PHONE_RE.test(phone)) {
      setError("Informe um telefone válido. Ex: (11) 99999-0000");
      return;
    }
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }

    setBusy(true);
    try {
      const body: Record<string, string> = {
        name:  form.name.trim(),
        phone,
      };
      if (form.email.trim())     body.email     = form.email.trim();
      if (form.birthDate.trim()) body.birthDate = new Date(form.birthDate).toISOString();
      if (form.notes.trim())     body.notes     = form.notes.trim();

      const res  = await fetch("/api/customers", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError("Este cliente já existe na sua base.");
        } else {
          setError(json?.error ?? "Não foi possível criar o cliente agora.");
        }
        return;
      }

      // json = { success: true, data: Customer }
      setCreatedId(json.data?.id ?? null);
      if (!json.data?.id) {
        // Fallback: no id returned — refresh list and close
        setOpen(false);
        reset();
        router.refresh();
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition-colors"
      >
        <span className="text-base leading-none">+</span>
        Novo cliente
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={close} />

          {/* Modal panel */}
          <div className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-paper shadow-xl flex flex-col max-h-[90dvh]">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-base font-bold text-ink">Novo cliente</h2>
              <button
                onClick={close}
                className="text-muted hover:text-ink2 text-xl leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            {/* ── Success state ─────────────────────────────────────────── */}
            {createdId ? (
              <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl">
                  ✓
                </div>
                <div>
                  <p className="text-base font-bold text-ink">Cliente criado com sucesso.</p>
                  <p className="mt-1 text-sm text-muted">
                    {onCreated ? "Atualizando lista…" : "Redirecionando para o perfil…"}
                  </p>
                </div>
                {onCreated ? (
                  <button
                    onClick={() => { onCreated(createdId); setOpen(false); reset(); }}
                    className="rounded-lg bg-brand-500 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
                  >
                    Fechar
                  </button>
                ) : (
                  <button
                    onClick={() => router.push(`/customers/${createdId}`)}
                    className="rounded-lg bg-brand-500 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
                  >
                    Ver perfil agora
                  </button>
                )}
              </div>
            ) : (
              /* ── Form ─────────────────────────────────────────────────── */
              <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4">

                {/* Nome */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">
                    Nome <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={nameRef}
                    value={form.name}
                    onChange={patch("name")}
                    placeholder="Nome completo"
                    maxLength={100}
                    autoComplete="off"
                    className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>

                {/* Telefone */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">
                    Telefone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={patch("phone")}
                    placeholder="(11) 99999-0000"
                    autoComplete="off"
                    className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                  <p className="text-[11px] text-muted">
                    Aceita: 11999990000 · (11) 99999-0000 · +5511999990000
                  </p>
                </div>

                {/* E-mail */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">
                    E-mail{" "}
                    <span className="font-normal text-muted">(opcional)</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={patch("email")}
                    placeholder="email@exemplo.com"
                    autoComplete="off"
                    className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>

                {/* Data de nascimento */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">
                    Data de nascimento{" "}
                    <span className="font-normal text-muted">(opcional)</span>
                  </label>
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={patch("birthDate")}
                    max={TODAY}
                    className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>

                {/* Observações */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">
                    Observações{" "}
                    <span className="font-normal text-muted">(opcional)</span>
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={patch("notes")}
                    placeholder="Preferências, restrições alimentares…"
                    rows={3}
                    maxLength={1000}
                    className="w-full resize-none rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>

                {/* Error banner */}
                {error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                    {error}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1 pb-1">
                  <button
                    type="button"
                    onClick={close}
                    disabled={busy}
                    className="flex-1 rounded-lg border border-line2 px-4 py-2.5 text-sm font-medium text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !form.name.trim() || !form.phone.trim()}
                    className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 transition-colors"
                  >
                    {busy ? "Criando…" : "Criar cliente"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
