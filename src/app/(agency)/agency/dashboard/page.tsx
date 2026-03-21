"use client";

import {
  FolderKanban, AlertTriangle, CheckSquare, Clock, Zap, ArrowRight,
} from "lucide-react";
import { StatCard } from "@/components/agency/ui/StatCard";
import { ActivityFeed } from "@/components/agency/dashboard/ActivityFeed";
import { PipelineOverview } from "@/components/agency/dashboard/PipelineOverview";
import { useAgencyStore } from "@/lib/agency/store";
import { Badge } from "@/components/agency/ui/Badge";
import Link from "next/link";

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

export default function DashboardPage() {
  const { projects, tasks, deliverables } = useAgencyStore();

  const activeProjects  = projects.filter((p) => p.status === "active").length;
  const atRiskProjects  = projects.filter((p) => p.status === "at_risk").length;
  const openTasks       = tasks.filter((t) => t.status === "in_progress" || t.status === "pending").length;
  const blockedTasks    = tasks.filter((t) => t.status === "blocked").length;
  const recentDelivered = deliverables.filter((d) => d.status === "delivered" || d.status === "approved").length;
  const urgentProjects  = projects.filter((p) => p.priority === "critical" && p.status !== "completed");
  const openTasksList   = tasks.filter((t) => t.status !== "done").slice(0, 5);

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>

      {/* ── Command Header ─────────────────────────────────────────── */}
      <div className="border-b border-[#E5E5E2] bg-white">
        <div className="flex items-center justify-between px-8 py-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#C0C0BC]">
              {todayLabel()}
            </p>
            <h1 className="mt-1 text-[22px] font-bold text-[#0A0A0A]" style={{ letterSpacing: "-0.02em" }}>
              Command Dashboard
            </h1>
            <p className="mt-1 text-[13px] text-[#71717A]">
              {activeProjects} project{activeProjects !== 1 ? "s" : ""} active
              {blockedTasks > 0 && (
                <>
                  {" "}·{" "}
                  <span className="font-semibold text-[#DC2626]">
                    {blockedTasks} task{blockedTasks > 1 ? "s" : ""} blocked
                  </span>
                </>
              )}
            </p>
          </div>
          <Link
            href="/agency/orchestrator"
            className="flex items-center gap-2 rounded-lg bg-[#5B5BD6] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#4848C2]"
          >
            <Zap size={14} />
            New Project
          </Link>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 border-t border-[#F0F0EE]">
          {[
            {
              label: "Active Projects",
              value: activeProjects,
              icon: FolderKanban,
              color: "#5B5BD6",
              trend: { value: `${projects.length} total`, direction: "flat" as const },
            },
            {
              label: "At Risk",
              value: atRiskProjects,
              icon: AlertTriangle,
              color: "#DC2626",
              alert: atRiskProjects > 0,
            },
            {
              label: "Open Tasks",
              value: openTasks,
              icon: CheckSquare,
              color: "#0D9488",
              trend: blockedTasks > 0
                ? { value: `${blockedTasks} blocked`, direction: "down" as const }
                : undefined,
            },
            {
              label: "Delivered",
              value: recentDelivered,
              icon: Clock,
              color: "#7C3AED",
              trend: { value: "approved + delivered", direction: "flat" as const },
            },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="px-6 py-4"
              style={{ borderLeft: i > 0 ? "1px solid #F0F0EE" : "none" }}
            >
              <StatCard
                label={stat.label}
                value={stat.value}
                icon={stat.icon}
                iconColor={stat.color}
                trend={stat.trend}
                alert={stat.alert}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-5 px-8 py-7">

        {/* ── Attention Banner ───────────────────────────────────────── */}
        {urgentProjects.length > 0 && (
          <div
            className="overflow-hidden rounded-xl border border-[#FECACA] bg-[#FFFAFA]"
            style={{ boxShadow: "0 1px 2px 0 rgba(220,38,38,0.06)" }}
          >
            <div className="flex items-center gap-2 border-b border-[#FEE2E2] px-5 py-3">
              <AlertTriangle size={12} className="text-[#DC2626]" strokeWidth={2.5} />
              <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#991B1B]">
                Requires Attention
              </p>
              <span className="ml-auto rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-bold text-[#DC2626]">
                {urgentProjects.length}
              </span>
            </div>
            <div>
              {urgentProjects.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/agency/projects/${p.id}`}
                  className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-[#FEF2F2]"
                  style={{ borderBottom: i < urgentProjects.length - 1 ? "1px solid #FEF2F2" : "none" }}
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="critical" />
                    <div>
                      <p className="text-[13px] font-semibold text-[#0A0A0A]">{p.name}</p>
                      <p className="text-[11px] text-[#A1A1AA]">{p.clientName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={p.status} />
                    <span className="mono-num text-[11px] text-[#A1A1AA]">Due {p.deadline}</span>
                    <ArrowRight size={12} className="text-[#D0D0CC]" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Activity + Pipeline ────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-5">
          <div className="col-span-3">
            <ActivityFeed />
          </div>
          <div className="col-span-2">
            <PipelineOverview />
          </div>
        </div>

        {/* ── Open Tasks Table ───────────────────────────────────────── */}
        <div
          className="rounded-xl border border-[#E5E5E2] bg-white"
          style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
        >
          <div className="flex items-center justify-between border-b border-[#F0F0EE] px-5 py-4">
            <div>
              <h2 className="text-[13px] font-semibold text-[#0A0A0A]">Open Tasks</h2>
              <p className="text-[11px] text-[#A1A1AA]">Active and pending across all projects</p>
            </div>
            <Link
              href="/agency/tasks"
              className="flex items-center gap-1 text-[11px] font-medium text-[#5B5BD6] hover:underline"
            >
              View all <ArrowRight size={11} />
            </Link>
          </div>

          {openTasksList.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-[12px] text-[#A1A1AA]">All tasks are completed. Great work.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 border-b border-[#F5F5F3] bg-[#FAFAF9] px-5 py-2.5">
                {[
                  { label: "Task",    span: "col-span-5" },
                  { label: "Project", span: "col-span-3" },
                  { label: "Agent",   span: "col-span-2" },
                  { label: "Status",  span: "col-span-1" },
                  { label: "Due",     span: "col-span-1" },
                ].map((c) => (
                  <div key={c.label} className={`${c.span} text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]`}>
                    {c.label}
                  </div>
                ))}
              </div>
              {openTasksList.map((task, i) => (
                <div
                  key={task.id}
                  className="grid grid-cols-12 items-center px-5 py-3.5 transition-colors hover:bg-[#FAFAF9]"
                  style={{ borderBottom: i < openTasksList.length - 1 ? "1px solid #F5F5F3" : "none" }}
                >
                  <div className="col-span-5 flex min-w-0 items-center gap-3 pr-4">
                    <div
                      className="h-[14px] w-[14px] flex-none rounded-[3px] border-[1.5px]"
                      style={{
                        borderColor:
                          task.status === "blocked" ? "#DC2626"
                          : task.status === "in_progress" ? "#5B5BD6"
                          : "#D0D0CC",
                      }}
                    />
                    <Link
                      href={`/agency/projects/${task.projectId}`}
                      className="truncate text-[13px] font-medium text-[#0A0A0A] hover:text-[#5B5BD6] transition-colors"
                    >
                      {task.title}
                    </Link>
                  </div>
                  <div className="col-span-3 min-w-0 pr-3">
                    <p className="truncate text-[12px] text-[#71717A]">{task.clientName}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="truncate text-[11px] text-[#A1A1AA]">{task.agentName}</p>
                  </div>
                  <div className="col-span-1">
                    <Badge variant={task.status} />
                  </div>
                  <div className="mono-num col-span-1 text-[11px] text-[#A1A1AA]">
                    {task.dueDate.slice(5)}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
