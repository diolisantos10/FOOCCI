/**
 * OrderAlertController — reliable, idempotent repeat-until-action loop for the
 * NEW ORDER alert sound.
 *
 * Why this exists
 * ---------------
 * The old logic gated the repeat loop on `status === "PENDING"`, so orders that
 * arrived already CONFIRMED never repeated, and the `repeatNewOrderSoundUntilAccepted`
 * setting was never wired. This controller centralizes the behavior:
 *
 *   • plays immediately when a new order requires action;
 *   • repeats every `intervalMs` while at least one order still requires action
 *     (only when repeat is enabled);
 *   • stops on ACCEPTED / REJECTED / SEEN / MAX_DURATION / PAGE_UNMOUNT;
 *   • never overlaps audio (single in-flight guard);
 *   • is idempotent — the same orderId re-appearing does not start a second loop,
 *     and multiple pending orders share ONE loop (no chaotic overlap).
 *
 * It is intentionally framework-agnostic (no DOM/Audio/React imports) so it can be
 * unit-tested with fake timers. The caller injects `play` (the gain-aware player),
 * `getVolume` (theme-adjusted %) and `isRepeatEnabled`.
 */

export type OrderAlertStopReason =
  | "ACCEPTED"
  | "REJECTED"
  | "SEEN"
  | "MAX_DURATION"
  | "PAGE_UNMOUNT"
  | "IDLE";

export interface OrderAlertDiagnostics {
  loopActive:       boolean;
  activeOrderCount: number;
  lastAttemptAt:    number | null;
  lastResult:       "success" | "error" | null;
  lastError:        string | null;
  lastStopReason:   OrderAlertStopReason | null;
  effectiveVolume:  number;
  assetPath:        string;
}

export interface OrderAlertControllerOptions {
  /** Gain-aware player. Resolves on success, rejects on failure (e.g. autoplay block). */
  play: (volumePercent: number) => Promise<void>;
  /** Current effective volume % (already theme-adjusted). Read fresh on every play. */
  getVolume: () => number;
  /** Whether the alert should repeat until the order is handled. Read fresh each sync. */
  isRepeatEnabled: () => boolean;
  /** Asset path — diagnostics only. */
  assetPath: string;
  /** Repeat interval in ms. Default 10_000 (within the 8–12 s window). */
  intervalMs?: number;
  /** Max time the loop may run before auto-stopping. Default 180_000 (3 min). */
  maxDurationMs?: number;
  /** Called whenever diagnostics change (attempt, result, stop). */
  onDiagnostics?: (d: OrderAlertDiagnostics) => void;
  /** Injectable clock for tests. */
  now?: () => number;
}

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_MAX_DURATION_MS = 180_000;

export class OrderAlertController {
  private readonly opts: Required<Pick<OrderAlertControllerOptions,
    "play" | "getVolume" | "isRepeatEnabled" | "assetPath" | "intervalMs" | "maxDurationMs" | "now">>
    & Pick<OrderAlertControllerOptions, "onDiagnostics">;

  /** Orders that currently require action. One shared loop covers all of them. */
  private activeIds = new Set<string>();
  /** Orders whose immediate (one-shot) alert already fired — idempotency guard. */
  private alertedIds = new Set<string>();
  /** Explicit stop reasons recorded via resolve(), consumed when the set empties. */
  private reasons = new Map<string, OrderAlertStopReason>();

  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private loopStartedAt: number | null = null;
  private inFlight = false;
  private disposed = false;

  private lastAttemptAt: number | null = null;
  private lastResult: "success" | "error" | null = null;
  private lastError: string | null = null;
  private lastStopReason: OrderAlertStopReason | null = null;
  private effectiveVolume = 0;

  constructor(options: OrderAlertControllerOptions) {
    this.opts = {
      play:            options.play,
      getVolume:       options.getVolume,
      isRepeatEnabled: options.isRepeatEnabled,
      assetPath:       options.assetPath,
      intervalMs:      options.intervalMs    ?? DEFAULT_INTERVAL_MS,
      maxDurationMs:   options.maxDurationMs  ?? DEFAULT_MAX_DURATION_MS,
      now:             options.now            ?? (() => Date.now()),
      onDiagnostics:   options.onDiagnostics,
    };
  }

  /**
   * Reconcile the controller with the current set of orders requiring action.
   * Call this on every render with the live set of actionable order IDs.
   */
  sync(orderIds: string[]): void {
    if (this.disposed) return;

    const incoming = new Set(orderIds);
    const removed = [...this.activeIds].filter((id) => !incoming.has(id));
    for (const id of removed) this.alertedIds.delete(id);
    this.activeIds = incoming;

    // Brand-new actionable orders fire one immediate alert (idempotent).
    const trulyNew = orderIds.filter((id) => !this.alertedIds.has(id));
    if (trulyNew.length > 0) {
      for (const id of trulyNew) this.alertedIds.add(id);
      this.fire();
      this.ensureLoop();
      return;
    }

    if (incoming.size === 0) {
      // Nothing requires action — stop with the most specific known reason.
      // Skip when already idle with nothing removed this call, so a prior
      // explicit resolve() reason (ACCEPTED/REJECTED) isn't clobbered by the
      // follow-up empty sync from React's re-render.
      if (removed.length > 0 || this.intervalHandle !== null) {
        this.stop(this.consumeReason(removed) ?? "SEEN");
      }
      return;
    }

    this.ensureLoop();
  }

  /** Mark an order handled (e.g. accepted/rejected) so the loop stops with that reason. */
  resolve(orderId: string, reason: OrderAlertStopReason): void {
    if (this.disposed) return;
    this.reasons.set(orderId, reason);
    this.activeIds.delete(orderId);
    this.alertedIds.delete(orderId);
    if (this.activeIds.size === 0) {
      this.stop(this.consumeReason([orderId]) ?? reason);
    } else {
      this.emit();
    }
  }

  /** Tear down on page unmount — clears the loop and all tracking. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearInterval();
    this.activeIds.clear();
    this.alertedIds.clear();
    this.reasons.clear();
    this.lastStopReason = "PAGE_UNMOUNT";
    this.loopStartedAt = null;
    this.emit();
  }

  getDiagnostics(): OrderAlertDiagnostics {
    return {
      loopActive:       this.intervalHandle !== null,
      activeOrderCount: this.activeIds.size,
      lastAttemptAt:    this.lastAttemptAt,
      lastResult:       this.lastResult,
      lastError:        this.lastError,
      lastStopReason:   this.lastStopReason,
      effectiveVolume:  this.effectiveVolume,
      assetPath:        this.opts.assetPath,
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private ensureLoop(): void {
    if (!this.opts.isRepeatEnabled()) {
      // Repeat disabled — immediate-only. Make sure no stale interval lingers.
      this.clearInterval();
      return;
    }
    if (this.intervalHandle !== null) return;          // idempotent: one loop only
    if (this.activeIds.size === 0) return;
    this.loopStartedAt = this.opts.now();
    this.intervalHandle = setInterval(() => this.tick(), this.opts.intervalMs);
    this.emit();
  }

  private tick(): void {
    if (this.loopStartedAt !== null &&
        this.opts.now() - this.loopStartedAt >= this.opts.maxDurationMs) {
      this.stop("MAX_DURATION");
      return;
    }
    if (this.activeIds.size === 0) {
      this.stop("IDLE");
      return;
    }
    this.fire();
  }

  private fire(): void {
    if (this.inFlight) return;                          // never overlap audio
    this.inFlight = true;
    this.effectiveVolume = this.opts.getVolume();
    this.lastAttemptAt = this.opts.now();
    this.emit();
    this.opts.play(this.effectiveVolume)
      .then(() => { this.lastResult = "success"; this.lastError = null; })
      .catch((err: unknown) => {
        this.lastResult = "error";
        this.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      })
      .finally(() => { this.inFlight = false; this.emit(); });
  }

  private stop(reason: OrderAlertStopReason): void {
    this.clearInterval();
    this.loopStartedAt = null;
    this.lastStopReason = reason;
    this.emit();
  }

  private clearInterval(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Pick the most meaningful explicit reason among the given ids, consuming them. */
  private consumeReason(ids: string[]): OrderAlertStopReason | null {
    let picked: OrderAlertStopReason | null = null;
    for (const id of ids) {
      const r = this.reasons.get(id);
      if (r) {
        this.reasons.delete(id);
        // ACCEPTED/REJECTED are more specific than a bare SEEN.
        if (!picked || picked === "SEEN") picked = r;
      }
    }
    return picked;
  }

  private emit(): void {
    this.opts.onDiagnostics?.(this.getDiagnostics());
  }
}
