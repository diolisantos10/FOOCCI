"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { NotificationItem, NotifType, NotifPriority } from "@/app/api/notifications/route";
import { useSidebar } from "./SidebarContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<NotifType, string> = {
  atendimento: "💬",
  pedido:      "📋",
  pagamento:   "💳",
  integracao:  "🔌",
  sistema:     "⚙️",
};

const TYPE_LABEL: Record<NotifType, string> = {
  atendimento: "Atendimento",
  pedido:      "Pedido",
  pagamento:   "Pagamento",
  integracao:  "Integração",
  sistema:     "Sistema",
};

const TYPE_LABEL_COLOR: Record<NotifType, string> = {
  atendimento: "text-blue-600",
  pedido:      "text-orange-600",
  pagamento:   "text-purple-600",
  integracao:  "text-teal-600",
  sistema:     "text-gray-500",
};

// Left border colors by priority
const PRIORITY_BORDER: Record<NotifPriority, string> = {
  critical:  "border-l-red-500",
  important: "border-l-orange-400",
  normal:    "border-l-gray-200",
};

// ── localStorage helpers (read state) ─────────────────────────────────────────

const STORAGE_KEY = "foocci_notifs_read_v1";

function loadReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore storage errors
  }
}

// ── Relative time ─────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TopBarProps {
  title: string;
}

const PAUSE_REASONS = [
  "Alta demanda — cozinha sobrecarregada",
  "Problema técnico",
  "Falta de ingredientes",
  "Encerramento antecipado",
  "Manutenção",
  "Outro",
];

const AUTO_RESUME_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: "Indefinido (manual)",   minutes: null },
  { label: "15 minutos",            minutes: 15 },
  { label: "30 minutos",            minutes: 30 },
  { label: "1 hora",                minutes: 60 },
  { label: "2 horas",               minutes: 120 },
];

export function TopBar({ title }: TopBarProps) {
  const router = useRouter();
  const { toggle: toggleSidebar } = useSidebar();
  const { data: session } = useSession();

  // Panel open/close
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Notifications
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [readIds, setReadIdsState] = useState<Set<string>>(new Set());

  // ── Emergency pause state ────────────────────────────────────────────────────
  const [isPaused, setIsPaused]         = useState(false);
  const [pauseReason, setPauseReason]   = useState<string | null>(null);
  const [pausedUntil, setPausedUntil]   = useState<string | null>(null);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [modalReason, setModalReason]   = useState(PAUSE_REASONS[0]!);
  const [modalResume, setModalResume]   = useState<number | null>(null);
  const [pauseLoading, setPauseLoading] = useState(false);

  // Hydrate read IDs from localStorage after mount
  useEffect(() => {
    setReadIdsState(loadReadIds());
  }, []);

  // ── Polling ────────────────────────────────────────────────────────────────
  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const json = await res.json();
      const items: NotificationItem[] = json.data ?? [];
      setNotifs(items);
    } catch {
      // network error — keep current state
    }
  }, []);

  useEffect(() => {
    fetchNotifs();
    const id = setInterval(fetchNotifs, 10_000);
    return () => clearInterval(id);
  }, [fetchNotifs]);

  // ── Pause status polling ───────────────────────────────────────────────────
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canPause = role === "OWNER" || role === "MANAGER";

  const fetchPauseStatus = useCallback(async () => {
    if (!canPause) return;
    try {
      const res = await fetch("/api/settings/store/pause");
      if (!res.ok) return;
      const json = await res.json() as { paused: boolean; reason: string | null; pausedUntil: string | null };
      setIsPaused(json.paused);
      setPauseReason(json.reason);
      setPausedUntil(json.pausedUntil);
    } catch {
      // network error — keep current state
    }
  }, [canPause]);

  useEffect(() => {
    fetchPauseStatus();
    const id = setInterval(fetchPauseStatus, 30_000);
    return () => clearInterval(id);
  }, [fetchPauseStatus]);

  async function handleActivatePause() {
    setPauseLoading(true);
    try {
      const pauseUntil = modalResume != null
        ? new Date(Date.now() + modalResume * 60_000).toISOString()
        : null;
      const res = await fetch("/api/settings/store/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: modalReason, pauseUntil }),
      });
      if (res.ok) {
        setIsPaused(true);
        setPauseReason(modalReason);
        setPausedUntil(pauseUntil);
        setShowPauseModal(false);
      }
    } catch {
      // ignore
    }
    setPauseLoading(false);
  }

  async function handleResumePause() {
    setPauseLoading(true);
    try {
      const res = await fetch("/api/settings/store/pause", { method: "DELETE" });
      if (res.ok) {
        setIsPaused(false);
        setPauseReason(null);
        setPausedUntil(null);
      }
    } catch {
      // ignore
    }
    setPauseLoading(false);
  }

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        bellRef.current?.contains(target)
      )
        return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const unreadCount = notifs.filter((n) => !readIds.has(n.id)).length;
  const hasCritical = notifs.some(
    (n) => n.priority === "critical" && !readIds.has(n.id)
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  function markRead(id: string) {
    const next = new Set(readIds);
    next.add(id);
    setReadIdsState(next);
    saveReadIds(next);
  }

  function markAllRead() {
    const next = new Set(notifs.map((n) => n.id));
    setReadIdsState(next);
    saveReadIds(next);
  }

  function handleNotifClick(notif: NotificationItem) {
    markRead(notif.id);
    setOpen(false);
    router.push(notif.href);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <header className="flex h-14 items-center justify-between border-b border-[#E5E5E5] bg-white px-6">
      {/* Left: hamburger (mobile) + brand / page breadcrumb */}
      <div className="flex items-center gap-2">
        {/* Hamburger — mobile only */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Abrir menu"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 lg:hidden"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <span className="text-sm font-bold tracking-tight text-[#0B0B0B]">
          Foocci
        </span>
        {title && (
          <>
            <span className="hidden text-sm text-gray-300 sm:inline">/</span>
            <span className="hidden text-sm text-gray-500 sm:inline">{title}</span>
          </>
        )}
      </div>

      {/* Right: pause + bell + sign out */}
      <div className="flex items-center gap-1">

        {/* ── Emergency pause button ───────────────────────────────────── */}
        {canPause && (
          isPaused ? (
            <button
              type="button"
              onClick={handleResumePause}
              disabled={pauseLoading}
              title={pauseReason ? `Pausado: ${pauseReason}. Clique para retomar` : "Pedidos pausados — clique para retomar"}
              className="flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="hidden sm:inline">Pedidos pausados</span>
              <span className="sm:hidden">Pausado</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setModalReason(PAUSE_REASONS[0]!); setModalResume(null); setShowPauseModal(true); }}
              title="Pausar pedidos de emergência"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-orange-50 hover:text-orange-700 border border-transparent hover:border-orange-200"
            >
              <span>⏸</span>
              <span className="hidden sm:inline">Pausar pedidos</span>
            </button>
          )
        )}

        {/* ── Notification bell ─────────────────────────────────────────── */}
        <div className="relative">
          <button
            ref={bellRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Notificações"
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors ${
              open
                ? "bg-gray-100 text-gray-800"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            }`}
          >
            🔔
            {unreadCount > 0 && (
              <span
                className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white ${
                  hasCritical ? "bg-red-500" : "bg-orange-400"
                }`}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* ── Notification panel ─────────────────────────────────────── */}
          {open && (
            <div
              ref={panelRef}
              className="absolute right-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">
                    Notificações
                  </span>
                  {unreadCount > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        hasCritical
                          ? "bg-red-100 text-red-600"
                          : "bg-orange-100 text-orange-600"
                      }`}
                    >
                      {unreadCount} nova{unreadCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-xs font-medium text-orange-500 transition-colors hover:text-orange-600"
                  >
                    Marcar tudo como lido
                  </button>
                )}
              </div>

              {/* Notification list */}
              <div className="max-h-[400px] overflow-y-auto">
                {notifs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                    <span className="text-3xl opacity-40">🔔</span>
                    <p className="text-sm text-gray-400">
                      Tudo em ordem por aqui
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {notifs.map((notif) => {
                      const isRead = readIds.has(notif.id);
                      return (
                        <li key={notif.id}>
                          <button
                            type="button"
                            onClick={() => handleNotifClick(notif)}
                            className={`w-full border-l-4 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                              PRIORITY_BORDER[notif.priority]
                            } ${isRead ? "opacity-55" : ""}`}
                          >
                            <div className="flex items-start gap-2.5">
                              {/* Category icon */}
                              <span className="mt-0.5 shrink-0 text-base leading-none">
                                {TYPE_ICON[notif.type]}
                              </span>

                              <div className="min-w-0 flex-1">
                                {/* Message row */}
                                <div className="flex items-start gap-1.5">
                                  <p
                                    className={`flex-1 text-xs leading-snug ${
                                      isRead
                                        ? "text-gray-500"
                                        : "font-semibold text-gray-900"
                                    }`}
                                  >
                                    {notif.message}
                                  </p>
                                  {/* Unread dot */}
                                  {!isRead && (
                                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                                  )}
                                </div>

                                {/* Meta row */}
                                <div className="mt-1 flex items-center gap-2">
                                  <span
                                    className={`text-[10px] font-semibold uppercase tracking-wide ${
                                      TYPE_LABEL_COLOR[notif.type]
                                    }`}
                                  >
                                    {TYPE_LABEL[notif.type]}
                                  </span>
                                  {notif.priority === "critical" && (
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-red-600">
                                      crítico
                                    </span>
                                  )}
                                  <span className="ml-auto text-[10px] text-gray-400">
                                    {relTime(notif.createdAt)}
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
          )}
        </div>

        {/* ── Sign out ─────────────────────────────────────────────────── */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <span>Sair</span>
          <span className="text-gray-300">↗</span>
        </button>
      </div>

      {/* ── Emergency pause modal ────────────────────────────────────────── */}
      {showPauseModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPauseModal(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl mx-4">
            <h2 className="mb-1 text-base font-bold text-gray-900">Pausar pedidos</h2>
            <p className="mb-4 text-xs text-gray-500">
              Todos os canais (cardápio online, WhatsApp) vão bloquear novos pedidos imediatamente.
            </p>

            <label className="mb-1.5 block text-xs font-semibold text-gray-700">Motivo</label>
            <select
              value={modalReason}
              onChange={(e) => setModalReason(e.target.value)}
              className="mb-4 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
            >
              {PAUSE_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <label className="mb-1.5 block text-xs font-semibold text-gray-700">Retomar automaticamente</label>
            <select
              value={modalResume ?? ""}
              onChange={(e) => setModalResume(e.target.value === "" ? null : Number(e.target.value))}
              className="mb-6 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
            >
              {AUTO_RESUME_OPTIONS.map((o) => (
                <option key={o.label} value={o.minutes ?? ""}>{o.label}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPauseModal(false)}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleActivatePause}
                disabled={pauseLoading}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {pauseLoading ? "Pausando…" : "Pausar agora"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
