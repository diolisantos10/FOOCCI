"use client";

/**
 * Chat Simulation Page — /chat-sim
 *
 * Simulates a WhatsApp conversation with the AI ordering assistant.
 * State is held entirely client-side; no DB records are created.
 * Used to validate the AI ordering flow before connecting a real WhatsApp number.
 */

import { useState, useEffect, useRef, FormEvent, KeyboardEvent } from "react";

// ─── types ────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: Date;
}

type UIState = "idle" | "thinking" | "error";

// ─── helpers ──────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ─── sub-components ───────────────────────────────────────────

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
        className={`relative max-w-[72%] rounded-2xl px-4 py-2.5 shadow-sm ${
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

// ─── quick prompts ────────────────────────────────────────────

const QUICK_PROMPTS = [
  "Ver cardápio",
  "Quero pedir uma pizza",
  "Quais são as sobremesas?",
  "Qual o preço do Quatro Queijos?",
];

// ─── main component ───────────────────────────────────────────

const GREETING_MSG =
  "Olá! (início da conversa — cumprimente o cliente e apresente-se brevemente)";

export default function ChatSimPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [uiState, setUiState] = useState<UIState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const greeted = useRef(false);

  // Auto-scroll when messages change or while thinking
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, uiState]);

  // Trigger automatic greeting on first mount
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    callAI([], GREETING_MSG, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Core AI call.
   * @param history  The conversation so far (before this turn).
   * @param userText The user's message to send (or the hidden greeting trigger).
   * @param isGreeting When true, no user bubble is shown; resets the chat to just the reply.
   */
  async function callAI(
    history: Array<{ role: "user" | "assistant"; content: string }>,
    userText: string,
    isGreeting = false
  ) {
    setUiState("thinking");
    setErrorMsg("");

    try {
      const res = await fetch("/api/chat-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, history }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `Erro ${res.status}`);
      }

      const assistantMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: json.data.reply,
        ts: new Date(),
      };

      if (isGreeting) {
        setMessages([assistantMsg]);
      } else {
        setMessages((prev) => [...prev, assistantMsg]);
      }

      setTimeout(() => inputRef.current?.focus(), 80);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setUiState("error");
      return;
    }

    setUiState("idle");
  }

  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || uiState === "thinking") return;
    setInput("");

    // Snapshot history before adding the new user message
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text, ts: new Date() };
    setMessages((prev) => [...prev, userMsg]);

    await callAI(history, text);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleQuickPrompt(prompt: string) {
    setInput(prompt);
    inputRef.current?.focus();
  }

  function handleClear() {
    setMessages([]);
    setInput("");
    setErrorMsg("");
    setUiState("idle");
    greeted.current = true;
    callAI([], GREETING_MSG, true);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#ece5dd]">

      {/* ── WhatsApp-style header ─────────────────────── */}
      <div className="flex shrink-0 items-center justify-between bg-[#075e54] px-4 py-3 text-white shadow">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#128c7e] text-sm font-bold">
            IA
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Assistente Virtual</p>
            <p className="text-xs text-green-200">
              {uiState === "thinking" ? "digitando…" : "online"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#128c7e] px-2.5 py-0.5 text-xs font-medium text-green-100">
            Simulação
          </span>
          <button
            onClick={handleClear}
            disabled={uiState === "thinking"}
            className="rounded-lg bg-[#128c7e] px-3 py-1.5 text-xs font-medium hover:bg-[#0f7a6f] disabled:opacity-50"
          >
            Reiniciar
          </button>
        </div>
      </div>

      {/* ── Info banner ───────────────────────────────── */}
      <div className="shrink-0 border-b border-yellow-200 bg-yellow-50 px-4 py-1.5 text-center text-xs text-yellow-800">
        Ambiente de teste — nenhuma mensagem é salva e nenhum pedido real é criado.
      </div>

      {/* ── Message thread ───────────────────────────── */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && uiState !== "thinking" && (
          <p className="text-center text-xs text-gray-400">Iniciando conversa…</p>
        )}

        {/* Date chip */}
        {messages.length > 0 && (
          <div className="flex justify-center">
            <span className="rounded-full bg-white/80 px-3 py-0.5 text-xs text-gray-500 shadow-sm">
              Hoje
            </span>
          </div>
        )}

        {messages.map((msg) => (
          <Bubble key={msg.id} msg={msg} />
        ))}

        {uiState === "thinking" && <TypingIndicator />}

        {uiState === "error" && (
          <div className="mx-auto max-w-sm rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700 shadow-sm">
            <p className="font-semibold">Erro ao conectar com a IA</p>
            <p className="mt-0.5 text-xs opacity-80">{errorMsg}</p>
            {(errorMsg.includes("401") || errorMsg.toLowerCase().includes("api")) && (
              <p className="mt-1 text-xs">
                Verifique se <code className="font-mono">OPENAI_API_KEY</code> está configurada.
              </p>
            )}
            <button
              onClick={() => setUiState("idle")}
              className="mt-2 text-xs underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Composer ─────────────────────────────────── */}
      <form
        onSubmit={handleSend}
        className="shrink-0 border-t border-gray-200 bg-white px-4 py-3"
      >
        {/* Quick prompts */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => handleQuickPrompt(q)}
              disabled={uiState === "thinking"}
              className="rounded-full border border-[#25d366] bg-[#e7fbe8] px-2.5 py-0.5 text-xs text-green-900 hover:bg-[#d0f5d2] disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Simule o cliente… (Enter para enviar, Shift+Enter para quebrar linha)"
            rows={1}
            disabled={uiState === "thinking"}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25d366] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || uiState === "thinking"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-white shadow hover:bg-[#0f7a6f] disabled:opacity-40"
            title="Enviar"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 rotate-45">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </form>

      {/* Bounce animation */}
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
