"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  FormEvent,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConvStatus =
  | "AI_ATENDENDO"
  | "HUMANO_ASSUMIU"
  | "OPEN"
  | "BOT"
  | "HUMAN"
  | "RESOLVED";

type SenderType = "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";

type StatusFilter = "ALL" | "AI_ATENDENDO" | "HUMANO_ASSUMIU" | "RESOLVED";

interface ConvSummary {
  id:            string;
  status:        ConvStatus;
  channel:       string;
  aiEnabled:     boolean;
  assignedTo:    string | null;
  unreadCount:   number;
  lastMessageAt: string | null;
  createdAt:     string;
  customerName:  string | null;
  customerPhone: string | null;
  customer:      { id: string; name: string; phone: string; tier: string } | null;
  messages:      { content: string; senderType: string | null; direction: string; sentAt: string }[];
}

interface Message {
  id:         string;
  direction:  "INBOUND" | "OUTBOUND";
  senderType: SenderType | null;
  content:    string;
  type:       string;
  isRead:     boolean;
  sentAt:     string;
  metadata:   Record<string, unknown> | null;
}

interface ConvDetail extends Omit<ConvSummary, "messages"> {
  messages: Message[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, string> = {
  WEB_AGENT:  "🌐",
  QR_AGENT:   "📷",
  WHATSAPP:   "📱",
  EMAIL:      "✉️",
  SMS:        "💬",
  MANUAL:     "✏️",
};

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ALL",           label: "Todas"          },
  { id: "AI_ATENDENDO",  label: "IA atendendo"   },
  { id: "HUMANO_ASSUMIU", label: "Humano assumiu" },
  { id: "RESOLVED",      label: "Finalizadas"    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayName(conv: ConvSummary): string {
  return (
    conv.customer?.name ??
    conv.customerName ??
    conv.customerPhone ??
    "Visitante anônimo"
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d   = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate();
  return sameDay
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

interface StatusBadge { label: string; cls: string }

function getStatusBadge(conv: ConvSummary): StatusBadge {
  if (!conv.aiEnabled && conv.status === "HUMANO_ASSUMIU")
    return { label: "Humano assumiu", cls: "bg-blue-100 text-blue-700 border-blue-200" };
  if (conv.status === "AI_ATENDENDO" || conv.aiEnabled)
    return { label: "IA atendendo",   cls: "bg-brand-100 text-brand-600 border-brand-200" };
  if (conv.status === "RESOLVED")
    return { label: "Finalizada",     cls: "bg-[#F4F4F2] text-muted border-line2" };
  if (conv.unreadCount > 0)
    return { label: "Nova mensagem",  cls: "bg-red-100 text-red-700 border-red-200" };
  return { label: conv.status,        cls: "bg-[#F4F4F2] text-muted border-line2" };
}

function convSortKey(conv: ConvSummary): number {
  if (!conv.aiEnabled && conv.status === "HUMANO_ASSUMIU") return 0;
  if (conv.unreadCount > 0)                                return 1;
  if (conv.status === "AI_ATENDENDO")                      return 2;
  if (conv.status === "RESOLVED")                          return 4;
  return 3;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ChatClient({ userId }: { userId: string }) {
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [loadingList,   setLoadingList]   = useState(true);

  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [thread,        setThread]        = useState<ConvDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const [mobileView,    setMobileView]    = useState<"list" | "thread">("list");
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>("ALL");
  const [searchInput,   setSearchInput]   = useState("");
  const [search,        setSearch]        = useState("");

  const [actionLoading, setActionLoading] = useState(false);
  const [replyText,     setReplyText]     = useState("");
  const [sending,       setSending]       = useState(false);
  const [sendError,     setSendError]     = useState<string | null>(null);
  const [sendNotice,    setSendNotice]    = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Fetch list ────────────────────────────────────────────────────────────

  const fetchList = useCallback(async () => {
    const sp = new URLSearchParams({ limit: "50" });
    if (statusFilter !== "ALL") sp.set("status", statusFilter);
    if (search.trim())          sp.set("search", search.trim());
    try {
      const res  = await fetch(`/api/chat/conversations?${sp}`);
      if (!res.ok) return;
      const json = await res.json();
      const items: ConvSummary[] = json.data?.data ?? json.data ?? [];
      setConversations(Array.isArray(items) ? items : []);
    } catch { /* network error — keep current state */ }
    finally { setLoadingList(false); }
  }, [statusFilter, search]);

  useEffect(() => {
    setLoadingList(true);
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const id = setInterval(fetchList, 5000);
    return () => clearInterval(id);
  }, [fetchList]);

  // ── Fetch thread ──────────────────────────────────────────────────────────

  const fetchThread = useCallback(async (id: string) => {
    try {
      const res  = await fetch(`/api/chat/conversations/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      setThread(json.data ?? null);
    } catch { /* keep current */ }
  }, []);

  useEffect(() => {
    if (!selectedId) { setThread(null); return; }
    setLoadingThread(true);
    fetchThread(selectedId).finally(() => setLoadingThread(false));
    const id = setInterval(() => fetchThread(selectedId), 5000);
    return () => clearInterval(id);
  }, [selectedId, fetchThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages?.length]);

  // ── Derived list ──────────────────────────────────────────────────────────

  const displayed = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        const pd = convSortKey(a) - convSortKey(b);
        if (pd !== 0) return pd;
        const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tb - ta;
      }),
    [conversations],
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleTakeover() {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      await fetch(`/api/chat/conversations/${selectedId}/takeover`, { method: "POST" });
      await Promise.all([fetchThread(selectedId), fetchList()]);
    } finally { setActionLoading(false); }
  }

  async function handleRelease() {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      await fetch(`/api/chat/conversations/${selectedId}/release`, { method: "POST" });
      await Promise.all([fetchThread(selectedId), fetchList()]);
    } finally { setActionLoading(false); }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!replyText.trim() || !selectedId) return;
    setSending(true);
    setSendError(null);
    setSendNotice(null);
    try {
      const res  = await fetch(`/api/chat/conversations/${selectedId}/messages`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: replyText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSendError(json.error ?? "Erro ao enviar");
        return;
      }
      if (json.data?.notice) setSendNotice(json.data.notice);
      setReplyText("");
      await fetchThread(selectedId);
    } catch {
      setSendError("Falha de rede");
    } finally { setSending(false); }
  }

  function handleSelectConv(id: string) {
    setSelectedId(id);
    setMobileView("thread");
    setSendError(null);
    setSendNotice(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex overflow-hidden" style={{ height: "calc(100vh - var(--topbar))" }}>

      {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
      <aside className={`
        flex-col border-r border-line2 bg-paper
        ${mobileView === "list" ? "flex w-full" : "hidden"}
        lg:flex lg:w-80 lg:shrink-0
      `}>
        {/* Search */}
        <div className="border-b border-line px-3 pt-3 pb-2">
          <form
            onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}
            className="flex gap-2"
          >
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nome, telefone…"
              className="min-w-0 flex-1 rounded-lg border border-line2 px-3 py-1.5 text-sm placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600 transition-colors"
            >
              Buscar
            </button>
          </form>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2 scrollbar-hide">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                statusFilter === f.id
                  ? "bg-brand-500 text-white"
                  : "bg-[#F4F4F2] text-ink2 hover:bg-line2"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted">
              Carregando…
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted">
              <span className="text-2xl">🤖</span>
              <p>Nenhuma conversa encontrada.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {displayed.map((conv) => {
                const last      = conv.messages[0];
                const preview   = last ? last.content.slice(0, 60) : "Sem mensagens";
                const badge     = getStatusBadge(conv);
                const isSelected = conv.id === selectedId;
                const name      = displayName(conv);

                return (
                  <li key={conv.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectConv(conv.id)}
                      className={`w-full border-l-2 px-3 py-3 text-left transition-colors ${
                        isSelected
                          ? "border-brand-500 bg-brand-50"
                          : conv.unreadCount > 0
                          ? "border-red-400 bg-red-50/40 hover:bg-red-50/70"
                          : !conv.aiEnabled
                          ? "border-blue-400 hover:bg-blue-50/20"
                          : "border-transparent hover:bg-[#FAFAF8]"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Avatar */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                          {initials(name)}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-sm font-semibold text-ink">
                              {name}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted">
                              {fmtTime(conv.lastMessageAt)}
                            </span>
                          </div>

                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[10px] text-muted">
                              {CHANNEL_ICONS[conv.channel] ?? "💬"}
                            </span>
                            {conv.unreadCount > 0 && (
                              <span className="rounded-full bg-red-500 px-1.5 py-px text-[9px] font-bold leading-none text-white">
                                {conv.unreadCount}
                              </span>
                            )}
                            <span className={`rounded-full border px-1.5 py-px text-[9px] font-bold leading-none ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-xs text-muted">{preview}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-line px-3 py-2 text-xs text-muted">
          {displayed.length} conversa{displayed.length !== 1 ? "s" : ""}
        </div>
      </aside>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <section className={`
        flex-col overflow-hidden
        ${mobileView === "thread" ? "flex w-full" : "hidden"}
        lg:flex lg:flex-1
      `}>
        {!selectedId ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
            <span className="text-5xl">🤖</span>
            <p className="text-sm font-medium text-muted">Selecione uma conversa</p>
            <p className="text-xs text-muted">para ver o histórico e gerenciar o atendimento</p>
          </div>
        ) : loadingThread && !thread ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Carregando…
          </div>
        ) : thread ? (
          <ThreadPanel
            thread={thread}
            userId={userId}
            actionLoading={actionLoading}
            onTakeover={handleTakeover}
            onRelease={handleRelease}
            replyText={replyText}
            setReplyText={setReplyText}
            sending={sending}
            sendError={sendError}
            sendNotice={sendNotice}
            onSend={handleSend}
            bottomRef={bottomRef}
            onBack={() => setMobileView("list")}
          />
        ) : null}
      </section>
    </div>
  );
}

// ── Thread Panel ──────────────────────────────────────────────────────────────

interface ThreadPanelProps {
  thread:        ConvDetail;
  userId:        string;
  actionLoading: boolean;
  onTakeover:    () => void;
  onRelease:     () => void;
  replyText:     string;
  setReplyText:  (v: string) => void;
  sending:       boolean;
  sendError:     string | null;
  sendNotice:    string | null;
  onSend:        (e: FormEvent) => void;
  bottomRef:     React.RefObject<HTMLDivElement>;
  onBack?:       () => void;
}

function ThreadPanel({
  thread,
  actionLoading,
  onTakeover,
  onRelease,
  replyText,
  setReplyText,
  sending,
  sendError,
  sendNotice,
  onSend,
  bottomRef,
  onBack,
}: ThreadPanelProps) {
  const name      = thread.customer?.name ?? thread.customerName ?? "Visitante";
  const badge     = getStatusBadge(thread);
  const isHuman   = !thread.aiEnabled && thread.status === "HUMANO_ASSUMIU";
  const isAI      = thread.aiEnabled;

  return (
    <>
      {/* Header */}
      <div className="shrink-0 border-b border-line2 bg-paper px-4 py-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Voltar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[#F4F4F2] lg:hidden"
            >
              ←
            </button>
          )}

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              {initials(name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{name}</p>
              <p className="text-xs text-muted">
                {thread.customerPhone ?? thread.customer?.phone ?? "Sem telefone"}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="flex items-center gap-1 rounded-full bg-[#F4F4F2] px-2 py-0.5 text-xs font-medium text-ink2">
              {CHANNEL_ICONS[thread.channel] ?? "💬"}
              <span className="hidden md:inline ml-1">{thread.channel.replace("_", " ")}</span>
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {isAI && (
            <button
              type="button"
              onClick={onTakeover}
              disabled={actionLoading}
              className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              Assumir atendimento
            </button>
          )}
          {isHuman && (
            <button
              type="button"
              onClick={onRelease}
              disabled={actionLoading}
              className="shrink-0 rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50 transition-colors"
            >
              Devolver para IA
            </button>
          )}
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto bg-[#FAFAF8] px-4 py-4">
        {thread.messages.length === 0 ? (
          <p className="text-center text-sm text-muted">Sem mensagens ainda.</p>
        ) : (
          <div className="space-y-2">
            {thread.messages.map((msg) => (
              <ChatBubble key={msg.id} msg={msg} customerName={name} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Send notice (e.g. not delivered disclaimer) */}
      {sendNotice && (
        <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          ⚠️ {sendNotice}
        </div>
      )}

      {/* Send error */}
      {sendError && (
        <div className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {sendError}
        </div>
      )}

      {/* Composer */}
      {isHuman ? (
        <div className="shrink-0 border-t border-line2 bg-paper">
          <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-1.5">
            <span className="text-[10px] text-amber-700">
              ⚠️ Resposta registrada internamente — envio ao cliente será conectado na próxima etapa.
            </span>
          </div>
          <form onSubmit={onSend} className="flex items-end gap-2 px-4 py-3">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(e as unknown as FormEvent);
                }
              }}
              placeholder="Digite uma resposta… (Enter para enviar)"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-line2 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <button
              type="submit"
              disabled={sending || !replyText.trim()}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {sending ? "…" : "Enviar"}
            </button>
          </form>
        </div>
      ) : (
        <div className="shrink-0 border-t border-line2 bg-[#FAFAF8] px-4 py-3 text-center text-xs text-muted">
          {isAI
            ? "IA está respondendo automaticamente. Assuma o atendimento para enviar mensagens."
            : "Conversa finalizada."}
        </div>
      )}
    </>
  );
}

// ── Chat Bubble ───────────────────────────────────────────────────────────────

function ChatBubble({
  msg,
  customerName,
}: {
  msg:          Message;
  customerName: string;
}) {
  const senderType = msg.senderType;

  const isCustomer = senderType === "CUSTOMER" || msg.direction === "INBOUND";
  const isAI       = senderType === "AI";
  const isHuman    = senderType === "HUMAN";
  const isSystem   = senderType === "SYSTEM";

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-line2 px-3 py-1 text-[10px] text-muted">
          {msg.content}
        </span>
      </div>
    );
  }

  const alignRight = isAI || isHuman;

  const bubbleCls = isCustomer
    ? "rounded-bl-sm bg-paper text-ink border border-line"
    : isAI
    ? "rounded-br-sm bg-brand-500 text-white"
    : "rounded-br-sm bg-brand-500 text-white";

  const senderLabel = isCustomer
    ? customerName
    : isAI
    ? "IA"
    : "Atendente";

  return (
    <div className={`flex flex-col gap-1 ${alignRight ? "items-end" : "items-start"}`}>
      <span className="px-1 text-[10px] text-muted">{senderLabel}</span>
      <div className={`max-w-[72%] rounded-2xl px-4 py-2 text-sm shadow-sm ${bubbleCls}`}>
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
      </div>
      <span className="px-1 text-[10px] text-muted">{fmtTime(msg.sentAt)}</span>
    </div>
  );
}
