"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";
import { useSidebar } from "./SidebarContext";
import { useNotifications } from "@/components/help/useNotifications";
import { openHelpWidget } from "@/components/help/events";

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
  { label: "1 hora",                minutes: 60 },
  { label: "2 horas",               minutes: 120 },
  { label: "3 horas",               minutes: 180 },
  { label: "Tempo personalizado",   minutes: -1 },
  { label: "Indefinido (manual)",   minutes: null },
];

function fmtLocalHM(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function TopBar({ title }: TopBarProps) {
  const { toggle: toggleSidebar, restaurant } = useSidebar();
  const { data: session } = useSession();

  // Notifications — shared with the Help widget (the full feed lives there now).
  // The bell is kept as a subtle indicator that opens the widget's Avisos tab.
  const { unreadCount, hasCritical } = useNotifications();

  // ── Emergency pause state ────────────────────────────────────────────────────
  const [isPaused, setIsPaused]         = useState(false);
  const [pauseReason, setPauseReason]   = useState<string | null>(null);
  const [pausedUntil, setPausedUntil]   = useState<string | null>(null);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [modalReason, setModalReason]       = useState(PAUSE_REASONS[0]!);
  const [modalResume, setModalResume]       = useState<number | null>(60);
  const [modalCustomMinutes, setModalCustomMinutes] = useState(60);
  const [pauseLoading, setPauseLoading]     = useState(false);

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
    const effectiveMinutes = modalResume === -1 ? modalCustomMinutes : modalResume;
    try {
      const pauseUntil = effectiveMinutes != null
        ? new Date(Date.now() + effectiveMinutes * 60_000).toISOString()
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

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/foocci/foocci-anagram.png" alt="Foocci" className="h-7 w-7 rounded-lg lg:hidden" />
        {title && (
          <>
            <span className="text-sm font-semibold text-gray-700 sm:text-gray-500">{title}</span>
          </>
        )}
      </div>

      {/* Right: pause + bell + sign out */}
      <div className="flex items-center gap-1">

        {/* ── Emergency pause button ───────────────────────────────────── */}
        {canPause && (
          isPaused ? (
            <div
              title={pauseReason ? `Pausado: ${pauseReason}` : "Pedidos pausados"}
              className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 animate-pulse" />
              <span className="font-semibold text-amber-800 hidden sm:inline">
                {pausedUntil && new Date(pausedUntil) > new Date()
                  ? `Pausado até ${fmtLocalHM(pausedUntil)}`
                  : "Pedidos pausados"}
              </span>
              <span className="font-semibold text-amber-800 sm:hidden">Pausado</span>
              <span className="text-amber-300 hidden sm:inline">·</span>
              <button
                type="button"
                onClick={handleResumePause}
                disabled={pauseLoading}
                className="font-semibold text-amber-700 hover:text-amber-900 transition-colors disabled:opacity-60"
              >
                Reativar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setModalReason(PAUSE_REASONS[0]!); setModalResume(60); setModalCustomMinutes(60); setShowPauseModal(true); }}
              title="Pausar pedidos de emergência"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-orange-50 hover:text-orange-700 border border-transparent hover:border-orange-200"
            >
              <span>⏸</span>
              <span className="hidden sm:inline">Pausar pedidos</span>
            </button>
          )
        )}

        {/* ── Notifications — opens the Help widget's Avisos tab ────────── */}
        <button
          type="button"
          onClick={() => openHelpWidget("avisos")}
          aria-label="Notificações"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-base text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
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

        {/* ── Account: partner restaurant + logged-in user ─────────────── */}
        <div className="mx-1 hidden h-6 w-px bg-[#E5E5E5] sm:block" />
        <div className="flex items-center gap-2.5">
          {/* Partner restaurant brand */}
          {(restaurant.logoUrl || restaurant.name) && (
            <div className="flex items-center gap-2">
              {restaurant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={restaurant.logoUrl}
                  alt={restaurant.name ?? "Restaurante"}
                  className="h-7 w-7 shrink-0 rounded-lg border border-[#E5E5E5] object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E5E5E5] bg-[#FAFAF8] text-[12px] font-bold text-gray-600">
                  {(restaurant.name ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden max-w-[150px] truncate text-[13px] font-bold text-gray-900 lg:block">
                {restaurant.name ?? "Restaurante"}
              </span>
            </div>
          )}
          {/* Logged-in user */}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[12px] font-bold text-white">
              {(session?.user?.name ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="hidden leading-tight lg:block">
              <p className="max-w-[120px] truncate text-[12.5px] font-semibold text-gray-900">{session?.user?.name ?? "—"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{session?.user?.role}</p>
            </div>
          </div>
        </div>

        {/* ── Sign out ─────────────────────────────────────────────────── */}
        <button
          onClick={async () => {
            // Don't let NextAuth build the post-logout redirect: it resolves the
            // callback against the configured base URL, which was sending users to
            // the Railway internal host (…up.railway.app/login → 404). Clear the
            // session, then navigate client-side to a relative path on THIS origin.
            await signOut({ redirect: false });
            window.location.href = "/login";
          }}
          aria-label="Sair"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <span className="hidden sm:inline">Sair</span>
          <span className="text-gray-300">↗</span>
        </button>
      </div>

      {/* ── Emergency pause modal ────────────────────────────────────────── */}
      {showPauseModal && (() => {
        const effectiveMinutes = modalResume === -1 ? modalCustomMinutes : modalResume;
        const reopenAt = effectiveMinutes != null
          ? fmtLocalHM(new Date(Date.now() + effectiveMinutes * 60_000).toISOString())
          : null;
        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
            onClick={(e) => { if (e.target === e.currentTarget) setShowPauseModal(false); }}
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl mx-4">
              <div className="mb-4 flex items-start gap-3">
                <span className="text-2xl">⏸</span>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Pausar pedidos</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Todos os canais (cardápio online, WhatsApp) vão bloquear novos pedidos imediatamente.
                  </p>
                </div>
              </div>

              <label className="mb-1.5 block text-xs font-semibold text-gray-700">Motivo</label>
              <select
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                className="mb-4 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              >
                {PAUSE_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              <label className="mb-1.5 block text-xs font-semibold text-gray-700">Retomar automaticamente</label>
              <select
                value={modalResume ?? ""}
                onChange={(e) => setModalResume(e.target.value === "" ? null : Number(e.target.value))}
                className="mb-3 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              >
                {AUTO_RESUME_OPTIONS.map((o) => (
                  <option key={o.label} value={o.minutes ?? ""}>{o.label}</option>
                ))}
              </select>

              {modalResume === -1 && (
                <div className="mb-3 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={480}
                    value={modalCustomMinutes}
                    onChange={(e) => setModalCustomMinutes(Math.max(1, Math.min(480, Number(e.target.value) || 60)))}
                    className="w-24 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                  />
                  <span className="text-sm text-gray-600">minutos</span>
                </div>
              )}

              {reopenAt !== null ? (
                <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⏰ Reabrirá automaticamente às <strong>{reopenAt}</strong>
                </p>
              ) : (
                <p className="mb-5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  Pausa indefinida — reative manualmente quando quiser.
                </p>
              )}

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
                  className="flex-1 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
                >
                  {pauseLoading ? "Pausando…" : "Pausar agora"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </header>
  );
}
