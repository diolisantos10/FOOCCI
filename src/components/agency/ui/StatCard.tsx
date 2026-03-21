import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    value: string;
    direction: "up" | "down" | "flat";
    label: string;
  };
  accent?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = "#5B5BD6",
  trend,
  accent,
}: StatCardProps) {
  const trendColors = {
    up: "#16A34A",
    down: "#DC2626",
    flat: "#71717A",
  };
  const TrendIcon = trend?.direction === "up" ? TrendingUp : trend?.direction === "down" ? TrendingDown : Minus;

  return (
    <div className="rounded-xl border border-[#E8E8E5] bg-white p-5 shadow-card">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-[12px] font-medium text-[#71717A] uppercase tracking-wide">{label}</p>
          <p className="mt-2 text-[28px] font-bold text-[#0A0A0A] leading-none">{value}</p>
          {trend && (
            <div className="mt-3 flex items-center gap-1">
              <TrendIcon size={12} style={{ color: trendColors[trend.direction] }} />
              <span className="text-[11px] font-medium" style={{ color: trendColors[trend.direction] }}>
                {trend.value}
              </span>
              <span className="text-[11px] text-[#A1A1AA]">{trend.label}</span>
            </div>
          )}
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: accent ?? `${iconColor}15` }}
        >
          <Icon size={18} style={{ color: iconColor }} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}
