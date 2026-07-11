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
 * SINGLE-LEADER ACROSS TABS: a restaurant commonly has SEVERAL Foocci tabs open
 * at once (Pedidos, Atendimento, CRM, Início, …). Since this component mounts
 * fresh in every one of them, without coordination EVERY open tab would poll
 * and ring independently — a cacophony that sounds like "the alarm is playing
 * on screens that aren't even in use". The Web Locks API elects exactly ONE
 * open tab as the audio leader (whichever tab currently holds the named lock);
 * only that tab ever calls audio.play(). The lock is released automatically
 * the instant its tab closes/crashes (no manual heartbeat/timeout needed), so
 * leadership fails over to another open tab immediately. Browsers without the
 * Locks API (very old) fail OPEN — that single tab treats itself as leader
 * rather than silencing the alarm entirely.
 *
 * CROSS-TAB HANDOFF ACCURACY: the handoff alarm's ack-aware ring-set ("Estou
 * ciente" / "Silenciar atrasados") is only known to the tab that has
 * AtendimentoClient mounted — but that might NOT be the leader tab. A
 * BroadcastChannel relays the same attach/detach/ring-ids/resolved signals to
 * every other open tab, so whichever tab is currently leader always rings (or
 * stays silent) using the accurate, ack-aware set, regardless of which tab
 * Atendimento happens to be open in.
 *
 * SINGLE-LEADER ACROSS DEVICES: Web Locks only coordinates tabs within ONE
 * browser — a restaurant with Foocci open on SEVERAL separate devices at once
 * (counter computer, kitchen tablet, owner's phone) still had every device's
 * own local leader ringing independently ("plays everywhere, uncontrollably" —
 * reported 2026-07-11). A second layer fixes this: the local tab leader
 * heartbeats a server-side lease (POST /api/settings/sounds/claim-leader,
 * AlarmLeaderService) keyed by a per-browser deviceId persisted in
 * localStorage. Only when this device holds BOTH the local Web Lock AND the
 * fresh server lease does it actually ring — see `isLeader()` below. A lease
 * with no heartbeat for ALARM_LEASE_STALE_MS is reclaimed by the next
 * device's heartbeat automatically, so a closed/crashed/offline device's
 * lease fails over within one heartbeat cycle — no manual takeover needed.
 *
 * Renders nothing. Two independent alarms:
 *   - ORDER  — polls PENDING orders every 8s. Simple, stateless: an order rings
 *     iff it is currently PENDING (and not a Pix/online payment still awaiting
 *     confirmation) — no "first seen" bookkeeping, so a container restart or a
 *     fresh page load immediately (correctly) rings for any order already
 *     waiting, rather than staying silent about it.
 *   - HANDOFF — polls the BASE case (unassumed HUMAN conversations) + the
 *     overdue-escalation endpoint every 10s/60s. While AtendimentoClient is
 *     mounted (in ANY tab), it hands over full control (including its "Estou
 *     ciente" / "Silenciar atrasados" acknowledgements) via the attach/detach
 *     bridge, so existing Atendimento behavior is preserved byte-for-byte, and
 *     the background poll resumes the instant it's closed everywhere.
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

const ORDER_POLL_MS   = 8_000;
const HUMAN_POLL_MS   = 10_000;
const OVERDUE_POLL_MS = 60_000; // matches the existing Atendimento cadence

const ALARM_LOCK_NAME    = "foocci-alarm-leader";
const BRIDGE_CHANNEL_NAME = "foocci-alarm-bridge";

// ── Cross-DEVICE lease (not just cross-tab) ─────────────────────────────────
// Web Locks above only elects a leader WITHIN one browser — a restaurant with
// Foocci open on several separate devices (counter computer, kitchen tablet,
// owner's phone) still had every device's own local leader ringing at once.
// This heartbeats a server-side lease (see AlarmLeaderService) so exactly one
// DEVICE, across all of them, is ever allowed to actually play the alarm.
// Mirrors AlarmLeaderService's ALARM_LEASE_HEARTBEAT_MS — kept as a plain
// constant here (not imported) because that service pulls in the Prisma
// client, which must never enter the browser bundle.
const SERVER_LEASE_HEARTBEAT_MS = 6_000;
const DEVICE_ID_KEY = "foocci-device-id";

/** Stable per-BROWSER id, persisted in localStorage so every tab of the same
 *  browser reports the same device — created once via crypto.randomUUID(). */
function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    return `ephemeral-${Math.random().toString(36).slice(2)}`;
  }
}

type BridgeMessage =
  | { type: "attach" }
  | { type: "detach" }
  | { type: "ring-ids"; ids: string[] }
  | { type: "handoff-resolved"; id: string; reason: string }
  | { type: "order-resolved"; id: string; reason: string };

export function GlobalAlertEngine() {
  const orderAudioRef   = useRef<HTMLAudioElement | null>(null);
  const handoffAudioRef = useRef<HTMLAudioElement | null>(null);

  const soundEnabledRef          = useRef(true);
  const newOrderSoundEnabledRef  = useRef(true);
  const repeatOrderRef           = useRef(true);
  const soundThemeRef            = useRef("DEFAULT");
  const handoffSoundEnabledRef   = useRef(true);
  const repeatHandoffRef         = useRef(true);

  // Attach/detach bridge: while AtendimentoClient is mounted (this tab or any
  // other, via BroadcastChannel), it drives the handoff ring-set directly
  // (preserving its ack/overdue nuance exactly); otherwise this engine's own
  // base-case poll drives it.
  const handoffDrivenRef = useRef(false);

  // Only the tab holding the Web Lock actually plays audio — see header doc.
  const isLeaderRef = useRef(false);
  // Only the DEVICE holding the server-side lease actually plays audio (in
  // addition to being the local tab leader above) — see header doc.
  const isServerLeaderRef = useRef(false);

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

    // ── Single-leader election across tabs (Web Locks API — see header doc) ──
    let releaseLeaderLock: () => void = () => {};
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav && "locks" in nav) {
      nav.locks
        .request(ALARM_LOCK_NAME, { mode: "exclusive" }, () =>
          new Promise<void>((resolve) => {
            isLeaderRef.current = true;
            releaseLeaderLock = resolve;
          }),
        )
        .catch(() => { /* lock request aborted (fast unmount) — harmless */ });
    } else {
      isLeaderRef.current = true; // no Locks API — fail open rather than silence everyone
    }

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

    // Only the tab that is BOTH the local (Web Lock) leader AND the current
    // server-lease holder ever receives non-empty ids, so play() can never
    // fire from a non-leader tab OR a non-leader device — see header doc.
    const isLeader = () => isLeaderRef.current && isServerLeaderRef.current;
    const safeOrderSync   = (ids: string[]) => orderController.sync(isLeader() ? ids : []);
    const safeHandoffSync = (ids: string[]) => handoffController.sync(isLeader() ? ids : []);

    // ── Cross-device lease heartbeat — only the local tab leader attempts it ──
    const deviceId = getOrCreateDeviceId();
    const heartbeatLease = () => {
      if (!isLeaderRef.current) { isServerLeaderRef.current = false; return; }
      fetch("/api/settings/sounds/claim-leader", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ deviceId }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((json: { data?: { isLeader?: boolean } } | null) => {
          isServerLeaderRef.current = json?.data?.isLeader === true;
        })
        .catch(() => { isServerLeaderRef.current = false; }); // fail toward silence, not toward every device ringing
    };
    heartbeatLease();
    const leaseTimer = setInterval(heartbeatLease, SERVER_LEASE_HEARTBEAT_MS);

    // ── ORDER poll — independent, stateless (see header doc) ─────────────────
    const pollOrders = () => {
      if (!isLeaderRef.current) return; // non-leader tabs stay fully dormant
      if (!soundEnabledRef.current || !newOrderSoundEnabledRef.current) {
        safeOrderSync([]);
        return;
      }
      fetch("/api/orders?status=PENDING&limit=50")
        .then((r) => r.json())
        .then((res: { success?: boolean; data?: { data?: (AlertOrderLike & { id: string })[] } }) => {
          const rows = res?.data?.data;
          if (!Array.isArray(rows)) return;
          safeOrderSync(pendingActionOrderIds(rows));
        })
        .catch(() => { /* keep ringing on last known state; next poll retries */ });
    };
    pollOrders();
    const orderTimer = setInterval(pollOrders, ORDER_POLL_MS);

    // ── HANDOFF poll — base case + overdue escalation, skipped while driven ──
    let overdueIds: string[] = [];
    const pollHuman = () => {
      if (!isLeaderRef.current) return; // non-leader tabs stay fully dormant
      if (handoffDrivenRef.current) return; // Atendimento (this tab or another) is driving directly
      if (!handoffSoundEnabledRef.current) {
        safeHandoffSync([]);
        return;
      }
      fetch("/api/chat/conversations?status=HUMAN&limit=50")
        .then((r) => r.json())
        .then((json: { data?: { data?: HandoffConversationLike[] } | HandoffConversationLike[] }) => {
          if (handoffDrivenRef.current) return; // a race with attach — defer to the page
          const raw = json?.data;
          const rows: HandoffConversationLike[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          const pending = pendingHumanRequestIds(rows);
          safeHandoffSync([...new Set([...pending, ...overdueIds])]);
        })
        .catch(() => { /* keep ringing on last known state; next poll retries */ });
    };
    const pollOverdue = () => {
      if (!isLeaderRef.current || handoffDrivenRef.current) return;
      fetch("/api/atendimento/handoff/check-timeouts", { method: "POST" })
        .then((r) => r.json())
        .then((d: { data?: { overdue?: { id: string }[] } }) => {
          overdueIds = (d?.data?.overdue ?? []).map((o) => o.id);
        })
        .catch(() => {});
    };
    pollHuman();
    pollOverdue();
    const humanTimer   = setInterval(pollHuman, HUMAN_POLL_MS);
    const overdueTimer = setInterval(pollOverdue, OVERDUE_POLL_MS);

    // ── Cross-tab bridge (BroadcastChannel) ───────────────────────────────────
    // Relays this tab's LOCAL attach/detach/ring-ids/resolved signals (below) to
    // every other open tab, so the (possibly different) leader tab always has
    // the accurate ring-set regardless of which tab Atendimento/Pedidos is open in.
    const bridge = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(BRIDGE_CHANNEL_NAME) : null;
    bridge?.addEventListener("message", (ev: MessageEvent<BridgeMessage>) => {
      const msg = ev.data;
      if (!msg || typeof msg !== "object") return;
      switch (msg.type) {
        case "attach":  handoffDrivenRef.current = true; break;
        case "detach":  handoffDrivenRef.current = false; pollHuman(); pollOverdue(); break;
        case "ring-ids": safeHandoffSync(msg.ids ?? []); break;
        case "handoff-resolved": if (msg.id) handoffController.resolve(msg.id, msg.reason ?? "RESOLVED"); break;
        case "order-resolved":   if (msg.id) orderController.resolve(msg.id, msg.reason ?? "RESOLVED"); break;
      }
    });

    // ── Attach/detach bridge with AtendimentoClient/OrdersClient (LOCAL tab) ──
    // Each local handler updates this tab's state AND relays to other tabs.
    const onAttach = () => { handoffDrivenRef.current = true; bridge?.postMessage({ type: "attach" }); };
    const onDetach = () => {
      handoffDrivenRef.current = false;
      pollHuman(); pollOverdue();
      bridge?.postMessage({ type: "detach" });
    };
    const onRingIds = (e: Event) => {
      const ids = (e as CustomEvent<{ ids: string[] }>).detail?.ids ?? [];
      safeHandoffSync(ids);
      bridge?.postMessage({ type: "ring-ids", ids });
    };
    const onHandoffResolved = (e: Event) => {
      const { id, reason } = (e as CustomEvent<{ id: string; reason: string }>).detail ?? {};
      if (id) handoffController.resolve(id, reason ?? "RESOLVED");
      if (id) bridge?.postMessage({ type: "handoff-resolved", id, reason: reason ?? "RESOLVED" });
    };
    const onOrderResolved = (e: Event) => {
      const { id, reason } = (e as CustomEvent<{ id: string; reason: string }>).detail ?? {};
      if (id) orderController.resolve(id, reason ?? "RESOLVED");
      if (id) bridge?.postMessage({ type: "order-resolved", id, reason: reason ?? "RESOLVED" });
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
      clearInterval(leaseTimer);
      window.removeEventListener("foocci:sound-settings-changed", loadSettings);
      window.removeEventListener("foocci:handoff-attach", onAttach);
      window.removeEventListener("foocci:handoff-detach", onDetach);
      window.removeEventListener("foocci:handoff-ring-ids", onRingIds);
      window.removeEventListener("foocci:handoff-resolved", onHandoffResolved);
      window.removeEventListener("foocci:order-resolved", onOrderResolved);
      bridge?.close();
      releaseLeaderLock();
      // Best-effort graceful release of the server lease (clean tab close —
      // e.g. navigating away from the dashboard). keepalive lets the request
      // survive page unload. Harmless if this tab wasn't the leader: the
      // server only clears the lease when `deviceId` is still its holder. The
      // 15s staleness window covers the crash/network-loss case regardless.
      if (isServerLeaderRef.current) {
        fetch("/api/settings/sounds/claim-leader", {
          method:    "DELETE",
          headers:   { "Content-Type": "application/json" },
          body:      JSON.stringify({ deviceId }),
          keepalive: true,
        }).catch(() => undefined);
      }
      orderController.dispose();
      handoffController.dispose();
      orderAudio.pause(); orderAudio.src = "";
      handoffAudio.pause(); handoffAudio.src = "";
    };
  }, []);

  return null;
}
