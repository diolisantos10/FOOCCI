import {
  FolderKanban,
  AlertTriangle,
  CheckSquare,
  Clock,
  TrendingUp,
} from "lucide-react";
import { StatCard } from "@/components/agency/ui/StatCard";
import { ActivityFeed } from "@/components/agency/dashboard/ActivityFeed";
import { PipelineOverview } from "@/components/agency/dashboard/PipelineOverview";
import { MOCK_PROJECTS, MOCK_TASKS } from "@/lib/agency/mock-data";
import { Badge } from "@/components/agency/ui/Badge";
import Link from "next/link";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  const activeProjects = MOCK_PROJECTS.filter((p) => p.status === "active").length;
  const atRiskProjects = MOCK_PROJECTS.filter((p) => p.status === "at_risk").length;
  const tasksToday = MOCK_TASKS.filter(
    (t) => t.status === "in_progress" || t.status === "pending"
  ).length;

  const urgentProjects = MOCK_PROJECTS.filter(
    (p) => p.priority === "critical" && p.status !== "completed"
  );

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      {/* Top bar */}
      <div className="border-b border-[#E8E8E5] bg-white px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
              Friday, March 21, 2026
            </p>
            <h1 className="mt-0.5 text-[22px] font-bold text-[#0A0A0A]">Good morning, Dioli.</h1>
            <p className="text-[13px] text-[#71717A]">
              {activeProjects} active projects · {tasksToday} tasks need attention
            </p>
          </div>
          <Link
            href="/agency/orchestrator"
            className="flex items-center gap-2 rounded-lg bg-[#5B5BD6] px-4 py-2.5 text-[13px] font-medium text-white hover:bg-[#4C4CB8] transition-colors"
          >
            <TrendingUp size={14} />
            New Project via Orchestrator
          </Link>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Active Projects"
            value={activeProjects}
            icon={FolderKanban}
            iconColor="#5B5BD6"
            trend={{ value: "+2", direction: "up", label: "this month" }}
          />
          <StatCard
            label="Projects at Risk"
            value={atRiskProjects}
            icon={AlertTriangle}
            iconColor="#DC2626"
            trend={{ value: "needs attention", direction: "flat", label: "" }}
          />
          <StatCard
            label="Tasks Today"
            value={tasksToday}
            icon={CheckSquare}
            iconColor="#0D9488"
            trend={{ value: "2 blocked", direction: "down", label: "" }}
          />
          <StatCard
            label="Upcoming Deadlines"
            value="3"
            icon={Clock}
            iconColor="#CA8A04"
            trend={{ value: "next 7 days", direction: "flat", label: "" }}
          />
        </div>

        {/* Urgent attention */}
        {urgentProjects.length > 0 && (
          <div className="rounded-xl border border-[#FEE2E2] bg-[#FFF5F5] p-5">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#B91C1C]">
              Requires Attention
            </p>
            <div className="space-y-2">
              {urgentProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/agency/projects/${p.id}`}
                  className="flex items-center justify-between rounded-lg border border-[#FEE2E2] bg-white px-4 py-3 hover:shadow-card-hover transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="critical" label="Critical" />
                    <span className="text-[13px] font-medium text-[#0A0A0A]">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={p.status} />
                    <span className="text-[12px] text-[#71717A]">Due {p.deadline}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-5 gap-6">
          {/* Activity feed */}
          <div className="col-span-3">
            <ActivityFeed />
          </div>
          {/* Pipeline overview */}
          <div className="col-span-2">
            <PipelineOverview />
          </div>
        </div>

        {/* Quick task glance */}
        <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-[#E8E8E5] px-5 py-4">
            <h2 className="text-[14px] font-semibold text-[#0A0A0A]">Open Tasks</h2>
            <Link href="/agency/tasks" className="text-[12px] text-[#5B5BD6] hover:underline">
              View all tasks →
            </Link>
          </div>
          <div className="divide-y divide-[#F4F4F4]">
            {MOCK_TASKS.filter((t) => t.status !== "done").slice(0, 4).map((task) => (
              <div key={task.id} className="flex items-center gap-4 px-5 py-3.5">
                <div
                  className="h-4 w-4 rounded border-2 flex-none"
                  style={{
                    borderColor: task.status === "blocked" ? "#DC2626" : task.status === "in_progress" ? "#2563EB" : "#D4D4D0",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#0A0A0A] truncate">{task.title}</p>
                  <p className="text-[11px] text-[#A1A1AA]">
                    {task.clientName} · {task.agentName}
                  </p>
                </div>
                <Badge variant={task.status} />
                <Badge variant={task.priority} />
                <span className="text-[11px] text-[#A1A1AA] flex-none">Due {task.dueDate}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
