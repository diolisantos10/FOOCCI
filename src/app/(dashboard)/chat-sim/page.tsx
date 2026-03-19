"use client";

/**
 * /chat-sim — Two-phase guided selling simulation
 *
 * Phase 1 (EXPLORATION): chip bar shows category shortcuts.
 *   → Customer browses categories one at a time; no aggressive upsell.
 * Phase 2 (UPSELL): triggered by "só isso" / "finalizar" / etc.
 *   → AI identifies missing categories and suggests one at a time.
 *   → Chip bar switches to finalization actions.
 *
 * All state is client-side; no DB records are created.
 */

import { useState, useEffect, useRef, FormEvent, KeyboardEvent, useCallback } from "react";

// ─── types ────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: Date;
}

type UIState = "idle" | "thinking" | "error";
type Phase   = "exploration" | "upsell";

// ─── helpers ──────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Words that trigger the transition from Phase 1 → Phase 2.
const UPSELL_TRIGGERS = [
  "só isso", "so isso", "é isso", "e isso", "pode fechar", "finalizar",
  "já escolhi", "ja escolhi", "pode confirmar", "tô bem", "to bem",
  "acabei", "mais nada", "isso mesmo", "tudo certo", "pode ir",
];

function detectPhaseTransition(text: string): boolean {
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return UPSELL_TRIGGERS.some((t) => normalized.includes(t));
}

// ─── Bubble ───────────────────────────────────────────────────

function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mr-2 mt-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-xs font-bold text-white">
          IA
        </div>
      )}
      <div
        className={`max-w-[72%] rounded-2xl px-4 py-2.5 shadow-sm ${
          isUser
            ? "rounded-br-none bg-[#dcf8c6] text-gray-900"
            : "rounded-bl-none bg-white text-gray-900"
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {msg.content}
        </p>
        <p className={`mt-0.5 text-right text-[10px] ${isUser ? "text-gray-500" : "text-gray-400"}`}>
          {formatTime(msg.ts)}
        </p>
      </div>
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-xs font-bold text-white">
        IA
      </div>
      <div className="rounded-2xl rounded-bl-none bg-white px-4 py-3 shadow-sm">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-2 w-2 rounded-full bg-gray-400"
              style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

// ─── Phase badge ──────────────────────────────────────────────

function PhaseBadge({ phase }: { phase: Phase }) {
  return phase === "exploration" ? (
    <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-100">
      Fase 1 · Explorando
    </span>
  ) : (
    <span className="rounded-full bg-amber-400/30 px-2 py-0.5 text-[10px] font-medium text-amber-100">
      Fase 2 · Upsell
    </span>
  );
}

// ─── Phase 1 chip bar — category shortcuts ────────────────────

function ExplorationChips({
  categories,
  disabled,
  onSelect,
}: {
  categories: string[];
  disabled: boolean;
  onSelect: (text: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onSelect(`Quero ver ${cat.toLowerCase()}`)}
          disabled={disabled}
          className="shrink-0 rounded-full border border-[#25d366] bg-[#e7fbe8] px-2.5 py-0.5 text-xs font-medium text-green-900 hover:bg-[#d0f5d2] disabled:opacity-40"
        >
          {cat}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onSelect("só isso, pode finalizar")}
        disabled={disabled}
        className="shrink-0 rounded-full border border-amber-400 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40"
      >
        Finalizar ✓
      </button>
    </div>
  );
}

// ─── Phase 2 chip bar — finalization actions ──────────────────

const UPSELL_CHIPS: { label: string; text: string }[] = [
  { label: "Sim, quero!",     text: "sim, pode incluir" },
  { label: "Não, obrigado",   text: "não, obrigado" },
  { label: "Entrega 🛵",      text: "é pra entrega" },
  { label: "Retirada 🏪",     text: "vou retirar no local" },
  { label: "Confirmar pedido", text: "pode confirmar o pedido" },
];

function UpsellChips({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (text: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {UPSELL_CHIPS.map((c) => (
        <button
          key={c.text}
          type="button"
          onClick={() => onSelect(c.text)}
          disabled={disabled}
          className="shrink-0 rounded-full border border-purple-300 bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-800 hover:bg-purple-100 disabled:opacity-40"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────

export default function ChatSimPage() {
  const [messages,   setMessages]   = useState<ChatMessage[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [phase,      setPhase]      = useState<Phase>("exploration");
  const [input,      setInput]      = useState("");
  const [uiState,    setUiState]    = useState<UIState>("idle");
  const [errorMsg,   setErrorMsg]   = useState("");

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const greeted    = useRef(false);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, uiState]);

  // Load category names for chip bar
  useEffect(() => {
    fetch("/api/chat-sim")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.data?.categories)) {
          setCategories(data.data.categories);
        }
      })
      .catch(() => {/* non-critical, chips just won't show */});
  }, []);

  // Initial greeting
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    callAI([], "oi", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── core AI call ────────────────────────────────────────────

  const callAI = useCallback(async (
    history: Array<{ role: "user" | "assistant"; content: string }>,
    userText: string,
    isGreeting = false
  ) => {
    setUiState("thinking");
    setErrorMsg("");

    try {
      const res = await fetch("/api/chat-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, history }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Erro ${res.status}`);

      const assistantMsg: ChatMessage = {
        id: uid(), role: "assistant", content: json.data.reply, ts: new Date(),
      };

      setMessages(isGreeting ? [assistantMsg] : (prev) => [...prev, assistantMsg]);
      setTimeout(() => inputRef.current?.focus(), 80);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setUiState("error");
      return;
    }

    setUiState("idle");
  }, []);

  // ── send ────────────────────────────────────────────────────

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || uiState === "thinking") return;
    setInput("");

    // Detect phase transition before the AI responds
    if (phase === "exploration" && detectPhaseTransition(trimmed)) {
      setPhase("upsell");
    }

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed, ts: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    await callAI(history, trimmed);
  }

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    sendText(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(input); }
  }

  function handleClear() {
    setMessages([]);
    setPhase("exploration");
    setInput("");
    setErrorMsg("");
    setUiState("idle");
    greeted.current = true;
    callAI([], "oi", true);
  }

  // ─── render ─────────────────────────────────────────────────

  const busy = uiState === "thinking";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#ece5dd]">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between bg-[#075e54] px-4 py-3 text-white shadow">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#128c7e] text-sm font-bold">
            IA
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Assistente Virtual</p>
            <p className="text-xs text-green-200">{busy ? "digitando…" : "online"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PhaseBadge phase={phase} />
          <span className="rounded-full bg-[#128c7e] px-2 py-0.5 text-[10px] font-medium text-green-100">
            Simulação
          </span>
          <button
            onClick={handleClear}
            disabled={busy}
            className="rounded-lg bg-[#128c7e] px-3 py-1.5 text-xs font-medium hover:bg-[#0f7a6f] disabled:opacity-50"
          >
            Reiniciar
          </button>
        </div>
      </div>

      {/* ── Phase indicator strip ─────────────────────── */}
      {phase === "exploration" ? (
        <div className="shrink-0 border-b border-blue-100 bg-blue-50 px-4 py-1.5 text-center text-xs text-blue-700">
          <strong>Fase 1 · Exploração</strong> — o assistente guia pelo cardápio sem upsell.
          Diga <em>"só isso"</em> ou clique em <strong>Finalizar ✓</strong> para avançar.
        </div>
      ) : (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
          <strong>Fase 2 · Upsell</strong> — o assistente verifica categorias não pedidas, uma por vez.
        </div>
      )}

      {/* ── Messages ───────────────────────────────────── */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !busy && (
          <p className="text-center text-xs text-gray-400">Iniciando conversa…</p>
        )}

        {messages.length > 0 && (
          <div className="flex justify-center">
            <span className="rounded-full bg-white/80 px-3 py-0.5 text-xs text-gray-500 shadow-sm">
              Hoje
            </span>
          </div>
        )}

        {messages.map((msg) => <Bubble key={msg.id} msg={msg} />)}

        {busy && <TypingIndicator />}

        {uiState === "error" && (
          <div className="mx-auto max-w-sm rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700 shadow-sm">
            <p className="font-semibold">Erro ao conectar com a IA</p>
            <p className="mt-0.5 text-xs opacity-80">{errorMsg}</p>
            {(errorMsg.includes("401") || errorMsg.toLowerCase().includes("api")) && (
              <p className="mt-1 text-xs">
                Verifique se <code className="font-mono">OPENAI_API_KEY</code> está configurada.
              </p>
            )}
            <button onClick={() => setUiState("idle")} className="mt-2 text-xs underline">
              Fechar
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Composer ───────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-gray-200 bg-white px-4 py-3"
      >
        {/* Dynamic chip bar — changes with phase */}
        <div className="mb-2">
          {phase === "exploration" ? (
            <ExplorationChips categories={categories} disabled={busy} onSelect={sendText} />
          ) : (
            <UpsellChips disabled={busy} onSelect={sendText} />
          )}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              phase === "exploration"
                ? "Simule o cliente… ex: "quero ver pizzas""
                : "Responda à sugestão… ex: "sim" ou "não obrigado""
            }
            rows={1}
            disabled={busy}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25d366] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-white shadow hover:bg-[#0f7a6f] disabled:opacity-40"
            title="Enviar"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 rotate-45">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </form>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
