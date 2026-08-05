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
import { HANDOFF_SOUND_PREF_KEY, readSoundPref, fetchRestaurantSoundSettings } from "@/lib/sound-prefs";
import {
  pendingHumanRequestIds,
  HANDOFF_ALARM_MAX_AGE_MS,
  HANDOFF_SOUND_MAX_AGE_MS,
  OVERDUE_SOUND_MAX_WAIT_MINUTES,
} from "@/lib/handoff-alert";
import { KNOWLEDGE_CATEGORIES } from "@/services/knowledge/RestaurantKnowledgeService";
import type { KnowledgeCategory } from "@/services/knowledge/RestaurantKnowledgeService";
import { ManualOrderModal } from "@/components/orders/ManualOrderModal";
import { formatOrderNumber } from "@/lib/order-number";

// ── Internal command detection (client-safe pure helper) ──────────────────────

const INTERNAL_CMD_PREFIXES = ["/build", "/cmd", "/prompt"] as const;

/** Returns true when the message is a Build OS internal command prefix. */
function isInternalCommandContent(content: string): boolean {
  if (!content) return false;
  const lower = content.trimStart().toLowerCase();
  return INTERNAL_CMD_PREFIXES.some((p) => {
    if (!lower.startsWith(p)) return false;
    const next = lower.charAt(p.length);
    return next === "" || /[^a-z0-9]/.test(next);
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ConvStatus =
  | "OPEN"
  | "BOT"
  | "HUMAN"
  | "RESOLVED"
  | "AI_ATENDENDO"
  | "HUMANO_ASSUMIU";

type Channel = "WHATSAPP" | "EMAIL" | "SMS" | "QR_AGENT" | "WEB_AGENT" | "MANUAL" | "INSTAGRAM_DIRECT" | "INSTAGRAM_COMMENT" | "MESSENGER";

type StatusFilter  = "ALL" | "AI_OFF" | "WAITING" | "STAFF" | "CRM" | "INSTAGRAM" | "RESOLVED";
type SortOption    = "RECENT" | "OLDEST" | "NAME_AZ" | "NAME_ZA" | "CHANNEL";

interface ActiveOrderItem {
  name:     string;
  quantity: number;
  price:    string;
}

interface ActiveOrder {
  id:           string;
  orderNumber?: number | null;
  status:       string;
  total:        string;
  type:         string;
  createdAt:    string;
  items:        ActiveOrderItem[];
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

type ConversationType =
  | "CUSTOMER" | "STAFF" | "SUPPLIER" | "PARTNER" | "INTERNAL" | "OTHER_NON_CUSTOMER";

interface ConvSummary {
  id:                  string;
  status:              ConvStatus;
  channel:             Channel;
  aiEnabled:           boolean;
  conversationType?:   ConversationType;
  aiLocked?:           boolean;
  assignedTo:          string | null;
  unreadCount:         number;
  lastMessageAt:       string | null;
  createdAt:           string;
  customerName:        string | null;
  customerPhone:       string | null;
  contextType:         string | null;
  /** Server-persisted "Estou ciente" acknowledgement — silences the alarm
   *  app-wide/cross-device until a fresh escalation clears it. */
  handoffAlarmAckAt?:  string | null;
  hasCustomerReplied?: boolean;
  /** True when the conversation received any CRM outbound (contextType OR send log). */
  crmSent?:            boolean;
  customer:            { name: string; phone: string } | null;
  messages:            { content: string; direction: string; senderType: string | null; type: string }[];
}

// Labels for the non-customer classification chips.
const CONV_TYPE_LABEL: Record<ConversationType, string> = {
  CUSTOMER:           "Cliente",
  STAFF:              "Staff",
  SUPPLIER:           "Fornecedor",
  PARTNER:            "Parceiro",
  INTERNAL:           "Interno",
  OTHER_NON_CUSTOMER: "Não-cliente",
};

const CONV_TYPE_OPTIONS: { id: ConversationType; label: string }[] = [
  { id: "CUSTOMER",           label: "Cliente normal"        },
  { id: "STAFF",              label: "Staff / equipe"        },
  { id: "SUPPLIER",           label: "Fornecedor"            },
  { id: "PARTNER",            label: "Parceiro"              },
  { id: "INTERNAL",           label: "Interno / administrativo" },
  { id: "OTHER_NON_CUSTOMER", label: "Outro não-cliente"     },
];

interface Message {
  id:             string;
  direction:      "INBOUND" | "OUTBOUND";
  senderType:     string | null;
  content:        string;
  type:           string;
  mediaUrl:       string | null;
  sentAt:         string;
  externalStatus: string | null;
  metadata?:      Record<string, unknown> | null;
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
  WHATSAPP:         { label: "WhatsApp",     icon: "📱" },
  EMAIL:            { label: "E-mail",       icon: "✉️"  },
  SMS:              { label: "SMS",          icon: "💬"  },
  QR_AGENT:         { label: "Cardápio",     icon: "📋"  },
  WEB_AGENT:        { label: "Cardápio",     icon: "📋"  },
  MANUAL:            { label: "Manual",       icon: "✍️"  },
  INSTAGRAM_DIRECT:  { label: "Instagram DM", icon: "📷"  },
  INSTAGRAM_COMMENT: { label: "Instagram comentário", icon: "💬" },
  MESSENGER:         { label: "Messenger",    icon: "💬"  },
};

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ALL",         label: "Todas"      },
  { id: "AI_OFF",      label: "Humano"     },
  { id: "WAITING",     label: "Aguardando" },
  { id: "STAFF",       label: "Staff"      },
  { id: "CRM",         label: "CRM"        },
  { id: "INSTAGRAM",   label: "📷 Instagram" },
  { id: "RESOLVED",    label: "Resolvidas" },
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
  // Permanent non-customer classification (Staff/Fornecedor/…) takes precedence
  // over every other state. The pill shows the classification itself (e.g.
  // "Staff") — these conversations live in the Staff tab, out of the human queue.
  if (c.aiLocked) {
    const t = c.conversationType;
    const label = t && t !== "CUSTOMER" ? CONV_TYPE_LABEL[t] : "Staff";
    return { label, cls: "bg-[#F4F4F2] text-ink2" };
  }
  if (c.status === "RESOLVED")
    return { label: "Resolvida",  cls: "bg-[#F4F4F2] text-muted" };
  if (c.status === "OPEN" && c.unreadCount > 0)
    return { label: "Aguardando", cls: "bg-red-50 text-red-600" };
  if (!c.aiEnabled || c.status === "HUMAN" || c.status === "HUMANO_ASSUMIU")
    return { label: "Humano",     cls: "bg-green-50 text-green-700" };
  return   { label: "IA ativa",   cls: "bg-brand-50 text-brand-600" };
}

// Classification chip for non-customer conversations (Staff/Fornecedor/etc.).
// The classification is now shown directly by the handler badge (getHandlerBadge)
// for locked conversations, so this separate chip is suppressed to avoid a
// duplicate pill. Kept as a no-op so existing call sites stay valid.
function getConvTypeBadge(_c: ConvSummary): { label: string; cls: string } | null {
  return null;
}

// CRM_CAMPAIGN and CRM_AUTOMATION are handled dynamically in getCrmBadge()
// so the badge reflects whether the customer has replied or not.
const CONTEXT_BADGE: Record<string, { label: string; cls: string }> = {
  ORDER_SUPPORT: { label: "Pós-venda", cls: "bg-brand-50 text-brand-600" },
  HUMAN_SUPPORT: { label: "Suporte",   cls: "bg-amber-50 text-amber-700" },
};

const CRM_CONTEXT_BADGE: Record<string, string> = {
  CRM_CAMPAIGN:   "Campanha enviada",
  CRM_AUTOMATION: "Automação enviada",
  CRM_REVIEW:     "Avaliação enviada",
  CART_RECOVERY:  "Recuperação enviada",
};

function getCrmBadge(c: ConvSummary): { label: string; cls: string } | null {
  const ct = c.contextType ?? "";
  const specific = CRM_CONTEXT_BADGE[ct];
  // Show a badge for any CRM-sent conversation: a specific one when the context is
  // known, else a generic "CRM enviado" for log-backed sends (post-order, review,
  // coupon, manual, …) that did not set a CRM contextType.
  if (!specific && !c.crmSent) return null;
  if (convHasCustomerReply(c)) {
    return { label: "Resposta CRM", cls: "bg-amber-50 text-amber-700" };
  }
  return {
    label: specific ?? "CRM enviado",
    cls:   "bg-brand-50 text-brand-500",
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
          className="absolute left-0 z-10 flex h-full items-center bg-gradient-to-r from-paper via-paper/80 to-transparent pl-0.5 pr-3 text-sm text-muted hover:text-ink2"
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
          className="absolute right-0 z-10 flex h-full items-center bg-gradient-to-l from-paper via-paper/80 to-transparent pr-0.5 pl-3 text-sm text-muted hover:text-ink2"
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
  const [fetchError,    setFetchError]    = useState<string | null>(null);

  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [thread,        setThread]        = useState<ConvDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const [activeOrder,   setActiveOrder]   = useState<ActiveOrder | null>(null);
  const [activeDraft,   setActiveDraft]   = useState<ActiveDraft | null>(null);

  const [mobileView,    setMobileView]    = useState<"list" | "thread">("list");

  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>("ALL");
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

  // ── Human-attention alarm sound ───────────────────────────────────────────
  // The actual ALARM (Audio element + repeat controller) is owned by
  // <GlobalAlertEngine/> (mounted once in the dashboard shell) so it rings from
  // any screen, not only while this page is open. This component keeps its full
  // ack/overdue logic unchanged and hands the resulting ring-set to the global
  // engine via a small attach/detach event bridge (see the effects below) —
  // "Estou ciente" and "Silenciar atrasados" keep working exactly as before
  // while this page is open. Config lives in Configurações → Sons e alertas.
  const [handoffSoundEnabled, setHandoffSoundEnabled] = useState(() => readSoundPref(HANDOFF_SOUND_PREF_KEY, true));

  const [leftWidth,     setLeftWidth]     = useState<number>(320);
  const [isDesktop,     setIsDesktop]     = useState<boolean>(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Fetch conversation list ────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    // Server-side status filter only for RESOLVED (reduces payload)
    if (statusFilter === "RESOLVED") params.set("status", "RESOLVED");
    // The unified CRM filter needs server-side contextType filtering. CRM
    // outbound-only conversations have lastMessageAt=null and are sorted/deduped
    // to the bottom, so they fall outside the default loaded window — a purely
    // client-side filter would find nothing. crm=1 returns every CRM-origin
    // conversation directly (sent or replied), independent of channel.
    if (statusFilter === "CRM") params.set("crm", "1");
    // The Staff tab filters server-side too, so classified conversations older
    // than the default loaded window still appear.
    if (statusFilter === "STAFF") params.set("staff", "1");

    try {
      // Use /api/chat/conversations: supports channel, all status values, aiEnabled
      const res = await fetch(`/api/chat/conversations?${params}`);
      if (!res.ok) { setFetchError("Falha ao carregar conversas."); return; }
      const json = await res.json();
      const items: ConvSummary[] = json.data?.data ?? json.data ?? [];
      if (!Array.isArray(items)) return;

      setFetchError(null);
      setConversations(items);
      // Sound is driven by the alarm controller off conversation status (see the
      // `pendingHumanIds` effect below), not from message/transition detection here.
    } catch {
      setFetchError("Falha ao carregar conversas.");
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter]);

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

  // Tell <GlobalAlertEngine/> this page is driving the handoff alarm directly
  // (so its own background poll steps aside), and hand back control on unmount.
  useEffect(() => {
    window.dispatchEvent(new Event("foocci:handoff-attach"));
    return () => { window.dispatchEvent(new Event("foocci:handoff-detach")); };
  }, []);

  // Load DB-backed sound settings (Configurações → Sons e alertas) — source of truth
  useEffect(() => {
    void fetchRestaurantSoundSettings().then((s) => {
      if (!s) return;
      setHandoffSoundEnabled(s.soundEnabled && s.humanAttentionSoundEnabled);
    });
  }, []);

  // Conversations waiting for a human (status === "HUMAN", not Staff/equipe),
  // unassumed. VISUAL window (2h): drives the "🙋 aguardando" banner, the
  // auto-select and the "Estou ciente" batch — visibility long outlives noise.
  const pendingHumanIds = useMemo(
    () => pendingHumanRequestIds(conversations, { maxAgeMs: HANDOFF_ALARM_MAX_AGE_MS }),
    [conversations],
  );

  // SOUND window (10 min) — mirrors the app-wide engine: the beep is a "come
  // look now" signal that auto-quiets on its own; answering the customer
  // (auto-ack) or assuming the conversation stops it immediately. The
  // conversation stays fully visible above regardless.
  const soundWindowHumanIds = useMemo(
    () => pendingHumanRequestIds(conversations, { maxAgeMs: HANDOFF_SOUND_MAX_AGE_MS }),
    [conversations],
  );

  // "Estou ciente" acknowledges the CURRENT pending batch — it silences the alarm
  // for those conversations WITHOUT resolving them, reactivating IA, or removing
  // the visual "Aguardando". A new pending request (not in this set) re-arms it.
  const [acknowledgedHumanIds, setAcknowledgedHumanIds] = useState<Set<string>>(new Set());

  // Overdue handoff alert (alert-only — never auto-returns to AI). Tracked with a
  // SEPARATE ack set from the pending alarm so silencing one never affects the
  // other, and a re-overdue conversation can ring again.
  type OverdueItem = { id: string; customer: string; waitingMinutes: number };
  const [overdueHandoffs,        setOverdueHandoffs]        = useState<OverdueItem[]>([]);
  const [acknowledgedOverdueIds, setAcknowledgedOverdueIds] = useState<Set<string>>(new Set());

  // Drop acknowledgements once a conversation leaves the pending queue (assumed/
  // resolved), so if it later returns to HUMAN it rings again.
  useEffect(() => {
    setAcknowledgedHumanIds((prev) => {
      if (prev.size === 0) return prev;
      const pending = new Set(pendingHumanIds);
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) { if (pending.has(id)) next.add(id); else changed = true; }
      return changed ? next : prev;
    });
  }, [pendingHumanIds]);

  // The alarm rings for pending requests INSIDE THE SOUND WINDOW minus the
  // acknowledged batch. Plays immediately on a new request, repeats while any
  // remain, stops when assumed/resolved/acknowledged/answered — or quiets on its
  // own once the sound window lapses (the conversation stays visible).
  const alarmingHumanIds = useMemo(
    () => soundWindowHumanIds.filter((id) => !acknowledgedHumanIds.has(id)),
    [soundWindowHumanIds, acknowledgedHumanIds],
  );

  // Overdue handoffs re-arm the alarm via their own ack set. Drop acks once a
  // conversation leaves the overdue list, so a later re-overdue rings again.
  const overdueIds = useMemo(() => overdueHandoffs.map((o) => o.id), [overdueHandoffs]);

  useEffect(() => {
    setAcknowledgedOverdueIds((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(overdueIds);
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) { if (live.has(id)) next.add(id); else changed = true; }
      return changed ? next : prev;
    });
  }, [overdueIds]);

  // Sound only for overdue handoffs whose wait is still recent (≤20 min) — an
  // item waiting longer keeps showing in the "⏰ atrasados" banner but stops
  // making noise on its own (matches the app-wide engine).
  const alarmingOverdueIds = useMemo(
    () => overdueHandoffs
      .filter((o) => o.waitingMinutes <= OVERDUE_SOUND_MAX_WAIT_MINUTES && !acknowledgedOverdueIds.has(o.id))
      .map((o) => o.id),
    [overdueHandoffs, acknowledgedOverdueIds],
  );

  // The alarm sound rings for pending (unacked) ∪ overdue (unacked), deduped.
  const soundIds = useMemo(
    () => Array.from(new Set([...alarmingHumanIds, ...alarmingOverdueIds])),
    [alarmingHumanIds, alarmingOverdueIds],
  );

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("foocci:handoff-ring-ids", { detail: { ids: handoffSoundEnabled ? soundIds : [] } }));
  }, [soundIds, handoffSoundEnabled]);

  const acknowledgePendingHuman = useCallback(() => {
    // Instant local silence for snappy UX…
    setAcknowledgedHumanIds(new Set(pendingHumanIds));
    // …plus a DURABLE server-side acknowledgement so the app-wide alarm stays
    // silent for these conversations on EVERY page and EVERY device (not just
    // this tab). Fire-and-forget; the next list refresh reflects it.
    if (pendingHumanIds.length > 0) {
      void fetch("/api/atendimento/handoff/acknowledge", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ids: pendingHumanIds }),
      })
        .then(() => fetchList())
        .catch(() => { /* local ack already silenced this tab; next poll retries */ });
    }
  }, [pendingHumanIds, fetchList]);

  const viewFirstPendingHuman = useCallback(() => {
    if (pendingHumanIds[0]) setSelectedId(pendingHumanIds[0]);
  }, [pendingHumanIds]);

  // ── Handoff alert poller (every 60 s while the page is open) ───────────────
  // Alert-only: surfaces conversations the customer has been waiting on past the
  // threshold (default 10 min) with no human reply. No auto-return ever happens —
  // human handoff stays persistent (product decision 2026-05-28).
  useEffect(() => {
    const run = () => {
      fetch("/api/atendimento/handoff/check-timeouts", { method: "POST" })
        .then((r) => r.json())
        .then((d: { data?: { overdue?: OverdueItem[] } }) => {
          setOverdueHandoffs(d?.data?.overdue ?? []);
        })
        .catch(() => {});
      // Sibling endpoint kept for backwards compatibility (safe no-op).
      fetch("/api/atendimento/handoff/check-customer-inactivity", { method: "POST" }).catch(() => {});
    };
    run();
    const id = setInterval(run, 60_000);
    return () => clearInterval(id);
  }, []);

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

  // Count for the "Humano" filter chip — all human-handled conversations
  // (pending + already assumed). The pending-only alarm queue is pendingHumanIds.
  const humanHandoffCount = useMemo(
    () => conversations.filter(
      (c) => (c.status === "HUMAN" || c.status === "HUMANO_ASSUMIU") && !c.aiLocked,
    ).length,
    [conversations],
  );

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
    // Use server-computed crmSent flag: covers all CRM contextTypes (CAMPAIGN,
    // AUTOMATION, REVIEW, CART_RECOVERY) and log-matched customers whose deduped
    // conversation has a non-CRM contextType (e.g. a prior order conversation).
    const isCrmOrigin = (c: ConvSummary) => c.crmSent === true;

    // Status filter (client-side for non-RESOLVED)
    if (statusFilter === "CRM") {
      // Unified CRM: every conversation touched by a CRM send — whether the
      // customer replied or not. One tab for everyone impacted by the CRM.
      items = items.filter((c) => isCrmOrigin(c));
    } else if (statusFilter === "STAFF") {
      // Non-customer classifications (Staff/Fornecedor/Parceiro/Interno/…) are
      // permanently AI-locked. They live here, OUT of the human queue, and only
      // leave when the owner reclassifies them back to "Cliente".
      items = items.filter((c) => c.aiLocked === true);
    } else if (statusFilter === "INSTAGRAM") {
      // Only Instagram (Direct + comentários). Client-side over the loaded window.
      items = items.filter((c) => c.channel === "INSTAGRAM_DIRECT" || c.channel === "INSTAGRAM_COMMENT");
    } else if (statusFilter !== "RESOLVED") {
      // "Todas": hide CRM outbound-only — they don't need human attention.
      // Conversations where the customer replied (hasCustomerReplied=true OR any
      // loaded INBOUND message) remain visible even if the latest msg is outbound.
      if (statusFilter === "ALL") {
        items = items.filter((c) => !isCrmOrigin(c) || convHasCustomerReply(c));
      }
      if (statusFilter === "AI_OFF") {
        // "Humano" = temporary human takeover only. Staff/locked are excluded so
        // a classified conversation never bounces back into the human queue —
        // it has its own "Staff" tab.
        items = items.filter((c) => !c.aiEnabled && !c.aiLocked && c.status !== "RESOLVED");
      }
      if (statusFilter === "WAITING") {
        // Waiting for a human — staff/locked never raise a human-attention alert.
        items = items.filter((c) => c.unreadCount > 0 && !c.aiLocked && c.status !== "RESOLVED");
      }
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
  }, [conversations, statusFilter, search, sortBy]);

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
      // Resolving the conversation is a clear operator action → silence its alarm.
      if (action === "resolve") window.dispatchEvent(new CustomEvent("foocci:handoff-resolved", { detail: { id: selectedId, reason: "RESOLVED" } }));
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
      // "Assumir atendimento" (takeover) acknowledges the request → silence its alarm.
      if (action === "takeover") window.dispatchEvent(new CustomEvent("foocci:handoff-resolved", { detail: { id: selectedId, reason: "ASSUMED" } }));
      await Promise.all([fetchThread(selectedId), fetchList()]);
    } finally {
      setActionLoading(false);
    }
  }

  // Classify a conversation (staff/supplier/etc.) — applies or lifts the
  // permanent AI lock via the classify endpoint.
  async function handleClassify(type: ConversationType) {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      await fetch(`/api/chat/conversations/${selectedId}/classify`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ type }),
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
      if (json.data?._deliveredVia === "CARDAPIO") {
        setSendNote("Enviado via Cardápio — o cliente verá no chat do /pedido.");
      } else if (json.data?._channel === "INSTAGRAM_COMMENT") {
        setSendNote(json.data?._dryRun
          ? "Resposta registrada (modo somente recebimento/sem envio real)."
          : "Resposta publicada no post do Instagram.");
      } else if (json.data?._channel === "INSTAGRAM_DIRECT" && json.data?._dryRun) {
        setSendNote("Mensagem registrada (envio real do Instagram não ativado).");
      } else if (json.data?._internalOnly) {
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
      style={{ height: "calc(100vh - var(--topbar))" }}
    >
      {/* ── LEFT PANEL ───────────────────────────────────────────────────── */}
      <aside
        className={`
          flex-col border-r border-line bg-paper overflow-hidden
          ${mobileView === "list" ? "flex w-full" : "hidden"}
          lg:flex lg:w-80 lg:shrink-0
        `}
        style={isDesktop ? { width: leftWidth } : undefined}
      >
        {/* Search + Sort */}
        <div className="border-b border-line px-3 pt-3 pb-2 space-y-2">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nome, telefone ou mensagem…"
              className="min-w-0 flex-1 rounded-xl border border-line2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="submit"
              className="rounded-xl bg-ink px-3.5 py-2 text-xs font-bold text-white hover:bg-black transition-colors"
            >
              Buscar
            </button>
          </form>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-muted">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="flex-1 rounded-xl border border-line2 bg-paper px-2 py-1.5 text-[11px] text-ink2 focus:border-brand-400 focus:outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Pending human-attendance queue + quick actions to stop the alarm
            without hunting. "Ver pendentes" jumps to the first pending conversation
            (where "Assumir atendimento" is); "Estou ciente" silences the current
            batch without resolving anything. */}
        {pendingHumanIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-brand-200 bg-brand-50 px-3 py-1.5">
            <span className="text-xs font-semibold text-brand-700">
              🙋 {pendingHumanIds.length} aguardando atendimento humano
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={viewFirstPendingHuman}
                className="rounded-lg bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-600 transition-colors"
              >
                Ver pendentes
              </button>
              <button
                type="button"
                onClick={acknowledgePendingHuman}
                disabled={alarmingHumanIds.length === 0}
                title="Silencia o alarme do lote atual sem resolver as conversas nem reativar a IA"
                className="rounded-lg border border-brand-300 bg-paper px-2.5 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 transition-colors"
              >
                {alarmingHumanIds.length === 0 ? "Silenciado ✓" : "Estou ciente"}
              </button>
            </div>
          </div>
        )}

        {/* Overdue handoff alert — a conversation already assumed/acknowledged but
            the customer has been waiting past the threshold with no human reply
            (the dropped-ball case the pending alarm above goes silent on). Alert
            only: the IA does NOT take over. Stays visible until a human answers;
            the sound can be silenced separately. */}
        {overdueHandoffs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5">
            <span className="text-xs font-semibold text-red-700">
              ⏰ {overdueHandoffs.length} sem resposta há +{overdueHandoffs[0]?.waitingMinutes ?? 0} min — cliente esperando
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { if (overdueHandoffs[0]) setSelectedId(overdueHandoffs[0].id); }}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Ver
              </button>
              <button
                type="button"
                onClick={() => {
                  const ids = overdueHandoffs.map((o) => o.id);
                  setAcknowledgedOverdueIds(new Set(ids)); // instant local silence
                  // Durable server-side ack so the overdue alarm stays silent
                  // app-wide/cross-device until the customer messages again.
                  if (ids.length > 0) {
                    void fetch("/api/atendimento/handoff/acknowledge", {
                      method:  "POST",
                      headers: { "Content-Type": "application/json" },
                      body:    JSON.stringify({ ids }),
                    }).catch(() => { /* local ack already silenced this tab */ });
                  }
                }}
                disabled={alarmingOverdueIds.length === 0}
                title="Silencia o som deste alerta sem resolver as conversas nem reativar a IA"
                className="rounded-lg border border-red-300 bg-paper px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                {alarmingOverdueIds.length === 0 ? "Silenciado ✓" : "Silenciar"}
              </button>
            </div>
          </div>
        )}

        {/* Status filter chips */}
        <div className="border-b border-line">
          <ScrollableChips>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  statusFilter === f.id
                    ? "bg-ink text-white"
                    : "bg-[#F4F4F2] text-ink2 hover:bg-[#ECECEA]"
                }`}
              >
                {f.label}{f.id === "AI_OFF" && humanHandoffCount > 0
                  ? ` (${humanHandoffCount})`
                  : ""}
              </button>
            ))}
          </ScrollableChips>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted">
              Carregando…
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-sm text-red-500">
              <span className="text-2xl">⚠️</span>
              <p>{fetchError}</p>
              <button
                type="button"
                onClick={fetchList}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted">
              <span className="text-2xl">💬</span>
              <p>
                {statusFilter === "CRM"
                  ? "Nenhuma mensagem de CRM encontrada neste filtro."
                  : statusFilter === "STAFF"
                  ? "Nenhuma conversa classificada como staff."
                  : "Nenhuma conversa encontrada."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {displayed.map((conv) => {
                // Skip SYSTEM messages (handoff events) and internal commands for preview.
                const lastMsg  = (conv.messages ?? []).find(
                  (m) => m.senderType !== "SYSTEM" && !isInternalCommandContent(m.content ?? ""),
                );
                const preview  = lastMsg
                  ? (lastMsg.type && lastMsg.type !== "TEXT")
                    ? `[${lastMsg.type.toLowerCase()}]`
                    : (lastMsg.content?.slice(0, 60) ?? "")
                  : "Sem mensagens";
                const badge        = getHandlerBadge(conv);
                const crmBadge     = getCrmBadge(conv);
                const convTypeBadge = getConvTypeBadge(conv);
                const isSelected = conv.id === selectedId;
                const isWaiting  = conv.status === "OPEN" && conv.unreadCount > 0;
                const priority   = convPriorityLevel(conv);
                const chanMeta   = CHANNEL_META[conv.channel] ?? { label: conv.channel, icon: "💬" };
                const isConvMultichannel = conv.channel === "WHATSAPP" &&
                  (conv.messages ?? []).some((m) => m.senderType === "CUSTOMER_CARDAPIO");

                return (
                  <li key={conv.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectConv(conv.id)}
                      className={`w-full px-3 py-3 text-left transition-colors border-l-2 ${
                        isSelected
                          ? "bg-brand-50 border-brand-500"
                          : priority === "critical"
                          ? "border-red-400 bg-red-50/40 hover:bg-red-50/70"
                          : priority === "attention"
                          ? "border-amber-400 hover:bg-amber-50/30"
                          : "border-transparent hover:bg-canvas"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Avatar */}
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isWaiting
                              ? "bg-red-50 text-red-600"
                              : "bg-brand-50 text-brand-600"
                          }`}
                        >
                          {initials(conv.customer?.name ?? conv.customerName ?? "?")}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-sm font-semibold text-ink">
                              {conv.customer?.name ?? conv.customerName ?? "Desconhecido"}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted">
                              {fmtTime(conv.lastMessageAt ?? conv.createdAt)}
                            </span>
                          </div>

                          <div className="mt-0.5 flex items-center gap-1.5">
                            {/* Priority dot */}
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              priority === "critical" ? "bg-red-500 animate-pulse" :
                              priority === "attention" ? "bg-amber-400" :
                              "bg-green-400"
                            }`} />
                            {/* Source badge */}
                            {isConvMultichannel ? (
                              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold leading-none text-blue-600">
                                📱📋 Multicanal
                              </span>
                            ) : conv.channel === "WHATSAPP" ? (
                              <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] font-bold leading-none text-green-700">
                                📱 WhatsApp
                              </span>
                            ) : conv.channel === "QR_AGENT" || conv.channel === "WEB_AGENT" ? (
                              <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[9px] font-bold leading-none text-brand-500">
                                📋 Cardápio
                              </span>
                            ) : conv.channel === "MANUAL" ? (
                              <span className="rounded-full bg-[#F4F4F2] px-1.5 py-0.5 text-[9px] font-bold leading-none text-ink2">
                                ✍️ Manual
                              </span>
                            ) : conv.channel === "INSTAGRAM_DIRECT" || conv.channel === "INSTAGRAM_COMMENT" ? (
                              <span className="rounded-full bg-pink-50 px-1.5 py-0.5 text-[9px] font-bold leading-none text-pink-700">
                                {conv.channel === "INSTAGRAM_COMMENT" ? "💬 IG comentário" : "📷 Instagram DM"}
                              </span>
                            ) : (
                              <span className="rounded-full bg-[#F4F4F2] px-1.5 py-0.5 text-[9px] font-bold leading-none text-muted">
                                {chanMeta.icon} {chanMeta.label}
                              </span>
                            )}
                            {/* Unread badge */}
                            {conv.unreadCount > 0 && (
                              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
                                {conv.unreadCount}
                              </span>
                            )}
                            {/* Handler badge */}
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${badge.cls}`}>
                              {badge.label}
                            </span>
                            {/* Context badge — CRM (dynamic) or other special contexts */}
                            {crmBadge ? (
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${crmBadge.cls}`}>
                                {crmBadge.label}
                              </span>
                            ) : conv.contextType && CONTEXT_BADGE[conv.contextType] && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${CONTEXT_BADGE[conv.contextType]!.cls}`}>
                                {CONTEXT_BADGE[conv.contextType]!.label}
                              </span>
                            )}
                            {/* Conversation type badge — Staff / Fornecedor / etc. */}
                            {convTypeBadge && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${convTypeBadge.cls}`}>
                                {convTypeBadge.label}
                              </span>
                            )}
                          </div>

                          <p className="mt-1 truncate text-xs text-muted">
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
        <div className="border-t border-line px-3 py-2 text-xs text-muted">
          {displayed.length} conversa{displayed.length !== 1 ? "s" : ""}
        </div>
      </aside>

      {/* ── DRAG HANDLE — desktop only ───────────────────────────────────── */}
      <div
        role="separator"
        aria-label="Redimensionar painel"
        onMouseDown={handleDividerMouseDown}
        className="hidden lg:flex w-1 shrink-0 cursor-col-resize bg-line2 hover:bg-brand-400 active:bg-brand-500 transition-colors"
      />

      {deleteConvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-paper p-5 shadow-xl">
            <h3 className="text-base font-bold text-ink">Apagar conversa?</h3>
            <p className="mt-2 text-sm text-ink2">
              Essa ação remove a conversa, mensagens e dados vinculados a esse atendimento. Essa ação não pode ser desfeita.
            </p>
            {deleteConvError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{deleteConvError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => { setDeleteConvOpen(false); setDeleteConvError(null); }}
                disabled={deleteConvLoading}
                className="flex-1 rounded-xl border border-line2 py-2.5 text-sm font-semibold text-ink2 hover:bg-canvas disabled:opacity-40 transition-colors"
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
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
            <span className="text-5xl">💬</span>
            <p className="text-sm font-medium text-muted">
              Selecione uma conversa
            </p>
            <p className="text-xs text-muted">
              para ver o histórico e gerenciar o atendimento
            </p>
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
            onAction={handleAction}
            onAIAction={handleAIAction}
            onClassify={handleClassify}
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
  onClassify:              (type: ConversationType) => void;
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
    <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/40 overflow-hidden shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-blue-100 bg-blue-50 px-3 py-1.5">
        <span className="text-[11px] font-bold uppercase tracking-widest text-blue-600">
          Rascunho IA
        </span>
        <span className="ml-1 rounded-full bg-blue-100 px-2 py-px text-[10px] font-semibold text-blue-700">
          {label}
        </span>
        <span className="ml-auto text-[10px] text-blue-400">em andamento</span>
      </div>
      <div className="px-3 py-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted italic">Nenhum item adicionado ainda</p>
        ) : (
          <p className="truncate text-xs text-ink2">
            {items.map((i) => `${i.quantity}× ${i.menuItem?.name ?? "?"}`).join(" · ")}
            {more > 0 && <span className="text-muted"> +{more}</span>}
          </p>
        )}
        {total > 0 && (
          <p className="mt-0.5 text-xs font-bold text-ink">
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

// Soft -50 badges mirroring the Pedidos board (OrdersClient STATUS_CONFIG).
const STATUS_META: Record<string, StatusMeta> = {
  PENDING:          { label: "Aguardando",        badge: "bg-amber-50 border-amber-100 text-amber-700"   },
  AWAITING_PAYMENT: { label: "Aguard. pagamento", badge: "bg-amber-50 border-amber-100 text-amber-700" },
  CONFIRMED:        { label: "Confirmado",        badge: "bg-blue-50 border-blue-100 text-blue-600"      },
  PREPARING:        { label: "Em preparo",        badge: "bg-brand-50 border-brand-100 text-brand-600"   },
  READY:            { label: "Pronto",            badge: "bg-teal-50 border-teal-100 text-teal-700"      },
  OUT_FOR_DELIVERY: { label: "Em entrega",        badge: "bg-brand-50 border-brand-100 text-brand-500" },
};

const DELAYED_META: StatusMeta = {
  label: "Atrasado",
  badge: "bg-red-50 border-red-100 text-red-600",
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
  const meta     = delayed ? DELAYED_META : (STATUS_META[status] ?? { label: status, badge: "bg-[#F4F4F2] border-line2 text-ink2" });
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
        ? "border-amber-400 bg-paper"
        : "border-line2 bg-paper"
    }`}>
      <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold border-b ${
        priority === "critical"
          ? "bg-red-50 text-red-700 border-red-100"
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

      <div className="flex items-center gap-2 border-b border-line bg-canvas px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Pedido ativo
        </span>
        <span className={`ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10px] font-semibold ${meta.badge}`}>
          {delayed && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
          {meta.label}
        </span>
        <span className="ml-auto text-[10px] text-muted tabular-nums">
          {Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000)} min
        </span>
        <a
          href="/orders"
          className="rounded-lg border border-line2 px-2 py-1 text-[10px] font-semibold text-muted hover:bg-[#F4F4F2] transition-colors"
        >
          Ver pedido
        </a>
      </div>

      <div className="px-3 py-2">
        <p className="truncate text-xs text-ink2">
          {items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}
          {more > 0 && <span className="text-muted"> +{more}</span>}
        </p>
        <p className="mt-0.5 text-xs font-bold text-ink">
          R$ {total.toFixed(2).replace(".", ",")}
        </p>
      </div>

      {status === "AWAITING_PAYMENT" && (
        <div className="border-t border-amber-100 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-amber-800">
            ⏳ Pix ainda não aprovado — aguardando confirmação do pagamento
          </p>
          {isManagerOrOwner && (
            <button
              onClick={() => setManualConfirmOpen(true)}
              className="mt-1.5 rounded-lg border border-amber-300 bg-paper px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
            >
              Confirmar pagamento manualmente
            </button>
          )}
        </div>
      )}

      {!isTerminal && (
        <div className="flex gap-1.5 flex-wrap border-t border-line bg-canvas px-3 py-2">
          {canConfirm && (
            <button
              onClick={() => applyAction("CONFIRMED", "confirm")}
              disabled={updating !== null}
              className="rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-black disabled:opacity-50 transition-colors"
            >
              {updating === "confirm" ? "…" : "Confirmar pedido"}
            </button>
          )}
          {canReady && (
            <button
              onClick={() => applyAction("READY", "ready")}
              disabled={updating !== null}
              className="rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-black disabled:opacity-50 transition-colors"
            >
              {updating === "ready" ? "…" : "Marcar como pronto"}
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => applyAction("CANCELLED", "cancel")}
              disabled={updating !== null}
              className="rounded-lg border border-red-200 bg-paper px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-paper p-5 shadow-xl">
            <h3 className="text-base font-bold text-ink">Confirmar pagamento manualmente?</h3>
            <p className="mt-1 text-xs text-muted">
              Use apenas se você verificou o pagamento no painel do Mercado Pago.
              Esta ação marca o pedido como pago e o envia para produção.
            </p>
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Pedido {formatOrderNumber(order.orderNumber, order.id)} · R$ {parseFloat(order.total).toFixed(2).replace(".", ",")}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink2">
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
              className="mt-2 w-full resize-none rounded-xl border border-line2 px-3 py-2 text-xs text-ink2 placeholder:text-muted focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            {manualConfirmError && (
              <p className="mt-1 text-xs text-red-600">{manualConfirmError}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setManualConfirmOpen(false); setManualConfirmChecked(false); setManualConfirmReason(""); setManualConfirmError(null); }}
                disabled={manualConfirming}
                className="flex-1 rounded-xl border border-line2 py-2 text-sm font-semibold text-ink2 hover:bg-canvas disabled:opacity-40 transition-colors"
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
// ── ThreadPanel component ─────────────────────────────────────────────────────

export function ThreadPanel({
  thread,
  actionLoading,
  onAction,
  onAIAction,
  onClassify,
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
  const typeBadge      = getConvTypeBadge(thread);
  const channel        = CHANNEL_META[thread.channel] ?? { label: thread.channel, icon: "💬" };
  const isResolved     = thread.status === "RESOLVED";
  const isLocked       = thread.aiLocked === true;
  // Instagram channels are text-only; comments are answered with a PUBLIC reply
  // posted under the original comment on the post (not a private DM).
  const isInstagramComment = thread.channel === "INSTAGRAM_COMMENT";
  const isInstagram        = thread.channel === "INSTAGRAM_DIRECT" || isInstagramComment;
  // Messenger is a text-only DM channel (same reply treatment as Instagram DM).
  const isMessenger        = thread.channel === "MESSENGER";
  // Pending human request: customer asked for a human and NO operator has assumed
  // yet (status HUMAN). Escalation turns aiEnabled off, so this used to fall into
  // "human handling" and only offered "Devolver para IA" — the bug. This is the
  // status that keeps the alarm ringing → it must offer "Assumir atendimento".
  const isPendingHuman = thread.status === "HUMAN" && !isResolved && !isLocked;
  // A locked conversation is neither AI-active nor a normal temporary takeover.
  const isAIActive     = thread.aiEnabled && !isResolved && !isLocked && !isPendingHuman;
  const isHumanHandling = !thread.aiEnabled && !isResolved && !isLocked;
  // A thread is multichannel when it genuinely mixes Cardápio and WhatsApp
  // messages — independent of which channel is canonical, since the unified
  // thread merges a customer's conversations across channels.
  const hasCardapioMsg = thread.messages.some(
    (m) => m.senderType === "CUSTOMER_CARDAPIO" || m.metadata?.source === "CARDAPIO",
  );
  const hasWhatsappMsg = thread.messages.some(
    (m) => m.metadata?.source === "WHATSAPP" || m.senderType === "HUMAN_EXTERNAL" || m.metadata?.whatsappMedia === true,
  );
  const isMultichannel = hasCardapioMsg && hasWhatsappMsg;

  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [orderCreatedId,  setOrderCreatedId]  = useState<string | null>(null);
  const [orderCreatedNumber, setOrderCreatedNumber] = useState<string | null>(null);

  return (
    <>
      {/* ── Thread header ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-line2 bg-paper px-4 py-3">

        {/* Row 1: back (mobile) + customer info + badges */}
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
              {initials(thread.customer?.name ?? thread.customerName ?? "?")}
            </div>
            <div className="min-w-0">
              {thread.customer?.id ? (
                <a
                  href={`/customers/${thread.customer.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-bold text-ink hover:text-brand-600 hover:underline"
                  title="Abrir ficha do cliente"
                >
                  {thread.customer.name ?? "Desconhecido"}
                </a>
              ) : (
                <p className="truncate text-sm font-bold text-ink">
                  {thread.customer?.name ?? thread.customerName ?? "Desconhecido"}
                </p>
              )}
              <p className="text-xs text-muted">
                {(() => {
                  const ph = thread.customer?.phone ?? thread.customerPhone ?? "";
                  return !ph || isGuestIdentifier(ph) ? "Telefone não informado" : ph;
                })()}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-1.5 sm:flex">
            {isMultichannel ? (
              <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                <span>📱📋</span>
                <span className="hidden md:inline">Multicanal</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-[#F4F4F2] px-2 py-0.5 text-xs font-medium text-ink2">
                <span>{channel.icon}</span>
                <span className="hidden md:inline">{channel.label}</span>
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge.cls}`}>
              {badge.label}
            </span>
            {typeBadge && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${typeBadge.cls}`}>
                {typeBadge.label}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: action buttons */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {/* Classification dropdown — marks the conversation as a non-customer
              context and applies/lifts the permanent AI lock. */}
          <select
            value={thread.conversationType ?? "CUSTOMER"}
            onChange={(e) => onClassify(e.target.value as ConversationType)}
            disabled={actionLoading}
            title="Classificar conversa"
            className="shrink-0 rounded-lg border border-line2 bg-paper px-2 py-1.5 text-xs font-medium text-ink2 hover:bg-canvas disabled:opacity-50 transition-colors"
          >
            {CONV_TYPE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          {isLocked && (
            <button
              type="button"
              onClick={() => onClassify("CUSTOMER")}
              disabled={actionLoading}
              className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-black disabled:opacity-50 transition-colors"
            >
              Voltar a tratar como cliente (reativa IA)
            </button>
          )}
          {(isPendingHuman || isAIActive) && (
            <button
              type="button"
              onClick={() => onAIAction("takeover")}
              disabled={actionLoading}
              title={isPendingHuman ? "Assumir este atendimento humano e silenciar o alerta" : "Assumir o atendimento desta conversa"}
              className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              Assumir atendimento
            </button>
          )}
          {isHumanHandling && !isPendingHuman && (
            <button
              type="button"
              onClick={() => onAIAction("release")}
              disabled={actionLoading}
              className="shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-100 disabled:opacity-50 transition-colors"
            >
              Devolver para IA
            </button>
          )}
          {!isResolved && (
            <button
              type="button"
              onClick={() => onAction("resolve")}
              disabled={actionLoading}
              className="shrink-0 rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-muted hover:bg-canvas disabled:opacity-50 transition-colors"
            >
              Resolver
            </button>
          )}
          {isResolved && (
            <button
              type="button"
              onClick={() => onAction("reopen")}
              disabled={actionLoading}
              className="shrink-0 rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-canvas disabled:opacity-50 transition-colors"
            >
              Reabrir
            </button>
          )}
          {isManagerOrOwner && (
            <button
              type="button"
              onClick={() => { setOrderCreatedId(null); setManualOrderOpen(true); }}
              className="shrink-0 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
            >
              + Criar pedido
            </button>
          )}
          {isOwner && onDeleteConversation && (
            <button
              type="button"
              onClick={onDeleteConversation}
              disabled={actionLoading}
              className="shrink-0 ml-auto rounded-lg border border-red-200 bg-paper px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              Apagar
            </button>
          )}
        </div>

        {/* Permanent AI lock warning */}
        {isLocked && (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-[#F4F4F2] border border-line px-3 py-2 text-xs text-ink2">
            <span>🔒</span>
            <span>
              Enquanto estiver marcada como <strong>{CONV_TYPE_LABEL[thread.conversationType ?? "OTHER_NON_CUSTOMER"]}</strong>,
              a IA não responderá automaticamente. Só volta se você reativar manualmente
              (selecione “Cliente normal” ou clique em “Reativar IA”). Você ainda pode enviar mensagens manuais.
            </span>
          </div>
        )}

        {/* Order created success notice */}
        {orderCreatedId && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
            <span>✅</span>
            <span>Pedido <span className="font-semibold">{orderCreatedNumber ?? `#${orderCreatedId.slice(-6).toUpperCase()}`}</span> criado com sucesso.</span>
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
          prefillName={thread.customer?.name ?? thread.customerName}
          prefillPhone={thread.customer?.phone ?? thread.customerPhone}
          source="whatsapp_manual"
          onClose={() => setManualOrderOpen(false)}
          onCreated={(orderId, displayNumber) => {
            setManualOrderOpen(false);
            setOrderCreatedId(orderId);
            setOrderCreatedNumber(displayNumber ?? null);
            onOrderCreated?.();
          }}
        />
      )}

      {/* ── Message thread ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-canvas px-4 py-4">
        {thread.messages.length === 0 ? (
          <p className="text-center text-sm text-muted">Sem mensagens ainda.</p>
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
        <div className="shrink-0 border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {sendError}
        </div>
      )}

      {/* ── Send note (info) ──────────────────────────────────────────── */}
      {sendNote && (
        <div className="shrink-0 border-t border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-700">
          {sendNote}
        </div>
      )}

      {/* ── Instagram comment: reply is public on the post ───────────── */}
      {!isResolved && (isHumanHandling || isLocked) && isInstagramComment && (
        <div className="shrink-0 border-t border-pink-100 bg-pink-50 px-4 py-2 text-xs text-pink-700">
          💬 Sua resposta será <strong>pública no post do Instagram</strong>, abaixo do comentário do cliente.
        </div>
      )}

      {/* ── Composer ─────────────────────────────────────────────────── */}
      {(!isResolved && (isHumanHandling || isLocked)) ? (
        <form
          onSubmit={onSend}
          className="shrink-0 border-t border-line bg-paper px-4 py-3 space-y-2"
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
            <div className="flex items-center gap-2 rounded-xl border border-line2 bg-canvas px-3 py-2">
              {attachment.mediaType === "IMAGE" && attachment.previewUrl ? (
                <img
                  src={attachment.previewUrl}
                  alt="preview"
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-line2 text-xl">
                  📄
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink2">{attachment.fileName}</p>
                <p className="text-[10px] text-muted">
                  {attachment.mediaType === "IMAGE" ? "Imagem" : "Documento PDF"}
                </p>
              </div>
              <button
                type="button"
                onClick={onAttachmentClear}
                aria-label="Remover anexo"
                className="shrink-0 text-muted hover:text-ink2 transition-colors"
              >
                ✕
              </button>
            </div>
          )}

          {/* Input row */}
          <div className="flex items-end gap-2">
            {/* Instagram (DM and comments) and Messenger are text-only — no attachments. */}
            {!isInstagram && !isMessenger && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || sending}
                aria-label="Anexar arquivo"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line2 text-muted hover:bg-canvas hover:text-brand-500 disabled:opacity-40 transition-colors"
              >
                📎
              </button>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(e as unknown as FormEvent);
                }
              }}
              placeholder={isInstagramComment ? "Responder publicamente o comentário… (Enter para enviar)" : attachment ? "Legenda (opcional)…" : "Digite uma mensagem… (Enter para enviar)"}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-line2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="submit"
              disabled={sending || uploading || (!text.trim() && !attachment)}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {uploading ? "Enviando…" : sending ? "…" : "Enviar"}
            </button>
          </div>
        </form>
      ) : isResolved ? (
        <div className="shrink-0 border-t border-line2 bg-canvas px-4 py-3 text-center text-xs text-muted">
          Conversa resolvida.{" "}
          <button
            onClick={() => onAction("reopen")}
            className="font-semibold text-brand-600 hover:underline"
          >
            Reabrir
          </button>{" "}
          para enviar mensagens.
        </div>
      ) : (
        <div className="shrink-0 border-t border-line2 bg-canvas px-4 py-3 text-center text-xs text-muted">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl bg-paper shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-sm font-bold text-ink">Ensinar IA</p>
            <p className="text-xs text-muted mt-0.5">Salvar como aprendizado sugerido (aguarda aprovação)</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink2 text-xl leading-none">✕</button>
        </div>

        {saved ? (
          <div className="px-5 py-8 text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm font-semibold text-ink">Aprendizado salvo!</p>
            <p className="text-xs text-muted mt-1">Acesse Agentes IA → WhatsApp Host para aprovar.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-4">
            {/* Customer question */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted uppercase tracking-wide">
                Pergunta do cliente
              </label>
              <textarea
                rows={2}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="O que o cliente perguntou?"
                className="w-full resize-none rounded-lg border border-line2 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            {/* Suggested answer */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted uppercase tracking-wide">
                Resposta da equipe (a IA usará isso)
              </label>
              <textarea
                rows={3}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Qual foi a resposta correta?"
                className="w-full resize-none rounded-lg border border-line2 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted uppercase tracking-wide">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
                className="w-full rounded-lg border border-line2 bg-paper px-3 py-2 text-sm text-ink2 focus:border-brand-400 focus:outline-none"
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
                className="flex-1 rounded-lg bg-brand-500 py-2 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {saving ? "Salvando…" : "Salvar aprendizado"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-line2 px-4 py-2 text-xs font-medium text-muted hover:bg-canvas"
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
      <div className="h-px flex-1 bg-line2" />
      <span className="shrink-0 rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        {label}
      </span>
      <div className="h-px flex-1 bg-line2" />
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

  // Historical internal command messages that leaked before the security fix.
  // Render as an admin-only separator — never as a customer chat bubble.
  if (isInternalCommandContent(msg.content)) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-px flex-1 bg-line2" />
        <span className="shrink-0 rounded-full bg-[#F4F4F2] border border-line2 px-2 py-0.5 text-[10px] font-medium text-muted">
          Comando interno ocultado
        </span>
        <div className="h-px flex-1 bg-line2" />
      </div>
    );
  }

  const isOutbound  = msg.direction === "OUTBOUND";
  const isHumanMsg  = isOutbound && (msg.senderType === "HUMAN" || msg.senderType === "HUMAN_EXTERNAL");
  const msgSource   = msg.metadata?.source; // "CARDAPIO" | "WHATSAPP" | "INSTAGRAM_DIRECT" | "INSTAGRAM_COMMENT" | undefined
  const crmCtx      = msg.metadata?.contextType as string | undefined;
  // Instagram is tagged only via metadata.source (the bubble has no channel prop);
  // without this branch IG messages fell through to the "WhatsApp" default label.
  const isIg        = msgSource === "INSTAGRAM_DIRECT" || msgSource === "INSTAGRAM_COMMENT";
  const igSfx       = msgSource === "INSTAGRAM_COMMENT" ? "Instagram comentário" : "Instagram";
  // CRM outbound is stored with senderType "AI" (+ CRM metadata) or "CRM"; either
  // way it must read as a campaign/automation, never as the IA Waiter agent.
  const isCrmMsg    = isOutbound && (msg.senderType === "CRM" || crmCtx === "CRM_CAMPAIGN" || crmCtx === "CRM_AUTOMATION");
  const crmActorLabel = crmCtx === "CRM_AUTOMATION" ? "Automação enviada" : "Campanha enviada";
  const senderLabel = isOutbound
    ? (isCrmMsg ? crmActorLabel
        : msg.senderType === "AI"
        ? (msgSource === "PEDIDO_TEXTO" ? "IA · Pedido Texto"
           : msgSource === "CARDAPIO"   ? "IA · Cardápio"
           :                              "IA · WhatsApp")
        : msg.senderType === "HUMAN_EXTERNAL" ? "WhatsApp externo"
        : msg.senderType === "HUMAN"
          ? (msgSource === "CARDAPIO" ? "Operador · Cardápio" : isIg ? `Operador · ${igSfx}` : "Operador · WhatsApp")
          : "Operador")
    : (msg.senderType === "CUSTOMER_CARDAPIO" ? `${customerName} · Cardápio` : isIg ? `${customerName} · ${igSfx}` : `${customerName} · WhatsApp`);
  const senderBadgeCls = isOutbound
    ? (isCrmMsg
        ? "bg-fuchsia-50 text-fuchsia-700"
        : msg.senderType === "AI"
        ? (msgSource === "PEDIDO_TEXTO"
            ? "bg-sky-50 text-sky-700"
            : "bg-brand-50 text-brand-600")
        : msg.senderType === "HUMAN_EXTERNAL"
          ? "bg-teal-50 text-teal-700"
          : isIg ? "bg-pink-50 text-pink-700"
          : "bg-ink text-white")
    : (msg.senderType === "CUSTOMER_CARDAPIO"
        ? "bg-brand-50 text-brand-500"
        : isIg ? "bg-pink-50 text-pink-700"
        : "bg-green-50 text-green-700");

  // WhatsApp media arrives as an encrypted `.enc` URL the browser cannot open.
  // For those, point to the authenticated proxy which streams decrypted bytes.
  // All other media (operator uploads, Cardápio) use the stored URL directly.
  const isWaMedia = msg.metadata?.whatsappMedia === true;
  const mediaSrc  = isWaMedia ? `/api/chat/messages/${msg.id}/attachment` : msg.mediaUrl;

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
        <span className={`inline-block rounded-full px-2 py-px text-[10px] font-medium ${senderBadgeCls}`}>
          {senderLabel}
        </span>

        <div
          className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
            isOutbound
              ? "rounded-br-sm bg-brand-500 text-white"
              : "rounded-bl-sm bg-paper text-ink border border-line"
          }`}
        >
          {/* Image — render with fallback card if URL fails or is absent */}
          {msg.type === "IMAGE" && (
            mediaSrc ? (
              <a href={mediaSrc} target="_blank" rel="noopener noreferrer" className="mb-1 block">
                <img
                  src={mediaSrc}
                  alt="imagem"
                  className="max-h-48 max-w-full rounded-xl object-cover"
                  loading="lazy"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    el.style.display = "none";
                    const next = el.nextElementSibling as HTMLElement | null;
                    if (next) next.style.display = "flex";
                  }}
                />
                {/* Fallback shown when image URL fails to load */}
                <span
                  style={{ display: "none" }}
                  className={`items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold underline ${
                    isOutbound
                      ? "border-brand-400/50 bg-brand-600 text-white"
                      : "border-line2 bg-[#F4F4F2] text-ink2"
                  }`}
                >
                  <span>📷</span>
                  <span>Abrir imagem</span>
                </span>
              </a>
            ) : (
              <div className={`mb-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                isOutbound ? "border-brand-400/50 text-brand-200" : "border-line2 bg-canvas text-muted"
              }`}>
                <span>📷</span>
                <span>Imagem recebida</span>
              </div>
            )
          )}

          {/* Audio */}
          {msg.type === "AUDIO" && (
            mediaSrc ? (
              isWaMedia ? (
                <audio controls src={mediaSrc} className="mb-1 max-w-full" preload="none" />
              ) : (
              <a
                href={mediaSrc}
                target="_blank"
                rel="noopener noreferrer"
                className={`mb-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold underline ${
                  isOutbound
                    ? "border-brand-400/50 bg-brand-600 text-white"
                    : "border-line2 bg-[#F4F4F2] text-ink2"
                }`}
              >
                <span>🎵</span>
                <span>Áudio — abrir/baixar</span>
              </a>
              )
            ) : (
              <div className={`mb-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                isOutbound ? "border-brand-400/50 text-brand-200" : "border-line2 bg-canvas text-muted"
              }`}>
                <span>🎵</span>
                <span>Áudio recebido</span>
              </div>
            )
          )}

          {/* Document */}
          {msg.type === "DOCUMENT" && (
            mediaSrc ? (
              <a
                href={mediaSrc}
                target="_blank"
                rel="noopener noreferrer"
                className={`mb-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold underline ${
                  isOutbound
                    ? "border-brand-400/50 bg-brand-600 text-white"
                    : "border-line2 bg-[#F4F4F2] text-ink2"
                }`}
              >
                <span>📄</span>
                <span className="truncate">{msg.content || "Documento"}</span>
              </a>
            ) : (
              <div className={`mb-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                isOutbound ? "border-brand-400/50 text-brand-200" : "border-line2 bg-canvas text-muted"
              }`}>
                <span>📄</span>
                <span className="truncate">{msg.content || "Arquivo recebido"}</span>
              </div>
            )
          )}

          {/* Unknown media types */}
          {msg.type !== "TEXT" && msg.type !== "IMAGE" && msg.type !== "AUDIO" && msg.type !== "DOCUMENT" && (
            <p className={`mb-1 text-xs font-medium ${isOutbound ? "text-brand-200" : "text-muted"}`}>
              [{msg.type?.toLowerCase?.() ?? "anexo"}]
            </p>
          )}

          {/* Text content / caption — skip for DOCUMENT (already shown in card) */}
          {msg.type !== "DOCUMENT" && msg.content && (
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          )}
        </div>

        <div className="flex items-center gap-2 px-1 text-[10px] text-muted">
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
              className="rounded-full border border-brand-200 bg-brand-50 px-2 py-px text-[10px] font-semibold text-brand-600 hover:bg-brand-100 transition-colors"
            >
              Ensinar IA
            </button>
          )}
        </div>
      </div>
    </>
  );
}
