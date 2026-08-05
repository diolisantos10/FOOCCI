"use client";

/**
 * Demo request form. Client component.
 *
 * Posts to `/api/site/leads`, which stores the lead BEFORE notifying anyone. This
 * form used to be inert on purpose (no backend existed, so it refused to pretend
 * it sent anything); the endpoint arrived with the commercial launch.
 *
 * Three states, per DESIGN.md §6.1: idle, sending (button locked so a double tap
 * cannot duplicate the lead), and either a success panel or an inline error that
 * KEEPS everything the visitor typed. Wiping a filled form on a network blip is
 * how a lead is lost after it was already won.
 */

import { useState } from "react";
import { leOrigemGuardada } from "./leadOriginStorage";

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

  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = status !== "sending" && nome.trim() !== "" && whatsapp.trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("sending");
    setError(null);

    // A origem NÃO é a página em que o visitante está agora — é a que ele abriu
    // primeiro nesta visita, com os parâmetros da campanha. Ver LeadOriginTracker.
    const origemDaVisita = leOrigemGuardada();

    try {
      const res = await fetch("/api/site/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          whatsapp,
          restaurante,
          cidade,
          tipo,
          desafio: includeChallenge ? desafio : "",
          // `origem` (legado) segue sendo a página do formulário: é a resposta a
          // "de qual página ele enviou", que continua útil e nunca foi atribuição.
          origem: typeof window !== "undefined" ? window.location.pathname : "",
          utmSource:   origemDaVisita.utmSource   ?? "",
          utmMedium:   origemDaVisita.utmMedium   ?? "",
          utmCampaign: origemDaVisita.utmCampaign ?? "",
          utmContent:  origemDaVisita.utmContent  ?? "",
          utmTerm:     origemDaVisita.utmTerm     ?? "",
          clickId:     origemDaVisita.clickId     ?? "",
          landingPath: origemDaVisita.landingPath ?? "",
          referrer:    origemDaVisita.referrer    ?? "",
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        // Nothing is cleared — the visitor keeps everything they typed.
        setError(data?.error ?? "Não conseguimos enviar agora. Tente de novo em instantes.");
        setStatus("idle");
        return;
      }

      setStatus("sent");
    } catch {
      setError("Sem conexão. Verifique a internet e tente de novo.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-brand-200 bg-brand-50 p-7 text-center"
      >
        <p className="text-lg font-semibold text-[#0B0B0B]">Recebemos seu pedido! 🎉</p>
        <p className="mt-2 text-base leading-relaxed text-gray-700">
          Vamos entrar em contato pelo WhatsApp <strong>{whatsapp}</strong> para combinar a
          demonstração.
        </p>
      </div>
    );
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

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex w-full items-center justify-center rounded-full bg-brand-500 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "sending" ? "Enviando…" : "Solicitar demonstração"}
        </button>
        <p className="mt-2 text-center text-sm text-gray-500">
          Sem compromisso. Retornamos pelo WhatsApp.
        </p>
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
