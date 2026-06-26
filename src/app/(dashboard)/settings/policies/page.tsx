"use client";

import { useState, useEffect, type FormEvent } from "react";
import { apiFetch, Field, INPUT, Feedback, SaveButton, PageCard, SectionHeading } from "../_shared";

const FIELDS = [
  {
    key: "termsOfUse",
    label: "Termos de uso",
    placeholder: "Descreva os termos e condições do seu restaurante…",
  },
  {
    key: "privacyPolicy",
    label: "Política de privacidade",
    placeholder: "Como coletamos, usamos e protegemos os dados dos clientes…",
  },
  {
    key: "cancellationPolicy",
    label: "Política de cancelamento",
    placeholder: "Prazo para cancelamento, condições de reembolso…",
  },
] as const;

type PolicyKey = (typeof FIELDS)[number]["key"];

export default function PoliciesPage() {
  const [form, setForm] = useState({
    termsOfUse: "",
    privacyPolicy: "",
    cancellationPolicy: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/policies").then(({ ok, data }) => {
      if (ok)
        setForm({
          termsOfUse:         data.termsOfUse         ?? "",
          privacyPolicy:      data.privacyPolicy       ?? "",
          cancellationPolicy: data.cancellationPolicy  ?? "",
        });
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    const { ok, data } = await apiFetch("/api/settings/policies", "PUT", {
      termsOfUse:         form.termsOfUse         || null,
      privacyPolicy:      form.privacyPolicy       || null,
      cancellationPolicy: form.cancellationPolicy  || null,
    });
    if (ok) setSuccess("Políticas salvas com sucesso.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  if (loading) return <p className="py-8 text-sm text-muted">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      <PageCard>
        <SectionHeading
          title="Documentos legais"
          subtitle="Exibidos no rodapé do cardápio web e enviados ao cliente quando solicitado."
        />
        <div className="space-y-5">
          {FIELDS.map(({ key, label, placeholder }) => (
            <Field key={key} label={label}>
              <textarea
                className={INPUT + " resize-y"}
                rows={5}
                maxLength={5000}
                value={form[key as PolicyKey]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
              />
            </Field>
          ))}
        </div>
      </PageCard>

      <SaveButton saving={saving} />
    </form>
  );
}
