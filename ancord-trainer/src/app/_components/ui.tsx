import Link from "next/link";
import { roman } from "@/lib/modules";

// Componentes de UI puros e reutilizáveis do treinador ANCORD.

export function Ring({
  value,
  size = 96,
  stroke = 9,
  label,
  sub,
}: {
  value: number; // 0..100
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  const color = value >= 70 ? "#16a34a" : value >= 45 ? "#f97316" : "#ef4444";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f1f1" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-gray-900">{label ?? `${Math.round(value)}%`}</span>
        {sub && <span className="text-[10px] font-medium text-gray-400">{sub}</span>}
      </div>
    </div>
  );
}

export function Bar({ value, tone = "brand" }: { value: number; tone?: "brand" | "green" | "red" }) {
  const v = Math.max(0, Math.min(100, value));
  const bg = tone === "green" ? "bg-green-500" : tone === "red" ? "bg-red-500" : "bg-brand-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full ${bg} transition-[width] duration-500`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function CriticalBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
      ⚠️ Crítico
    </span>
  );
}

export function ModuleChip({ id }: { id: number }) {
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-brand-50 px-1.5 text-[11px] font-bold text-brand-600">
      {roman(id)}
    </span>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ${className}`}>{children}</div>
  );
}

export function PrimaryLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 active:bg-brand-700 ${className}`}
    >
      {children}
    </Link>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-gray-400">{children}</h2>;
}
