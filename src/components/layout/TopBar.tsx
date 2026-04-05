"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { NotificationItem, NotifType, NotifPriority } from "@/app/api/notifications/route";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<NotifType, string> = {
  atendimento: "💬",
  pedido:      "📋",
  pagamento:   "💳",
  sistema:     "⚙️",
};

const TYPE_LABEL: Record<NotifType, string> = {
  atendimento: "Atendimento",
  pedido:      "Pedido",
  pagamento:   "Pagamento",
  sistema:     "Sistema",
};

const TYPE_LABEL_COLOR: Record<NotifType, string> = {
  atendimento: "text-blue-600",
  pedido:      "text-orange-600",
  pagamento:   "text-purple-600",
  sistema:     "text-gray-500",
};

// Left border colors by priority
const PRIORITY_BORDER: Record<NotifPriority, string> = {
  urgent:    "border-l-red-500",
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

export function TopBar({ title }: TopBarProps) {
  const router = useRouter();

  // Panel open/close
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Notifications
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [readIds, setReadIdsState] = useState<Set<string>>(new Set());

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
      {/* Left: brand / page breadcrumb */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold tracking-tight text-[#0B0B0B]">
          Foocci
        </span>
        {title && (
          <>
            <span className="text-gray-300 text-sm">/</span>
            <span className="text-sm text-gray-500">{title}</span>
          </>
        )}
      </div>

      {/* Right: bell + sign out */}
      <div className="flex items-center gap-1">

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
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
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
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
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
                                  {notif.priority === "urgent" && (
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-red-600">
                                      urgente
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

              {/* Panel footer */}
              {notifs.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push("/atendimento");
                    }}
                    className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
                  >
                    Ver central de atendimento →
                  </button>
                </div>
              )}
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
    </header>
  );
}
