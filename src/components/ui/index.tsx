/**
 * Foocci UI kit — the shared primitives for the whole panel.
 *
 * Design language (Brand Book v1): "minimalismo premium com hospitalidade moderna",
 * 90% neutro + 10% laranja. Tokens: ink #0B0B0B · paper #FFF · canvas #F6F6F4 ·
 * line #E9E9E6 · brand #F97316. Font: Inter.
 *
 * Pure presentational components (no hooks) → usable from server or client.
 * Import from "@/components/ui".
 */

import Link from "next/link";

type Div = React.HTMLAttributes<HTMLDivElement>;

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ── Surface ───────────────────────────────────────────────────────────────────

export function Card({ className, children, ...rest }: Div) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-line bg-paper shadow-[0_1px_2px_rgba(11,11,11,.03)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// ── Section title ─────────────────────────────────────────────────────────────

export function SectionTitle({
  children,
  meta,
  href,
  hrefLabel = "Ver",
}: {
  children: React.ReactNode;
  meta?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[12.5px] font-bold uppercase tracking-[.04em] text-ink2">{children}</h3>
        {meta && <span className="text-xs text-muted">{meta}</span>}
      </div>
      {href && (
        <Link href={href} className="text-[12.5px] font-semibold text-brand-600 hover:text-brand-700">
          {hrefLabel} →
        </Link>
      )}
    </div>
  );
}

// ── Delta chip (vs. comparison) ───────────────────────────────────────────────

export function Delta({ change }: { change: { label: string; positive: boolean } | null }) {
  if (!change) return <span className="text-xs text-muted">—</span>;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-bold",
        change.positive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600",
      )}
    >
      {change.positive ? "▲" : "▼"} {change.label}
    </span>
  );
}

// ── KPI stat ──────────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  change,
  sub,
  right,
}: {
  label: string;
  value: React.ReactNode;
  change?: { label: string; positive: boolean } | null;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted">{label}</p>
      <p className="mt-2.5 text-[28px] font-extrabold leading-none tracking-[-.03em] text-ink">{value}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        {change !== undefined && <Delta change={change} />}
        {sub && <span className="text-xs text-muted">{sub}</span>}
        {right && <span className="ml-auto shrink-0">{right}</span>}
      </div>
    </Card>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────

const PILL_TONES: Record<string, string> = {
  neutral: "bg-[#F4F4F2] text-ink2",
  brand:   "bg-brand-50 text-brand-600",
  blue:    "bg-blue-50 text-blue-600",
  green:   "bg-green-50 text-green-700",
  amber:   "bg-amber-50 text-amber-700",
  red:     "bg-red-50 text-red-600",
};

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof PILL_TONES | string;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-semibold", PILL_TONES[tone] ?? PILL_TONES.neutral, className)}>
      {children}
    </span>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

const BTN_VARIANTS: Record<string, string> = {
  primary:   "bg-brand-500 text-white border-brand-500 shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] hover:bg-brand-600",
  secondary: "bg-paper text-ink border-line2 hover:bg-[#FAFAF8]",
  ghost:     "bg-transparent text-ink2 border-transparent hover:bg-[#F4F4F2]",
};

export function Button({ variant = "secondary", className, children, ...rest }: BtnProps) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition-colors disabled:opacity-50",
        BTN_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── Confirm dialog shell ──────────────────────────────────────────────────────

const DIALOG_TONES: Record<string, string> = {
  danger:  "bg-red-50 text-red-600 ring-red-100",
  caution: "bg-amber-50 text-amber-600 ring-amber-100",
  brand:   "bg-brand-50 text-brand-600 ring-brand-100",
};

/**
 * Centered confirmation modal — tone-driven icon badge + title/subtitle, with
 * an arbitrary body (`children`) and an action row (`footer`). Presentational
 * only: the parent owns open/close state and the button handlers.
 */
export function ConfirmDialog({
  tone = "danger",
  icon,
  title,
  subtitle,
  children,
  footer,
}: {
  tone?: keyof typeof DIALOG_TONES;
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1", DIALOG_TONES[tone])}>
            {icon}
          </div>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-[15px] font-bold leading-snug text-ink">{title}</h3>
            {subtitle && <p className="mt-1 text-[13px] leading-snug text-muted">{subtitle}</p>}
          </div>
        </div>
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-5 flex gap-3">{footer}</div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, sub }: { icon?: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="text-2xl opacity-60">{icon}</div>}
      <p className="text-sm font-semibold text-ink2">{title}</p>
      {sub && <p className="max-w-xs text-xs text-muted">{sub}</p>}
    </div>
  );
}
