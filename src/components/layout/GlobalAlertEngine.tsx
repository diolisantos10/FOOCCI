"use client";

/**
 * GlobalAlertEngine — the ONE place that owns the new-order and human-attention
 * alarm sounds. Mounted once in the dashboard shell layout, so it rings no matter
 * which screen (Pedidos, Atendimento, Início, CRM, Configurações, …) is open —
 * the alarm never depends on a specific page being on screen.
 *
 * WHO RINGS — "the tab you're looking at, on every device":
 *  - Within ONE browser several Foocci tabs can be open. To avoid a cacophony,
 *    only one tab per browser rings, and we PREFER the tab that is currently
 *    VISIBLE (document.visibilityState). That matters a lot: a visible tab has
 *    its audio unlocked and its timers running at full speed, whereas a
 *    backgrounded tab is throttled by the browser (~1 poll/minute) and may be
 *    autoplay-blocked. Tabs announce their visibility over a BroadcastChannel;
 *    the visible one rings. If NO tab is visible (browser minimized / operator on
 *    another app), the Web-Lock holder still rings so the device is never silent.
 *  - Across DEVICES there is NO single leader: every device with Foocci open
 *    rings on its own. A restaurant WANTS its counter tablet, kitchen screen and
 *    the owner's phone to all beep for a new order. (A previous "one device for
 *    the whole restaurant" server lease made most devices silent — most of the
 *    time the elected device was backgrounded/muted/the wrong one — and is gone.)
 *
 * Renders nothing. Two independent alarms, both honoring the SAME DB-backed
 * settings (Configurações → Sons e alertas), refreshed on mount and live via the
 * "foocci:sound-settings-changed" event the settings page dispatches on save:
 *  - ORDER — rings for a newly-arrived order (PENDING or CONFIRMED; pay-on-
 *    delivery/pickup orders skip PENDING and land CONFIRMED) within a recency
 *    window; stops when staff move it forward (PREPARING/…) or the window lapses.
 *    See order-alert.ts. Stateless: a reload immediately (correctly) rings for any
 *    order still waiting, rather than staying silent about it.
 *  - HANDOFF — polls unassumed HUMAN conversations + the overdue-escalation
 *    endpoint. While AtendimentoClient is mounted (in ANY tab) it drives the
 *    ack-aware ring-set directly via the attach/detach/ring-ids bridge, so the
 *    "Estou ciente" / "Silenciar atrasados" nuance is preserved byte-for-byte.
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
import { pendingActionOrderIds, ORDER_ALARM_MAX_AGE_MS, type AlertOrderLike } from "@/lib/order-alert";
import {
  pendingHumanRequestIds,
  HANDOFF_ALARM_MAX_AGE_MS,
  type HandoffConversationLike,
} from "@/lib/handoff-alert";

const ORDER_POLL_MS   = 8_000;
const HUMAN_POLL_MS   = 10_000;
const OVERDUE_POLL_MS = 60_000; // matches the existing Atendimento cadence

const ALARM_LOCK_NAME     = "foocci-alarm-leader";
const BRIDGE_CHANNEL_NAME = "foocci-alarm-bridge";

// ── Visible-tab election within a browser ───────────────────────────────────
// A tab announces "I'm visible" on this cadence; peers treat it as visible while
// the announcement is fresh. The ringer is the visible tab (see canRing()).
const VISIBILITY_PING_MS = 2_500;
const PEER_VISIBLE_TTL   = 6_000;

/** Shape of an order row from GET /api/orders (only the fields the alarm needs). */
interface RawOrderRow {
  id: string;
  status: string;
  createdAt: string;
  payment?: { providerName?: string | null; status?: string | null } | null;
}

type BridgeMessage =
  | { type: "attach" }
  | { type: "detach" }
  | { type: "ring-ids"; ids: string[] }
  | { type: "handoff-resolved"; id: string; reason: string }
  | { type: "order-resolved"; id: string; reason: string }
  | { type: "tab-visible"; tabId: string; at: number };

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

  // The Web-Lock holder is the browser's FALLBACK ringer — used only when no tab
  // is visible anywhere in this browser (minimized window / operator on another
  // app). The primary ringer is whichever tab is currently visible.
  const isLockLeaderRef = useRef(false);
  // Whether THIS tab is currently visible/foreground.
  const isVisibleRef = useRef(true);

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

    // ── Visible-tab election ────────────────────────────────────────────────
    const myTabId =
      (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const peerVisibleAt = new Map<string, number>();
    isVisibleRef.current =
      typeof document === "undefined" ? true : document.visibilityState === "visible";
    const anyPeerVisible = () => {
      const now = Date.now();
      for (const [tid, at] of peerVisibleAt) {
        if (tid !== myTabId && now - at < PEER_VISIBLE_TTL) return true;
      }
      return false;
    };
    // A tab rings if it's the one you're looking at, or — when no tab is visible
    // anywhere in this browser — the Web-Lock fallback leader.
    const canRing = () => isVisibleRef.current || (isLockLeaderRef.current && !anyPeerVisible());

    // ── Web Lock elects the single fallback ringer per browser ───────────────
    let releaseLeaderLock: () => void = () => {};
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav && "locks" in nav) {
      nav.locks
        .request(ALARM_LOCK_NAME, { mode: "exclusive" }, () =>
          new Promise<void>((resolve) => {
            isLockLeaderRef.current = true;
            releaseLeaderLock = resolve;
          }),
        )
        .catch(() => { /* lock request aborted (fast unmount) — harmless */ });
    } else {
      isLockLeaderRef.current = true; // no Locks API — fail open rather than silence everyone
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
      maxDurationMs:   0, // rings until accepted/advanced or the sound is turned off
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
    // Only a tab that currently CAN RING (visible, or the fallback leader when no
    // tab is visible) ever receives non-empty ids, so play() never fires from a
    // dormant background tab.
    const safeOrderSync   = (ids: string[]) => orderController.sync(canRing() ? ids : []);
    const safeHandoffSync = (ids: string[]) => handoffController.sync(canRing() ? ids : []);

    // ── ORDER poll — recent orders needing attention (see order-alert.ts) ────
    const pollOrders = () => {
      if (!soundEnabledRef.current || !newOrderSoundEnabledRef.current) {
        safeOrderSync([]);
        return;
      }
      if (!canRing()) { safeOrderSync([]); return; } // dormant tabs neither fetch nor ring
      // No status filter → the 50 most recent orders (the API already excludes
      // AWAITING_PAYMENT); pendingActionOrderIds keeps only new PENDING/CONFIRMED.
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
          safeOrderSync(pendingActionOrderIds(mapped, { maxAgeMs: ORDER_ALARM_MAX_AGE_MS }));
        })
        .catch(() => { /* keep ringing on last known state; next poll retries */ });
    };

    // ── HANDOFF poll — base case + overdue escalation, skipped while driven ──
    let overdueIds: string[] = [];
    const pollHuman = () => {
      if (!canRing()) return; // dormant tabs stay silent
      if (handoffDrivenRef.current) return; // Atendimento (this tab or another) is driving directly
      // Honor the master "Ativar todos os sons" toggle too (consistent with the
      // order alarm and with AtendimentoClient) — no more "handoff ignores mute".
      if (!soundEnabledRef.current || !handoffSoundEnabledRef.current) {
        safeHandoffSync([]);
        return;
      }
      fetch("/api/chat/conversations?status=HUMAN&limit=50")
        .then((r) => r.json())
        .then((json: { data?: { data?: HandoffConversationLike[] } | HandoffConversationLike[] }) => {
          if (handoffDrivenRef.current) return; // a race with attach — defer to the page
          const raw = json?.data;
          const rows: HandoffConversationLike[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          // maxAgeMs stops the SOUND for handoffs whose customer has been silent
          // for hours (the "apita e não para" stale-escalation case) — they stay
          // visible in the inbox, they just go quiet on their own.
          const pending = pendingHumanRequestIds(rows, { maxAgeMs: HANDOFF_ALARM_MAX_AGE_MS });
          safeHandoffSync([...new Set([...pending, ...overdueIds])]);
        })
        .catch(() => { /* keep ringing on last known state; next poll retries */ });
    };
    const pollOverdue = () => {
      if (!canRing() || handoffDrivenRef.current) return;
      fetch("/api/atendimento/handoff/check-timeouts", { method: "POST" })
        .then((r) => r.json())
        .then((d: { data?: { overdue?: { id: string; waitingMinutes?: number }[] } }) => {
          const maxMinutes = HANDOFF_ALARM_MAX_AGE_MS / 60_000;
          overdueIds = (d?.data?.overdue ?? [])
            .filter((o) => (o.waitingMinutes ?? 0) <= maxMinutes)
            .map((o) => o.id);
        })
        .catch(() => {});
    };
    pollOrders();
    pollHuman();
    pollOverdue();
    const orderTimer   = setInterval(pollOrders, ORDER_POLL_MS);
    const humanTimer   = setInterval(pollHuman, HUMAN_POLL_MS);
    const overdueTimer = setInterval(pollOverdue, OVERDUE_POLL_MS);

    // ── Cross-tab bridge (BroadcastChannel) ───────────────────────────────────
    // Relays this tab's attach/detach/ring-ids/resolved signals AND visibility
    // announcements to every other open tab, so whichever tab is currently the
    // ringer always has the accurate ring-set and knows if a peer is visible.
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
        case "tab-visible":      if (msg.tabId) peerVisibleAt.set(msg.tabId, msg.at ?? Date.now()); break;
      }
    });

    // ── Visibility: announce ours, re-evaluate ring state on change ──────────
    const announceVisible = () => {
      if (isVisibleRef.current) bridge?.postMessage({ type: "tab-visible", tabId: myTabId, at: Date.now() });
    };
    const onVisibility = () => {
      isVisibleRef.current = typeof document === "undefined" ? true : document.visibilityState === "visible";
      announceVisible();
      // A tab that just became visible should start ringing pending items; one
      // that went hidden should hand off to the now-visible tab. Re-poll now so
      // the switch is immediate, not up-to-a-poll-interval late.
      pollOrders();
      pollHuman();
      pollOverdue();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    announceVisible();
    const visibilityTimer = setInterval(announceVisible, VISIBILITY_PING_MS);

    // ── Attach/detach bridge with AtendimentoClient/OrdersClient (LOCAL tab) ──
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
      clearInterval(visibilityTimer);
      window.removeEventListener("foocci:sound-settings-changed", loadSettings);
      window.removeEventListener("foocci:handoff-attach", onAttach);
      window.removeEventListener("foocci:handoff-detach", onDetach);
      window.removeEventListener("foocci:handoff-ring-ids", onRingIds);
      window.removeEventListener("foocci:handoff-resolved", onHandoffResolved);
      window.removeEventListener("foocci:order-resolved", onOrderResolved);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      bridge?.close();
      releaseLeaderLock();
      orderController.dispose();
      handoffController.dispose();
      orderAudio.pause(); orderAudio.src = "";
      handoffAudio.pause(); handoffAudio.src = "";
    };
  }, []);

  // Renders nothing — the engine is sound-only. (A floating "Silenciar alarme"
  // button used to live here; the owner asked for it to be removed. The alarm now
  // bounds its own noise via the recency windows in order-alert/handoff-alert, so
  // no kill switch is needed — handling the order/conversation stops it, and a
  // stale one goes quiet on its own.)
  return null;
}
