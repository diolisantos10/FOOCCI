import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "active"
  | "at_risk"
  | "blocked"
  | "completed"
  | "paused"
  | "draft"
  | "in_review"
  | "approved"
  | "delivered"
  | "pending"
  | "in_progress"
  | "done"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "onboarding"
  | "inactive"
  | "pending_analysis"
  | "analyzed";

/* Refined palette: less saturated, more premium */
const STYLES: Record<BadgeVariant, { bg: string; text: string }> = {
  default:          { bg: "#F4F4F5", text: "#52525B" },
  active:           { bg: "#DCFCE7", text: "#166534" },
  at_risk:          { bg: "#FEF3C7", text: "#92400E" },
  blocked:          { bg: "#FEE2E2", text: "#991B1B" },
  completed:        { bg: "#F4F4F5", text: "#52525B" },
  paused:           { bg: "#F4F4F5", text: "#71717A" },
  draft:            { bg: "#F4F4F5", text: "#71717A" },
  in_review:        { bg: "#EEF2FF", text: "#3730A3" },
  approved:         { bg: "#DCFCE7", text: "#166534" },
  delivered:        { bg: "#F3E8FF", text: "#6B21A8" },
  pending:          { bg: "#F4F4F5", text: "#71717A" },
  in_progress:      { bg: "#EEF2FF", text: "#3730A3" },
  done:             { bg: "#DCFCE7", text: "#166534" },
  critical:         { bg: "#FEE2E2", text: "#991B1B" },
  high:             { bg: "#FFF0E8", text: "#9A3412" },
  medium:           { bg: "#FEFCE8", text: "#854D0E" },
  low:              { bg: "#F4F4F5", text: "#71717A" },
  onboarding:       { bg: "#EEF2FF", text: "#3730A3" },
  inactive:         { bg: "#F4F4F5", text: "#A1A1AA" },
  pending_analysis: { bg: "#FEF3C7", text: "#92400E" },
  analyzed:         { bg: "#EEF2FF", text: "#3730A3" },
};

const DISPLAY_LABELS: Partial<Record<BadgeVariant, string>> = {
  at_risk:          "At Risk",
  in_review:        "In Review",
  in_progress:      "In Progress",
  pending_analysis: "Pending",
};

interface BadgeProps {
  variant?: BadgeVariant;
  label?: string;
  className?: string;
}

export function Badge({ variant = "default", label, className }: BadgeProps) {
  const { bg, text } = STYLES[variant] ?? STYLES.default;
  const display = label ?? DISPLAY_LABELS[variant] ?? variant.replace(/_/g, " ");

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[5px] px-[7px] py-[2px] text-[11px] font-medium capitalize leading-[16px]",
        className
      )}
      style={{ backgroundColor: bg, color: text }}
    >
      {display}
    </span>
  );
}

/* Dot badge — used for status in tables */
interface DotBadgeProps {
  variant?: BadgeVariant;
  label?: string;
}

const DOT_COLORS: Partial<Record<BadgeVariant, string>> = {
  active:      "#16A34A",
  at_risk:     "#CA8A04",
  blocked:     "#DC2626",
  completed:   "#A1A1AA",
  paused:      "#A1A1AA",
  in_progress: "#5B5BD6",
  done:        "#16A34A",
  pending:     "#D0D0CC",
};

export function DotBadge({ variant = "default", label }: DotBadgeProps) {
  const display = label ?? DISPLAY_LABELS[variant] ?? variant.replace(/_/g, " ");
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[#52525B]">
      <span
        className="h-[6px] w-[6px] flex-none rounded-full"
        style={{ backgroundColor: DOT_COLORS[variant] ?? "#D0D0CC" }}
      />
      <span className="capitalize">{display}</span>
    </span>
  );
}
