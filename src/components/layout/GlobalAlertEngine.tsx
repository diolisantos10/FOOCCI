"use client";

/**
 * GlobalAlertEngine — the ONE place that owns the new-order and human-attention
 * alarm sounds. Mounted once in the dashboard shell layout, so it plays no
 * matter which screen (Pedidos, Atendimento, Dashboard, CRM, Configurações, …)
 * is on screen — the alarm no longer depends on a specific page being open.
 *
 * WHY THIS EXISTS: before this component, both alarms were owned by the page
 * that displays the data (OrdersClient / AtendimentoClient) — the Audio element
 * and AlertLoopController were created in a useEffect scoped to that page and
 * torn down (`controller.dispose()`) the moment the operator navigated away.
 * A restaurant that isn't sitting on the exact right tab all day never heard
 * the alarm. This component polls independently so a new PENDING order or an
 * unassumed HUMAN conversation rings from anywhere in the app.
 *
 * Renders nothing. Two independent alarms:
 *   - ORDER  — polls PENDING orders every 8s. Simple, stateless: an order rings
 *     iff it is currently PENDING (and not a Pix/online payment still awaiting
 *     confirmation) — no "first seen" bookkeeping, so a container restart or a
 *     fresh page load immediately (correctly) rings for any order already
 *     waiting, rather than staying silent about it.
 *   - HANDOFF — polls the BASE case (unassumed HUMAN conversations) + the
 *     overdue-escalation endpoint every 10s/60s. While AtendimentoClient is
 *     mounted, it hands over full control (including its "Estou ciente" /
 *     "Silenciar atrasados" acknowledgements) via a tiny attach/detach event
 *     bridge — see foocci:handoff-attach/detach/ring-ids below — so existing
 *     Atendimento behavior is preserved byte-for-byte while that page is open,
 *     and the background poll resumes the instant it's closed.
 *
 * Both engines honor the SAME DB-backed settings (Configurações → Sons e
 * alertas) as before, refreshed on mount and live via the
 * "foocci:sound-settings-changed" event the settings page dispatches on save.
 */

import { useEffect, useRef } from "react";
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
import { pendingHumanRequestIds, type HandoffConversationLike } from "@/lib/handoff-alert";

const ORDER_POLL_MS  = 8_000;
const HUMAN_POLL_MS  = 10_000;
const OVERDUE_POLL_MS = 60_000; // matches the existing Atendimento cadence

export function GlobalAlertEngine() {
  const orderAudioRef   = useRef<HTMLAudioElement | null>(null);
  const handoffAudioRef = useRef<HTMLAudioElement | null>(null);

  const soundEnabledRef          = useRef(true);
  const newOrderSoundEnabledRef  = useRef(true);
  const repeatOrderRef           = useRef(true);
  const soundThemeRef            = useRef("DEFAULT");
  const handoffSoundEnabledRef   = useRef(true);
  const repeatHandoffRef         = useRef(true);

  // Attach/detach bridge: while AtendimentoClient is mounted, it drives the
  // handoff ring-set directly (preserving its ack/overdue nuance exactly);
  // otherwise this engine's own base-case poll drives it.
  const handoffDrivenRef = useRef(false);

  useEffect(() => {
    // ── Load settings, once + on every save from Configurações → Sons ────────
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

    // ── ORDER alarm controller ────────────────────────────────────────────────
    const orderController = new AlertLoopController({
      play: async (vol) => {
        const a = orderAudioRef.current;
        if (!a) return;
        await playAlertAudio(a, vol);
      },
      getVolume:       () => 100, // volume travado em 100%
      isRepeatEnabled: () => repeatOrderRef.current || soundThemeRef.current === "URGENT",
      assetPath:       ORDER_ALERT_ASSET,
      intervalMs:      10_000,
      maxDurationMs:   0, // rings until accepted/rejected or the sound is turned off
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

    // ── HANDOFF alarm controller ──────────────────────────────────────────────
    const handoffController = new AlertLoopController({
      play: async (vol) => {
        const a = handoffAudioRef.current;
        if (!a) return;
        await playAlertAudio(a, vol);
      },
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

    // ── ORDER poll — independent, stateless (see header doc) ─────────────────
    let orderTimer: ReturnType<typeof setInterval> | null = null;
    const pollOrders = () => {
      if (!soundEnabledRef.current || !newOrderSoundEnabledRef.current) {
        orderController.sync([]);
        return;
      }
      fetch("/api/orders?status=PENDING&limit=50")
        .then((r) => r.json())
        .then((res: { success?: boolean; data?: { data?: (AlertOrderLike & { id: string })[] } }) => {
          const rows = res?.data?.data;
          if (!Array.isArray(rows)) return;
          orderController.sync(pendingActionOrderIds(rows));
        })
        .catch(() => { /* keep ringing on last known state; next poll retries */ });
    };
    pollOrders();
    orderTimer = setInterval(pollOrders, ORDER_POLL_MS);

    // ── HANDOFF poll — base case + overdue escalation, skipped while driven ──
    let humanTimer: ReturnType<typeof setInterval> | null = null;
    let overdueIds: string[] = [];
    const pollHuman = () => {
      if (handoffDrivenRef.current) return; // AtendimentoClient is driving directly
      if (!handoffSoundEnabledRef.current) {
        handoffController.sync([]);
        return;
      }
      fetch("/api/chat/conversations?status=HUMAN&limit=50")
        .then((r) => r.json())
        .then((json: { data?: { data?: HandoffConversationLike[] } | HandoffConversationLike[] }) => {
          if (handoffDrivenRef.current) return; // a race with attach — defer to the page
          const raw = json?.data;
          const rows: HandoffConversationLike[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          const pending = pendingHumanRequestIds(rows);
          handoffController.sync([...new Set([...pending, ...overdueIds])]);
        })
        .catch(() => { /* keep ringing on last known state; next poll retries */ });
    };
    let overdueTimer: ReturnType<typeof setInterval> | null = null;
    const pollOverdue = () => {
      if (handoffDrivenRef.current) return;
      fetch("/api/atendimento/handoff/check-timeouts", { method: "POST" })
        .then((r) => r.json())
        .then((d: { data?: { overdue?: { id: string }[] } }) => {
          overdueIds = (d?.data?.overdue ?? []).map((o) => o.id);
        })
        .catch(() => {});
    };
    pollHuman();
    pollOverdue();
    humanTimer = setInterval(pollHuman, HUMAN_POLL_MS);
    overdueTimer = setInterval(pollOverdue, OVERDUE_POLL_MS);

    // ── Attach/detach bridge with AtendimentoClient (see header doc) ─────────
    const onAttach = () => { handoffDrivenRef.current = true; };
    const onDetach = () => { handoffDrivenRef.current = false; pollHuman(); pollOverdue(); };
    const onRingIds = (e: Event) => {
      const ids = (e as CustomEvent<{ ids: string[] }>).detail?.ids ?? [];
      handoffController.sync(ids);
    };
    const onHandoffResolved = (e: Event) => {
      const { id, reason } = (e as CustomEvent<{ id: string; reason: string }>).detail ?? {};
      if (id) handoffController.resolve(id, reason ?? "RESOLVED");
    };
    const onOrderResolved = (e: Event) => {
      const { id, reason } = (e as CustomEvent<{ id: string; reason: string }>).detail ?? {};
      if (id) orderController.resolve(id, reason ?? "RESOLVED");
    };
    window.addEventListener("foocci:handoff-attach", onAttach);
    window.addEventListener("foocci:handoff-detach", onDetach);
    window.addEventListener("foocci:handoff-ring-ids", onRingIds);
    window.addEventListener("foocci:handoff-resolved", onHandoffResolved);
    window.addEventListener("foocci:order-resolved", onOrderResolved);

    return () => {
      if (orderTimer) clearInterval(orderTimer);
      if (humanTimer) clearInterval(humanTimer);
      if (overdueTimer) clearInterval(overdueTimer);
      window.removeEventListener("foocci:sound-settings-changed", loadSettings);
      window.removeEventListener("foocci:handoff-attach", onAttach);
      window.removeEventListener("foocci:handoff-detach", onDetach);
      window.removeEventListener("foocci:handoff-ring-ids", onRingIds);
      window.removeEventListener("foocci:handoff-resolved", onHandoffResolved);
      window.removeEventListener("foocci:order-resolved", onOrderResolved);
      orderController.dispose();
      handoffController.dispose();
      orderAudio.pause(); orderAudio.src = "";
      handoffAudio.pause(); handoffAudio.src = "";
    };
  }, []);

  return null;
}
