"use client";

/**
 * GlobalAlertEngine — owns the new-order and human-attention alarm SOUNDS.
 * Mounted once in the dashboard shell, so it exists on every screen, but it
 * follows ONE simple rule (owner's request, 2026-07-14):
 *
 *   Each alarm only sounds on the tab that is BOTH visible/foreground AND showing
 *   that alarm's own screen.
 *     • ORDER sound  → only while you are looking at Pedidos (/orders).
 *     • ATENDIMENTO sound (customer needs a human) → only while you are looking at
 *       the Central de Conversas (/atendimento).
 *
 * Why "visible" matters: sound reaches your ears no matter which tab plays it, so
 * the ONLY way to stop an alarm bleeding onto a screen where it does not belong is
 * to play it exclusively while its own screen is the one in front. On any other
 * screen (Início, CRM, Cardápio…), or when the browser is in the background, both
 * alarms stay silent. Orders are never lost — the kitchen ticket still prints.
 *
 * This deliberately drops the old app-wide "ring everywhere / elect one leader"
 * machinery (tab locks, cross-tab messaging, device lease): that is exactly what
 * made the same sound bleed onto two or three unrelated screens.
 *
 * Renders nothing. Honors Configurações → Sons e alertas (master + per-alarm
 * toggles), refreshed on mount and live via "foocci:sound-settings-changed".
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AlertLoopController } from "@/lib/alert-loop";
import { playAlertAudio, installSilentUnlock } from "@/lib/sound-player";
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

/** Each alarm's home screen (route prefix). */
const ORDERS_SCREEN      = "/orders";
const ATENDIMENTO_SCREEN = "/atendimento";

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

  // Which screen this tab is on + whether it's the foreground tab. Both gate the
  // sound (see the rule in the header).
  const isVisibleRef        = useRef(true);
  const isOrdersScreenRef   = useRef(false);
  const isAtendimentoScreenRef = useRef(false);

  // Re-evaluate the alarms immediately when the route or visibility changes
  // (assigned inside the setup effect; called from the route/visibility effects).
  const reevalRef = useRef<() => void>(() => {});

  // Keep the screen flags current and re-evaluate the moment the route changes,
  // so switching INTO Pedidos starts the order sound and switching OUT stops it
  // without waiting for the next poll tick.
  useEffect(() => {
    isOrdersScreenRef.current      = !!pathname && pathname.startsWith(ORDERS_SCREEN);
    isAtendimentoScreenRef.current = !!pathname && pathname.startsWith(ATENDIMENTO_SCREEN);
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

    // ── Audio elements + silent-unlock on the FIRST click anywhere in the app ─
    const orderAudio = new Audio(ORDER_ALERT_ASSET);
    orderAudio.preload = "auto";
    orderAudioRef.current = orderAudio;
    const handoffAudio = new Audio(HANDOFF_ALERT_ASSET);
    handoffAudio.preload = "auto";
    handoffAudioRef.current = handoffAudio;
    installSilentUnlock(() => [orderAudio, handoffAudio]);

    isVisibleRef.current =
      typeof document === "undefined" ? true : document.visibilityState === "visible";

    // ── Controllers ──────────────────────────────────────────────────────────
    const orderController = new AlertLoopController({
      play: async (vol) => { const a = orderAudioRef.current; if (a) await playAlertAudio(a, vol); },
      getVolume:       () => 100,
      isRepeatEnabled: () => repeatOrderRef.current || soundThemeRef.current === "URGENT",
      assetPath:       ORDER_ALERT_ASSET,
      intervalMs:      10_000,
      maxDurationMs:   0,
      onDiagnostics: (d) => {
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
      play: async (vol) => { const a = handoffAudioRef.current; if (a) await playAlertAudio(a, vol); },
      getVolume:       () => 100,
      isRepeatEnabled: () => repeatHandoffRef.current,
      assetPath:       HANDOFF_ALERT_ASSET,
      intervalMs:      9_000,
      maxDurationMs:   0,
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

    // Orders handled this session (Accept/Reject) — accepting moves PENDING→
    // CONFIRMED, still inside the new-order ring-set, so without this memory the
    // alarm would re-ring the order that was just accepted.
    const resolvedOrderIds = new Set<string>();

    // ── The two rules, in one place ──────────────────────────────────────────
    const canRingOrder   = () => isVisibleRef.current && isOrdersScreenRef.current;
    const canRingHandoff = () => isVisibleRef.current && isAtendimentoScreenRef.current;
    const safeOrderSync = (ids: string[]) =>
      orderController.sync(canRingOrder() ? ids.filter((id) => !resolvedOrderIds.has(id)) : []);
    const safeHandoffSync = (ids: string[]) => handoffController.sync(canRingHandoff() ? ids : []);

    // ── ORDER poll — only while you are looking at Pedidos ───────────────────
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

    // ── HANDOFF poll — only while you are looking at Central de Conversas ────
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
