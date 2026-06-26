"use client";

import { useState, useEffect, type FormEvent } from "react";
import { apiFetch, Feedback, SaveButton, Toggle, PageCard, SectionHeading } from "../_shared";

const METHODS = [
  {
    key: "acceptPix",
    icon: "⚡",
    label: "Pix",
    desc: "Transferência instantânea — recomendado para delivery",
  },
  {
    key: "acceptCash",
    icon: "💵",
    label: "Dinheiro",
    desc: "Pagamento em espécie na entrega ou retirada",
  },
  {
    key: "acceptCard",
    icon: "💳",
    label: "Cartão (maquininha)",
    desc: "Crédito ou débito com a maquininha na entrega",
  },
  {
    key: "acceptLink",
    icon: "🔗",
    label: "Link de pagamento",
    desc: "Cobranças online via link — requer integração",
  },
] as const;

type MethodKey = (typeof METHODS)[number]["key"];

export default function PaymentsPage() {
  const [form, setForm] = useState({
    acceptPix: true,
    acceptCash: true,
    acceptCard: true,
    acceptLink: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/payment").then(({ ok, data }) => {
      if (ok)
        setForm({
          acceptPix:  data.acceptPix  ?? true,
          acceptCash: data.acceptCash ?? true,
          acceptCard: data.acceptCard ?? true,
          acceptLink: data.acceptLink ?? false,
        });
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    const { ok, data } = await apiFetch("/api/settings/payment", "PUT", form);
    if (ok) setSuccess("Métodos de pagamento salvos.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  if (loading) return <p className="py-8 text-sm text-muted">Carregando…</p>;

  const activeCount = Object.values(form).filter(Boolean).length;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      <PageCard>
        <SectionHeading
          title="Métodos aceitos"
          subtitle={`${activeCount} método${activeCount !== 1 ? "s" : ""} habilitado${activeCount !== 1 ? "s" : ""}.`}
        />

        <div className="space-y-1">
          {METHODS.map(({ key, icon, label, desc }) => (
            <div
              key={key}
              className={`flex items-center gap-4 rounded-xl px-4 py-4 transition-colors ${
                form[key as MethodKey] ? "bg-brand-50" : "bg-[#FAFAF8]"
              }`}
            >
              <span className="text-2xl">{icon}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{label}</p>
                <p className="text-xs text-muted">{desc}</p>
              </div>
              <Toggle
                label=""
                checked={form[key as MethodKey]}
                onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
              />
            </div>
          ))}
        </div>
      </PageCard>

      {/* Info note — no marketing */}
      <div className="rounded-xl border border-line bg-paper px-4 py-3 text-xs text-muted">
        Configure o link de pagamento em <strong className="text-ink2">Integrações</strong> quando precisar cobrar online antes da entrega.
      </div>

      <SaveButton saving={saving} />
    </form>
  );
}
