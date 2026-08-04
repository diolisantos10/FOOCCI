"use client";

/**
 * Shared notifications hook — single source of truth for the operational
 * notification feed, reused by both the TopBar indicator and the Help widget.
 *
 * Data comes from GET /api/notifications (derived from conversations, orders,
 * payments and integration errors). Read state is per-browser in localStorage
 * (same key the TopBar has always used), and changes are broadcast in-tab so
 * the bell badge and the widget feed never drift apart.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  NotificationItem,
  NotifType,
  NotifPriority,
} from "@/app/api/notifications/route";

export type { NotificationItem, NotifType, NotifPriority };

// ── Presentation maps (shared) ────────────────────────────────────────────────

export const TYPE_ICON: Record<NotifType, string> = {
  atendimento: "💬",
  pedido: "📋",
  pagamento: "💳",
  integracao: "🔌",
  sistema: "⚙️",
};

export const TYPE_LABEL: Record<NotifType, string> = {
  atendimento: "Atendimento",
  pedido: "Pedido",
  pagamento: "Pagamento",
  integracao: "Integração",
  sistema: "Sistema",
};

// Tokens do DESIGN.md — laranja é da marca, o resto é status semântico.
// (Antes: purple/teal/gray crus. Corrigido ao reconstruir a superfície de Avisos.)
export const TYPE_LABEL_COLOR: Record<NotifType, string> = {
  atendimento: "text-blue-600",
  pedido: "text-brand-600",
  pagamento: "text-green-700",
  integracao: "text-amber-700",
  sistema: "text-muted",
};

export const PRIORITY_BORDER: Record<NotifPriority, string> = {
  critical: "border-l-red-500",
  important: "border-l-brand-400",
  normal: "border-l-line2",
};

// ── Read-state (localStorage, shared with the legacy TopBar) ──────────────────

const STORAGE_KEY = "foocci_notifs_read_v1";
const READ_EVENT = "foocci:notifs-read";

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
    window.dispatchEvent(new Event(READ_EVENT));
  } catch {
    // ignore storage errors
  }
}

// ── Relative time ─────────────────────────────────────────────────────────────

export function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseNotifications {
  notifs: NotificationItem[];
  readIds: Set<string>;
  unreadCount: number;
  hasCritical: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export function useNotifications(pollMs = 10_000): UseNotifications {
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [readIds, setReadIdsState] = useState<Set<string>>(new Set());

  // Hydrate read IDs and keep in sync with other hook instances / tabs.
  useEffect(() => {
    setReadIdsState(loadReadIds());
    const sync = () => setReadIdsState(loadReadIds());
    window.addEventListener(READ_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(READ_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Poll the feed.
  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const json = await res.json();
      setNotifs((json.data ?? []) as NotificationItem[]);
    } catch {
      // network error — keep current state
    }
  }, []);

  useEffect(() => {
    fetchNotifs();
    const id = setInterval(fetchNotifs, pollMs);
    return () => clearInterval(id);
  }, [fetchNotifs, pollMs]);

  const unreadCount = notifs.filter((n) => !readIds.has(n.id)).length;
  const hasCritical = notifs.some(
    (n) => n.priority === "critical" && !readIds.has(n.id),
  );

  const markRead = useCallback((id: string) => {
    setReadIdsState((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReadIds(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIdsState(() => {
      const next = new Set(notifs.map((n) => n.id));
      saveReadIds(next);
      return next;
    });
  }, [notifs]);

  return { notifs, readIds, unreadCount, hasCritical, markRead, markAllRead };
}
