"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";
import { useSidebar } from "./SidebarContext";
import { SoundStatusChip } from "./SoundStatusChip";
import { AssistantPill } from "@/components/help/AssistantPill";

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
  // UMA barra só (decisão do CEO, 04/08): título da página à esquerda, a pílula
  // do Assistente no meio e os ícones de conta à direita. O assistente NÃO tem
  // faixa própria — duas réguas empilhadas foi exatamente o que ele reprovou.
  // A altura (h-14) é publicada em `--topbar`, que as telas de altura fixa
  // descontam. Medida que uma tela precisa saber de outra vira token.
  return (
    // `sticky`: a faixa antiga do assistente vivia FORA do `main` e nunca sumia.
    // Agora que ele mora aqui dentro, o cabeçalho precisa grudar no topo — senão
    // o assistente rolava para fora da tela em toda página comprida.
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line2 bg-paper px-3 sm:px-4 lg:px-6 print:hidden">
      {/* Left: hamburger (mobile) + brand / page breadcrumb + sound control */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
        {/* Hamburger — mobile only */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Abrir menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[#F4F4F2] hover:text-ink lg:hidden"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Anagrama some no celular: ali a marca já está no menu, e o espaço é do
            título + da pílula do assistente. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/foocci/foocci-anagram.png" alt="Foocci" className="hidden h-7 w-7 shrink-0 rounded-lg sm:block lg:hidden" />
        {/* O título da página é o texto mais forte da barra. Antes ele era o mais
            fraco (`text-muted`) e o nome do restaurante o mais forte — hierarquia
            invertida. */}
        {title && (
          <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{title}</span>
        )}
        {/* Sound control lives right here in the white bar on every tab (owner's
            request, 2026-07-30) — not a floating balloon over the account cluster. */}
        <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-line2 sm:block" />
        {/* Fica no celular também: é aqui que o lojista arma o som dos pedidos. */}
        <SoundStatusChip />
      </div>

      {/* Center: o Assistente — pílula compacta dentro DESTA barra */}
      <AssistantPill />

      {/* Right: pause + account + sign out */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">

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
              aria-label="Pausar pedidos de emergência"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 sm:px-2.5"
            >
              {/* O emoji ⏸ virava um risquinho cinza de 4px quando o rótulo
                  sumia — controle de emergência não pode parecer sujeira. */}
              <svg className="h-[15px] w-[15px] shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <rect x="4" y="3" width="3" height="10" rx="1.2" />
                <rect x="9" y="3" width="3" height="10" rx="1.2" />
              </svg>
              <span className="hidden 2xl:inline">Pausar pedidos</span>
            </button>
          )
        )}

        {/* ── Account: partner restaurant + logged-in user ─────────────── */}
        <div className="mx-1 hidden h-6 w-px shrink-0 bg-line2 sm:block" />
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {/* Partner restaurant brand */}
          {(restaurant.logoUrl || restaurant.name) && (
            <div className="flex items-center gap-2">
              {restaurant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={restaurant.logoUrl}
                  alt={restaurant.name ?? "Restaurante"}
                  className="h-7 w-7 shrink-0 rounded-lg border border-line2 object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line2 bg-[#FAFAF8] text-[12px] font-semibold text-ink2">
                  {(restaurant.name ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden min-w-0 max-w-[150px] truncate text-[13px] text-ink2 xl:block">
                {restaurant.name ?? "Restaurante"}
              </span>
            </div>
          )}
          {/* Logged-in user — abaixo de 2xl fica só a inicial, com o nome no
              title: a pílula do assistente precisa do meio da barra, e nome +
              cargo por extenso comiam 130px que ninguém lê duas vezes por dia. */}
          <div className="flex items-center gap-2">
            <div
              title={`${session?.user?.name ?? "—"}${session?.user?.role ? ` · ${session.user.role}` : ""}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-paper"
            >
              {(session?.user?.name ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="hidden min-w-0 leading-tight 2xl:block">
              <p className="max-w-[120px] truncate text-[12.5px] font-semibold text-ink">{session?.user?.name ?? "—"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{session?.user?.role}</p>
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
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-[#F4F4F2] hover:text-ink sm:px-2.5"
        >
          <span className="hidden 2xl:inline">Sair</span>
          <span aria-hidden>↗</span>
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
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45"
            onClick={(e) => { if (e.target === e.currentTarget) setShowPauseModal(false); }}
          >
            <div className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-2xl mx-4">
              <div className="mb-4 flex items-start gap-3">
                <span className="text-2xl">⏸</span>
                <div>
                  <h2 className="text-base font-semibold text-ink">Pausar pedidos</h2>
                  <p className="text-xs text-muted mt-0.5">
                    Todos os canais (cardápio online, WhatsApp) vão bloquear novos pedidos imediatamente.
                  </p>
                </div>
              </div>

              <label className="mb-1.5 block text-xs font-semibold text-ink2">Motivo</label>
              <select
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                className="mb-4 w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {PAUSE_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              <label className="mb-1.5 block text-xs font-semibold text-ink2">Retomar automaticamente</label>
              <select
                value={modalResume ?? ""}
                onChange={(e) => setModalResume(e.target.value === "" ? null : Number(e.target.value))}
                className="mb-3 w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
                    className="w-24 rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                  <span className="text-sm text-ink2">minutos</span>
                </div>
              )}

              {reopenAt !== null ? (
                <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⏰ Reabrirá automaticamente às <strong>{reopenAt}</strong>
                </p>
              ) : (
                <p className="mb-5 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-muted">
                  Pausa indefinida — reative manualmente quando quiser.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPauseModal(false)}
                  className="flex-1 rounded-xl border border-line2 px-4 py-2 text-sm font-semibold text-ink2 transition-colors hover:bg-canvas"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleActivatePause}
                  disabled={pauseLoading}
                  className="flex-1 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-amber-600 disabled:opacity-60"
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
