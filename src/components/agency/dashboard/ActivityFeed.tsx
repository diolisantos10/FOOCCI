import { MOCK_ACTIVITY, Activity } from "@/lib/agency/mock-data";
import { CheckSquare, Upload, ArrowRight, FileText, UserCheck } from "lucide-react";

const TYPE_CONFIG = {
  task_completed:      { icon: CheckSquare,  color: "#16A34A", bg: "#F0FDF4" },
  deliverable_uploaded:{ icon: Upload,       color: "#5B5BD6", bg: "#EEEEFD" },
  project_advanced:    { icon: ArrowRight,   color: "#7C3AED", bg: "#F5F3FF" },
  briefing_submitted:  { icon: FileText,     color: "#CA8A04", bg: "#FFFBEB" },
  agent_assigned:      { icon: UserCheck,    color: "#0D9488", bg: "#F0FDFA" },
};

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

export function ActivityFeed() {
  return (
    <div className="rounded-xl border border-[#E5E5E2] bg-white" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
      <div className="flex items-center justify-between border-b border-[#F0F0EE] px-5 py-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[#0A0A0A]">Activity</h2>
          <p className="text-[11px] text-[#A1A1AA]">Recent changes across all projects</p>
        </div>
        <button className="text-[11px] font-medium text-[#5B5BD6] hover:underline">View all</button>
      </div>
      <ul>
        {MOCK_ACTIVITY.map((item: Activity, i) => {
          const config = TYPE_CONFIG[item.type];
          const Icon = config.icon;
          const isLast = i === MOCK_ACTIVITY.length - 1;
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
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] text-[#0A0A0A] leading-snug">{item.description}</p>
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
    </div>
  );
}
