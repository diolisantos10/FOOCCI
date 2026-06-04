"use client";

/**
 * Demo request form. Client component.
 *
 * IMPORTANT (documented): there is no lead-capture backend in this codebase, so
 * this form does NOT post to any API (no fake endpoints). Instead, when a sales
 * WhatsApp number is configured (`WHATSAPP_SALES_NUMBER` in config.ts), submit
 * opens WhatsApp with the typed details prefilled. While no number is set, the
 * submit button stays disabled with an honest note — nothing pretends to send.
 */

import { useState } from "react";
import { whatsappUrl } from "./config";
import { PrimaryCta } from "./Cta";

const TIPOS = [
  "Pizzaria",
  "Hamburgueria",
  "Japonês",
  "Comida brasileira",
  "Cafeteria / Padaria",
  "Açaí / Sorveteria",
  "Outro",
];

export function DemoForm() {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [restaurante, setRestaurante] = useState("");
  const [cidade, setCidade] = useState("");
  const [tipo, setTipo] = useState("");

  const whatsappEnabled = whatsappUrl() !== null;
  const canSubmit = whatsappEnabled && nome.trim() !== "" && whatsapp.trim() !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message =
      `Olá! Quero ver a Foocci funcionando no meu restaurante.\n` +
      `Nome: ${nome}\n` +
      `WhatsApp: ${whatsapp}\n` +
      `Restaurante: ${restaurante}\n` +
      `Cidade: ${cidade}\n` +
      `Tipo: ${tipo}`;
    const url = whatsappUrl(message);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nome" label="Nome" value={nome} onChange={setNome} placeholder="Seu nome" required />
        <Field id="whatsapp" label="WhatsApp" value={whatsapp} onChange={setWhatsapp} placeholder="(00) 00000-0000" required />
        <Field id="restaurante" label="Nome do restaurante" value={restaurante} onChange={setRestaurante} placeholder="Seu restaurante" />
        <Field id="cidade" label="Cidade" value={cidade} onChange={setCidade} placeholder="Sua cidade" />
      </div>

      <div>
        <label htmlFor="tipo" className="mb-1 block text-sm font-medium text-gray-700">
          Tipo de restaurante
        </label>
        <select
          id="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Selecione…</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="pt-2">
        {whatsappEnabled ? (
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex w-full items-center justify-center rounded-full bg-brand-500 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Quero ver a Foocci funcionando
          </button>
        ) : (
          <>
            {/* No WhatsApp number / lead backend configured yet — honest disabled state. */}
            <button
              type="button"
              disabled
              aria-disabled
              className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-full bg-gray-200 px-6 py-3.5 text-base font-semibold text-gray-500"
            >
              Quero ver a Foocci funcionando
            </button>
            <p className="mt-2 text-center text-sm text-gray-500">
              Envio disponível em breve.
            </p>
          </>
        )}
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-brand-500"> *</span>}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}
