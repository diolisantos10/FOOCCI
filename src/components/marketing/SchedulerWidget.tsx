"use client";

/**
 * Agendamento da chamada de demonstração — o widget da página /site/agendar.
 *
 * Fluxo em três passos na mesma tela: escolher o dia → escolher a hora → um
 * formulário curto (nome + WhatsApp). Estados obrigatórios do DESIGN.md §6.1:
 * carregando, vazio (sem horários → aponta o formulário de demonstração) e erro
 * (mantém tudo que o visitante digitou; horário disputado volta para a escolha
 * com a agenda atualizada).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_URL } from "./config";

interface PublicSlot {
  id:          string;
  startsAt:    string;
  durationMin: number;
}

const TZ = "America/Sao_Paulo";
const fmtDayLong  = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long" });
const fmtDayShort = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" });
const fmtTime     = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtKey      = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export function SchedulerWidget() {
  const [phase, setPhase]   = useState<"loading" | "ready" | "empty" | "error" | "done">("loading");
  const [slots, setSlots]   = useState<PublicSlot[]>([]);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);

  const [nome, setNome]             = useState("");
  const [whatsapp, setWhatsapp]     = useState("");
  const [restaurante, setRestaurante] = useState("");
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [confirmed, setConfirmed]   = useState<PublicSlot | null>(null);

  const load = useCallback(async (keepSelection = false) => {
    try {
      const res = await fetch("/api/site/agenda");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "");
      const list: PublicSlot[] = json.slots;
      setSlots(list);
      if (!keepSelection) { setDayKey(null); setSlotId(null); }
      setPhase(list.length === 0 ? "empty" : "ready");
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const days = useMemo(() => {
    const map = new Map<string, PublicSlot[]>();
    for (const s of slots) {
      const key = fmtKey.format(new Date(s.startsAt));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [slots]);

  const activeDay = dayKey ?? days[0]?.[0] ?? null;
  const daySlots  = days.find(([k]) => k === activeDay)?.[1] ?? [];
  const selected  = slots.find((s) => s.id === slotId) ?? null;

  const canSubmit = !sending && !!selected && nome.trim().length >= 2 && whatsapp.replace(/\D/g, "").length >= 10;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selected) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/site/agenda/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: selected.id, nome, whatsapp, restaurante }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // Horário disputado: recarrega a agenda e devolve à escolha — nada digitado se perde.
        setError(json?.error ?? "Não conseguimos agendar agora. Tente de novo.");
        if (res.status === 409) { setSlotId(null); await load(true); }
        return;
      }
      setConfirmed(selected);
      setPhase("done");
    } catch {
      setError("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setSending(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500" role="status">
        Carregando horários…
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center" role="alert">
        <p className="font-medium text-red-700">Não conseguimos carregar a agenda agora.</p>
        <button
          type="button"
          onClick={() => { setPhase("loading"); void load(); }}
          className="mt-4 rounded-full border border-red-300 px-5 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
        <p className="text-lg font-semibold text-[#0B0B0B]">Os horários desta semana já foram.</p>
        <p className="mt-2 text-base text-gray-600">
          Deixe seu contato que a gente combina o melhor horário com você.
        </p>
        <a
          href={`${DEMO_URL}#formulario`}
          className="mt-5 inline-flex items-center justify-center rounded-full bg-brand-500 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-600"
        >
          Deixar meu contato
        </a>
      </div>
    );
  }

  if (phase === "done" && confirmed) {
    return (
      <div role="status" className="rounded-2xl border border-brand-200 bg-brand-50 p-8 text-center">
        <p className="text-xl font-semibold text-[#0B0B0B]">Reunião agendada! 🎉</p>
        <p className="mt-3 text-base leading-relaxed text-gray-700">
          <span className="font-semibold capitalize">{fmtDayLong.format(new Date(confirmed.startsAt))}</span>
          {" às "}
          <span className="font-semibold">{fmtTime.format(new Date(confirmed.startsAt))}</span>
          {" "}(horário de Brasília) · {confirmed.durationMin} minutos
        </p>
        <p className="mt-2 text-base text-gray-700">
          Vamos confirmar pelo WhatsApp <strong>{whatsapp}</strong> e mandar o link da chamada por lá.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ring-1 ring-gray-900/[0.03] sm:p-8">
      {/* Passo 1 — dia */}
      <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">1 · Escolha o dia</p>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {days.map(([key, list]) => {
          const active = key === activeDay;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setDayKey(key); setSlotId(null); }}
              className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                active
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {fmtDayShort.format(new Date(list[0]!.startsAt))}
            </button>
          );
        })}
      </div>

      {/* Passo 2 — hora */}
      <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">2 · Escolha a hora</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {daySlots.map((s) => {
          const active = s.id === slotId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSlotId(s.id)}
              className={`rounded-xl border px-4 py-2.5 font-mono text-sm font-semibold transition-colors ${
                active
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-gray-200 text-gray-800 hover:border-brand-300 hover:bg-brand-50"
              }`}
            >
              {fmtTime.format(new Date(s.startsAt))}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Horário de Brasília · chamada de {daySlots[0]?.durationMin ?? 20} minutos
      </p>

      {/* Passo 3 — contato */}
      <form onSubmit={submit} className="mt-7 border-t border-gray-100 pt-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">3 · Seus dados</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ag-nome" className="mb-1 block text-sm font-medium text-gray-700">
              Nome<span className="text-brand-500"> *</span>
            </label>
            <input
              id="ag-nome"
              type="text"
              value={nome}
              required
              placeholder="Seu nome"
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label htmlFor="ag-whatsapp" className="mb-1 block text-sm font-medium text-gray-700">
              WhatsApp<span className="text-brand-500"> *</span>
            </label>
            <input
              id="ag-whatsapp"
              type="tel"
              value={whatsapp}
              required
              placeholder="(00) 00000-0000"
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="ag-restaurante" className="mb-1 block text-sm font-medium text-gray-700">
              Nome do restaurante
            </label>
            <input
              id="ag-restaurante"
              type="text"
              value={restaurante}
              placeholder="Seu restaurante (opcional)"
              onChange={(e) => setRestaurante(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-brand-500 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Agendando…" : selected ? "Confirmar agendamento" : "Escolha um horário acima"}
        </button>
        <p className="mt-2 text-center text-sm text-gray-500">
          Sem compromisso. Confirmamos pelo WhatsApp.
        </p>
      </form>
    </div>
  );
}
