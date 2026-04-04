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
    instagram: "",
    ifood: "",
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
          instagram:   data.instagram    ?? "",
          ifood:       data.ifood        ?? "",
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

      {/* Social media */}
      <PageCard>
        <SectionHeading
          title="Redes sociais"
          subtitle="Links exibidos no rodapé do cardápio online."
        />
        <div className="space-y-4">
          <Field label="Instagram">
            <div className="flex items-center rounded-xl border border-gray-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition overflow-hidden bg-white">
              <span className="border-r border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400 select-none">
                instagram.com/
              </span>
              <input
                className="flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                value={form.instagram}
                onChange={set("instagram")}
                placeholder="seurestaurante"
                maxLength={60}
              />
            </div>
          </Field>

          <Field label="iFood">
            <div className="flex items-center rounded-xl border border-gray-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition overflow-hidden bg-white">
              <span className="border-r border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400 select-none">
                ifood.com.br/
              </span>
              <input
                className="flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                value={form.ifood}
                onChange={set("ifood")}
                placeholder="restaurante/seurestaurante"
                maxLength={120}
              />
            </div>
          </Field>
        </div>
      </PageCard>

      <SaveButton saving={saving} />
    </form>
  );
}
