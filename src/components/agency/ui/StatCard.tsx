import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    value: string;
    direction: "up" | "down" | "flat";
    label?: string;
  };
  alert?: boolean;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = "#5B5BD6",
  trend,
  alert,
}: StatCardProps) {
  const trendColors = {
    up: "#16A34A",
    down: "#DC2626",
    flat: "#A1A1AA",
  };

  const TrendIcon =
    trend?.direction === "up"
      ? TrendingUp
      : trend?.direction === "down"
      ? TrendingDown
      : Minus;

  return (
    <div
      className="rounded-xl border bg-white p-5 transition-shadow hover:shadow-[0_4px_16px_0_rgba(0,0,0,0.08)]"
      style={{
        borderColor: alert ? "#FECACA" : "#E5E5E2",
        backgroundColor: alert ? "#FFFAFA" : "#FFFFFF",
        boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#A1A1AA]">
            {label}
          </p>
          <p
            className="mt-2.5 text-[30px] font-bold leading-none text-[#0A0A0A] mono-num"
            style={{ letterSpacing: "-0.02em" }}
          >
            {value}
          </p>
          {trend && (
            <div className="mt-3 flex items-center gap-1.5">
              <TrendIcon
                size={11}
                strokeWidth={2.5}
                style={{ color: trendColors[trend.direction], flexShrink: 0 }}
              />
              <span
                className="text-[11px] font-medium"
                style={{ color: trendColors[trend.direction] }}
              >
                {trend.value}
              </span>
              {trend.label && (
                <span className="text-[11px] text-[#A1A1AA]">{trend.label}</span>
              )}
            </div>
          )}
        </div>
        <div
          className="flex h-9 w-9 flex-none items-center justify-center rounded-lg"
          style={{ backgroundColor: alert ? "#FEE2E2" : `${iconColor}12` }}
        >
          <Icon
            size={16}
            strokeWidth={1.75}
            style={{ color: alert ? "#DC2626" : iconColor }}
          />
        </div>
      </div>
    </div>
  );
}
