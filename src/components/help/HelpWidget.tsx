"use client";

/**
 * Foocci Help Widget — the floating, retractable companion in the corner of
 * every dashboard page. Three jobs in one:
 *   • "Ajuda"  — AI chat grounded on the Operational Manual (RAG), with a
 *                de-emphasized "Falar com a FOOD" escalation as a last resort.
 *   • "Avisos" — the operational notification feed (moved down from the TopBar).
 *   • a quiet support channel once a thread is escalated to the Foocci team.
 *
 * It is optional: collapsed to a small launcher until the lojista opens it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useNotifications,
  relTime,
  TYPE_ICON,
  TYPE_LABEL,
  TYPE_LABEL_COLOR,
  PRIORITY_BORDER,
  type NotificationItem,
} from "./useNotifications";
import { HELP_OPEN_EVENT, type HelpOpenDetail, type HelpTab } from "./events";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "USER" | "ASSISTANT" | "SUPPORT" | "SYSTEM";

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  authorName: string | null;
  createdAt: string;
}

interface ThreadInfo {
  id: string;
  status: "OPEN" | "ESCALATED" | "RESOLVED";
  mode: "AI" | "HUMAN";
}

const SUGGESTIONS = [
  "Como cadastro um produto no cardápio?",
  "Como conecto meu WhatsApp?",
  "Como crio uma promoção no CRM?",
  "Onde acompanho meus pedidos?",
];

// ── Component ─────────────────────────────────────────────────────────────────

export function HelpWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HelpTab>("ajuda");

  const { notifs, readIds, unreadCount, hasCritical, markRead, markAllRead } =
    useNotifications();

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thread, setThread] = useState<ThreadInfo | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadLoaded, setThreadLoaded] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [resetting, setResetting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Open on external event (e.g. TopBar bell) ───────────────────────────────
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<HelpOpenDetail>).detail;
      setTab(detail?.tab ?? "ajuda");
      setOpen(true);
    }
    window.addEventListener(HELP_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(HELP_OPEN_EVENT, onOpen);
  }, []);

  // ── Close on Escape ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // ── Load thread the first time the chat is opened ───────────────────────────
  const loadThread = useCallback(async () => {
    setLoadingThread(true);
    try {
      const res = await fetch("/api/help/thread");
      if (res.ok) {
        const json = await res.json();
        const data = json.data as
          | { thread: ThreadInfo; messages: ChatMessage[] }
          | undefined;
        if (data) {
          setThread(data.thread);
          setMessages(data.messages ?? []);
        }
      }
    } catch {
      // keep current state
    } finally {
      setLoadingThread(false);
      setThreadLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (open && tab === "ajuda" && !threadLoaded && !loadingThread) {
      void loadThread();
    }
  }, [open, tab, threadLoaded, loadingThread, loadThread]);

  // ── Poll for the Foocci team's replies once escalated to a human ────────────
  useEffect(() => {
    if (!open || tab !== "ajuda" || thread?.mode !== "HUMAN") return;
    const id = setInterval(loadThread, 12_000);
    return () => clearInterval(id);
  }, [open, tab, thread?.mode, loadThread]);

  // ── Auto-scroll chat to the bottom on new messages ──────────────────────────
  useEffect(() => {
    if (tab === "ajuda" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending, tab]);

  // ── Send a message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;
      setInput("");
      setSending(true);

      // Optimistic user bubble.
      const optimistic: ChatMessage = {
        id: `tmp-${messages.length}-${content.length}`,
        role: "USER",
        content,
        authorName: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const res = await fetch("/api/help/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (res.ok) {
          const json = await res.json();
          const data = json.data as
            | { threadId: string; mode: ThreadInfo["mode"]; messages: ChatMessage[] }
            | undefined;
          if (data) {
            // Replace the optimistic bubble with the server's authoritative set.
            setMessages((prev) => [
              ...prev.filter((m) => m.id !== optimistic.id),
              ...data.messages,
            ]);
            setThread((t) =>
              t ? { ...t, mode: data.mode } : { id: data.threadId, status: "OPEN", mode: data.mode },
            );
          }
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimistic.id
                ? { ...m, content: `${content}\n\n(não consegui enviar — tente de novo)` }
                : m,
            ),
          );
        }
      } catch {
        // leave the optimistic message; user can retry
      } finally {
        setSending(false);
      }
    },
    [messages.length, sending],
  );

  // ── Escalate to the Foocci team (last resort) ───────────────────────────────
  const escalate = useCallback(async () => {
    if (escalating) return;
    setEscalating(true);
    try {
      const res = await fetch("/api/help/escalate", { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        const data = json.data as
          | { thread: ThreadInfo; message: ChatMessage }
          | undefined;
        if (data) {
          setThread(data.thread);
          setMessages((prev) => [...prev, data.message]);
        }
      }
    } catch {
      // ignore
    } finally {
      setEscalating(false);
    }
  }, [escalating]);

  // ── Start over — back to the assistant / initial menu ───────────────────────
  const startNewConversation = useCallback(async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const res = await fetch("/api/help/reset", { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        const data = json.data as
          | { thread: ThreadInfo; messages: ChatMessage[] }
          | undefined;
        if (data) {
          setThread(data.thread);
          setMessages(data.messages ?? []);
          setInput("");
        }
      }
    } catch {
      // ignore
    } finally {
      setResetting(false);
    }
  }, [resetting]);

  function handleNotifClick(n: NotificationItem) {
    markRead(n.id);
    setOpen(false);
    router.push(n.href);
  }

  const hasUserMessages = messages.some((m) => m.role === "USER");
  const isHuman = thread?.mode === "HUMAN";

  // ── Launcher (collapsed) ────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir ajuda do Foocci"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-[0_10px_30px_-8px_rgba(249,115,22,.6)] transition-transform hover:scale-105 hover:bg-brand-600"
      >
        <ChatIcon className="h-6 w-6" />
        {unreadCount > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white ${
              hasCritical ? "bg-red-500" : "bg-orange-400"
            }`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    );
  }

  // ── Open panel ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[560px] max-h-[calc(100vh-2.5rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between bg-brand-500 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <ChatIcon className="h-5 w-5" />
          <span className="text-[15px] font-bold">Ajuda Foocci</span>
        </div>
        <div className="flex items-center gap-1">
          {tab === "ajuda" && hasUserMessages && (
            <button
              type="button"
              onClick={startNewConversation}
              disabled={resetting}
              aria-label="Nova conversa"
              title="Começar do zero"
              className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold text-white/90 transition-colors hover:bg-white/15 disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5 9a7 7 0 0111-3M19 15a7 7 0 01-11 3" />
              </svg>
              Nova
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/15"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-line bg-paper">
        <TabButton active={tab === "ajuda"} onClick={() => setTab("ajuda")}>
          💬 Ajuda
        </TabButton>
        <TabButton active={tab === "avisos"} onClick={() => setTab("avisos")} badge={unreadCount}>
          🔔 Avisos
        </TabButton>
      </div>

      {/* Body */}
      {tab === "ajuda" ? (
        <>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-canvas px-3.5 py-4">
            {/* Greeting */}
            {!hasUserMessages && (
              <div className="rounded-2xl border border-line bg-paper p-3.5">
                <p className="text-[13.5px] font-semibold text-ink">Oi! 👋 Sou o assistente do Foocci.</p>
                <p className="mt-1 text-[12.5px] leading-snug text-muted">
                  Pergunte qualquer coisa sobre a plataforma — cardápio, pedidos, WhatsApp,
                  CRM, pagamentos. Respondo na hora.
                </p>
              </div>
            )}

            {loadingThread && !threadLoaded && (
              <p className="px-1 text-[12.5px] text-muted">Carregando…</p>
            )}

            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}

            {sending && <TypingBubble />}

            {/* Suggestions (only before the first question) */}
            {!hasUserMessages && !loadingThread && (
              <div className="space-y-1.5 pt-1">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => sendMessage(q)}
                    className="block w-full rounded-xl border border-line bg-paper px-3 py-2 text-left text-[12.5px] font-medium text-ink2 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Escalation banner / link */}
          {isHuman ? (
            <div className="shrink-0 border-t border-line bg-amber-50 px-3.5 py-2 text-center text-[11.5px] font-medium text-amber-800">
              Você está falando com a equipe Foocci. Responderemos por aqui.{" "}
              <button
                type="button"
                onClick={startNewConversation}
                disabled={resetting}
                className="font-semibold text-brand-600 underline-offset-2 transition-colors hover:underline disabled:opacity-50"
              >
                Voltar ao assistente
              </button>
            </div>
          ) : (
            hasUserMessages && (
              <div className="shrink-0 border-t border-line bg-paper px-3.5 py-1.5 text-center">
                <button
                  type="button"
                  onClick={escalate}
                  disabled={escalating}
                  className="text-[11.5px] font-medium text-muted underline-offset-2 transition-colors hover:text-brand-600 hover:underline disabled:opacity-50"
                >
                  {escalating ? "Encaminhando…" : "Não resolveu? Falar com a equipe Foocci →"}
                </button>
              </div>
            )
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="flex shrink-0 items-end gap-2 border-t border-line bg-paper px-3 py-2.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isHuman ? "Escreva para a equipe Foocci…" : "Tire sua dúvida…"}
              className="min-w-0 flex-1 rounded-xl border border-line2 bg-canvas px-3 py-2 text-[13px] text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Enviar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        </>
      ) : (
        <NotificationsTab
          notifs={notifs}
          readIds={readIds}
          unreadCount={unreadCount}
          hasCritical={hasCritical}
          onMarkAll={markAllRead}
          onClick={handleNotifClick}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold transition-colors ${
        active
          ? "border-b-2 border-brand-500 text-brand-600"
          : "border-b-2 border-transparent text-muted hover:text-ink2"
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange-400 px-1 text-[9px] font-bold leading-none text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "SYSTEM") {
    return (
      <p className="mx-auto max-w-[85%] rounded-full bg-line/60 px-3 py-1 text-center text-[11.5px] text-muted">
        {message.content}
      </p>
    );
  }

  const isUser = message.role === "USER";
  const isSupport = message.role === "SUPPORT";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        {isSupport && (
          <span className="mb-0.5 block px-1 text-[10px] font-bold uppercase tracking-wide text-brand-600">
            {message.authorName || "Equipe Foocci"}
          </span>
        )}
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
            isUser
              ? "rounded-br-md bg-brand-500 text-white"
              : isSupport
                ? "rounded-bl-md border border-brand-100 bg-brand-50 text-ink"
                : "rounded-bl-md border border-line bg-paper text-ink"
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-paper px-3.5 py-3">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
      style={{ animationDelay: delay }}
    />
  );
}

function NotificationsTab({
  notifs,
  readIds,
  unreadCount,
  hasCritical,
  onMarkAll,
  onClick,
}: {
  notifs: NotificationItem[];
  readIds: Set<string>;
  unreadCount: number;
  hasCritical: boolean;
  onMarkAll: () => void;
  onClick: (n: NotificationItem) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-paper">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-ink">Avisos</span>
          {unreadCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                hasCritical ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"
              }`}
            >
              {unreadCount} nov{unreadCount !== 1 ? "os" : "o"}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAll}
            className="text-[11.5px] font-medium text-brand-500 transition-colors hover:text-brand-600"
          >
            Marcar tudo como lido
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {notifs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="text-3xl opacity-40">🔔</span>
            <p className="text-[13px] text-muted">Tudo em ordem por aqui</p>
          </div>
        ) : (
          <ul className="divide-y divide-line/60">
            {notifs.map((n) => {
              const isRead = readIds.has(n.id);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onClick(n)}
                    className={`w-full border-l-4 px-4 py-3 text-left transition-colors hover:bg-canvas ${PRIORITY_BORDER[n.priority]} ${
                      isRead ? "opacity-55" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0 text-base leading-none">
                        {TYPE_ICON[n.type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-1.5">
                          <p
                            className={`flex-1 text-xs leading-snug ${
                              isRead ? "text-gray-500" : "font-semibold text-ink"
                            }`}
                          >
                            {n.message}
                          </p>
                          {!isRead && (
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide ${TYPE_LABEL_COLOR[n.type]}`}
                          >
                            {TYPE_LABEL[n.type]}
                          </span>
                          {n.priority === "critical" && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-red-600">
                              crítico
                            </span>
                          )}
                          <span className="ml-auto text-[10px] text-gray-400">
                            {relTime(n.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.85L3 20l1.1-3.3A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}
