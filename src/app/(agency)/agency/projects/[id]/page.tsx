"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  CheckSquare,
  FileDown,
  GitBranch,
  BarChart2,
  Palette,
  Clock,
  Plus,
  AlertCircle,
} from "lucide-react";
import {
  MOCK_PROJECTS,
  MOCK_TASKS,
  MOCK_DELIVERABLES,
  MOCK_AGENTS,
} from "@/lib/agency/mock-data";
import { Badge } from "@/components/agency/ui/Badge";
import Link from "next/link";

const STAGE_COLORS: Record<string, string> = {
  briefing: "#A1A1AA",
  diagnosis: "#CA8A04",
  planning: "#2563EB",
  production: "#7C3AED",
  review: "#EA580C",
  delivery: "#0D9488",
  ongoing: "#16A34A",
  completed: "#E8E8E5",
};

const PIPELINE_STAGES = [
  "briefing", "diagnosis", "planning", "production",
  "review", "delivery", "ongoing", "completed",
];

type Tab = "overview" | "pipeline" | "tasks" | "deliverables" | "strategy" | "assets" | "history";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: BarChart2 },
  { key: "pipeline", label: "Pipeline", icon: GitBranch },
  { key: "tasks", label: "Tasks", icon: CheckSquare },
  { key: "deliverables", label: "Deliverables", icon: FileDown },
  { key: "strategy", label: "Strategy", icon: BarChart2 },
  { key: "assets", label: "Assets", icon: Palette },
  { key: "history", label: "History", icon: Clock },
];

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const project = MOCK_PROJECTS.find((p) => p.id === params.id);
  if (!project) notFound();

  const tasks = MOCK_TASKS.filter((t) => t.projectId === project.id);
  const deliverables = MOCK_DELIVERABLES.filter((d) => d.projectId === project.id);
  const agents = MOCK_AGENTS.filter((a) => project.assignedAgents.includes(a.id));

  const stageIndex = PIPELINE_STAGES.indexOf(project.stage);
  const currentColor = STAGE_COLORS[project.stage];

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      {/* Header */}
      <div className="border-b border-[#E8E8E5] bg-white px-8 py-5">
        <Link
          href="/agency/projects"
          className="mb-3 flex items-center gap-1.5 text-[12px] text-[#71717A] hover:text-[#0A0A0A] transition-colors"
        >
          <ArrowLeft size={13} />
          Back to Projects
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[20px] font-bold text-[#0A0A0A]">{project.name}</h1>
              <Badge variant={project.status} />
              <Badge variant={project.priority} />
            </div>
            <p className="mt-1.5 text-[13px] text-[#71717A]">{project.goal}</p>
            <div className="mt-2 flex items-center gap-4 text-[12px] text-[#A1A1AA]">
              <span>Client: <span className="font-medium text-[#52525B]">{project.clientName}</span></span>
              <span>Deadline: <span className="font-medium text-[#52525B]">{project.deadline}</span></span>
              <span>Started: <span className="font-medium text-[#52525B]">{project.createdAt}</span></span>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg border border-[#E8E8E5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0A0A0A] hover:border-[#D4D4D0] transition-colors">
              Edit
            </button>
            <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#4C4CB8] transition-colors">
              <Plus size={14} />
              Add Task
            </button>
          </div>
        </div>

        {/* Pipeline progress bar */}
        <div className="mt-5">
          <div className="flex items-center gap-0">
            {PIPELINE_STAGES.map((stage, i) => {
              const isPast = i < stageIndex;
              const isCurrent = i === stageIndex;
              const isFuture = i > stageIndex;
              return (
                <div key={stage} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className="h-1.5 w-full rounded-full transition-colors"
                      style={{
                        backgroundColor: isPast
                          ? "#5B5BD6"
                          : isCurrent
                          ? currentColor
                          : "#E8E8E5",
                      }}
                    />
                    <span
                      className="text-[9px] font-medium uppercase tracking-wide"
                      style={{
                        color: isCurrent ? currentColor : isPast ? "#5B5BD6" : "#A1A1AA",
                      }}
                    >
                      {stage}
                    </span>
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && <div className="w-1" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#E8E8E5] bg-white px-8">
        <div className="flex gap-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex items-center gap-1.5 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors"
              style={{
                borderBottomColor: activeTab === key ? "#5B5BD6" : "transparent",
                color: activeTab === key ? "#5B5BD6" : "#71717A",
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-8 py-6">
        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 space-y-5">
              {/* Description */}
              <div className="rounded-xl border border-[#E8E8E5] bg-white p-5 shadow-card">
                <h3 className="mb-2 text-[13px] font-semibold text-[#0A0A0A]">Project Description</h3>
                <p className="text-[13px] text-[#52525B] leading-relaxed">{project.description}</p>
              </div>

              {/* Tasks snapshot */}
              <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
                <div className="border-b border-[#E8E8E5] px-5 py-4 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-[#0A0A0A]">Tasks</h3>
                  <button
                    onClick={() => setActiveTab("tasks")}
                    className="text-[12px] text-[#5B5BD6] hover:underline"
                  >
                    View all
                  </button>
                </div>
                <div className="divide-y divide-[#F4F4F4]">
                  {tasks.slice(0, 3).map((task) => (
                    <div key={task.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div
                        className="h-4 w-4 rounded border-2 flex-none"
                        style={{
                          borderColor:
                            task.status === "done"
                              ? "#16A34A"
                              : task.status === "blocked"
                              ? "#DC2626"
                              : "#D4D4D0",
                          backgroundColor: task.status === "done" ? "#DCFCE7" : "transparent",
                        }}
                      />
                      <p className="flex-1 text-[13px] text-[#0A0A0A]">{task.title}</p>
                      <Badge variant={task.status} />
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <p className="px-5 py-4 text-[12px] text-[#A1A1AA]">No tasks yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              {/* Assigned agents */}
              <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
                <div className="border-b border-[#E8E8E5] px-5 py-4">
                  <h3 className="text-[13px] font-semibold text-[#0A0A0A]">Assigned Agents</h3>
                </div>
                <div className="divide-y divide-[#F4F4F4]">
                  {agents.map((agent) => (
                    <div key={agent.id} className="flex items-center gap-3 px-5 py-3">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-lg flex-none"
                        style={{ backgroundColor: `${agent.color}20` }}
                      >
                        <Bot size={13} style={{ color: agent.color }} />
                      </div>
                      <div>
                        <p className="text-[12px] font-medium text-[#0A0A0A]">{agent.name}</p>
                        <p className="text-[10px] text-[#A1A1AA]">{agent.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick stats */}
              <div className="rounded-xl border border-[#E8E8E5] bg-white p-5 shadow-card space-y-3">
                {[
                  { label: "Total Tasks", value: tasks.length },
                  { label: "Completed", value: tasks.filter((t) => t.status === "done").length },
                  { label: "Blocked", value: tasks.filter((t) => t.status === "blocked").length },
                  { label: "Deliverables", value: deliverables.length },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between">
                    <span className="text-[12px] text-[#71717A]">{stat.label}</span>
                    <span className="text-[13px] font-semibold text-[#0A0A0A]">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PIPELINE tab */}
        {activeTab === "pipeline" && (
          <div className="rounded-xl border border-[#E8E8E5] bg-white p-6 shadow-card">
            <h3 className="mb-5 text-[14px] font-semibold text-[#0A0A0A]">Project Pipeline</h3>
            <div className="space-y-3">
              {PIPELINE_STAGES.map((stage, i) => {
                const isPast = i < stageIndex;
                const isCurrent = i === stageIndex;
                return (
                  <div
                    key={stage}
                    className="flex items-center gap-4 rounded-xl border p-4 transition-colors"
                    style={{
                      borderColor: isCurrent ? currentColor : "#E8E8E5",
                      backgroundColor: isCurrent ? `${currentColor}08` : "#FAFAF9",
                    }}
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold flex-none"
                      style={{
                        backgroundColor: isPast ? "#5B5BD6" : isCurrent ? currentColor : "#E8E8E5",
                        color: isPast || isCurrent ? "white" : "#A1A1AA",
                      }}
                    >
                      {isPast ? "✓" : i + 1}
                    </div>
                    <div className="flex-1">
                      <p
                        className="text-[13px] font-semibold capitalize"
                        style={{ color: isCurrent ? currentColor : isPast ? "#0A0A0A" : "#A1A1AA" }}
                      >
                        {stage}
                      </p>
                      {isCurrent && (
                        <p className="mt-0.5 text-[11px]" style={{ color: currentColor }}>
                          Current stage — In progress
                        </p>
                      )}
                    </div>
                    {isCurrent && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: currentColor }}>
                        Active
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TASKS tab */}
        {activeTab === "tasks" && (
          <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-[#E8E8E5] px-5 py-4">
              <h3 className="text-[14px] font-semibold text-[#0A0A0A]">Tasks</h3>
              <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#4C4CB8] transition-colors">
                <Plus size={12} />
                Add task
              </button>
            </div>
            {tasks.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[13px] text-[#A1A1AA]">No tasks yet. Add the first task.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#F4F4F4]">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-4 px-5 py-4">
                    <div
                      className="mt-0.5 h-4 w-4 rounded border-2 flex-none"
                      style={{
                        borderColor: task.status === "done" ? "#16A34A" : task.status === "blocked" ? "#DC2626" : "#D4D4D0",
                        backgroundColor: task.status === "done" ? "#DCFCE7" : "transparent",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#0A0A0A]">{task.title}</p>
                      <p className="mt-0.5 text-[12px] text-[#71717A]">{task.description}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[11px] text-[#A1A1AA]">Agent: {task.agentName}</span>
                        {task.status === "blocked" && (
                          <span className="flex items-center gap-1 text-[11px] text-[#DC2626]">
                            <AlertCircle size={10} />
                            Blocked
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={task.status} />
                      <Badge variant={task.priority} />
                      <span className="text-[11px] text-[#A1A1AA]">{task.dueDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DELIVERABLES tab */}
        {activeTab === "deliverables" && (
          <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-[#E8E8E5] px-5 py-4">
              <h3 className="text-[14px] font-semibold text-[#0A0A0A]">Deliverables</h3>
              <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#4C4CB8] transition-colors">
                <Plus size={12} />
                Log deliverable
              </button>
            </div>
            {deliverables.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[13px] text-[#A1A1AA]">No deliverables logged yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#F4F4F4]">
                {deliverables.map((d) => (
                  <div key={d.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EEF2FF] flex-none">
                      <FileDown size={15} className="text-[#5B5BD6]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#0A0A0A]">{d.name}</p>
                      <p className="text-[11px] text-[#A1A1AA]">{d.type} · {d.agentName} · {d.producedAt}</p>
                    </div>
                    <Badge variant={d.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STRATEGY tab */}
        {activeTab === "strategy" && (
          <div className="grid grid-cols-2 gap-5">
            {[
              { title: "Business Goal", content: project.goal, color: "#5B5BD6" },
              { title: "Project Description", content: project.description, color: "#7C3AED" },
              { title: "Success Criteria", content: "To be defined after strategy session.", color: "#0D9488" },
              { title: "Risks & Dependencies", content: "No risks flagged by Orchestrator yet.", color: "#CA8A04" },
            ].map((card) => (
              <div key={card.title} className="rounded-xl border border-[#E8E8E5] bg-white p-5 shadow-card">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-1 w-4 rounded-full" style={{ backgroundColor: card.color }} />
                  <h3 className="text-[13px] font-semibold text-[#0A0A0A]">{card.title}</h3>
                </div>
                <p className="text-[13px] text-[#52525B] leading-relaxed">{card.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* ASSETS tab */}
        {activeTab === "assets" && (
          <div className="rounded-xl border border-[#E8E8E5] bg-white p-6 shadow-card">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[14px] font-semibold text-[#0A0A0A]">Brand Assets</h3>
              <button className="text-[12px] text-[#5B5BD6] hover:underline">
                View full library →
              </button>
            </div>
            <p className="text-[13px] text-[#71717A]">
              Brand assets for {project.clientName} are available in the client&apos;s Brand Asset Library.
            </p>
            <Link
              href={`/agency/clients/${project.clientId}`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[#E8E8E5] px-3.5 py-2 text-[13px] font-medium text-[#0A0A0A] hover:border-[#5B5BD6] hover:text-[#5B5BD6] transition-colors"
            >
              Go to {project.clientName} profile →
            </Link>
          </div>
        )}

        {/* HISTORY tab */}
        {activeTab === "history" && (
          <div className="rounded-xl border border-[#E8E8E5] bg-white p-6 shadow-card">
            <h3 className="mb-5 text-[14px] font-semibold text-[#0A0A0A]">Project History</h3>
            <div className="space-y-4">
              {[
                { date: project.createdAt, label: "Project created", color: "#5B5BD6" },
                { date: "2026-02-05", label: "Briefing submitted and analyzed", color: "#CA8A04" },
                { date: "2026-02-10", label: "Orchestrator generated pipeline and agent assignments", color: "#7C3AED" },
                { date: "2026-03-01", label: `Project advanced to ${project.stage}`, color: STAGE_COLORS[project.stage] },
              ].map((event, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2.5 w-2.5 rounded-full mt-1" style={{ backgroundColor: event.color }} />
                    {i < 3 && <div className="w-px flex-1 mt-1 bg-[#E8E8E5]" style={{ height: "24px" }} />}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-[#0A0A0A]">{event.label}</p>
                    <p className="text-[11px] text-[#A1A1AA]">{event.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
