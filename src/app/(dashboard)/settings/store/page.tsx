"use client";

import { useState, useEffect, type FormEvent } from "react";
import { apiFetch, Field, INPUT, Feedback, SaveButton, PageCard, SectionHeading } from "../_shared";

export default function StorePage() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    description: "",
    logoUrl: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/store").then(({ ok, data }) => {
      if (ok)
        setForm({
          name:        data.name         ?? "",
          phone:       data.phone        ?? "",
          address:     data.address      ?? "",
          description: data.description  ?? "",
          logoUrl:     data.logoUrl      ?? "",
        });
      setLoading(false);
    });
  }, []);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    const { ok, data } = await apiFetch("/api/settings/store", "PUT", {
      name:        form.name,
      phone:       form.phone       || null,
      address:     form.address     || null,
      description: form.description || null,
      logoUrl:     form.logoUrl     || null,
    });
    if (ok) setSuccess("Informações da loja salvas.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* Basic info */}
      <PageCard>
        <SectionHeading
          title="Informações básicas"
          subtitle="Dados exibidos no cardápio e páginas públicas."
        />
        <div className="space-y-4">
          <Field label="Nome do restaurante *">
            <input
              className={INPUT}
              value={form.name}
              onChange={set("name")}
              placeholder="Ex: Sushi Cazza"
              required
              maxLength={120}
            />
          </Field>

          <Field
            label="Descrição"
            hint="Aparece no topo do cardápio web e QR."
          >
            <textarea
              className={INPUT + " resize-none"}
              rows={3}
              value={form.description}
              onChange={set("description")}
              placeholder="Breve descrição do seu restaurante…"
              maxLength={500}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Telefone / WhatsApp">
              <input
                className={INPUT}
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                placeholder="(11) 99999-9999"
                maxLength={30}
              />
            </Field>

            <Field label="Endereço">
              <input
                className={INPUT}
                value={form.address}
                onChange={set("address")}
                placeholder="Rua, número, bairro"
                maxLength={300}
              />
            </Field>
          </div>

          <Field
            label="Logo (URL)"
            hint="Cole a URL de uma imagem (JPG, PNG, WebP)."
          >
            <input
              className={INPUT}
              type="url"
              value={form.logoUrl}
              onChange={set("logoUrl")}
              placeholder="https://…"
              maxLength={500}
            />
            {form.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.logoUrl}
                alt="Preview do logo"
                className="mt-3 h-16 w-16 rounded-2xl border border-gray-100 object-cover shadow-sm"
              />
            )}
          </Field>
        </div>
      </PageCard>

      <SaveButton saving={saving} />
    </form>
  );
}
