"use client";

/**
 * Conversation detail page — message thread + composer.
 *
 * Client component to handle:
 *   - Outbound message send (POST /api/conversations/[id]/messages)
 *   - Mark as read on mount (POST /api/conversations/[id]/read)
 *   - Status actions: assign, resolve, reopen (PATCH /api/conversations/[id])
 *
 * In Phase 4, this page will also show AI-suggested replies and
 * per-restaurant brand settings without any structural changes.
 */

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isGuestIdentifier } from "@/lib/guest";
import { appendTranscript, useVoiceInput, VoiceButton, VoiceStatus } from "@/components/voice";

// ─── types ────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

interface Message {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  type: string;
  mediaUrl: string | null;
  isRead: boolean;
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  externalStatus: string | null;
}

interface Conversation {
  id: string;
  status: "OPEN" | "BOT" | "HUMAN" | "RESOLVED";
  assignedTo: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  customer: Customer;
  messages: Message[];
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Aberta",
  BOT: "Bot",
  HUMAN: "Em Atendimento",
  RESOLVED: "Resolvida",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  BOT: "bg-brand-100 text-brand-600",
  HUMAN: "bg-amber-100 text-amber-800",
  RESOLVED: "bg-[#F4F4F2] text-ink2",
};

// ─── component ────────────────────────────────────────────────

export default function ConversationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // Ditado: a fala cai no campo e o atendente revisa antes de enviar ao cliente.
  const voice = useVoiceInput((t) => setText((prev) => appendTranscript(prev, t)), {
    fileName: "resposta.webm",
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load conversation on mount
  useEffect(() => {
    fetchConversation();
    markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchConversation() {
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${params.id}`);
      if (!res.ok) throw new Error("Conversa não encontrada");
      const json = await res.json();
      setConv(json.data);
      setMessages(json.data.messages ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function markRead() {
    await fetch(`/api/conversations/${params.id}/read`, { method: "POST" }).catch(() => {});
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${params.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text.trim(), type: "TEXT" }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Erro ao enviar mensagem");
        return;
      }

      const json = await res.json();
      setMessages((prev) => [...prev, json.data]);
      setText("");
      setError(null);
    } catch {
      setError("Falha de rede ao enviar mensagem");
    } finally {
      setSending(false);
    }
  }

  async function handleAction(action: string, userId?: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/conversations/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Ação falhou");
        return;
      }

      await fetchConversation();
      setError(null);
    } catch {
      setError("Falha de rede");
    } finally {
      setActionLoading(false);
    }
  }

  // ─── render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Carregando...
      </div>
    );
  }

  if (error && !conv) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="text-muted">{error}</p>
        <button
          onClick={() => router.push("/conversations")}
          className="rounded-lg border border-line2 px-4 py-2 text-sm hover:bg-[#FAFAF8]"
        >
          ← Voltar
        </button>
      </div>
    );
  }

  if (!conv) return null;

  const isResolved = conv.status === "RESOLVED";

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line2 bg-paper px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/conversations")}
            className="text-sm text-muted hover:text-ink2"
          >
            ←
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
            {conv.customer.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">{conv.customer.name}</p>
            <p className="text-xs text-muted">
              {isGuestIdentifier(conv.customer.phone) ? "Telefone não informado" : conv.customer.phone}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[conv.status]}`}
          >
            {STATUS_LABELS[conv.status]}
          </span>

          {!isResolved && (
            <button
              onClick={() => handleAction("resolve")}
              disabled={actionLoading}
              className="rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50"
            >
              Resolver
            </button>
          )}

          {isResolved && (
            <button
              onClick={() => handleAction("reopen")}
              disabled={actionLoading}
              className="rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50"
            >
              Reabrir
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            fechar
          </button>
        </div>
      )}

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto bg-[#FAFAF8] px-4 py-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted">Sem mensagens ainda.</p>
        )}
        <div className="space-y-2">
          {messages.map((msg) => {
            const isOutbound = msg.direction === "OUTBOUND";
            return (
              <div
                key={msg.id}
                className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                    isOutbound
                      ? "rounded-br-sm bg-brand-600 text-white"
                      : "rounded-bl-sm bg-paper text-ink"
                  }`}
                >
                  {msg.type !== "TEXT" && (
                    <p className="mb-1 text-xs font-medium opacity-70">
                      [{msg.type.toLowerCase()}]
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <div className={`mt-1 flex items-center justify-end gap-1 text-xs ${isOutbound ? "text-brand-200" : "text-muted"}`}>
                    {new Date(msg.sentAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {isOutbound && msg.externalStatus && (
                      <span className="ml-1 opacity-70">
                        {msg.externalStatus === "read"
                          ? "✓✓"
                          : msg.externalStatus === "delivered"
                          ? "✓✓"
                          : "✓"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      {!isResolved ? (
        <form
          onSubmit={handleSend}
          className="border-t border-line2 bg-paper px-4 py-3"
        >
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 items-end gap-1 rounded-xl border border-line2 bg-paper px-1.5 py-1 transition-colors focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e as unknown as FormEvent);
                  }
                }}
                placeholder="Digite ou fale…"
                rows={1}
                className="min-w-0 flex-1 resize-none border-0 bg-transparent px-1.5 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:!ring-0"
              />
              <VoiceButton voice={voice} label="Ditar a mensagem por voz" disabled={sending} />
            </div>
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {sending ? "…" : "Enviar"}
            </button>
          </div>
          <VoiceStatus voice={voice} />
        </form>
      ) : (
        <div className="border-t border-line2 bg-[#FAFAF8] px-4 py-3 text-center text-sm text-muted">
          Conversa resolvida.{" "}
          <button
            className="font-medium text-brand-600 hover:underline"
            onClick={() => handleAction("reopen")}
          >
            Reabrir
          </button>{" "}
          para enviar mensagens.
        </div>
      )}
    </div>
  );
}
