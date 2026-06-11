"use client";

/**
 * Demo request form. Client component.
 *
 * IMPORTANT (documented): there is no lead-capture backend in this codebase, so
 * this form does NOT post to any API (no fake endpoints). Instead, when a sales
 * WhatsApp number is configured (`WHATSAPP_SALES_NUMBER` in config.ts), submit
 * opens WhatsApp with the typed details prefilled. While no number is set, the
 * submit button stays disabled with an honest note — nothing pretends to send.
 *
 * TODO(backend): wire a real lead-capture endpoint or CRM integration, then
 * enable the submit independently of the WhatsApp number.
 */

import { useState } from "react";
import { whatsappUrl } from "./config";

const TIPOS = [
  "Pizzaria",
  "Hamburgueria",
  "Japonês",
  "Comida brasileira",
  "Cafeteria / Padaria",
  "Açaí / Sorveteria",
  "Outro",
];

const DESAFIOS = [
  "Poucos pedidos diretos",
  "Clientes que não voltam",
  "Atendimento no WhatsApp",
  "Falta de CRM / organização",
  "Recuperar clientes",
  "Outro",
];

export function DemoForm({ includeChallenge = false }: { includeChallenge?: boolean }) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [restaurante, setRestaurante] = useState("");
  const [cidade, setCidade] = useState("");
  const [tipo, setTipo] = useState("");
  const [desafio, setDesafio] = useState("");

  const whatsappEnabled = whatsappUrl() !== null;
  const canSubmit = whatsappEnabled && nome.trim() !== "" && whatsapp.trim() !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message =
      `Olá! Quero ver o Foocci funcionando no meu restaurante.\n` +
      `Nome: ${nome}\n` +
      `WhatsApp: ${whatsapp}\n` +
      `Restaurante: ${restaurante}\n` +
      `Cidade: ${cidade}\n` +
      `Tipo: ${tipo}` +
      (includeChallenge ? `\nPrincipal desafio: ${desafio}` : "");
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

      <div className={includeChallenge ? "grid gap-4 sm:grid-cols-2" : ""}>
        <Select id="tipo" label="Tipo de restaurante" value={tipo} onChange={setTipo} options={TIPOS} />
        {includeChallenge && (
          <Select id="desafio" label="Principal desafio" value={desafio} onChange={setDesafio} options={DESAFIOS} />
        )}
      </div>

      <div className="pt-2">
        {whatsappEnabled ? (
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex w-full items-center justify-center rounded-full bg-brand-500 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Solicitar demonstração
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
              Solicitar demonstração
            </button>
            <p className="mt-2 text-center text-sm text-gray-500">Envio disponível em breve.</p>
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

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        <option value="">Selecione…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
