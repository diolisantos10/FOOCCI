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
import {
  HANDOFF_SOUND_PREF_KEY,
  readSoundPref,
  fetchRestaurantSoundSettings,
  HANDOFF_ALERT_ASSET,
  HANDOFF_SOUND_LAST_PLAYED_KEY,
  HANDOFF_SOUND_LAST_ERROR_KEY,
} from "@/lib/sound-prefs";
import { playAlertAudio, installSilentUnlock } from "@/lib/sound-player";
import { AlertLoopController } from "@/lib/alert-loop";
import { pendingHumanRequestIds } from "@/lib/handoff-alert";
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

type Channel = "WHATSAPP" | "EMAIL" | "SMS" | "QR_AGENT" | "WEB_AGENT" | "MANUAL" | "INSTAGRAM_DIRECT";

type StatusFilter  = "ALL" | "AI_ON" | "AI_OFF" | "WAITING" | "RESOLVED" | "CRM_SENT" | "CRM_REPLIED" | "LOCKED";
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
  MANUAL:           { label: "Manual",       icon: "✍️"  },
  INSTAGRAM_DIRECT: { label: "Instagram DM", icon: "📷"  },
};

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ALL",         label: "Todas"         },
  { id: "AI_ON",       label: "IA ativa"      },
  { id: "AI_OFF",      label: "Humano"        },
  { id: "WAITING",     label: "Aguardando"    },
  { id: "RESOLVED",    label: "Resolvidas"    },
  { id: "LOCKED",      label: "IA bloqueada"  },
  { id: "CRM_SENT",    label: "CRM enviado"   },
  { id: "CRM_REPLIED", label: "Resposta CRM"  },
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
  // Permanent Staff/Supplier lock takes precedence over every other state —
  // it must never read as "IA ativa".
  if (c.aiLocked)
    return { label: "IA bloqueada", cls: "bg-slate-200 text-slate-700 border-slate-300" };
  if (c.status === "RESOLVED")
    return { label: "Resolvida",  cls: "bg-gray-100   text-gray-500  border-gray-200"  };
  if (c.status === "OPEN" && c.unreadCount > 0)
    return { label: "Aguardando", cls: "bg-red-100    text-red-700   border-red-200"   };
  if (!c.aiEnabled || c.status === "HUMAN" || c.status === "HUMANO_ASSUMIU")
    return { label: "Humano",     cls: "bg-green-100  text-green-700 border-green-200" };
  return   { label: "IA ativa",   cls: "bg-purple-100 text-purple-700 border-purple-200" };
}

// Classification chip for non-customer conversations (Staff/Fornecedor/etc.).
function getConvTypeBadge(c: ConvSummary): { label: string; cls: string } | null {
  const t = c.conversationType;
  if (!t || t === "CUSTOMER") return null;
  return { label: CONV_TYPE_LABEL[t], cls: "bg-slate-100 text-slate-600 border-slate-200" };
}

// CRM_CAMPAIGN and CRM_AUTOMATION are handled dynamically in getCrmBadge()
// so the badge reflects whether the customer has replied or not.
const CONTEXT_BADGE: Record<string, { label: string; cls: string }> = {
  ORDER_SUPPORT: { label: "Pós-venda", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  HUMAN_SUPPORT: { label: "Suporte",   cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
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
    return { label: "Resposta CRM", cls: "bg-amber-100 text-amber-700 border-amber-200" };
  }
  return {
    label: specific ?? "CRM enviado",
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
  // Repeats until an operator assumes/resolves the conversation. Config lives
  // ONLY in Configurações → Sons e alertas (DB-backed); the localStorage mirror
  // is just the instant fallback before the API responds. No sound UI here.
  const handoffAudioRef      = useRef<HTMLAudioElement | null>(null);
  const handoffControllerRef = useRef<AlertLoopController | null>(null);
  const [handoffSoundEnabled, setHandoffSoundEnabled] = useState(() => readSoundPref(HANDOFF_SOUND_PREF_KEY, true));
  const handoffVolumeRef = useRef(120);
  const repeatHandoffRef = useRef(true);

  const [leftWidth,     setLeftWidth]     = useState<number>(320);
  const [isDesktop,     setIsDesktop]     = useState<boolean>(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Fetch conversation list ────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    // Server-side status filter only for RESOLVED (reduces payload)
    if (statusFilter === "RESOLVED") params.set("status", "RESOLVED");
    // CRM filters need server-side contextType filtering. CRM outbound-only
    // conversations have lastMessageAt=null and are sorted/deduped to the bottom,
    // so they fall outside the default loaded window — a purely client-side
    // filter would find nothing. crm=1 returns CRM-origin conversations directly,
    // independent of channel. The SENT vs REPLIED split stays client-side below.
    if (statusFilter === "CRM_SENT" || statusFilter === "CRM_REPLIED") params.set("crm", "1");

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

  // ── Human-attention alarm: audio element + repeat controller ──────────────
  useEffect(() => {
    const audio = new Audio(HANDOFF_ALERT_ASSET);
    audio.preload = "auto";
    handoffAudioRef.current = audio;
    // First user interaction silently unlocks browser autoplay — no UI required
    installSilentUnlock(() => [audio]);

    const controller = new AlertLoopController({
      // Uses the existing atendimento sound + saved volume/gain (no theme).
      play: async (vol) => {
        const a = handoffAudioRef.current;
        if (!a) return;
        await playAlertAudio(a, vol);
      },
      getVolume:       () => handoffVolumeRef.current,
      isRepeatEnabled: () => repeatHandoffRef.current,
      assetPath:       HANDOFF_ALERT_ASSET,
      intervalMs:      9_000,    // repeat every 9 s (8–10 s window)
      maxDurationMs:   300_000,  // backstop: stop a single alarm after 5 min
      onDiagnostics: (d) => {
        try {
          if (d.lastResult === "success" && d.lastAttemptAt) {
            localStorage.setItem(HANDOFF_SOUND_LAST_PLAYED_KEY, new Date(d.lastAttemptAt).toISOString());
          } else if (d.lastResult === "error" && d.lastError) {
            localStorage.setItem(HANDOFF_SOUND_LAST_ERROR_KEY, `${new Date().toISOString()}: ${d.lastError}`);
          }
        } catch { /* storage unavailable */ }
      },
    });
    handoffControllerRef.current = controller;

    return () => {
      controller.dispose();           // stop reason → PAGE_UNMOUNT, clears loop
      handoffControllerRef.current = null;
      audio.pause();
      audio.src = "";
    };
  }, []);

  // Load DB-backed sound settings (Configurações → Sons e alertas) — source of truth
  useEffect(() => {
    void fetchRestaurantSoundSettings().then((s) => {
      if (!s) return;
      setHandoffSoundEnabled(s.soundEnabled && s.humanAttentionSoundEnabled);
      handoffVolumeRef.current = s.soundVolume;
      repeatHandoffRef.current = s.repeatHumanAttentionUntilSeen;
    });
  }, []);

  // Conversations waiting for a human (status === "HUMAN", not Staff/equipe),
  // unassumed. This is the visible pending queue AND the base of the alarm.
  const pendingHumanIds = useMemo(
    () => pendingHumanRequestIds(conversations),
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

  // The alarm rings for pending requests MINUS the acknowledged batch. Plays
  // immediately on a new request, repeats while any remain, stops when assumed/
  // resolved/acknowledged — never because the page is open or a conversation is viewed.
  const alarmingHumanIds = useMemo(
    () => pendingHumanIds.filter((id) => !acknowledgedHumanIds.has(id)),
    [pendingHumanIds, acknowledgedHumanIds],
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

  const alarmingOverdueIds = useMemo(
    () => overdueIds.filter((id) => !acknowledgedOverdueIds.has(id)),
    [overdueIds, acknowledgedOverdueIds],
  );

  // The alarm sound rings for pending (unacked) ∪ overdue (unacked), deduped.
  const soundIds = useMemo(
    () => Array.from(new Set([...alarmingHumanIds, ...alarmingOverdueIds])),
    [alarmingHumanIds, alarmingOverdueIds],
  );

  useEffect(() => {
    handoffControllerRef.current?.sync(handoffSoundEnabled ? soundIds : []);
  }, [soundIds, handoffSoundEnabled]);

  const acknowledgePendingHuman = useCallback(() => {
    setAcknowledgedHumanIds(new Set(pendingHumanIds));
  }, [pendingHumanIds]);

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
    () => conversations.filter((c) => c.status === "HUMAN" || c.status === "HUMANO_ASSUMIU").length,
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
    if (statusFilter === "CRM_SENT") {
      // Show only CRM outbound-only conversations (customer hasn't replied).
      items = items.filter((c) => isCrmOrigin(c) && !convHasCustomerReply(c));
    } else if (statusFilter === "CRM_REPLIED") {
      // Show only CRM conversations where customer replied.
      items = items.filter((c) => isCrmOrigin(c) && convHasCustomerReply(c));
    } else if (statusFilter === "LOCKED") {
      // Show only permanently AI-locked (staff/supplier/non-customer) conversations.
      items = items.filter((c) => c.aiLocked === true);
    } else if (statusFilter !== "RESOLVED") {
      // Default "Todas": hide CRM outbound-only — they don't need human attention.
      // Conversations where the customer replied (hasCustomerReplied=true OR any
      // loaded INBOUND message) remain visible even if the latest msg is outbound.
      if (statusFilter === "ALL") {
        items = items.filter((c) => !isCrmOrigin(c) || convHasCustomerReply(c));
      }
      if (statusFilter === "AI_ON") {
        // Locked conversations are never "IA ativa".
        items = items.filter((c) => c.aiEnabled && !c.aiLocked && c.status !== "RESOLVED");
      }
      if (statusFilter === "AI_OFF") {
        items = items.filter((c) => !c.aiEnabled && c.status !== "RESOLVED");
      }
      if (statusFilter === "WAITING") {
        items = items.filter((c) => c.unreadCount > 0 && c.status !== "RESOLVED");
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
      if (action === "resolve") handoffControllerRef.current?.resolve(selectedId, "RESOLVED");
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
      if (action === "takeover") handoffControllerRef.current?.resolve(selectedId, "ASSUMED");
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
      style={{ height: "calc(100vh - 56px)" }}
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
          <div className="flex flex-wrap items-center gap-2 border-b border-orange-200 bg-orange-50 px-3 py-1.5">
            <span className="text-xs font-semibold text-orange-700">
              🙋 {pendingHumanIds.length} aguardando atendimento humano
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={viewFirstPendingHuman}
                className="rounded-lg bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-600 transition-colors"
              >
                Ver pendentes
              </button>
              <button
                type="button"
                onClick={acknowledgePendingHuman}
                disabled={alarmingHumanIds.length === 0}
                title="Silencia o alarme do lote atual sem resolver as conversas nem reativar a IA"
                className="rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-[11px] font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50 transition-colors"
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
                onClick={() => setAcknowledgedOverdueIds(new Set(overdueHandoffs.map((o) => o.id)))}
                disabled={alarmingOverdueIds.length === 0}
                title="Silencia o som deste alerta sem resolver as conversas nem reativar a IA"
                className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
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
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
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
                {statusFilter === "CRM_SENT" || statusFilter === "CRM_REPLIED"
                  ? "Nenhuma mensagem de CRM encontrada neste filtro."
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
                          : "border-transparent hover:bg-[#FAFAF8]"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Avatar */}
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isWaiting
                              ? "bg-red-100 text-red-700"
                              : "bg-brand-50 text-brand-600"
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
                              <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-px text-[9px] font-bold leading-none text-blue-700">
                                📱📋 Multicanal
                              </span>
                            ) : conv.channel === "WHATSAPP" ? (
                              <span className="rounded-full border border-green-200 bg-green-50 px-1.5 py-px text-[9px] font-bold leading-none text-green-700">
                                📱 WhatsApp
                              </span>
                            ) : conv.channel === "QR_AGENT" || conv.channel === "WEB_AGENT" ? (
                              <span className="rounded-full border border-purple-200 bg-purple-50 px-1.5 py-px text-[9px] font-bold leading-none text-purple-700">
                                📋 Cardápio
                              </span>
                            ) : conv.channel === "MANUAL" ? (
                              <span className="rounded-full border border-gray-200 bg-gray-100 px-1.5 py-px text-[9px] font-bold leading-none text-gray-600">
                                ✍️ Manual
                              </span>
                            ) : (
                              <span className="rounded-full border border-gray-200 bg-gray-100 px-1.5 py-px text-[9px] font-bold leading-none text-gray-500">
                                {chanMeta.icon} {chanMeta.label}
                              </span>
                            )}
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
                            {/* Conversation type badge — Staff / Fornecedor / etc. */}
                            {convTypeBadge && (
                              <span className={`rounded-full border px-1.5 py-px text-[9px] font-bold leading-none ${convTypeBadge.cls}`}>
                                {convTypeBadge.label}
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
              Pedido {formatOrderNumber(order.orderNumber, order.id)} · R$ {parseFloat(order.total).toFixed(2).replace(".", ",")}
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
// ── ThreadPanel component ─────────────────────────────────────────────────────

function ThreadPanel({
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
  // Pending human request: customer asked for a human and NO operator has assumed
  // yet (status HUMAN). Escalation turns aiEnabled off, so this used to fall into
  // "human handling" and only offered "Devolver para IA" — the bug. This is the
  // status that keeps the alarm ringing → it must offer "Assumir atendimento".
  const isPendingHuman = thread.status === "HUMAN" && !isResolved && !isLocked;
  // A locked conversation is neither AI-active nor a normal temporary takeover.
  const isAIActive     = thread.aiEnabled && !isResolved && !isLocked && !isPendingHuman;
  const isHumanHandling = !thread.aiEnabled && !isResolved && !isLocked;
  const isMultichannel = thread.channel === "WHATSAPP" &&
    thread.messages.some((m) => m.senderType === "CUSTOMER_CARDAPIO");

  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [orderCreatedId,  setOrderCreatedId]  = useState<string | null>(null);
  const [orderCreatedNumber, setOrderCreatedNumber] = useState<string | null>(null);

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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
              {initials(thread.customer?.name ?? thread.customerName ?? "?")}
            </div>
            <div className="min-w-0">
              {thread.customer?.id ? (
                <a
                  href={`/customers/${thread.customer.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-bold text-gray-900 hover:text-orange-600 hover:underline"
                  title="Abrir ficha do cliente"
                >
                  {thread.customer.name ?? "Desconhecido"}
                </a>
              ) : (
                <p className="truncate text-sm font-bold text-gray-900">
                  {thread.customer?.name ?? thread.customerName ?? "Desconhecido"}
                </p>
              )}
              <p className="text-xs text-gray-500">
                {(() => {
                  const ph = thread.customer?.phone ?? thread.customerPhone ?? "";
                  return !ph || isGuestIdentifier(ph) ? "Telefone não informado" : ph;
                })()}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-1.5 sm:flex">
            {isMultichannel ? (
              <span className="flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-700">
                <span>📱📋</span>
                <span className="hidden md:inline">Multicanal</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                <span>{channel.icon}</span>
                <span className="hidden md:inline">{channel.label}</span>
              </span>
            )}
            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${badge.cls}`}>
              {badge.label}
            </span>
            {typeBadge && (
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${typeBadge.cls}`}>
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
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
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
              className="shrink-0 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
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
              className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              Assumir atendimento
            </button>
          )}
          {isHumanHandling && !isPendingHuman && (
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

        {/* Permanent AI lock warning */}
        {isLocked && (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
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
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line2 text-muted hover:bg-[#FAFAF8] hover:text-brand-500 disabled:opacity-40 transition-colors"
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

  // Historical internal command messages that leaked before the security fix.
  // Render as an admin-only separator — never as a customer chat bubble.
  if (isInternalCommandContent(msg.content)) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="shrink-0 rounded-full bg-gray-100 border border-gray-300 px-2 py-0.5 text-[10px] font-medium text-gray-400">
          Comando interno ocultado
        </span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
    );
  }

  const isOutbound  = msg.direction === "OUTBOUND";
  const isHumanMsg  = isOutbound && (msg.senderType === "HUMAN" || msg.senderType === "HUMAN_EXTERNAL");
  const msgSource   = msg.metadata?.source; // "CARDAPIO" | "WHATSAPP" | undefined
  const crmCtx      = msg.metadata?.contextType as string | undefined;
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
          ? (msgSource === "CARDAPIO" ? "Operador · Cardápio" : "Operador · WhatsApp")
          : "Operador")
    : (msg.senderType === "CUSTOMER_CARDAPIO" ? `${customerName} · Cardápio` : `${customerName} · WhatsApp`);
  const senderBadgeCls = isOutbound
    ? (isCrmMsg
        ? "bg-violet-50 border border-violet-200 text-violet-700"
        : msg.senderType === "AI"
        ? (msgSource === "PEDIDO_TEXTO"
            ? "bg-sky-50 border border-sky-200 text-sky-700"
            : "bg-orange-50 border border-orange-200 text-orange-600")
        : msg.senderType === "HUMAN_EXTERNAL"
          ? "bg-teal-50 border border-teal-200 text-teal-700"
          : "bg-gray-700 border border-gray-600 text-white")
    : (msg.senderType === "CUSTOMER_CARDAPIO"
        ? "bg-purple-50 border border-purple-200 text-purple-700"
        : "bg-green-50 border border-green-200 text-green-700");

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
                      ? "border-orange-400/50 bg-orange-600 text-white"
                      : "border-gray-200 bg-gray-100 text-gray-700"
                  }`}
                >
                  <span>📷</span>
                  <span>Abrir imagem</span>
                </span>
              </a>
            ) : (
              <div className={`mb-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                isOutbound ? "border-orange-400/50 text-orange-200" : "border-gray-200 bg-gray-50 text-gray-500"
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
                    ? "border-orange-400/50 bg-orange-600 text-white"
                    : "border-gray-200 bg-gray-100 text-gray-700"
                }`}
              >
                <span>🎵</span>
                <span>Áudio — abrir/baixar</span>
              </a>
              )
            ) : (
              <div className={`mb-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                isOutbound ? "border-orange-400/50 text-orange-200" : "border-gray-200 bg-gray-50 text-gray-500"
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
                    ? "border-orange-400/50 bg-orange-600 text-white"
                    : "border-gray-200 bg-gray-100 text-gray-700"
                }`}
              >
                <span>📄</span>
                <span className="truncate">{msg.content || "Documento"}</span>
              </a>
            ) : (
              <div className={`mb-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                isOutbound ? "border-orange-400/50 text-orange-200" : "border-gray-200 bg-gray-50 text-gray-500"
              }`}>
                <span>📄</span>
                <span className="truncate">{msg.content || "Arquivo recebido"}</span>
              </div>
            )
          )}

          {/* Unknown media types */}
          {msg.type !== "TEXT" && msg.type !== "IMAGE" && msg.type !== "AUDIO" && msg.type !== "DOCUMENT" && (
            <p className={`mb-1 text-xs font-medium ${isOutbound ? "text-orange-200" : "text-gray-400"}`}>
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
