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

type ConvStatus = "OPEN" | "BOT" | "HUMAN" | "RESOLVED";
type Channel = "WHATSAPP" | "EMAIL" | "SMS";
type StatusFilter = "ALL" | "OPEN" | "HUMAN" | "RESOLVED";

interface ActiveOrderItem {
  name:     string;
  quantity: number;
  price:    string;
}

interface ActiveOrder {
  id:        string;
  status:    string;
  total:     string;
  type:      string;
  createdAt: string;
  items:     ActiveOrderItem[];
}

interface ConvSummary {
  id: string;
  status: ConvStatus;
  channel: Channel;
  assignedTo: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  customer: { name: string; phone: string };
  messages: { content: string; direction: string; type: string }[];
}

interface Message {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  type: string;
  mediaUrl: string | null;
  sentAt: string;
  externalStatus: string | null;
}

interface ConvDetail extends ConvSummary {
  messages: Message[];
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_META: Record<Channel, { label: string; icon: string }> = {
  WHATSAPP: { label: "WhatsApp", icon: "📱" },
  EMAIL:    { label: "Email",    icon: "✉️"  },
  SMS:      { label: "SMS",      icon: "💬"  },
};

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ALL",      label: "Todas"        },
  { id: "OPEN",     label: "Abertas"      },
  { id: "HUMAN",    label: "Atendimento"  },
  { id: "RESOLVED", label: "Resolvidas"   },
];

// ── Priority helpers ──────────────────────────────────────────────────────────

type PriorityLevel = "critical" | "attention" | "ok";

function handlerPriority(c: ConvSummary): number {
  if (c.status === "OPEN" && c.unreadCount > 0) return 0; // Aguardando humano
  if (c.status === "HUMAN")                     return 1; // Em atendimento
  if (c.status === "OPEN")                      return 2; // Aberta
  if (c.status === "BOT")                       return 3; // IA
  return 4; // RESOLVED
}

function convPriorityLevel(c: ConvSummary): PriorityLevel {
  if (c.status === "OPEN" && c.unreadCount > 0) return "critical";
  if (c.status === "OPEN" || c.status === "HUMAN") return "attention";
  return "ok";
}

type HandlerBadge = { label: string; cls: string };

function getHandlerBadge(c: ConvSummary): HandlerBadge {
  if (c.status === "OPEN" && c.unreadCount > 0)
    return { label: "Aguardando humano", cls: "bg-red-100 text-red-700 border-red-200" };
  if (c.status === "HUMAN")
    return { label: "Humano",   cls: "bg-green-100 text-green-700 border-green-200" };
  if (c.status === "BOT")
    return { label: "IA",       cls: "bg-purple-100 text-purple-700 border-purple-200" };
  if (c.status === "OPEN")
    return { label: "Aberta",   cls: "bg-blue-100 text-blue-700 border-blue-200" };
  return { label: "Resolvida",  cls: "bg-gray-100 text-gray-500 border-gray-200" };
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AtendimentoClient({
  userId,
  initialConvId,
}: {
  userId:        string;
  initialConvId?: string;
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ConvDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);

  // Mobile navigation: "list" shows the conversation list, "thread" shows the active thread
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [actionLoading, setActionLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Fetch conversation list ────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    const params = new URLSearchParams({ limit: "50" });
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (search.trim()) params.set("search", search.trim());

    try {
      const res = await fetch(`/api/conversations?${params}`);
      if (!res.ok) return;
      const json = await res.json();
      const items: ConvSummary[] = json.data?.items ?? json.data ?? [];
      setConversations(Array.isArray(items) ? items : []);
    } catch {
      // network error — keep current state
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter, search]);

  // Immediate refetch when filter/search changes
  useEffect(() => {
    setLoadingList(true);
    fetchList();
  }, [fetchList]);

  // Polling — re-subscribe whenever fetchList identity changes
  useEffect(() => {
    const id = setInterval(fetchList, 7000);
    return () => clearInterval(id);
  }, [fetchList]);

  // ── Fetch conversation thread ──────────────────────────────────────────────
  const fetchThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      setThread(json.data ?? null);
    } catch {
      // keep current
    }
  }, []);

  // Deep-link: auto-select conversation from URL param on mount
  useEffect(() => {
    if (initialConvId) {
      setSelectedId(initialConvId);
      setMobileView("thread");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      setActiveOrder(null);
      return;
    }
    setLoadingThread(true);
    fetchThread(selectedId).finally(() => setLoadingThread(false));
    // mark as read
    fetch(`/api/conversations/${selectedId}/read`, { method: "POST" }).catch(() => {});
    // fetch active order for this conversation's customer
    fetch(`/api/conversations/${selectedId}/order`)
      .then((r) => r.json())
      .then((res: { success: boolean; data: ActiveOrder | null }) => {
        setActiveOrder(res.success ? (res.data ?? null) : null);
      })
      .catch(() => setActiveOrder(null));
    // poll thread
    const id = setInterval(() => fetchThread(selectedId), 4000);
    return () => clearInterval(id);
  }, [selectedId, fetchThread]);

  // Scroll to bottom when thread messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages?.length]);

  // ── Derived list ──────────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const pd = handlerPriority(a) - handlerPriority(b);
      if (pd !== 0) return pd;
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });
  }, [conversations]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleAction(action: string) {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      await fetch(`/api/conversations/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "assign" ? { userId } : {}),
        }),
      });
      await Promise.all([fetchThread(selectedId), fetchList()]);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !selectedId) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text.trim(), type: "TEXT" }),
      });
      if (!res.ok) {
        const json = await res.json();
        setSendError(json.error ?? "Erro ao enviar");
        return;
      }
      setText("");
      await fetchThread(selectedId);
    } catch {
      setSendError("Falha de rede");
    } finally {
      setSending(false);
    }
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  function handleSelectConv(id: string) {
    setSelectedId(id);
    setMobileView("thread");
  }

  function handleMobileBack() {
    setMobileView("list");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex overflow-hidden"
      style={{ height: "calc(100vh - 56px)" }}
    >
      {/* ── LEFT PANEL: conversation list
            Mobile: full width, shown when mobileView === "list"
            Desktop: fixed 320px side panel, always visible ─────────────── */}
      <aside className={`
        flex-col border-r border-gray-200 bg-white
        ${mobileView === "list" ? "flex w-full" : "hidden"}
        lg:flex lg:w-80 lg:shrink-0
      `}>
        {/* Search */}
        <div className="border-b border-gray-100 px-3 pt-3 pb-2">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nome ou telefone…"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600 transition-colors"
            >
              Buscar
            </button>
          </form>
        </div>

        {/* Status filter chips */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-gray-100 px-3 py-2 scrollbar-hide">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                statusFilter === f.id
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
              Carregando…
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-gray-400">
              <span className="text-2xl">💬</span>
              <p>Nenhuma conversa encontrada.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {displayed.map((conv) => {
                const lastMsg = conv.messages[0];
                const preview = lastMsg
                  ? lastMsg.type !== "TEXT"
                    ? `[${lastMsg.type.toLowerCase()}]`
                    : lastMsg.content.slice(0, 60)
                  : "Sem mensagens";
                const badge = getHandlerBadge(conv);
                const isSelected = conv.id === selectedId;
                const isWaiting =
                  conv.status === "OPEN" && conv.unreadCount > 0;
                const priority = convPriorityLevel(conv);

                return (
                  <li key={conv.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectConv(conv.id)}
                      className={`w-full px-3 py-3 text-left transition-colors border-l-2 ${
                        isSelected
                          ? "bg-orange-50 border-orange-500"
                          : priority === "critical"
                          ? "border-red-400 bg-red-50/40 hover:bg-red-50/70"
                          : priority === "attention"
                          ? "border-amber-400 hover:bg-amber-50/30"
                          : "border-transparent hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Avatar */}
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isWaiting
                              ? "bg-red-100 text-red-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {initials(conv.customer.name)}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-sm font-semibold text-gray-900">
                              {conv.customer.name}
                            </span>
                            <span className="shrink-0 text-[10px] text-gray-400">
                              {fmtTime(conv.lastMessageAt)}
                            </span>
                          </div>

                          <div className="mt-0.5 flex items-center gap-1.5">
                            {/* Priority dot */}
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              priority === "critical" ? "bg-red-500 animate-pulse" :
                              priority === "attention" ? "bg-amber-400" :
                              "bg-green-400"
                            }`} />
                            {/* Channel */}
                            <span className="text-[10px] text-gray-400">
                              {CHANNEL_META[conv.channel]?.icon ?? "💬"}
                            </span>
                            {/* Unread badge */}
                            {conv.unreadCount > 0 && (
                              <span className="rounded-full bg-red-500 px-1.5 py-px text-[9px] font-bold text-white leading-none">
                                {conv.unreadCount}
                              </span>
                            )}
                            {/* Handler badge */}
                            <span
                              className={`rounded-full border px-1.5 py-px text-[9px] font-bold leading-none ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-xs text-gray-500">
                            {preview}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer count */}
        <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">
          {displayed.length} conversa{displayed.length !== 1 ? "s" : ""}
        </div>
      </aside>

      {/* ── RIGHT PANEL: conversation thread
            Mobile: full width, shown when mobileView === "thread"
            Desktop: flex-1 always visible ──────────────────────────────── */}
      <section className={`
        flex-col overflow-hidden
        ${mobileView === "thread" ? "flex w-full" : "hidden"}
        lg:flex lg:flex-1
      `}>
        {!selectedId ? (
          // Empty state
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-gray-400">
            <span className="text-5xl">💬</span>
            <p className="text-sm font-medium text-gray-500">
              Selecione uma conversa
            </p>
            <p className="text-xs text-gray-400">
              para ver o histórico e gerenciar o atendimento
            </p>
          </div>
        ) : loadingThread && !thread ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Carregando…
          </div>
        ) : thread ? (
          <ThreadPanel
            thread={thread}
            userId={userId}
            actionLoading={actionLoading}
            onAction={handleAction}
            text={text}
            setText={setText}
            sending={sending}
            sendError={sendError}
            onSend={handleSend}
            bottomRef={bottomRef}
            onBack={handleMobileBack}
            activeOrder={activeOrder}
          />
        ) : null}
      </section>
    </div>
  );
}

// ── Thread Panel ──────────────────────────────────────────────────────────────

interface ThreadPanelProps {
  thread: ConvDetail;
  userId: string;
  actionLoading: boolean;
  onAction: (action: string) => void;
  text: string;
  setText: (v: string) => void;
  sending: boolean;
  sendError: string | null;
  onSend: (e: FormEvent) => void;
  bottomRef: React.RefObject<HTMLDivElement>;
  onBack?: () => void;
  activeOrder?: ActiveOrder | null;
}

// ── ActiveOrderPanel ──────────────────────────────────────────

const DELAY_MINUTES = 20;

interface StatusMeta {
  label: string;
  badge: string; // tailwind classes for the badge
  dot?:  string; // optional animated dot color
}

const STATUS_META: Record<string, StatusMeta> = {
  PENDING:          { label: "Aguardando",        badge: "bg-amber-100  border-amber-200  text-amber-800"  },
  AWAITING_PAYMENT: { label: "Aguard. pagamento", badge: "bg-yellow-100 border-yellow-200 text-yellow-800" },
  CONFIRMED:        { label: "Confirmado",        badge: "bg-blue-100   border-blue-200   text-blue-800"   },
  PREPARING:        { label: "Em preparo",        badge: "bg-orange-100 border-orange-200 text-orange-800" },
  READY:            { label: "Pronto",            badge: "bg-teal-100   border-teal-200   text-teal-800"   },
  OUT_FOR_DELIVERY: { label: "Em entrega",        badge: "bg-purple-100 border-purple-200 text-purple-800" },
};

const DELAYED_META: StatusMeta = {
  label: "Atrasado",
  badge: "bg-red-100 border-red-200 text-red-700",
  dot:   "bg-red-500",
};

function isDelayed(createdAt: string, status: string): boolean {
  const terminal = ["DELIVERED", "CANCELLED", "READY", "OUT_FOR_DELIVERY"];
  if (terminal.includes(status)) return false;
  return (Date.now() - new Date(createdAt).getTime()) > DELAY_MINUTES * 60_000;
}

function orderPriorityLevel(status: string, createdAt: string): PriorityLevel {
  if (isDelayed(createdAt, status)) return "critical";
  if (["PENDING", "AWAITING_PAYMENT"].includes(status)) return "attention";
  return "ok";
}

function ActiveOrderPanel({ order }: { order: ActiveOrder }) {
  const [status,     setStatus]     = useState(order.status);
  const [updating,   setUpdating]   = useState<string | null>(null); // which action is loading
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);

  const total    = parseFloat(order.total);
  const items    = order.items.slice(0, 3);
  const more     = order.items.length - items.length;
  const delayed  = isDelayed(order.createdAt, status);
  const meta     = delayed ? DELAYED_META : (STATUS_META[status] ?? { label: status, badge: "bg-gray-100 border-gray-200 text-gray-600" });
  const priority = orderPriorityLevel(status, order.createdAt);

  async function applyAction(nextStatus: string, actionKey: string) {
    setUpdating(actionKey);
    setErrorMsg(null);
    try {
      const res  = await fetch(`/api/orders/${order.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (json.success) {
        setStatus(nextStatus);
      } else {
        setErrorMsg(json.error ?? "Erro ao atualizar");
      }
    } catch {
      setErrorMsg("Falha de rede");
    } finally {
      setUpdating(null);
    }
  }

  const canConfirm = ["PENDING", "AWAITING_PAYMENT"].includes(status);
  const canReady   = ["CONFIRMED", "PREPARING"].includes(status);
  const canCancel  = !["READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(status);
  const isTerminal = ["DELIVERED", "CANCELLED"].includes(status);

  return (
    <div className={`mt-2 rounded-xl border-2 overflow-hidden shadow-sm ${
      priority === "critical"
        ? "border-red-400 bg-red-50/30"
        : priority === "attention"
        ? "border-amber-400 bg-white"
        : "border-gray-200 bg-white"
    }`}>

      {/* Priority banner */}
      <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold border-b ${
        priority === "critical"
          ? "bg-red-100 text-red-700 border-red-200"
          : priority === "attention"
          ? "bg-amber-50 text-amber-700 border-amber-100"
          : "bg-green-50 text-green-700 border-green-100"
      }`}>
        <span>{priority === "critical" ? "🔴" : priority === "attention" ? "🟡" : "🟢"}</span>
        <span>
          {priority === "critical"
            ? "Pedido atrasado — agir agora"
            : priority === "attention"
            ? "Aguardando confirmação"
            : "Em preparo"}
        </span>
      </div>

      {/* Header row */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Pedido ativo
        </span>
        <span className={`ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10px] font-semibold ${meta.badge}`}>
          {delayed && (
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
          {meta.label}
        </span>
        <span className="ml-auto text-[10px] text-gray-400 tabular-nums">
          {Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000)} min
        </span>
        <a
          href="/orders"
          className="rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
        >
          Ver pedido
        </a>
      </div>

      {/* Items + total */}
      <div className="px-3 py-2">
        <p className="truncate text-xs text-gray-600">
          {items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}
          {more > 0 && <span className="text-gray-400"> +{more}</span>}
        </p>
        <p className="mt-0.5 text-xs font-bold text-gray-800">
          R$ {total.toFixed(2).replace(".", ",")}
        </p>
      </div>

      {/* Quick actions */}
      {!isTerminal && (
        <div className="flex gap-1.5 flex-wrap border-t border-gray-100 bg-gray-50 px-3 py-2">
          {canConfirm && (
            <button
              onClick={() => applyAction("CONFIRMED", "confirm")}
              disabled={updating !== null}
              className="rounded-lg bg-blue-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {updating === "confirm" ? "…" : "Confirmar pedido"}
            </button>
          )}
          {canReady && (
            <button
              onClick={() => applyAction("READY", "ready")}
              disabled={updating !== null}
              className="rounded-lg bg-teal-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
            >
              {updating === "ready" ? "…" : "Marcar como pronto"}
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => applyAction("CANCELLED", "cancel")}
              disabled={updating !== null}
              className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {updating === "cancel" ? "…" : "Cancelar pedido"}
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <p className="border-t border-red-100 bg-red-50 px-3 py-1.5 text-[11px] text-red-600">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

function ThreadPanel({
  thread,
  actionLoading,
  onAction,
  text,
  setText,
  sending,
  sendError,
  onSend,
  bottomRef,
  onBack,
  activeOrder,
}: ThreadPanelProps) {
  const badge = getHandlerBadge(thread);
  const channel = CHANNEL_META[thread.channel] ?? { label: thread.channel, icon: "💬" };
  const isResolved = thread.status === "RESOLVED";
  const isHuman = thread.status === "HUMAN";
  const canTakeOver = thread.status === "OPEN" || thread.status === "BOT";

  return (
    <>
      {/* ── Thread header ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">

        {/* Row 1: back button (mobile) + customer info + badges */}
        <div className="flex items-center gap-2">
          {/* Back button — mobile only */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Voltar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 lg:hidden"
            >
              ←
            </button>
          )}

          {/* Avatar + name */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
              {initials(thread.customer.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-900">
                {thread.customer.name}
              </p>
              <p className="text-xs text-gray-500">{thread.customer.phone}</p>
            </div>
          </div>

          {/* Badges — hidden on very small screens, shown sm+ */}
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              <span>{channel.icon}</span>
              <span className="hidden md:inline">{channel.label}</span>
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
        </div>

        {/* Row 2: action buttons — full-width row, scrollable on mobile */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {canTakeOver && (
            <button
              type="button"
              onClick={() => onAction("assign")}
              disabled={actionLoading}
              className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              Assumir atendimento
            </button>
          )}
          {isHuman && (
            <button
              type="button"
              onClick={() => onAction("unassign")}
              disabled={actionLoading}
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Devolver para fila
            </button>
          )}
          {!isResolved && (
            <button
              type="button"
              onClick={() => onAction("resolve")}
              disabled={actionLoading}
              className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Resolver
            </button>
          )}
          {isResolved && (
            <button
              type="button"
              onClick={() => onAction("reopen")}
              disabled={actionLoading}
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Reabrir
            </button>
          )}
        </div>

        {/* Row 3: active order panel */}
        {activeOrder && <ActiveOrderPanel order={activeOrder} />}
      </div>

      {/* ── Message thread ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4">
        {thread.messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400">Sem mensagens ainda.</p>
        ) : (
          <div className="space-y-2">
            {thread.messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} customerName={thread.customer.name} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Send error ────────────────────────────────────────────────── */}
      {sendError && (
        <div className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {sendError}
        </div>
      )}

      {/* ── Composer (only when human is handling) ────────────────────── */}
      {isHuman && !isResolved ? (
        <form
          onSubmit={onSend}
          className="flex shrink-0 items-end gap-2 border-t border-gray-200 bg-white px-4 py-3"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend(e as unknown as FormEvent);
              }
            }}
            placeholder="Digite uma mensagem… (Enter para enviar)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {sending ? "…" : "Enviar"}
          </button>
        </form>
      ) : isResolved ? (
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-400">
          Conversa resolvida.{" "}
          <button
            onClick={() => onAction("reopen")}
            className="font-semibold text-orange-500 hover:underline"
          >
            Reabrir
          </button>{" "}
          para enviar mensagens.
        </div>
      ) : (
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-400">
          Assuma o atendimento para enviar mensagens.
        </div>
      )}
    </>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  customerName,
}: {
  msg: Message;
  customerName: string;
}) {
  const isOutbound = msg.direction === "OUTBOUND";

  return (
    <div className={`flex flex-col gap-1 ${isOutbound ? "items-end" : "items-start"}`}>
      {/* Sender label */}
      <span className="px-1 text-[10px] text-gray-400">
        {isOutbound ? "Equipe" : customerName}
      </span>

      {/* Bubble */}
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
          isOutbound
            ? "rounded-br-sm bg-orange-500 text-white"
            : "rounded-bl-sm bg-white text-gray-900 border border-gray-100"
        }`}
      >
        {msg.type !== "TEXT" && (
          <p className={`mb-1 text-xs font-medium ${isOutbound ? "text-orange-200" : "text-gray-400"}`}>
            [{msg.type.toLowerCase()}]
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
      </div>

      {/* Time + delivery */}
      <div className="flex items-center gap-1 px-1 text-[10px] text-gray-400">
        <span>{fmtTime(msg.sentAt)}</span>
        {isOutbound && msg.externalStatus && (
          <span>
            {msg.externalStatus === "read" || msg.externalStatus === "delivered"
              ? "✓✓"
              : "✓"}
          </span>
        )}
      </div>
    </div>
  );
}
