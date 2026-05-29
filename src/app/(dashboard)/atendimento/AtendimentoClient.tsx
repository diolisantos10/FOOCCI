"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  FormEvent,
  type ReactNode,
} from "react";
import { isGuestIdentifier } from "@/lib/guest";
import { KNOWLEDGE_CATEGORIES } from "@/services/knowledge/RestaurantKnowledgeService";
import type { KnowledgeCategory } from "@/services/knowledge/RestaurantKnowledgeService";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConvStatus =
  | "OPEN"
  | "BOT"
  | "HUMAN"
  | "RESOLVED"
  | "AI_ATENDENDO"
  | "HUMANO_ASSUMIU";

type Channel = "WHATSAPP" | "EMAIL" | "SMS" | "QR_AGENT" | "WEB_AGENT" | "MANUAL";

type StatusFilter  = "ALL" | "AI_ON" | "AI_OFF" | "WAITING" | "RESOLVED" | "CRM_SENT" | "CRM_REPLIED";
type ChannelFilter = "ALL" | "WHATSAPP" | "MENU" | "MANUAL";
type SortOption    = "RECENT" | "OLDEST" | "NAME_AZ" | "NAME_ZA" | "CHANNEL";

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

interface ActiveDraftItem {
  quantity:  number;
  unitPrice: string;
  menuItem:  { name: string } | null;
}

interface ActiveDraft {
  id:              string;
  fulfillmentType: string;
  totalAmount:     string;
  updatedAt:       string;
  items:           ActiveDraftItem[];
}

interface ConvSummary {
  id:                  string;
  status:              ConvStatus;
  channel:             Channel;
  aiEnabled:           boolean;
  assignedTo:          string | null;
  unreadCount:         number;
  lastMessageAt:       string | null;
  createdAt:           string;
  customerName:        string | null;
  customerPhone:       string | null;
  contextType:         string | null;
  hasCustomerReplied?: boolean;
  customer:            { name: string; phone: string } | null;
  messages:            { content: string; direction: string; senderType: string | null; type: string }[];
}

interface Message {
  id:             string;
  direction:      "INBOUND" | "OUTBOUND";
  senderType:     string | null;
  content:        string;
  type:           string;
  mediaUrl:       string | null;
  sentAt:         string;
  externalStatus: string | null;
}

interface AttachmentState {
  file:       File;
  previewUrl: string | null;
  mediaType:  "IMAGE" | "DOCUMENT";
  fileName:   string;
}

interface ConvDetail extends ConvSummary {
  messages: Message[];
  customer: {
    id:    string;
    name:  string;
    phone: string;
    email: string | null;
  } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_META: Record<Channel, { label: string; icon: string }> = {
  WHATSAPP:  { label: "WhatsApp", icon: "📱" },
  EMAIL:     { label: "E-mail",   icon: "✉️"  },
  SMS:       { label: "SMS",      icon: "💬"  },
  QR_AGENT:  { label: "Cardápio", icon: "📋"  },
  WEB_AGENT: { label: "Cardápio", icon: "📋"  },
  MANUAL:    { label: "Manual",   icon: "✍️"  },
};

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ALL",         label: "Todas"         },
  { id: "AI_ON",       label: "IA ativa"      },
  { id: "AI_OFF",      label: "Humano"        },
  { id: "WAITING",     label: "Aguardando"    },
  { id: "RESOLVED",    label: "Resolvidas"    },
  { id: "CRM_SENT",    label: "CRM enviado"   },
  { id: "CRM_REPLIED", label: "Resposta CRM"  },
];

const CHANNEL_FILTERS: { id: ChannelFilter; label: string; icon: string }[] = [
  { id: "ALL",      label: "Todos",             icon: ""   },
  { id: "WHATSAPP", label: "WhatsApp",          icon: "📱" },
  { id: "MENU",     label: "Cardápio / Pedido", icon: "📋" },
  { id: "MANUAL",   label: "Manual",            icon: "✍️" },
];

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: "RECENT",  label: "Mais recentes" },
  { id: "OLDEST",  label: "Mais antigas"  },
  { id: "NAME_AZ", label: "Nome A–Z"      },
  { id: "NAME_ZA", label: "Nome Z–A"      },
  { id: "CHANNEL", label: "Canal"         },
];

// ── CRM / customer-reply helpers ─────────────────────────────────────────────

// Whether the conversation has at least one customer (inbound) message.
// Uses the backend-computed hasCustomerReplied field when available (reliable
// even when the latest message is an outbound CRM follow-up). Falls back to
// checking the loaded messages array — messages[0] is the most recent, but we
// scan all loaded messages with .some() to handle CRM follow-up edge cases.
function convHasCustomerReply(c: ConvSummary): boolean {
  if (c.hasCustomerReplied === true) return true;
  return (c.messages ?? []).some(
    (m) => m.direction === "INBOUND" || m.senderType === "CUSTOMER",
  );
}

// ── Priority helpers ──────────────────────────────────────────────────────────

type PriorityLevel = "critical" | "attention" | "ok";

function handlerPriority(c: ConvSummary): number {
  // CRM outbound-only (no customer reply) sorts below everything else.
  // Uses convHasCustomerReply so that CRM conversations where the customer
  // replied but the latest message is outbound (follow-up) are NOT demoted.
  const isCrm = c.contextType === "CRM_CAMPAIGN" || c.contextType === "CRM_AUTOMATION";
  if (isCrm && !convHasCustomerReply(c)) return 5;

  if (c.status === "OPEN" && c.unreadCount > 0)              return 0;
  if (c.status === "HUMAN" || c.status === "HUMANO_ASSUMIU") return 1;
  if (c.status === "OPEN")                                   return 2;
  if (c.status === "BOT"  || c.status === "AI_ATENDENDO")   return 3;
  return 4; // RESOLVED
}

function convPriorityLevel(c: ConvSummary): PriorityLevel {
  if (c.status === "OPEN" && c.unreadCount > 0)                         return "critical";
  if (["OPEN", "HUMAN", "HUMANO_ASSUMIU"].includes(c.status))           return "attention";
  return "ok";
}

type HandlerBadge = { label: string; cls: string };

function getHandlerBadge(c: ConvSummary): HandlerBadge {
  if (c.status === "RESOLVED")
    return { label: "Resolvida",  cls: "bg-gray-100   text-gray-500  border-gray-200"  };
  if (c.status === "OPEN" && c.unreadCount > 0)
    return { label: "Aguardando", cls: "bg-red-100    text-red-700   border-red-200"   };
  if (!c.aiEnabled || c.status === "HUMAN" || c.status === "HUMANO_ASSUMIU")
    return { label: "Humano",     cls: "bg-green-100  text-green-700 border-green-200" };
  return   { label: "IA ativa",   cls: "bg-purple-100 text-purple-700 border-purple-200" };
}

// CRM_CAMPAIGN and CRM_AUTOMATION are handled dynamically in getCrmBadge()
// so the badge reflects whether the customer has replied or not.
const CONTEXT_BADGE: Record<string, { label: string; cls: string }> = {
  ORDER_SUPPORT: { label: "Pós-venda", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  HUMAN_SUPPORT: { label: "Suporte",   cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
};

function getCrmBadge(c: ConvSummary): { label: string; cls: string } | null {
  if (c.contextType !== "CRM_CAMPAIGN" && c.contextType !== "CRM_AUTOMATION") return null;
  const isAuto = c.contextType === "CRM_AUTOMATION";
  if (convHasCustomerReply(c)) {
    return { label: "Resposta CRM", cls: "bg-amber-100 text-amber-700 border-amber-200" };
  }
  return {
    label: isAuto ? "Automação enviada" : "Campanha enviada",
    cls:   "bg-violet-100 text-violet-700 border-violet-200",
  };
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d    = new Date(iso);
  const now  = new Date();
  const hhmm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dMidnight     = new Date(d.getFullYear(),   d.getMonth(),   d.getDate()).getTime();

  if (dMidnight === todayMidnight)              return `Hoje · ${hhmm}`;
  if (dMidnight === todayMidnight - 86_400_000) return `Ontem · ${hhmm}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · ${hhmm}`;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── ScrollableChips ───────────────────────────────────────────────────────────

function ScrollableChips({ children, className }: { children: ReactNode; className?: string }) {
  const rail      = useRef<HTMLDivElement>(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sync = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    sync();
    const el = rail.current;
    if (!el) return;
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", sync); ro.disconnect(); };
  }, [sync]);

  const nudge = (dir: 1 | -1) =>
    rail.current?.scrollBy({ left: dir * 130, behavior: "smooth" });

  return (
    <div className="relative flex items-center">
      {canLeft && (
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Rolar esquerda"
          className="absolute left-0 z-10 flex h-full items-center bg-gradient-to-r from-white via-white/80 to-transparent pl-0.5 pr-3 text-sm text-gray-400 hover:text-gray-600"
        >
          ‹
        </button>
      )}
      <div
        ref={rail}
        className={`flex gap-1.5 overflow-x-auto scrollbar-hide w-full px-3 py-2 ${className ?? ""}`}
      >
        {children}
      </div>
      {canRight && (
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Rolar direita"
          className="absolute right-0 z-10 flex h-full items-center bg-gradient-to-l from-white via-white/80 to-transparent pr-0.5 pl-3 text-sm text-gray-400 hover:text-gray-600"
        >
          ›
        </button>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AtendimentoClient({
  userId,
  initialConvId,
  isOwner,
  isManagerOrOwner,
}: {
  userId:             string;
  initialConvId?:     string;
  isOwner?:           boolean;
  isManagerOrOwner?:  boolean;
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [loadingList,   setLoadingList]   = useState(true);

  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [thread,        setThread]        = useState<ConvDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const [activeOrder,   setActiveOrder]   = useState<ActiveOrder | null>(null);
  const [activeDraft,   setActiveDraft]   = useState<ActiveDraft | null>(null);

  const [mobileView,    setMobileView]    = useState<"list" | "thread">("list");

  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>("ALL");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("ALL");
  const [sortBy,        setSortBy]        = useState<SortOption>("RECENT");
  const [search,        setSearch]        = useState("");
  const [searchInput,   setSearchInput]   = useState("");

  const [deleteConvOpen,    setDeleteConvOpen]    = useState(false);
  const [deleteConvLoading, setDeleteConvLoading] = useState(false);
  const [deleteConvError,   setDeleteConvError]   = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [text,          setText]          = useState("");
  const [sending,       setSending]       = useState(false);
  const [sendError,     setSendError]     = useState<string | null>(null);
  const [sendNote,      setSendNote]      = useState<string | null>(null);
  const [attachment,    setAttachment]    = useState<AttachmentState | null>(null);
  const [uploading,     setUploading]     = useState(false);

  // ── Human-handoff alert sound ─────────────────────────────────────────────
  const handoffAudioRef       = useRef<HTMLAudioElement | null>(null);
  const [handoffAudioBlocked, setHandoffAudioBlocked] = useState(false);
  const [handoffSoundEnabled, setHandoffSoundEnabled] = useState(true);
  // Track conversation statuses to detect new transitions to HUMAN
  const prevStatusRef    = useRef<Map<string, ConvStatus>>(new Map());
  const alertedIds       = useRef<Set<string>>(new Set());
  const isFirstListLoad  = useRef(true);

  const [leftWidth,     setLeftWidth]     = useState<number>(320);
  const [isDesktop,     setIsDesktop]     = useState<boolean>(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Fetch conversation list ────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    // Server-side status filter only for RESOLVED (reduces payload)
    if (statusFilter === "RESOLVED") params.set("status", "RESOLVED");
    // Single-value channel filters handled server-side
    if (channelFilter === "WHATSAPP") params.set("channel", "WHATSAPP");
    if (channelFilter === "MANUAL")   params.set("channel", "MANUAL");
    // MENU (WEB_AGENT + QR_AGENT) and search are handled client-side

    try {
      // Use /api/chat/conversations: supports channel, all status values, aiEnabled
      const res = await fetch(`/api/chat/conversations?${params}`);
      if (!res.ok) return;
      const json = await res.json();
      const items: ConvSummary[] = json.data?.data ?? json.data ?? [];
      if (!Array.isArray(items)) return;

      setConversations(items);

      // ── Human-handoff sound detection ──────────────────────────────────────
      if (isFirstListLoad.current) {
        // On first load: seed the status map and alerted set WITHOUT playing sound
        for (const c of items) {
          prevStatusRef.current.set(c.id, c.status);
          if (c.status === "HUMAN" || c.status === "HUMANO_ASSUMIU") {
            alertedIds.current.add(c.id);
          }
        }
        isFirstListLoad.current = false;
      } else {
        const newHandoffs: string[] = [];
        for (const c of items) {
          const prev = prevStatusRef.current.get(c.id);
          const isHumanNow = c.status === "HUMAN" || c.status === "HUMANO_ASSUMIU";
          const wasHumanBefore = prev === "HUMAN" || prev === "HUMANO_ASSUMIU";
          // New conversation OR status just changed to HUMAN
          if (isHumanNow && !wasHumanBefore && !alertedIds.current.has(c.id)) {
            newHandoffs.push(c.id);
          }
          prevStatusRef.current.set(c.id, c.status);
          // Clear alert tracking when conversation returns to AI
          if (!isHumanNow) alertedIds.current.delete(c.id);
        }
        if (newHandoffs.length > 0 && handoffSoundEnabled) {
          const audio = handoffAudioRef.current;
          if (audio) {
            audio.currentTime = 0;
            audio.play().catch((err: unknown) => {
              if (err instanceof DOMException && err.name === "NotAllowedError") {
                setHandoffAudioBlocked(true);
              }
            });
          }
          newHandoffs.forEach((id) => alertedIds.current.add(id));
        }
      }
    } catch {
      // network error — keep current state
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter, channelFilter, handoffSoundEnabled]);

  // Immediate refetch when filter/search changes
  useEffect(() => {
    setLoadingList(true);
    fetchList();
  }, [fetchList]);

  // Polling
  useEffect(() => {
    const id = setInterval(fetchList, 7000);
    return () => clearInterval(id);
  }, [fetchList]);

  // Desktop media query + localStorage panel width
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    try {
      const stored = localStorage.getItem("atendimento-left-width");
      if (stored) {
        const n = parseInt(stored, 10);
        if (n >= 260 && n <= 480) setLeftWidth(n);
      }
    } catch { /* storage unavailable */ }
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    try { localStorage.setItem("atendimento-left-width", String(leftWidth)); } catch { /* ignore */ }
  }, [leftWidth, isDesktop]);

  // ── Handoff alert sound initialization ────────────────────────────────────
  useEffect(() => {
    const audio = new Audio("/sounds/foocci-handoff-alert.wav");
    handoffAudioRef.current = audio;
    // Restore user preference
    try {
      const stored = localStorage.getItem("handoff-sound-enabled");
      if (stored === "false") setHandoffSoundEnabled(false);
    } catch { /* ignore */ }
    return () => { audio.pause(); audio.src = ""; };
  }, []);

  // ── Inactivity-timeout pollers (run every 60 s while page is open) ──────
  // check-timeouts:            human hasn't replied → customer waiting → return to AI
  // check-customer-inactivity: human replied        → customer silent  → return to AI
  useEffect(() => {
    const run = () => {
      const refresh = (d: { data?: { timedOut?: string[] } }) => {
        if ((d.data?.timedOut?.length ?? 0) > 0) fetchList();
      };
      fetch("/api/atendimento/handoff/check-timeouts", { method: "POST" })
        .then((r) => r.json()).then(refresh).catch(() => {});
      fetch("/api/atendimento/handoff/check-customer-inactivity", { method: "POST" })
        .then((r) => r.json()).then(refresh).catch(() => {});
    };
    run();
    const id = setInterval(run, 60_000);
    return () => clearInterval(id);
  }, [fetchList]);

  // ── Fetch conversation thread ──────────────────────────────────────────────
  const fetchThread = useCallback(async (id: string) => {
    try {
      const res  = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      setThread(json.data ?? null);
    } catch {
      // keep current
    }
  }, []);

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
      setActiveDraft(null);
      return;
    }
    setSendError(null);
    setSendNote(null);
    setLoadingThread(true);
    fetchThread(selectedId).finally(() => setLoadingThread(false));
    fetch(`/api/conversations/${selectedId}/read`, { method: "POST" }).catch(() => {});
    fetch(`/api/conversations/${selectedId}/order`)
      .then((r) => r.json())
      .then((res: { success: boolean; data: { order: ActiveOrder | null; draft: ActiveDraft | null } | null }) => {
        setActiveOrder(res.success ? (res.data?.order ?? null) : null);
        setActiveDraft(res.success ? (res.data?.draft ?? null) : null);
      })
      .catch(() => { setActiveOrder(null); setActiveDraft(null); });
    const id = setInterval(() => fetchThread(selectedId), 4000);
    return () => clearInterval(id);
  }, [selectedId, fetchThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages?.length]);

  // ── Human-handoff badge count ─────────────────────────────────────────────
  const humanHandoffCount = useMemo(
    () => conversations.filter((c) => c.status === "HUMAN" || c.status === "HUMANO_ASSUMIU").length,
    [conversations],
  );

  function unlockHandoffAudio() {
    const audio = handoffAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play()
      .then(() => setHandoffAudioBlocked(false))
      .catch(() => {});
  }

  // ── Derived list — client-side filter + sort ──────────────────────────────
  const displayed = useMemo(() => {
    let items = [...conversations];

    // Search: name, phone, last message content (excluding system events)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((c) => {
        const name      = (c.customer?.name    ?? c.customerName  ?? "").toLowerCase();
        const phone     = (c.customer?.phone   ?? c.customerPhone ?? "").toLowerCase();
        const visibleMsg = (c.messages ?? []).find((m) => m.senderType !== "SYSTEM");
        const lastMsg   = (visibleMsg?.content ?? "").toLowerCase();
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    // CRM context helpers — convHasCustomerReply defined at module level.
    const isCrmOrigin = (c: ConvSummary) =>
      c.contextType === "CRM_CAMPAIGN" || c.contextType === "CRM_AUTOMATION";

    // Status filter (client-side for non-RESOLVED)
    if (statusFilter === "CRM_SENT") {
      // Show only CRM outbound-only conversations (customer hasn't replied).
      items = items.filter((c) => isCrmOrigin(c) && !convHasCustomerReply(c));
    } else if (statusFilter === "CRM_REPLIED") {
      // Show only CRM conversations where customer replied.
      items = items.filter((c) => isCrmOrigin(c) && convHasCustomerReply(c));
    } else if (statusFilter !== "RESOLVED") {
      // Default "Todas": hide CRM outbound-only — they don't need human attention.
      // Conversations where the customer replied (hasCustomerReplied=true OR any
      // loaded INBOUND message) remain visible even if the latest msg is outbound.
      if (statusFilter === "ALL") {
        items = items.filter((c) => !isCrmOrigin(c) || convHasCustomerReply(c));
      }
      if (statusFilter === "AI_ON") {
        items = items.filter((c) => c.aiEnabled && c.status !== "RESOLVED");
      }
      if (statusFilter === "AI_OFF") {
        items = items.filter((c) => !c.aiEnabled && c.status !== "RESOLVED");
      }
      if (statusFilter === "WAITING") {
        items = items.filter((c) => c.unreadCount > 0 && c.status !== "RESOLVED");
      }
    }

    // Channel filter (client-side for MENU, otherwise already server-filtered)
    if (channelFilter === "MENU") {
      items = items.filter(
        (c) => c.channel === "WEB_AGENT" || c.channel === "QR_AGENT",
      );
    }

    return items.sort((a, b) => {
      if (sortBy === "NAME_AZ") {
        const na = (a.customer?.name ?? a.customerName ?? "").toLowerCase();
        const nb = (b.customer?.name ?? b.customerName ?? "").toLowerCase();
        return na.localeCompare(nb, "pt-BR");
      }
      if (sortBy === "NAME_ZA") {
        const na = (a.customer?.name ?? a.customerName ?? "").toLowerCase();
        const nb = (b.customer?.name ?? b.customerName ?? "").toLowerCase();
        return nb.localeCompare(na, "pt-BR");
      }
      if (sortBy === "CHANNEL") {
        if (a.channel !== b.channel) return a.channel.localeCompare(b.channel);
        const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : new Date(a.createdAt).getTime();
        const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : new Date(b.createdAt).getTime();
        return tb - ta;
      }
      // RECENT or OLDEST: pure chronological sort by last activity.
      // lastMessageAt is updated on every inbound/outbound message.
      // CRM outbound-only conversations leave lastMessageAt=null; the backend
      // now sorts them last (NULLS LAST) so they don't surface as fake "recent".
      // P2 TODO: evaluate WhatsApp-like priority sorting — surface OPEN+unread
      // conversations above purely chronological order using handlerPriority().
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : new Date(a.createdAt).getTime();
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : new Date(b.createdAt).getTime();
      return sortBy === "OLDEST" ? ta - tb : tb - ta;
    });
  }, [conversations, statusFilter, channelFilter, search, sortBy]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleAction(action: string) {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      await fetch(`/api/conversations/${selectedId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          action,
          ...(action === "assign" ? { userId } : {}),
        }),
      });
      await Promise.all([fetchThread(selectedId), fetchList()]);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAIAction(action: "takeover" | "release") {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      await fetch(`/api/chat/conversations/${selectedId}/${action}`, {
        method: "POST",
      });
      await Promise.all([fetchThread(selectedId), fetchList()]);
    } finally {
      setActionLoading(false);
    }
  }

  function handleAttachmentSelect(file: File) {
    const isImage   = file.type.startsWith("image/");
    const mediaType = isImage ? ("IMAGE" as const) : ("DOCUMENT" as const);
    const previewUrl = isImage ? URL.createObjectURL(file) : null;
    setAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl, mediaType, fileName: file.name };
    });
  }

  function handleAttachmentClear() {
    setAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    if (!attachment && !text.trim()) return;

    setSending(true);
    setSendError(null);
    setSendNote(null);

    let mediaUrl: string | null = null;
    let messageType = "TEXT";

    if (attachment) {
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", attachment.file);
        const uploadRes = await fetch("/api/atendimento/upload", { method: "POST", body: form });
        if (!uploadRes.ok) {
          const json = await uploadRes.json();
          setSendError(json.error ?? "Falha no upload do arquivo.");
          setSending(false);
          setUploading(false);
          return;
        }
        const uploadJson = await uploadRes.json();
        mediaUrl    = uploadJson.data?.url ?? null;
        messageType = attachment.mediaType; // "IMAGE" | "DOCUMENT"
      } catch {
        setSendError("Falha de rede ao enviar o arquivo.");
        setSending(false);
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    try {
      const caption = text.trim() ||
        (attachment?.mediaType === "DOCUMENT" ? attachment.fileName : "");

      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          content:  caption,
          type:     messageType,
          ...(mediaUrl ? { mediaUrl } : {}),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        const raw = json.error ?? "Erro ao enviar";
        setSendError(
          raw === "WHATSAPP_NOT_CONFIGURED"
            ? "WhatsApp não configurado. Configure em Configurações → WhatsApp."
            : raw
        );
        return;
      }
      const json = await res.json();
      setText("");
      // Clean up attachment
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      setAttachment(null);
      if (json.data?._internalOnly) {
        setSendNote("Mensagem registrada internamente. Este canal não usa WhatsApp.");
      }
      await fetchThread(selectedId);
    } catch {
      setSendError("Falha de rede");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteConversation() {
    if (!selectedId) return;
    const idToDelete = selectedId;
    setDeleteConvLoading(true);
    setDeleteConvError(null);
    try {
      const res  = await fetch(`/api/chat/conversations/${idToDelete}`, { method: "DELETE" });
      const json = await res.json() as { success: boolean; error?: string };
      if (json.success) {
        setConversations((prev) => prev.filter((c) => c.id !== idToDelete));
        setSelectedId(null);
        setDeleteConvOpen(false);
      } else {
        setDeleteConvError(json.error ?? "Erro ao apagar conversa.");
      }
    } catch {
      setDeleteConvError("Falha de rede ao apagar conversa.");
    } finally {
      setDeleteConvLoading(false);
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

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidth;
    const onMove = (me: MouseEvent) => {
      setLeftWidth(Math.min(480, Math.max(260, startW + me.clientX - startX)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [leftWidth]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex overflow-hidden"
      style={{ height: "calc(100vh - 56px)" }}
    >
      {/* ── LEFT PANEL ───────────────────────────────────────────────────── */}
      <aside
        className={`
          flex-col border-r border-gray-200 bg-white overflow-hidden
          ${mobileView === "list" ? "flex w-full" : "hidden"}
          lg:flex lg:w-80 lg:shrink-0
        `}
        style={isDesktop ? { width: leftWidth } : undefined}
      >
        {/* Search + Sort */}
        <div className="border-b border-gray-100 px-3 pt-3 pb-2 space-y-2">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nome, telefone ou mensagem…"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600 transition-colors"
            >
              Buscar
            </button>
          </form>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-gray-400">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 focus:border-orange-400 focus:outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Human-handoff alert banner */}
        {handoffAudioBlocked && (
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-1.5">
            <button
              type="button"
              onClick={unlockHandoffAudio}
              className="w-full rounded-md bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-600 transition-colors"
            >
              🔔 Ativar sons de atendimento
            </button>
          </div>
        )}

        {/* Human-handoff count + sound toggle */}
        {humanHandoffCount > 0 && (
          <div className="flex items-center justify-between border-b border-orange-200 bg-orange-50 px-3 py-1.5">
            <span className="text-xs font-semibold text-orange-700">
              🙋 {humanHandoffCount} aguardando atendimento humano
            </span>
            <button
              type="button"
              title={handoffSoundEnabled ? "Desativar som de atendimento" : "Ativar som de atendimento"}
              onClick={() => {
                const next = !handoffSoundEnabled;
                setHandoffSoundEnabled(next);
                try { localStorage.setItem("handoff-sound-enabled", String(next)); } catch { /* ignore */ }
              }}
              className="ml-2 rounded p-0.5 text-orange-600 hover:bg-orange-100 transition-colors"
            >
              {handoffSoundEnabled ? "🔔" : "🔕"}
            </button>
          </div>
        )}

        {/* Status filter chips */}
        <div className="border-b border-gray-100">
          <ScrollableChips>
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
                {f.label}{f.id === "AI_OFF" && humanHandoffCount > 0
                  ? ` (${humanHandoffCount})`
                  : ""}
              </button>
            ))}
          </ScrollableChips>
        </div>

        {/* Channel filter chips */}
        <div className="border-b border-gray-100">
          <ScrollableChips className="py-1.5">
            {CHANNEL_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setChannelFilter(f.id)}
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  channelFilter === f.id
                    ? "bg-gray-700 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {f.icon ? `${f.icon} ` : ""}{f.label}
              </button>
            ))}
          </ScrollableChips>
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
                // Skip SYSTEM messages (handoff events) for the preview snippet.
                // The API already excludes them from the messages subquery, but
                // guard here too in case older cached data slips through.
                const lastMsg  = (conv.messages ?? []).find((m) => m.senderType !== "SYSTEM");
                const preview  = lastMsg
                  ? (lastMsg.type && lastMsg.type !== "TEXT")
                    ? `[${lastMsg.type.toLowerCase()}]`
                    : (lastMsg.content?.slice(0, 60) ?? "")
                  : "Sem mensagens";
                const badge      = getHandlerBadge(conv);
                const crmBadge   = getCrmBadge(conv);
                const isSelected = conv.id === selectedId;
                const isWaiting  = conv.status === "OPEN" && conv.unreadCount > 0;
                const priority   = convPriorityLevel(conv);
                const chanMeta   = CHANNEL_META[conv.channel] ?? { label: conv.channel, icon: "💬" };

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
                          {initials(conv.customer?.name ?? conv.customerName ?? "?")}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-sm font-semibold text-gray-900">
                              {conv.customer?.name ?? conv.customerName ?? "Desconhecido"}
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
                            {/* Channel badge */}
                            <span className="text-[10px] text-gray-400" title={chanMeta.label}>
                              {chanMeta.icon}
                            </span>
                            {/* Unread badge */}
                            {conv.unreadCount > 0 && (
                              <span className="rounded-full bg-red-500 px-1.5 py-px text-[9px] font-bold text-white leading-none">
                                {conv.unreadCount}
                              </span>
                            )}
                            {/* Handler badge */}
                            <span className={`rounded-full border px-1.5 py-px text-[9px] font-bold leading-none ${badge.cls}`}>
                              {badge.label}
                            </span>
                            {/* Context badge — CRM (dynamic) or other special contexts */}
                            {crmBadge ? (
                              <span className={`rounded-full border px-1.5 py-px text-[9px] font-bold leading-none ${crmBadge.cls}`}>
                                {crmBadge.label}
                              </span>
                            ) : conv.contextType && CONTEXT_BADGE[conv.contextType] && (
                              <span className={`rounded-full border px-1.5 py-px text-[9px] font-bold leading-none ${CONTEXT_BADGE[conv.contextType]!.cls}`}>
                                {CONTEXT_BADGE[conv.contextType]!.label}
                              </span>
                            )}
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

      {/* ── DRAG HANDLE — desktop only ───────────────────────────────────── */}
      <div
        role="separator"
        aria-label="Redimensionar painel"
        onMouseDown={handleDividerMouseDown}
        className="hidden lg:flex w-1 shrink-0 cursor-col-resize bg-gray-200 hover:bg-orange-400 active:bg-orange-500 transition-colors"
      />

      {deleteConvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">Apagar conversa?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Essa ação remove a conversa, mensagens e dados vinculados a esse atendimento. Essa ação não pode ser desfeita.
            </p>
            {deleteConvError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{deleteConvError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => { setDeleteConvOpen(false); setDeleteConvError(null); }}
                disabled={deleteConvLoading}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConversation}
                disabled={deleteConvLoading}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {deleteConvLoading ? "Apagando…" : "Sim, apagar conversa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
      <section className={`
        flex-col overflow-hidden
        ${mobileView === "thread" ? "flex w-full" : "hidden"}
        lg:flex lg:flex-1
      `}>
        {!selectedId ? (
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
            onAIAction={handleAIAction}
            text={text}
            setText={setText}
            sending={sending}
            sendError={sendError}
            sendNote={sendNote}
            onSend={handleSend}
            bottomRef={bottomRef}
            onBack={handleMobileBack}
            activeOrder={activeOrder}
            activeDraft={activeDraft}
            attachment={attachment}
            onAttachmentSelect={handleAttachmentSelect}
            onAttachmentClear={handleAttachmentClear}
            uploading={uploading}
            isOwner={isOwner}
            isManagerOrOwner={isManagerOrOwner}
            onDeleteConversation={() => { setDeleteConvOpen(true); setDeleteConvError(null); }}
            onOrderCreated={() => { if (selectedId) fetchThread(selectedId); }}
          />
        ) : null}
      </section>
    </div>
  );
}

// ── Thread Panel ──────────────────────────────────────────────────────────────

interface ThreadPanelProps {
  thread:                  ConvDetail;
  userId:                  string;
  actionLoading:           boolean;
  onAction:                (action: string) => void;
  onAIAction:              (action: "takeover" | "release") => void;
  text:                    string;
  setText:                 (v: string) => void;
  sending:                 boolean;
  sendError:               string | null;
  sendNote:                string | null;
  onSend:                  (e: FormEvent) => void;
  bottomRef:               React.RefObject<HTMLDivElement>;
  onBack?:                 () => void;
  activeOrder?:            ActiveOrder | null;
  activeDraft?:            ActiveDraft | null;
  attachment:              AttachmentState | null;
  onAttachmentSelect:      (file: File) => void;
  onAttachmentClear:       () => void;
  uploading:               boolean;
  isOwner?:                boolean;
  isManagerOrOwner?:       boolean;
  onDeleteConversation?:   () => void;
  onOrderCreated?:         () => void;
}

// ── ActiveDraftPanel ──────────────────────────────────────────

const FULFILLMENT_LABEL: Record<string, string> = {
  DELIVERY: "Entrega",
  PICKUP:   "Retirada",
  DINE_IN:  "Mesa",
};

function ActiveDraftPanel({ draft }: { draft: ActiveDraft }) {
  const items = draft.items.slice(0, 4);
  const more  = draft.items.length - items.length;
  const total = parseFloat(draft.totalAmount);
  const label = FULFILLMENT_LABEL[draft.fulfillmentType] ?? draft.fulfillmentType;

  return (
    <div className="mt-2 rounded-xl border-2 border-blue-300 bg-blue-50/40 overflow-hidden shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-blue-200 bg-blue-100/60 px-3 py-1.5">
        <span className="text-[11px] font-bold uppercase tracking-widest text-blue-700">
          Rascunho IA
        </span>
        <span className="ml-1 rounded-full bg-blue-200 px-2 py-px text-[10px] font-semibold text-blue-800">
          {label}
        </span>
        <span className="ml-auto text-[10px] text-blue-500">em andamento</span>
      </div>
      <div className="px-3 py-2">
        {items.length === 0 ? (
          <p className="text-xs text-blue-400 italic">Nenhum item adicionado ainda</p>
        ) : (
          <p className="truncate text-xs text-gray-700">
            {items.map((i) => `${i.quantity}× ${i.menuItem?.name ?? "?"}`).join(" · ")}
            {more > 0 && <span className="text-gray-400"> +{more}</span>}
          </p>
        )}
        {total > 0 && (
          <p className="mt-0.5 text-xs font-bold text-gray-800">
            R$ {total.toFixed(2).replace(".", ",")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── ActiveOrderPanel ──────────────────────────────────────────

const DELAY_MINUTES = 20;

interface StatusMeta {
  label: string;
  badge: string;
  dot?:  string;
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
  if (isDelayed(createdAt, status))                              return "critical";
  if (["PENDING", "AWAITING_PAYMENT"].includes(status))         return "attention";
  return "ok";
}

function ActiveOrderPanel({ order, isManagerOrOwner }: { order: ActiveOrder; isManagerOrOwner?: boolean }) {
  const [status,   setStatus]   = useState(order.status);
  const [updating, setUpdating] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [manualConfirmOpen,    setManualConfirmOpen]    = useState(false);
  const [manualConfirmChecked, setManualConfirmChecked] = useState(false);
  const [manualConfirmReason,  setManualConfirmReason]  = useState("");
  const [manualConfirming,     setManualConfirming]     = useState(false);
  const [manualConfirmError,   setManualConfirmError]   = useState<string | null>(null);

  async function handleManualConfirm() {
    if (!manualConfirmChecked || !manualConfirmReason.trim()) return;
    setManualConfirming(true);
    setManualConfirmError(null);
    try {
      const res  = await fetch(`/api/orders/${order.id}/confirm-manual-payment`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ reason: manualConfirmReason.trim() }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (json.success) {
        setStatus("CONFIRMED");
        setManualConfirmOpen(false);
        setManualConfirmChecked(false);
        setManualConfirmReason("");
      } else {
        setManualConfirmError(json.error ?? "Erro ao confirmar");
      }
    } catch {
      setManualConfirmError("Falha de rede");
    } finally {
      setManualConfirming(false);
    }
  }

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

  const canConfirm = status === "PENDING";
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

      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Pedido ativo
        </span>
        <span className={`ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10px] font-semibold ${meta.badge}`}>
          {delayed && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
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

      <div className="px-3 py-2">
        <p className="truncate text-xs text-gray-600">
          {items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}
          {more > 0 && <span className="text-gray-400"> +{more}</span>}
        </p>
        <p className="mt-0.5 text-xs font-bold text-gray-800">
          R$ {total.toFixed(2).replace(".", ",")}
        </p>
      </div>

      {status === "AWAITING_PAYMENT" && (
        <div className="border-t border-yellow-100 bg-yellow-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-yellow-800">
            ⏳ Pix ainda não aprovado — aguardando confirmação do pagamento
          </p>
          {isManagerOrOwner && (
            <button
              onClick={() => setManualConfirmOpen(true)}
              className="mt-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
            >
              Confirmar pagamento manualmente
            </button>
          )}
        </div>
      )}

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

      {errorMsg && (
        <p className="border-t border-red-100 bg-red-50 px-3 py-1.5 text-[11px] text-red-600">
          {errorMsg}
        </p>
      )}

      {manualConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">Confirmar pagamento manualmente?</h3>
            <p className="mt-1 text-xs text-gray-500">
              Use apenas se você verificou o pagamento no painel do Mercado Pago.
              Esta ação marca o pedido como pago e o envia para produção.
            </p>
            <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              Pedido #{order.id.slice(-6).toUpperCase()} · R$ {parseFloat(order.total).toFixed(2).replace(".", ",")}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={manualConfirmChecked}
                onChange={(e) => setManualConfirmChecked(e.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              Confirmei o pagamento no painel do Mercado Pago
            </label>
            <textarea
              value={manualConfirmReason}
              onChange={(e) => setManualConfirmReason(e.target.value)}
              placeholder="Ex: Pagamento confirmado manualmente no painel Mercado Pago às 19:42."
              rows={2}
              className="mt-2 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
            {manualConfirmError && (
              <p className="mt-1 text-xs text-red-600">{manualConfirmError}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setManualConfirmOpen(false); setManualConfirmChecked(false); setManualConfirmReason(""); setManualConfirmError(null); }}
                disabled={manualConfirming}
                className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleManualConfirm}
                disabled={manualConfirming || !manualConfirmChecked || !manualConfirmReason.trim()}
                className="flex-1 rounded-xl bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40 transition-colors"
              >
                {manualConfirming ? "Confirmando…" : "Confirmar pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ManualOrderModal ──────────────────────────────────────────────────────────

interface MenuItemRow {
  id:           string;
  name:         string;
  price:        number;
  categoryName: string;
}

interface CartLine {
  menuItemId: string;
  name:       string;
  price:      number;
  quantity:   number;
}

function ManualOrderModal({
  conversationId,
  customerName: initName,
  customerPhone: initPhone,
  onClose,
  onCreated,
}: {
  conversationId?: string;
  customerName?:  string | null;
  customerPhone?: string | null;
  onClose:        () => void;
  onCreated:      (orderId: string) => void;
}) {
  const [customerName,    setCustomerName]    = useState(initName  ?? "");
  const [customerPhone,   setCustomerPhone]   = useState(initPhone ?? "");
  const [orderType,       setOrderType]       = useState<"DELIVERY" | "PICKUP">("PICKUP");
  const [paymentMethod,   setPaymentMethod]   = useState<"CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "CARD_MACHINE">("CASH");
  const [paymentStatus,   setPaymentStatus]   = useState<"PAID" | "PAY_ON_DELIVERY">("PAID");
  const [notes,           setNotes]           = useState("");
  const [menuItems,       setMenuItems]       = useState<MenuItemRow[]>([]);
  const [menuLoading,     setMenuLoading]     = useState(false);
  const [itemSearch,      setItemSearch]      = useState("");
  const [cart,            setCart]            = useState<CartLine[]>([]);
  const [submitting,      setSubmitting]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  useEffect(() => {
    setMenuLoading(true);
    fetch("/api/menu/items")
      .then((r) => r.json())
      .then((res: { success?: boolean; data?: MenuItemRow[] }) => {
        if (res.success && Array.isArray(res.data)) setMenuItems(res.data);
      })
      .catch(() => {})
      .finally(() => setMenuLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemSearch.toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.categoryName.toLowerCase().includes(q)
    );
  }, [menuItems, itemSearch]);

  function addToCart(item: MenuItemRow) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }

  function adjustQty(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l)
        .filter((l) => l.quantity > 0)
    );
  }

  const cartTotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);

  async function handleSubmit() {
    if (!customerName.trim()) { setError("Nome do cliente é obrigatório"); return; }
    if (cart.length === 0)    { setError("Adicione pelo menos um item"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/manual", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          customerName:  customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          notes:         notes.trim() || undefined,
          deliveryFee:   0,
          type:          orderType,
          paymentMethod,
          paymentStatus,
          source:        "whatsapp_manual",
          conversationId: conversationId || undefined,
          items:         cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
        }),
      });
      const json = await res.json() as { success?: boolean; orderId?: string; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Erro ao criar pedido");
        return;
      }
      onCreated(json.orderId!);
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4">
      <div className="flex h-[90vh] sm:h-auto sm:max-h-[90vh] w-full sm:max-w-xl flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 shrink-0">
          <div>
            <p className="text-sm font-bold text-gray-900">Criar pedido</p>
            <p className="text-xs text-gray-500 mt-0.5">Pedido via WhatsApp ou balcão</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Customer info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome do cliente"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Telefone</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="5511999999999"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>

          {/* Order type + payment */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as "DELIVERY" | "PICKUP")}
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-700 focus:border-orange-300 focus:outline-none"
              >
                <option value="PICKUP">Retirada</option>
                <option value="DELIVERY">Entrega</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Pagamento</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-700 focus:border-orange-300 focus:outline-none"
              >
                <option value="CASH">Dinheiro</option>
                <option value="PIX">Pix</option>
                <option value="CREDIT_CARD">Crédito</option>
                <option value="DEBIT_CARD">Débito</option>
                <option value="CARD_MACHINE">Máquina</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as "PAID" | "PAY_ON_DELIVERY")}
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-700 focus:border-orange-300 focus:outline-none"
              >
                <option value="PAID">Pago</option>
                <option value="PAY_ON_DELIVERY">Pagar na entrega</option>
              </select>
            </div>
          </div>

          {/* Product picker */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Produtos</label>
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Buscar produto..."
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
            />
            {menuLoading ? (
              <p className="text-center text-xs text-gray-400 py-4">Carregando produtos…</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                {filteredItems.length === 0 ? (
                  <p className="py-3 text-center text-xs text-gray-400">Nenhum produto encontrado</p>
                ) : (
                  filteredItems.slice(0, 50).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addToCart(item)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-orange-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-gray-800">{item.name}</p>
                        <p className="text-[10px] text-gray-400">{item.categoryName}</p>
                      </div>
                      <span className="ml-3 shrink-0 text-xs font-semibold text-orange-600">
                        + R$ {item.price.toFixed(2).replace(".", ",")}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Cart */}
          {cart.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
              {cart.map((line) => (
                <div key={line.menuItemId} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-gray-800">{line.name}</p>
                    <p className="text-[10px] text-gray-400">
                      R$ {(line.price * line.quantity).toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => adjustQty(line.menuItemId, -1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 text-sm leading-none"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-xs font-semibold text-gray-700">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => adjustQty(line.menuItemId, 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 text-sm leading-none"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ex: sem cebola, endereço de entrega…"
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-5 py-4 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-base font-bold text-gray-900">
              R$ {cartTotal.toFixed(2).replace(".", ",")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || cart.length === 0 || !customerName.trim()}
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Criando…" : "Confirmar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ThreadPanel component ─────────────────────────────────────────────────────

function ThreadPanel({
  thread,
  actionLoading,
  onAction,
  onAIAction,
  text,
  setText,
  sending,
  sendError,
  sendNote,
  onSend,
  bottomRef,
  onBack,
  activeOrder,
  activeDraft,
  attachment,
  onAttachmentSelect,
  onAttachmentClear,
  uploading,
  isOwner,
  isManagerOrOwner,
  onDeleteConversation,
  onOrderCreated,
}: ThreadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const badge          = getHandlerBadge(thread);
  const channel        = CHANNEL_META[thread.channel] ?? { label: thread.channel, icon: "💬" };
  const isResolved     = thread.status === "RESOLVED";
  const isAIActive     = thread.aiEnabled && !isResolved;
  const isHumanHandling = !thread.aiEnabled && !isResolved;

  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [orderCreatedId,  setOrderCreatedId]  = useState<string | null>(null);

  return (
    <>
      {/* ── Thread header ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">

        {/* Row 1: back (mobile) + customer info + badges */}
        <div className="flex items-center gap-2">
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

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
              {initials(thread.customer?.name ?? thread.customerName ?? "?")}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-900">
                {thread.customer?.name ?? thread.customerName ?? "Desconhecido"}
              </p>
              <p className="text-xs text-gray-500">
                {(() => {
                  const ph = thread.customer?.phone ?? thread.customerPhone ?? "";
                  return !ph || isGuestIdentifier(ph) ? "Telefone não informado" : ph;
                })()}
              </p>
            </div>
          </div>

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

        {/* Row 2: action buttons */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {isAIActive && (
            <button
              type="button"
              onClick={() => onAIAction("takeover")}
              disabled={actionLoading}
              className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              Assumir atendimento
            </button>
          )}
          {isHumanHandling && (
            <button
              type="button"
              onClick={() => onAIAction("release")}
              disabled={actionLoading}
              className="shrink-0 rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
            >
              Devolver para IA
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
          {isManagerOrOwner && (
            <button
              type="button"
              onClick={() => { setOrderCreatedId(null); setManualOrderOpen(true); }}
              className="shrink-0 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
            >
              + Criar pedido
            </button>
          )}
          {isOwner && onDeleteConversation && (
            <button
              type="button"
              onClick={onDeleteConversation}
              disabled={actionLoading}
              className="shrink-0 ml-auto rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              Apagar
            </button>
          )}
        </div>

        {/* Order created success notice */}
        {orderCreatedId && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
            <span>✅</span>
            <span>Pedido <span className="font-semibold">#{orderCreatedId.slice(-6).toUpperCase()}</span> criado com sucesso.</span>
            <button
              type="button"
              onClick={() => setOrderCreatedId(null)}
              className="ml-auto text-green-500 hover:text-green-700 leading-none"
            >
              ✕
            </button>
          </div>
        )}

        {/* Row 3: active order / draft */}
        {activeOrder && <ActiveOrderPanel order={activeOrder} isManagerOrOwner={isManagerOrOwner} />}
        {!activeOrder && activeDraft && <ActiveDraftPanel draft={activeDraft} />}
      </div>

      {/* ── Manual order modal ────────────────────────────────────── */}
      {manualOrderOpen && (
        <ManualOrderModal
          conversationId={thread.id}
          customerName={thread.customer?.name ?? thread.customerName}
          customerPhone={thread.customer?.phone ?? thread.customerPhone}
          onClose={() => setManualOrderOpen(false)}
          onCreated={(orderId) => {
            setManualOrderOpen(false);
            setOrderCreatedId(orderId);
            onOrderCreated?.();
          }}
        />
      )}

      {/* ── Message thread ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4">
        {thread.messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400">Sem mensagens ainda.</p>
        ) : (
          <div className="space-y-2">
            {thread.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                customerName={thread.customer?.name ?? thread.customerName ?? "Cliente"}
                allMessages={thread.messages}
              />
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

      {/* ── Send note (info) ──────────────────────────────────────────── */}
      {sendNote && (
        <div className="shrink-0 border-t border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-700">
          {sendNote}
        </div>
      )}

      {/* ── Composer ─────────────────────────────────────────────────── */}
      {isHumanHandling ? (
        <form
          onSubmit={onSend}
          className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 space-y-2"
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAttachmentSelect(file);
              e.target.value = "";
            }}
          />

          {/* Attachment preview */}
          {attachment && (
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              {attachment.mediaType === "IMAGE" && attachment.previewUrl ? (
                <img
                  src={attachment.previewUrl}
                  alt="preview"
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-xl">
                  📄
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-700">{attachment.fileName}</p>
                <p className="text-[10px] text-gray-400">
                  {attachment.mediaType === "IMAGE" ? "Imagem" : "Documento PDF"}
                </p>
              </div>
              <button
                type="button"
                onClick={onAttachmentClear}
                aria-label="Remover anexo"
                className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>
          )}

          {/* Input row */}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || sending}
              aria-label="Anexar arquivo"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-orange-500 disabled:opacity-40 transition-colors"
            >
              📎
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(e as unknown as FormEvent);
                }
              }}
              placeholder={attachment ? "Legenda (opcional)…" : "Digite uma mensagem… (Enter para enviar)"}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <button
              type="submit"
              disabled={sending || uploading || (!text.trim() && !attachment)}
              className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {uploading ? "Enviando…" : sending ? "…" : "Enviar"}
            </button>
          </div>
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

// ── TeachAIModal ───────────────────────────────────────────────────────────────

interface TeachAIModalProps {
  humanMessage:    Message;
  customerMessage: Message | null;
  onClose:         () => void;
}

function TeachAIModal({ humanMessage, customerMessage, onClose }: TeachAIModalProps) {
  const [question,  setQuestion]  = useState(customerMessage?.content ?? "");
  const [answer,    setAnswer]    = useState(humanMessage.content);
  const [category,  setCategory]  = useState<KnowledgeCategory>("FAQ");
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [err,       setErr]       = useState<string | null>(null);

  async function handleSave() {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/knowledge", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          title:            question.trim().slice(0, 80),
          category,
          questionPatterns: [question.trim()],
          answer:           answer.trim(),
          status:           "SUGGESTED",
          source:           "HUMAN_REPLY",
          createdFromMessageIds: [
            ...(customerMessage ? [customerMessage.id] : []),
            humanMessage.id,
          ],
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      setSaved(true);
    } catch {
      setErr("Falha ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-bold text-gray-900">Ensinar IA</p>
            <p className="text-xs text-gray-500 mt-0.5">Salvar como aprendizado sugerido (aguarda aprovação)</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {saved ? (
          <div className="px-5 py-8 text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm font-semibold text-gray-800">Aprendizado salvo!</p>
            <p className="text-xs text-gray-500 mt-1">Acesse Agentes IA → WhatsApp Host para aprovar.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-white hover:bg-orange-600"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-4">
            {/* Customer question */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Pergunta do cliente
              </label>
              <textarea
                rows={2}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="O que o cliente perguntou?"
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>

            {/* Suggested answer */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Resposta da equipe (a IA usará isso)
              </label>
              <textarea
                rows={3}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Qual foi a resposta correta?"
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-orange-400 focus:outline-none"
              >
                {KNOWLEDGE_CATEGORIES.filter((c) => c.id !== "UNKNOWN_GAP").map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !question.trim() || !answer.trim()}
                className="flex-1 rounded-lg bg-orange-500 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {saving ? "Salvando…" : "Salvar aprendizado"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

// Handoff reason → human-readable Portuguese label
const HANDOFF_LABELS: Record<string, string> = {
  AI_ESCALATION:      "IA solicitou atendimento humano",
  MENU_OPTION:        "Cliente pediu falar com humano",
  WAITER_ESCALATION:  "Garçom solicitou atendimento humano",
  CUSTOMER_REQUEST:   "Cliente solicitou atendimento humano",
  COMPLAINT:          "Reclamação — aguardando atendimento",
  UNKNOWN:            "Solicitação de atendimento humano",
};

function SystemEventNote({ msg }: { msg: Message }) {
  // Parse [handoff:REASON] or show generic system text
  const match = msg.content.match(/^\[handoff:([A-Z_]+)\]$/);
  const reason = match?.[1] ?? "";
  const label = match
    ? (HANDOFF_LABELS[reason] ?? "Solicitação de atendimento humano")
    : msg.content;

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="shrink-0 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        {label}
      </span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

function MessageBubble({
  msg,
  customerName,
  allMessages,
}: {
  msg:          Message;
  customerName: string;
  allMessages:  Message[];
}) {
  const [teachOpen, setTeachOpen] = useState(false);

  // System events (handoff, escalation metadata) are not chat bubbles.
  if (msg.senderType === "SYSTEM") {
    return <SystemEventNote msg={msg} />;
  }

  const isOutbound  = msg.direction === "OUTBOUND";
  const isHumanMsg  = isOutbound && (msg.senderType === "HUMAN" || msg.senderType === "HUMAN_EXTERNAL");
  const senderLabel = isOutbound
    ? (msg.senderType === "AI" ? "IA"
      : msg.senderType === "HUMAN_EXTERNAL" ? "WhatsApp externo"
      : "Equipe")
    : (msg.senderType === "CUSTOMER_CARDAPIO" ? `${customerName} · Cardápio` : customerName);

  // Find the most recent customer message before this human reply
  const precedingCustomerMsg = isHumanMsg
    ? [...allMessages]
        .reverse()
        .find((m) => m.direction === "INBOUND" && new Date(m.sentAt) < new Date(msg.sentAt))
        ?? null
    : null;

  return (
    <>
      {teachOpen && isHumanMsg && (
        <TeachAIModal
          humanMessage={msg}
          customerMessage={precedingCustomerMsg}
          onClose={() => setTeachOpen(false)}
        />
      )}

      <div className={`flex flex-col gap-1 ${isOutbound ? "items-end" : "items-start"}`}>
        <span className="px-1 text-[10px] text-gray-400">{senderLabel}</span>

        <div
          className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
            isOutbound
              ? "rounded-br-sm bg-orange-500 text-white"
              : "rounded-bl-sm bg-white text-gray-900 border border-gray-100"
          }`}
        >
          {/* Image */}
          {msg.type === "IMAGE" && msg.mediaUrl && (
            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-1 block">
              <img
                src={msg.mediaUrl}
                alt="imagem"
                className="max-h-48 max-w-full rounded-xl object-cover"
                loading="lazy"
              />
            </a>
          )}

          {/* Document */}
          {msg.type === "DOCUMENT" && msg.mediaUrl && (
            <a
              href={msg.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`mb-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold underline ${
                isOutbound
                  ? "border-orange-400/50 bg-orange-600 text-white"
                  : "border-gray-200 bg-gray-100 text-gray-700"
              }`}
            >
              <span>📄</span>
              <span className="truncate">{msg.content || "Documento"}</span>
            </a>
          )}

          {/* Unknown media label (AUDIO, etc.) */}
          {msg.type !== "TEXT" && msg.type !== "IMAGE" && msg.type !== "DOCUMENT" && (
            <p className={`mb-1 text-xs font-medium ${isOutbound ? "text-orange-200" : "text-gray-400"}`}>
              [{msg.type.toLowerCase()}]
            </p>
          )}

          {/* Text content / caption — skip for DOCUMENT (already shown in card) */}
          {msg.type !== "DOCUMENT" && msg.content && (
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          )}
        </div>

        <div className="flex items-center gap-2 px-1 text-[10px] text-gray-400">
          <span>{fmtTime(msg.sentAt)}</span>
          {isOutbound && msg.externalStatus && (
            <span>
              {msg.externalStatus === "read" || msg.externalStatus === "delivered" ? "✓✓" : "✓"}
            </span>
          )}
          {isHumanMsg && (
            <button
              type="button"
              onClick={() => setTeachOpen(true)}
              className="rounded-full border border-orange-200 bg-orange-50 px-2 py-px text-[10px] font-semibold text-orange-600 hover:bg-orange-100 transition-colors"
            >
              Ensinar IA
            </button>
          )}
        </div>
      </div>
    </>
  );
}
