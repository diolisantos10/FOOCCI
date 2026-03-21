import { MOCK_ACTIVITY, Activity } from "@/lib/agency/mock-data";
import {
  CheckSquare,
  Upload,
  ArrowRight,
  FileText,
  UserCheck,
} from "lucide-react";

const TYPE_CONFIG = {
  task_completed: { icon: CheckSquare, color: "#16A34A", bg: "#DCFCE7" },
  deliverable_uploaded: { icon: Upload, color: "#2563EB", bg: "#DBEAFE" },
  project_advanced: { icon: ArrowRight, color: "#7C3AED", bg: "#EDE9FE" },
  briefing_submitted: { icon: FileText, color: "#CA8A04", bg: "#FEF9C3" },
  agent_assigned: { icon: UserCheck, color: "#0D9488", bg: "#CCFBF1" },
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
    <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-[#E8E8E5] px-5 py-4">
        <h2 className="text-[14px] font-semibold text-[#0A0A0A]">Recent Activity</h2>
        <button className="text-[12px] text-[#5B5BD6] hover:underline">View all</button>
      </div>
      <ul className="divide-y divide-[#F4F4F4]">
        {MOCK_ACTIVITY.map((item: Activity) => {
          const config = TYPE_CONFIG[item.type];
          const Icon = config.icon;
          return (
            <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
              <div
                className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg"
                style={{ backgroundColor: config.bg }}
              >
                <Icon size={13} style={{ color: config.color }} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[#0A0A0A] leading-snug">{item.description}</p>
                {item.project && (
                  <p className="mt-0.5 truncate text-[11px] text-[#A1A1AA]">
                    {item.client} · {item.project}
                  </p>
                )}
              </div>
              <span className="flex-none text-[11px] text-[#A1A1AA]">{timeAgo(item.timestamp)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
