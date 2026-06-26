/**
 * Shared primitives for all /settings/* pages.
 * Import from here instead of duplicating.
 */

export async function apiFetch(url: string, method = "GET", body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json?.data ?? json };
}

export const INPUT =
  "w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition";

export const SELECT = INPUT;

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink2">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Feedback({
  success,
  error,
  onDismiss,
}: {
  success: string | null;
  error: string | null;
  onDismiss: () => void;
}) {
  if (success)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
        <span>✓</span> {success}
      </div>
    );
  if (error)
    return (
      <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <span>{error}</span>
        <button type="button" className="ml-2 text-xs underline opacity-70 hover:opacity-100" onClick={onDismiss}>
          fechar
        </button>
      </div>
    );
  return null;
}

export function SaveButton({ saving, label = "Salvar" }: { saving: boolean; label?: string }) {
  return (
    <div className="flex justify-end pt-2">
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition"
      >
        {saving ? "Salvando…" : label}
      </button>
    </div>
  );
}

export function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={`h-5 w-9 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-line2"}`}
        />
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {desc && <p className="text-xs text-muted">{desc}</p>}
      </div>
    </label>
  );
}

export function PageCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-paper p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}
