import { cn } from "@/lib/utils";

type BadgeVariant =
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

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: "bg-[#F4F4F5] text-[#52525B]",
  active: "bg-[#DCFCE7] text-[#15803D]",
  at_risk: "bg-[#FEF9C3] text-[#A16207]",
  blocked: "bg-[#FEE2E2] text-[#B91C1C]",
  completed: "bg-[#F4F4F5] text-[#52525B]",
  paused: "bg-[#F4F4F5] text-[#52525B]",
  draft: "bg-[#F4F4F5] text-[#52525B]",
  in_review: "bg-[#DBEAFE] text-[#1D4ED8]",
  approved: "bg-[#DCFCE7] text-[#15803D]",
  delivered: "bg-[#EDE9FE] text-[#6D28D9]",
  pending: "bg-[#F4F4F5] text-[#52525B]",
  in_progress: "bg-[#DBEAFE] text-[#1D4ED8]",
  done: "bg-[#DCFCE7] text-[#15803D]",
  critical: "bg-[#FEE2E2] text-[#B91C1C]",
  high: "bg-[#FFEDD5] text-[#C2410C]",
  medium: "bg-[#FEF9C3] text-[#A16207]",
  low: "bg-[#F4F4F5] text-[#52525B]",
  onboarding: "bg-[#DBEAFE] text-[#1D4ED8]",
  inactive: "bg-[#F4F4F5] text-[#52525B]",
  pending_analysis: "bg-[#FEF9C3] text-[#A16207]",
  analyzed: "bg-[#DBEAFE] text-[#1D4ED8]",
};

const VARIANT_LABELS: Partial<Record<BadgeVariant, string>> = {
  at_risk: "At Risk",
  in_review: "In Review",
  in_progress: "In Progress",
  pending_analysis: "Pending Analysis",
};

interface BadgeProps {
  variant?: BadgeVariant;
  label?: string;
  className?: string;
}

export function Badge({ variant = "default", label, className }: BadgeProps) {
  const displayLabel = label ?? VARIANT_LABELS[variant] ?? variant.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium capitalize",
        VARIANT_STYLES[variant],
        className
      )}
    >
      {displayLabel}
    </span>
  );
}

interface DotBadgeProps {
  variant?: BadgeVariant;
  label?: string;
}

export function DotBadge({ variant = "default", label }: DotBadgeProps) {
  const displayLabel = label ?? VARIANT_LABELS[variant] ?? variant.replace(/_/g, " ");

  const dotColors: Partial<Record<BadgeVariant, string>> = {
    active: "#16A34A",
    at_risk: "#CA8A04",
    blocked: "#DC2626",
    completed: "#71717A",
    paused: "#71717A",
    in_progress: "#2563EB",
    done: "#16A34A",
    pending: "#71717A",
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[#52525B]">
      <span
        className="h-1.5 w-1.5 rounded-full flex-none"
        style={{ backgroundColor: dotColors[variant] ?? "#A1A1AA" }}
      />
      <span className="capitalize">{displayLabel}</span>
    </span>
  );
}
