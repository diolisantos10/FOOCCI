"use client";

import { CheckSquare, Upload, ArrowRight, FileText, UserCheck, Plus, CheckCircle2 } from "lucide-react";
import { useAgencyStore, ActivityEventType } from "@/lib/agency/store";

const TYPE_CONFIG: Record<ActivityEventType, { icon: React.ElementType; color: string; bg: string }> = {
  task_completed:       { icon: CheckSquare,  color: "#16A34A", bg: "#F0FDF4" },
  task_started:         { icon: CheckSquare,  color: "#5B5BD6", bg: "#EEEEFD" },
  task_unblocked:       { icon: CheckSquare,  color: "#0D9488", bg: "#F0FDFA" },
  deliverable_uploaded: { icon: Upload,       color: "#5B5BD6", bg: "#EEEEFD" },
  deliverable_approved: { icon: CheckCircle2, color: "#16A34A", bg: "#F0FDF4" },
  deliverable_delivered:{ icon: Upload,       color: "#0D9488", bg: "#F0FDFA" },
  project_advanced:     { icon: ArrowRight,   color: "#7C3AED", bg: "#F5F3FF" },
  project_created:      { icon: Plus,         color: "#5B5BD6", bg: "#EEEEFD" },
  briefing_submitted:   { icon: FileText,     color: "#CA8A04", bg: "#FFFBEB" },
  agent_assigned:       { icon: UserCheck,    color: "#0D9488", bg: "#F0FDFA" },
};

const FALLBACK_CONFIG = { icon: ArrowRight, color: "#A1A1AA", bg: "#F4F4F5" };

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 2)  return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

export function ActivityFeed() {
  const activity = useAgencyStore((s) => s.activity);

  return (
    <div className="rounded-xl border border-[#E5E5E2] bg-white" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
      <div className="flex items-center justify-between border-b border-[#F0F0EE] px-5 py-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[#0A0A0A]">Activity</h2>
          <p className="text-[11px] text-[#A1A1AA]">Live changes across all projects</p>
        </div>
        <span className="rounded-full bg-[#F4F4F5] px-2 py-0.5 text-[10px] font-semibold text-[#A1A1AA]">
          {activity.length}
        </span>
      </div>

      {activity.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-[12px] text-[#A1A1AA]">No activity yet. Create a project to get started.</p>
        </div>
      ) : (
        <ul>
          {activity.slice(0, 8).map((item, i) => {
            const config = TYPE_CONFIG[item.type] ?? FALLBACK_CONFIG;
            const Icon   = config.icon;
            const isLast = i === Math.min(activity.length, 8) - 1;
            return (
              <li
                key={item.id}
                className="flex items-start gap-3.5 px-5 py-3.5"
                style={{ borderBottom: isLast ? "none" : "1px solid #F5F5F3" }}
              >
                <div
                  className="mt-0.5 flex h-[28px] w-[28px] flex-none items-center justify-center rounded-lg"
                  style={{ backgroundColor: config.bg }}
                >
                  <Icon size={12} strokeWidth={2} style={{ color: config.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] leading-snug text-[#0A0A0A]">{item.description}</p>
                  {item.project && (
                    <p className="mt-0.5 truncate text-[11px] text-[#A1A1AA]">
                      {item.client} · {item.project}
                    </p>
                  )}
                </div>
                <span className="flex-none pt-0.5 text-[11px] text-[#C0C0BC]">{timeAgo(item.timestamp)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
