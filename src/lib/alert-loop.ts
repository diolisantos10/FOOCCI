/**
 * AlertLoopController — reliable, idempotent repeat-until-action alarm loop.
 *
 * Generic engine shared by operational alerts that must keep ringing until an
 * operator acts (new-order alert, human-attention alert). It is intentionally
 * framework-agnostic (no DOM/Audio/React imports) so it can be unit-tested with
 * fake timers. The caller injects `play` (the gain-aware player), `getVolume`
 * and `isRepeatEnabled`, and feeds it the live set of items requiring action.
 *
 *   • plays immediately when a new item requires action;
 *   • repeats every `intervalMs` while at least one item still requires action
 *     (only when repeat is enabled);
 *   • stops on an explicit reason (e.g. ACCEPTED/ASSUMED/RESOLVED) or an
 *     internal one (SEEN / MAX_DURATION / PAGE_UNMOUNT / IDLE);
 *   • never overlaps audio (single in-flight guard);
 *   • is idempotent — the same id re-appearing does not start a second loop,
 *     and multiple pending items share ONE loop (no chaotic overlap).
 */

/** Internal stop reasons are well-known; callers may supply any domain reason
 *  via resolve() (e.g. "ACCEPTED", "REJECTED", "ASSUMED", "RESOLVED"). */
export type AlertStopReason =
  | "SEEN"
  | "MAX_DURATION"
  | "PAGE_UNMOUNT"
  | "IDLE"
  | (string & {});

export interface AlertLoopDiagnostics {
  loopActive:      boolean;
  activeCount:     number;
  lastAttemptAt:   number | null;
  lastResult:      "success" | "error" | null;
  lastError:       string | null;
  lastStopReason:  AlertStopReason | null;
  effectiveVolume: number;
  assetPath:       string;
}

export interface AlertLoopControllerOptions {
  /** Gain-aware player. Resolves on success, rejects on failure (e.g. autoplay block). */
  play: (volumePercent: number) => Promise<void>;
  /** Current effective volume %. Read fresh on every play. */
  getVolume: () => number;
  /** Whether the alert should repeat until handled. Read fresh each sync. */
  isRepeatEnabled: () => boolean;
  /** Asset path — diagnostics only. */
  assetPath: string;
  /** Repeat interval in ms. Default 10_000. */
  intervalMs?: number;
  /** Max time the loop may run before auto-stopping. Default 180_000 (3 min).
   *  Pass 0 (or a negative number) to DISABLE the cap — the alert then keeps
   *  ringing until the operator handles it or turns the sound off. */
  maxDurationMs?: number;
  /** Called whenever diagnostics change (attempt, result, stop). */
  onDiagnostics?: (d: AlertLoopDiagnostics) => void;
  /** Injectable clock for tests. */
  now?: () => number;
}

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_MAX_DURATION_MS = 180_000;

export class AlertLoopController {
  private readonly opts: Required<Pick<AlertLoopControllerOptions,
    "play" | "getVolume" | "isRepeatEnabled" | "assetPath" | "intervalMs" | "maxDurationMs" | "now">>
    & Pick<AlertLoopControllerOptions, "onDiagnostics">;

  /** Items that currently require action. One shared loop covers all of them. */
  private activeIds = new Set<string>();
  /** Items whose immediate (one-shot) alert already fired — idempotency guard. */
  private alertedIds = new Set<string>();
  /** Explicit stop reasons recorded via resolve(), consumed when the set empties. */
  private reasons = new Map<string, AlertStopReason>();

  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private loopStartedAt: number | null = null;
  private inFlight = false;
  private disposed = false;

  private lastAttemptAt: number | null = null;
  private lastResult: "success" | "error" | null = null;
  private lastError: string | null = null;
  private lastStopReason: AlertStopReason | null = null;
  private effectiveVolume = 0;

  constructor(options: AlertLoopControllerOptions) {
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
   * Reconcile the controller with the current set of items requiring action.
   * Call this on every render with the live set of actionable IDs.
   */
  sync(ids: string[]): void {
    if (this.disposed) return;

    const incoming = new Set(ids);
    const removed = [...this.activeIds].filter((id) => !incoming.has(id));
    for (const id of removed) this.alertedIds.delete(id);
    this.activeIds = incoming;

    // Brand-new actionable items fire one immediate alert (idempotent).
    const trulyNew = ids.filter((id) => !this.alertedIds.has(id));
    if (trulyNew.length > 0) {
      for (const id of trulyNew) this.alertedIds.add(id);
      this.fire();
      this.ensureLoop();
      return;
    }

    if (incoming.size === 0) {
      // Nothing requires action — stop with the most specific known reason.
      // Skip when already idle with nothing removed this call, so a prior
      // explicit resolve() reason isn't clobbered by the follow-up empty sync
      // from React's re-render.
      if (removed.length > 0 || this.intervalHandle !== null) {
        this.stop(this.consumeReason(removed) ?? "SEEN");
      }
      return;
    }

    this.ensureLoop();
  }

  /** Mark an item handled (e.g. accepted/assumed/resolved) so the loop stops with that reason. */
  resolve(id: string, reason: AlertStopReason): void {
    if (this.disposed) return;
    this.reasons.set(id, reason);
    this.activeIds.delete(id);
    this.alertedIds.delete(id);
    if (this.activeIds.size === 0) {
      this.stop(this.consumeReason([id]) ?? reason);
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

  getDiagnostics(): AlertLoopDiagnostics {
    return {
      loopActive:      this.intervalHandle !== null,
      activeCount:     this.activeIds.size,
      lastAttemptAt:   this.lastAttemptAt,
      lastResult:      this.lastResult,
      lastError:       this.lastError,
      lastStopReason:  this.lastStopReason,
      effectiveVolume: this.effectiveVolume,
      assetPath:       this.opts.assetPath,
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
    // A non-positive maxDurationMs disables the cap: the alarm rings until the
    // operator handles the item (resolve) or turns the sound off (empty sync).
    if (this.opts.maxDurationMs > 0 &&
        this.loopStartedAt !== null &&
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

  private stop(reason: AlertStopReason): void {
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
  private consumeReason(ids: string[]): AlertStopReason | null {
    let picked: AlertStopReason | null = null;
    for (const id of ids) {
      const r = this.reasons.get(id);
      if (r) {
        this.reasons.delete(id);
        // An explicit domain reason is more specific than a bare SEEN.
        if (!picked || picked === "SEEN") picked = r;
      }
    }
    return picked;
  }

  private emit(): void {
    this.opts.onDiagnostics?.(this.getDiagnostics());
  }
}
