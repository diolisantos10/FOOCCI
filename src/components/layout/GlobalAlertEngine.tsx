"use client";

/**
 * GlobalAlertEngine — owns the new-order and human-attention alarm SOUNDS.
 * Mounted once in the dashboard shell, so it exists on every screen and rings
 * from ANY of them (Início, Pedidos, Atendimento, CRM, Cardápio…). It follows
 * ONE rule (owner's request, 2026-07-23):
 *
 *   An alarm sounds on the FOREGROUND tab whenever — and only when — its own
 *   real signal is present:
 *     • ORDER sound       → a new order just arrived and nobody has handled it yet
 *       (pendingActionOrderIds: PENDING/CONFIRMED inside its sound window).
 *     • ATENDIMENTO sound → a customer is waiting for a human and no operator has
 *       taken over (pendingHumanRequestIds: status HUMAN, not acked, not stale).
 *   The two are independent: neither, one, or BOTH can ring at the same time.
 *   Nothing else rings — no "tudo com tudo".
 *
 * Why FOREGROUND (document.visibilityState) still gates: the engine runs once per
 * open tab, so if the owner keeps Foocci open in several tabs, only the tab they
 * are actually looking at rings — that is what keeps ONE alarm from playing two or
 * three times at once (the old "apita em várias telas" bleed). It deliberately does
 * NOT gate on WHICH screen you are on: that over-correction (2026-07-14) is exactly
 * what forced the owner to keep the Pedidos tab open to hear anything.
 *
 * Precision lives in the selectors (order-alert / handoff-alert): each signal is
 * bounded to a sound window and honours acknowledgement, so a stale or handled item
 * silences itself. Orders are never lost — the kitchen ticket still prints.
 *
 * Renders nothing. Honors Configurações → Sons e alertas (master + per-alarm
 * toggles), refreshed on mount and live via "foocci:sound-settings-changed".
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AlertLoopController } from "@/lib/alert-loop";
import { playAlertAudio, installGlobalAudioArming, resumeSharedAudioContext } from "@/lib/sound-player";
import { markAudioArmed, refletirTentativaDeAlerta } from "@/lib/audio-gate";
import { startSoundLeaderElection } from "@/lib/sound-leader";
import {
  ORDER_ALERT_ASSET,
  HANDOFF_ALERT_ASSET,
  ORDER_ALERT_DIAG_KEY,
  SOUND_LAST_PLAYED_KEY,
  SOUND_LAST_ERROR_KEY,
  HANDOFF_SOUND_LAST_PLAYED_KEY,
  HANDOFF_SOUND_LAST_ERROR_KEY,
  fetchRestaurantSoundSettings,
} from "@/lib/sound-prefs";
import { pendingActionOrderIds, type AlertOrderLike } from "@/lib/order-alert";
import {
  pendingHumanRequestIds,
  HANDOFF_SOUND_MAX_AGE_MS,
  OVERDUE_SOUND_MAX_WAIT_MINUTES,
  type HandoffConversationLike,
} from "@/lib/handoff-alert";

const ORDER_POLL_MS   = 8_000;
const HUMAN_POLL_MS   = 10_000;
const OVERDUE_POLL_MS = 60_000;

/** Shape of an order row from GET /api/orders (only the fields the alarm needs). */
interface RawOrderRow {
  id: string;
  status: string;
  createdAt: string;
  payment?: { providerName?: string | null; status?: string | null } | null;
}

export function GlobalAlertEngine() {
  const pathname = usePathname();

  const orderAudioRef   = useRef<HTMLAudioElement | null>(null);
  const handoffAudioRef = useRef<HTMLAudioElement | null>(null);

  const soundEnabledRef          = useRef(true);
  const newOrderSoundEnabledRef  = useRef(true);
  const repeatOrderRef           = useRef(true);
  const soundThemeRef            = useRef("DEFAULT");
  const handoffSoundEnabledRef   = useRef(true);
  const repeatHandoffRef         = useRef(true);

  // While AtendimentoClient is mounted in THIS tab it drives the ack-aware ring
  // set directly (via the "foocci:handoff-ring-ids" window event); the engine's
  // own base poll then steps aside.
  const handoffDrivenRef = useRef(false);

  // Whether THIS tab is the foreground tab — the only gate on the sound now
  // (see the rule in the header). Which screen you are on no longer matters.
  const isVisibleRef = useRef(true);

  // Re-evaluate the alarms immediately when the route or visibility changes
  // (assigned inside the setup effect; called from the route/visibility effects).
  const reevalRef = useRef<() => void>(() => {});

  // Re-poll the moment the route changes, so a freshly-opened screen reflects the
  // current alarm state right away instead of waiting for the next poll tick.
  useEffect(() => {
    reevalRef.current();
  }, [pathname]);

  useEffect(() => {
    // ── Settings, once + on every save from Configurações → Sons ─────────────
    const loadSettings = () => {
      void fetchRestaurantSoundSettings().then((s) => {
        if (!s) return;
        soundEnabledRef.current          = s.soundEnabled;
        newOrderSoundEnabledRef.current  = s.newOrderSoundEnabled;
        repeatOrderRef.current           = s.repeatNewOrderSoundUntilAccepted;
        soundThemeRef.current            = s.soundTheme || "DEFAULT";
        handoffSoundEnabledRef.current   = s.humanAttentionSoundEnabled;
        repeatHandoffRef.current         = s.repeatHumanAttentionUntilSeen;
      });
    };
    loadSettings();
    window.addEventListener("foocci:sound-settings-changed", loadSettings);

    // ── Audio elements + arm on the FIRST interaction (click/key/tap) app-wide ─
    const orderAudio = new Audio(ORDER_ALERT_ASSET);
    orderAudio.preload = "auto";
    orderAudioRef.current = orderAudio;
    const handoffAudio = new Audio(HANDOFF_ALERT_ASSET);
    handoffAudio.preload = "auto";
    handoffAudioRef.current = handoffAudio;
    // First natural interaction anywhere in the app (click / key / tap) arms audio;
    // the moment it's armed we re-check so an order already waiting rings at once.
    const disposeArming = installGlobalAudioArming(
      () => [orderAudio, handoffAudio],
      () => reevalRef.current(),
    );

    isVisibleRef.current =
      typeof document === "undefined" ? true : document.visibilityState === "visible";

    // ── Controllers ──────────────────────────────────────────────────────────
    const orderController = new AlertLoopController({
      play: async (vol) => {
        const a = orderAudioRef.current; if (!a) return;
        await playAlertAudio(a, vol);
        markAudioArmed(); // a real alert just played → the autoplay lock is lifted
      },
      getVolume:       () => 100,
      isRepeatEnabled: () => repeatOrderRef.current || soundThemeRef.current === "URGENT",
      assetPath:       ORDER_ALERT_ASSET,
      intervalMs:      10_000,
      maxDurationMs:   0,
      onDiagnostics: (d) => {
        refletirTentativaDeAlerta(d, true);
        try {
          localStorage.setItem(ORDER_ALERT_DIAG_KEY, JSON.stringify({ ...d, updatedAt: new Date().toISOString() }));
          if (d.lastResult === "success" && d.lastAttemptAt) {
            localStorage.setItem(SOUND_LAST_PLAYED_KEY, new Date(d.lastAttemptAt).toISOString());
          } else if (d.lastResult === "error" && d.lastError) {
            localStorage.setItem(SOUND_LAST_ERROR_KEY, `${new Date().toISOString()}: ${d.lastError}`);
          }
        } catch { /* storage unavailable */ }
      },
    });
    const handoffController = new AlertLoopController({
      play: async (vol) => {
        const a = handoffAudioRef.current; if (!a) return;
        await playAlertAudio(a, vol);
        markAudioArmed(); // a real alert just played → the autoplay lock is lifted
      },
      getVolume:       () => 100,
      isRepeatEnabled: () => repeatHandoffRef.current,
      assetPath:       HANDOFF_ALERT_ASSET,
      intervalMs:      9_000,
      maxDurationMs:   0,
      onDiagnostics: (d) => {
        refletirTentativaDeAlerta(d);
        try {
          if (d.lastResult === "success" && d.lastAttemptAt) {
            localStorage.setItem(HANDOFF_SOUND_LAST_PLAYED_KEY, new Date(d.lastAttemptAt).toISOString());
          } else if (d.lastResult === "error" && d.lastError) {
            localStorage.setItem(HANDOFF_SOUND_LAST_ERROR_KEY, `${new Date().toISOString()}: ${d.lastError}`);
          }
        } catch { /* storage unavailable */ }
      },
    });

    // Orders handled this session (Accept/Reject) — accepting moves PENDING→
    // CONFIRMED, still inside the new-order ring-set, so without this memory the
    // alarm would re-ring the order that was just accepted.
    const resolvedOrderIds = new Set<string>();

    // ── The rule, in one place ───────────────────────────────────────────────
    // Ring on ANY screen. Which tab rings is decided by a cross-tab LEADER (Web
    // Locks) instead of "is this tab in the foreground" — so the alarm sounds even
    // when FOOCCI is a BACKGROUND tab (owner working on another site), while still
    // never ringing in two tabs at once. Sem Web Locks → cai no gate de foco antigo.
    const leader = startSoundLeaderElection(() => reevalRef.current());
    const canRing = () => (leader.supported ? leader.isLeader() : isVisibleRef.current);
    const canRingOrder   = canRing;
    const canRingHandoff = canRing;
    const safeOrderSync = (ids: string[]) =>
      orderController.sync(canRingOrder() ? ids.filter((id) => !resolvedOrderIds.has(id)) : []);
    const safeHandoffSync = (ids: string[]) => handoffController.sync(canRingHandoff() ? ids : []);

    // ── ORDER poll — runs on any screen while this tab is in the foreground ──
    const pollOrders = () => {
      if (!canRingOrder() || !soundEnabledRef.current || !newOrderSoundEnabledRef.current) {
        safeOrderSync([]);
        return;
      }
      fetch("/api/orders?limit=50")
        .then((r) => r.json())
        .then((res: { data?: { data?: RawOrderRow[] } }) => {
          const rows = res?.data?.data;
          if (!Array.isArray(rows)) return;
          const mapped: (AlertOrderLike & { id: string })[] = rows.map((o) => ({
            id:                  o.id,
            status:              o.status,
            createdAt:           o.createdAt,
            paymentProviderName: o.payment?.providerName ?? null,
            paymentStatus:       o.payment?.status ?? null,
          }));
          safeOrderSync(pendingActionOrderIds(mapped));
        })
        .catch(() => { /* keep last state; next poll retries */ });
    };

    // ── HANDOFF poll — runs on any screen while this tab is in the foreground ─
    let overdueIds: string[] = [];
    const pollHuman = () => {
      if (!canRingHandoff()) { safeHandoffSync([]); return; }
      if (handoffDrivenRef.current) return; // AtendimentoClient (this tab) drives directly
      if (!soundEnabledRef.current || !handoffSoundEnabledRef.current) { safeHandoffSync([]); return; }
      fetch("/api/chat/conversations?status=HUMAN&limit=50")
        .then((r) => r.json())
        .then((json: { data?: { data?: HandoffConversationLike[] } | HandoffConversationLike[] }) => {
          if (handoffDrivenRef.current) return;
          const raw = json?.data;
          const rows: HandoffConversationLike[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          const pending = pendingHumanRequestIds(rows, { maxAgeMs: HANDOFF_SOUND_MAX_AGE_MS });
          safeHandoffSync([...new Set([...pending, ...overdueIds])]);
        })
        .catch(() => { /* keep last state; next poll retries */ });
    };
    const pollOverdue = () => {
      if (!canRingHandoff() || handoffDrivenRef.current) return;
      fetch("/api/atendimento/handoff/check-timeouts", { method: "POST" })
        .then((r) => r.json())
        .then((d: { data?: { overdue?: { id: string; waitingMinutes?: number }[] } }) => {
          overdueIds = (d?.data?.overdue ?? [])
            .filter((o) => (o.waitingMinutes ?? 0) <= OVERDUE_SOUND_MAX_WAIT_MINUTES)
            .map((o) => o.id);
        })
        .catch(() => {});
    };

    const reeval = () => { pollOrders(); pollHuman(); pollOverdue(); };
    reevalRef.current = reeval;

    reeval();
    const orderTimer   = setInterval(pollOrders, ORDER_POLL_MS);
    const humanTimer   = setInterval(pollHuman, HUMAN_POLL_MS);
    const overdueTimer = setInterval(pollOverdue, OVERDUE_POLL_MS);

    // ── Visibility: foreground/background of THIS tab ────────────────────────
    const onVisibility = () => {
      isVisibleRef.current = typeof document === "undefined" ? true : document.visibilityState === "visible";
      // A backgrounded tab gets its AudioContext suspended; wake it the moment we
      // return so the next alert isn't silently swallowed by a dormant context.
      if (isVisibleRef.current) void resumeSharedAudioContext();
      reeval(); // start/stop the relevant sound the instant you focus/leave the tab
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);

    // ── Same-tab bridge with AtendimentoClient / OrdersClient (window events) ─
    const onAttach = () => { handoffDrivenRef.current = true; };
    const onDetach = () => { handoffDrivenRef.current = false; pollHuman(); pollOverdue(); };
    const onRingIds = (e: Event) => {
      const ids = (e as CustomEvent<{ ids: string[] }>).detail?.ids ?? [];
      safeHandoffSync(ids);
    };
    const onHandoffResolved = (e: Event) => {
      const { id, reason } = (e as CustomEvent<{ id: string; reason: string }>).detail ?? {};
      if (id) handoffController.resolve(id, reason ?? "RESOLVED");
    };
    const onOrderResolved = (e: Event) => {
      const { id, reason } = (e as CustomEvent<{ id: string; reason: string }>).detail ?? {};
      if (id) { resolvedOrderIds.add(id); orderController.resolve(id, reason ?? "RESOLVED"); }
    };
    window.addEventListener("foocci:handoff-attach", onAttach);
    window.addEventListener("foocci:handoff-detach", onDetach);
    window.addEventListener("foocci:handoff-ring-ids", onRingIds);
    window.addEventListener("foocci:handoff-resolved", onHandoffResolved);
    window.addEventListener("foocci:order-resolved", onOrderResolved);

    return () => {
      clearInterval(orderTimer);
      clearInterval(humanTimer);
      clearInterval(overdueTimer);
      window.removeEventListener("foocci:sound-settings-changed", loadSettings);
      window.removeEventListener("foocci:handoff-attach", onAttach);
      window.removeEventListener("foocci:handoff-detach", onDetach);
      window.removeEventListener("foocci:handoff-ring-ids", onRingIds);
      window.removeEventListener("foocci:handoff-resolved", onHandoffResolved);
      window.removeEventListener("foocci:order-resolved", onOrderResolved);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      disposeArming();
      leader.dispose();
      reevalRef.current = () => {};
      orderController.dispose();
      handoffController.dispose();
      orderAudio.pause(); orderAudio.src = "";
      handoffAudio.pause(); handoffAudio.src = "";
    };
  }, []);

  // Renders nothing — the engine is sound-only.
  return null;
}
