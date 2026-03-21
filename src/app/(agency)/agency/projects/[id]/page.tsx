"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Bot, CheckSquare, FileDown, GitBranch,
  Layers, Lightbulb, Palette, Clock, Plus, AlertCircle,
  Calendar, Target, CheckCircle2, RefreshCw,
} from "lucide-react";
import {
  MOCK_PROJECTS, MOCK_TASKS, MOCK_DELIVERABLES, MOCK_AGENTS,
  TaskStatus, DeliverableStatus,
} from "@/lib/agency/mock-data";
import { Badge } from "@/components/agency/ui/Badge";
import Link from "next/link";

const STAGE_COLORS: Record<string, string> = {
  briefing:   "#A1A1AA", diagnosis:  "#D97706", planning:   "#3B82F6",
  production: "#8B5CF6", review:     "#F97316", delivery:   "#0D9488",
  ongoing:    "#16A34A", completed:  "#A1A1AA",
};

const PIPELINE_STAGES = [
  "briefing", "diagnosis", "planning", "production",
  "review", "delivery", "ongoing", "completed",
];

type Tab = "overview" | "pipeline" | "tasks" | "deliverables" | "strategy" | "assets" | "history";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "overview",     label: "Overview",     icon: Layers },
  { key: "pipeline",     label: "Pipeline",     icon: GitBranch },
  { key: "tasks",        label: "Tasks",        icon: CheckSquare },
  { key: "deliverables", label: "Deliverables", icon: FileDown },
  { key: "strategy",     label: "Strategy",     icon: Lightbulb },
  { key: "assets",       label: "Assets",       icon: Palette },
  { key: "history",      label: "History",      icon: Clock },
];

const TASK_STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  pending: "in_progress", in_progress: "done", done: "pending", blocked: "pending",
};

const DELIVERABLE_STATUS_CYCLE: Record<DeliverableStatus, DeliverableStatus> = {
  draft: "in_review", in_review: "approved", approved: "delivered", delivered: "draft",
};

const DELIVERABLE_STATUS_META: Record<DeliverableStatus, { label: string; bg: string; text: string }> = {
  draft:     { label: "Draft",     bg: "#F4F4F5", text: "#71717A" },
  in_review: { label: "In Review", bg: "#FFF7ED", text: "#C2410C" },
  approved:  { label: "Approved",  bg: "#F0FDF4", text: "#15803D" },
  delivered: { label: "Delivered", bg: "#EFF6FF", text: "#1D4ED8" },
};

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [taskStatuses,        setTaskStatuses]        = useState<Record<string, TaskStatus>>({});
  const [deliverableStatuses, setDeliverableStatuses] = useState<Record<string, DeliverableStatus>>({});

  const project = MOCK_PROJECTS.find((p) => p.id === params.id);
  if (!project) notFound();

  const tasks        = MOCK_TASKS.filter((t) => t.projectId === project.id);
  const deliverables = MOCK_DELIVERABLES.filter((d) => d.projectId === project.id);
  const agents       = MOCK_AGENTS.filter((a) => project.assignedAgents.includes(a.id));
  const stageIndex   = PIPELINE_STAGES.indexOf(project.stage);
  const stageColor   = STAGE_COLORS[project.stage] ?? "#A1A1AA";

  function getTaskStatus(id: string, orig: TaskStatus): TaskStatus {
    return taskStatuses[id] ?? orig;
  }
  function cycleTask(id: string, orig: TaskStatus) {
    const current = getTaskStatus(id, orig);
    setTaskStatuses((prev) => ({ ...prev, [id]: TASK_STATUS_CYCLE[current] }));
  }

  function getDeliverableStatus(id: string, orig: DeliverableStatus): DeliverableStatus {
    return deliverableStatuses[id] ?? orig;
  }
  function cycleDeliverable(id: string, orig: DeliverableStatus) {
    const current = getDeliverableStatus(id, orig);
    setDeliverableStatuses((prev) => ({ ...prev, [id]: DELIVERABLE_STATUS_CYCLE[current] }));
  }

  const tasksDone    = tasks.filter((t) => getTaskStatus(t.id, t.status) === "done").length;
  const tasksTotal   = tasks.length;
  const progressPct  = tasksTotal > 0 ? (tasksDone / tasksTotal) * 100 : 0;

  return (
    <div className="flex min-h-full flex-col" style={{ backgroundColor: "#F5F5F3" }}>

      {/* ── Project Header ─────────────────────────────────────────── */}
      <div className="border-b border-[#E5E5E2] bg-white">
        <div className="px-8 pt-5 pb-0">
          <Link
            href="/agency/projects"
            className="mb-4 flex items-center gap-1.5 text-[11px] font-medium text-[#A1A1AA] transition-colors hover:text-[#52525B]"
          >
            <ArrowLeft size={12} />
            Projects
          </Link>

          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h1 className="text-[20px] font-bold text-[#0A0A0A]" style={{ letterSpacing: "-0.02em" }}>
                  {project.name}
                </h1>
                <Badge variant={project.status} />
                <Badge variant={project.priority} />
              </div>
              <p className="text-[13px] leading-snug text-[#71717A]">{project.goal}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-4 text-[12px] text-[#A1A1AA]">
                <span className="font-medium text-[#52525B]">{project.clientName}</span>
                <span className="flex items-center gap-1.5">
                  <Calendar size={11} /> Due {project.deadline}
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckSquare size={11} />
                  <span className="mono-num">{tasksDone}/{tasksTotal}</span> tasks
                </span>
              </div>
            </div>
            <div className="flex flex-none gap-2">
              <button className="rounded-lg border border-[#E5E5E2] bg-white px-3.5 py-2 text-[12px] font-medium text-[#52525B] transition-colors hover:border-[#D0D0CC]">
                Edit
              </button>
              <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]">
                <Plus size={13} /> Add Task
              </button>
            </div>
          </div>

          {/* Pipeline progress */}
          <div className="mt-6 flex items-end gap-0">
            {PIPELINE_STAGES.map((stage, i) => {
              const isPast    = i < stageIndex;
              const isCurrent = i === stageIndex;
              return (
                <div key={stage} className="flex flex-1 flex-col items-start">
                  <div
                    className="mb-1.5 h-[3px] w-full rounded-sm"
                    style={{ backgroundColor: isPast ? "#5B5BD6" : isCurrent ? stageColor : "#EDEDED" }}
                  />
                  <span
                    className="pb-1 text-[9px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: isCurrent ? stageColor : isPast ? "#5B5BD6" : "#C0C0BC" }}
                  >
                    {stage}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 px-8">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-[12.5px] font-medium transition-colors"
              style={{
                borderBottomColor: activeTab === key ? "#5B5BD6" : "transparent",
                color: activeTab === key ? "#5B5BD6" : "#A1A1AA",
              }}
            >
              <Icon size={12} strokeWidth={activeTab === key ? 2 : 1.75} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────── */}
      <div className="flex-1 px-8 py-6">

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2 space-y-4">

              {/* Goal */}
              <div className="rounded-xl border border-[#E5E5E2] bg-white p-5" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
                <div className="mb-3 flex items-center gap-2">
                  <Target size={13} className="text-[#5B5BD6]" />
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#A1A1AA]">Objective</h3>
                </div>
                <p className="text-[13px] leading-relaxed text-[#52525B]">{project.description}</p>
              </div>

              {/* Tasks snapshot */}
              <div className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
                <div className="flex items-center justify-between border-b border-[#F0F0EE] px-5 py-3.5">
                  <h3 className="text-[13px] font-semibold text-[#0A0A0A]">Tasks</h3>
                  <div className="flex items-center gap-3">
                    <span className="mono-num text-[11px] text-[#A1A1AA]">{tasksDone} of {tasksTotal} done</span>
                    <button onClick={() => setActiveTab("tasks")} className="text-[11px] font-medium text-[#5B5BD6] hover:underline">
                      View all
                    </button>
                  </div>
                </div>
                {tasksTotal > 0 && (
                  <div className="h-[3px] bg-[#F0F0EE]">
                    <div className="h-full bg-[#5B5BD6] transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                )}
                <div>
                  {tasks.slice(0, 4).map((task, i) => {
                    const status   = getTaskStatus(task.id, task.status);
                    const isDone   = status === "done";
                    const isBlocked = status === "blocked";
                    const isInProg  = status === "in_progress";
                    return (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-5 py-3.5"
                        style={{ borderBottom: i < Math.min(tasksTotal, 4) - 1 ? "1px solid #F5F5F3" : "none" }}
                      >
                        <button onClick={() => cycleTask(task.id, task.status)} className="flex-none">
                          <div
                            className="flex h-[14px] w-[14px] items-center justify-center rounded-[3px] border-[1.5px] transition-all hover:opacity-70"
                            style={{
                              borderColor: isBlocked ? "#DC2626" : isDone ? "#16A34A" : isInProg ? "#5B5BD6" : "#D0D0CC",
                              backgroundColor: isDone ? "#DCFCE7" : isBlocked ? "#FEE2E2" : isInProg ? "#EEEEFD" : "transparent",
                            }}
                          >
                            {isDone    && <CheckCircle2 size={9} style={{ color: "#16A34A" }} strokeWidth={2.5} />}
                            {isInProg  && <span className="h-[5px] w-[5px] rounded-full bg-[#5B5BD6]" />}
                            {isBlocked && <AlertCircle  size={9} style={{ color: "#DC2626" }} strokeWidth={2.5} />}
                          </div>
                        </button>
                        <p
                          className="flex-1 text-[13px] font-medium text-[#0A0A0A] transition-all"
                          style={{ opacity: isDone ? 0.4 : 1, textDecoration: isDone ? "line-through" : "none" }}
                        >
                          {task.title}
                        </p>
                        <Badge variant={status} />
                      </div>
                    );
                  })}
                  {tasksTotal === 0 && (
                    <div className="flex flex-col items-center justify-center px-5 py-10">
                      <CheckSquare size={20} className="mb-2 text-[#E5E5E2]" />
                      <p className="text-[12px] text-[#A1A1AA]">No tasks yet for this project.</p>
                      <p className="mt-0.5 text-[11px] text-[#C0C0BC]">Tasks will appear here once the Orchestrator assigns them.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Deliverables snapshot */}
              {deliverables.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
                  <div className="flex items-center justify-between border-b border-[#F0F0EE] px-5 py-3.5">
                    <h3 className="text-[13px] font-semibold text-[#0A0A0A]">Deliverables</h3>
                    <button onClick={() => setActiveTab("deliverables")} className="text-[11px] font-medium text-[#5B5BD6] hover:underline">
                      View all
                    </button>
                  </div>
                  {deliverables.map((d, i) => {
                    const dStatus = getDeliverableStatus(d.id, d.status);
                    const dMeta   = DELIVERABLE_STATUS_META[dStatus];
                    return (
                      <div
                        key={d.id}
                        className="flex items-center gap-3 px-5 py-3.5"
                        style={{ borderBottom: i < deliverables.length - 1 ? "1px solid #F5F5F3" : "none" }}
                      >
                        <div className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#EEEEFD]">
                          <FileDown size={12} className="text-[#5B5BD6]" />
                        </div>
                        <p className="flex-1 text-[13px] font-medium text-[#0A0A0A]">{d.name}</p>
                        <span className="text-[11px] text-[#A1A1AA]">{d.type}</span>
                        <button
                          onClick={() => cycleDeliverable(d.id, d.status)}
                          className="rounded-[5px] px-[7px] py-[2px] text-[11px] font-semibold transition-all hover:opacity-75"
                          style={{ backgroundColor: dMeta.bg, color: dMeta.text }}
                          title="Click to advance status"
                        >
                          {dMeta.label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Agents */}
              <div className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
                <div className="border-b border-[#F0F0EE] px-5 py-3.5">
                  <h3 className="text-[13px] font-semibold text-[#0A0A0A]">Assigned Agents</h3>
                </div>
                {agents.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <Bot size={20} className="mx-auto mb-2 text-[#E5E5E2]" />
                    <p className="text-[12px] text-[#A1A1AA]">No agents assigned yet.</p>
                  </div>
                ) : (
                  <div>
                    {agents.map((agent, i) => (
                      <div
                        key={agent.id}
                        className="flex items-center gap-3 px-5 py-3"
                        style={{ borderBottom: i < agents.length - 1 ? "1px solid #F5F5F3" : "none" }}
                      >
                        <div
                          className="flex h-7 w-7 flex-none items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${agent.color}15` }}
                        >
                          <Bot size={12} style={{ color: agent.color }} />
                        </div>
                        <div>
                          <p className="text-[12px] font-semibold text-[#0A0A0A]">{agent.name}</p>
                          <p className="text-[10px] text-[#A1A1AA]">{agent.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="rounded-xl border border-[#E5E5E2] bg-white p-5" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
                <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#A1A1AA]">At a Glance</h3>
                <div className="space-y-2.5">
                  {[
                    { label: "Tasks total",   value: tasksTotal },
                    { label: "Tasks done",    value: tasksDone },
                    { label: "Blocked",       value: tasks.filter((t) => getTaskStatus(t.id, t.status) === "blocked").length },
                    { label: "Deliverables",  value: deliverables.length },
                    { label: "Agents active", value: agents.length },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center justify-between">
                      <span className="text-[12px] text-[#71717A]">{s.label}</span>
                      <span className="mono-num text-[13px] font-bold text-[#0A0A0A]">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PIPELINE */}
        {activeTab === "pipeline" && (
          <div className="rounded-xl border border-[#E5E5E2] bg-white p-6" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
            <h3 className="mb-1 text-[14px] font-semibold text-[#0A0A0A]">Execution Pipeline</h3>
            <p className="mb-6 text-[12px] text-[#A1A1AA]">
              Current stage: <span className="font-semibold capitalize" style={{ color: stageColor }}>{project.stage}</span>
            </p>
            <div className="space-y-2">
              {PIPELINE_STAGES.map((stage, i) => {
                const isPast    = i < stageIndex;
                const isCurrent = i === stageIndex;
                const color     = isCurrent ? stageColor : isPast ? "#5B5BD6" : "#E5E5E2";
                return (
                  <div
                    key={stage}
                    className="flex items-center gap-4 rounded-xl border px-5 py-4"
                    style={{
                      borderColor: isCurrent ? stageColor : "#E5E5E2",
                      backgroundColor: isCurrent ? `${stageColor}06` : "#FAFAF9",
                    }}
                  >
                    <div
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-bold"
                      style={{ backgroundColor: color, color: isPast || isCurrent ? "white" : "#A1A1AA" }}
                    >
                      {isPast ? "✓" : i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold capitalize" style={{ color: isCurrent ? stageColor : isPast ? "#0A0A0A" : "#A1A1AA" }}>
                        {stage}
                      </p>
                      {isCurrent && <p className="text-[11px]" style={{ color: stageColor }}>In progress</p>}
                    </div>
                    {isCurrent && (
                      <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: stageColor }}>
                        Active
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TASKS */}
        {activeTab === "tasks" && (
          <div className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
            <div className="flex items-center justify-between border-b border-[#F0F0EE] px-5 py-4">
              <div>
                <h3 className="text-[13px] font-semibold text-[#0A0A0A]">Tasks</h3>
                <p className="mono-num text-[11px] text-[#A1A1AA]">{tasksDone} of {tasksTotal} completed</p>
              </div>
              <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#4848C2]">
                <Plus size={12} /> Add task
              </button>
            </div>

            {/* Progress */}
            {tasksTotal > 0 && (
              <div className="h-[3px] bg-[#F0F0EE]">
                <div className="h-full bg-[#5B5BD6] transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
            )}

            {tasksTotal === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-14">
                <CheckSquare size={24} className="mb-3 text-[#E5E5E2]" />
                <p className="text-[13px] font-medium text-[#52525B]">No tasks yet</p>
                <p className="mt-1 text-[11px] text-[#A1A1AA]">Use the Orchestrator to generate a task breakdown for this project.</p>
              </div>
            ) : (
              tasks.map((task, i) => {
                const status   = getTaskStatus(task.id, task.status);
                const isDone   = status === "done";
                const isBlocked = status === "blocked";
                const isInProg  = status === "in_progress";
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[#FAFAF9]"
                    style={{ borderBottom: i < tasksTotal - 1 ? "1px solid #F5F5F3" : "none" }}
                  >
                    <button onClick={() => cycleTask(task.id, task.status)} className="mt-0.5 flex-none">
                      <div
                        className="flex h-[14px] w-[14px] items-center justify-center rounded-[3px] border-[1.5px] transition-all hover:opacity-70"
                        style={{
                          borderColor: isBlocked ? "#DC2626" : isDone ? "#16A34A" : isInProg ? "#5B5BD6" : "#D0D0CC",
                          backgroundColor: isDone ? "#DCFCE7" : isBlocked ? "#FEE2E2" : isInProg ? "#EEEEFD" : "transparent",
                        }}
                      >
                        {isDone    && <CheckCircle2 size={9} style={{ color: "#16A34A" }} strokeWidth={2.5} />}
                        {isInProg  && <span className="h-[5px] w-[5px] rounded-full bg-[#5B5BD6]" />}
                        {isBlocked && <AlertCircle  size={9} style={{ color: "#DC2626" }} strokeWidth={2.5} />}
                      </div>
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[13px] font-medium text-[#0A0A0A] transition-all"
                        style={{ opacity: isDone ? 0.4 : 1, textDecoration: isDone ? "line-through" : "none" }}
                      >
                        {task.title}
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#71717A]">{task.description}</p>
                      <div className="mt-1.5 flex items-center gap-2.5">
                        <span className="text-[11px] text-[#A1A1AA]">{task.agentName}</span>
                        {isBlocked && (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-[#DC2626]">
                            <AlertCircle size={10} /> Blocked
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={status} />
                      <Badge variant={task.priority} />
                      <span className="mono-num text-[11px] text-[#A1A1AA]">{task.dueDate.slice(5)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* DELIVERABLES */}
        {activeTab === "deliverables" && (
          <div className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
            <div className="flex items-center justify-between border-b border-[#F0F0EE] px-5 py-4">
              <div>
                <h3 className="text-[13px] font-semibold text-[#0A0A0A]">Deliverables</h3>
                <p className="text-[11px] text-[#A1A1AA]">{deliverables.length} produced for this project</p>
              </div>
              <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#4848C2]">
                <Plus size={12} /> Log deliverable
              </button>
            </div>
            {deliverables.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-14">
                <FileDown size={24} className="mb-3 text-[#E5E5E2]" />
                <p className="text-[13px] font-medium text-[#52525B]">No deliverables yet</p>
                <p className="mt-1 text-[11px] text-[#A1A1AA]">Outputs produced by agents will be logged here as the project progresses.</p>
              </div>
            ) : (
              deliverables.map((d, i) => {
                const dStatus = getDeliverableStatus(d.id, d.status);
                const dMeta   = DELIVERABLE_STATUS_META[dStatus];
                return (
                  <div
                    key={d.id}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[#FAFAF9]"
                    style={{ borderBottom: i < deliverables.length - 1 ? "1px solid #F5F5F3" : "none" }}
                  >
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#EEEEFD]">
                      <FileDown size={14} className="text-[#5B5BD6]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[#0A0A0A]">{d.name}</p>
                      <p className="text-[11px] text-[#A1A1AA]">{d.type} · {d.agentName} · {d.producedAt}</p>
                    </div>
                    <button
                      onClick={() => cycleDeliverable(d.id, d.status)}
                      className="flex items-center gap-1.5 rounded-[5px] px-[7px] py-[2px] transition-all hover:opacity-75"
                      title="Click to advance status"
                      style={{ backgroundColor: dMeta.bg, color: dMeta.text }}
                    >
                      <span className="text-[11px] font-semibold">{dMeta.label}</span>
                      <RefreshCw size={9} className="flex-none opacity-50" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* STRATEGY */}
        {activeTab === "strategy" && (
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: "Business Objective", content: project.goal,        color: "#5B5BD6", label: "Goal" },
              { title: "Project Scope",       content: project.description, color: "#8B5CF6", label: "Scope" },
              {
                title: "Success Criteria",
                content: "To be defined during the diagnosis and planning stages with the Marketing Strategist Agent.",
                color: "#0D9488", label: "Success",
              },
              {
                title: "Risks & Dependencies",
                content: "No risks currently flagged. Orchestrator analysis will surface blockers as the project progresses.",
                color: "#D97706", label: "Risks",
              },
            ].map((card) => (
              <div key={card.title} className="rounded-xl border border-[#E5E5E2] bg-white p-5" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
                <div className="mb-3">
                  <span
                    className="inline-flex rounded-[5px] px-[7px] py-[2px] text-[10px] font-semibold uppercase tracking-[0.06em]"
                    style={{ backgroundColor: `${card.color}12`, color: card.color }}
                  >
                    {card.label}
                  </span>
                </div>
                <h3 className="mb-2 text-[13px] font-semibold text-[#0A0A0A]">{card.title}</h3>
                <p className="text-[13px] leading-relaxed text-[#52525B]">{card.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* ASSETS */}
        {activeTab === "assets" && (
          <div className="rounded-xl border border-[#E5E5E2] bg-white p-6" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
            <h3 className="mb-1 text-[14px] font-semibold text-[#0A0A0A]">Brand Assets</h3>
            <p className="mb-5 text-[12px] text-[#A1A1AA]">
              Brand assets for {project.clientName} are managed in the client profile.
            </p>
            <Link
              href={`/agency/clients/${project.clientId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E2] px-3.5 py-2 text-[12px] font-medium text-[#52525B] transition-colors hover:border-[#5B5BD6] hover:text-[#5B5BD6]"
            >
              Open {project.clientName} profile →
            </Link>
          </div>
        )}

        {/* HISTORY */}
        {activeTab === "history" && (
          <div className="rounded-xl border border-[#E5E5E2] bg-white p-6" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
            <h3 className="mb-5 text-[14px] font-semibold text-[#0A0A0A]">Project History</h3>
            <div className="space-y-0">
              {[
                { date: project.createdAt, label: "Project created and registered in OS", color: "#5B5BD6" },
                { date: "2026-02-05", label: "Briefing submitted and analyzed by Orchestrator", color: "#D97706" },
                { date: "2026-02-10", label: "Pipeline defined and agents assigned", color: "#8B5CF6" },
                { date: "2026-03-01", label: `Advanced to ${project.stage} stage`, color: STAGE_COLORS[project.stage] ?? "#A1A1AA" },
              ].map((event, i, arr) => (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="mt-1 h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: event.color }} />
                    {i < arr.length - 1 && <div className="my-1 w-px flex-1 bg-[#F0F0EE]" />}
                  </div>
                  <div className="pb-5">
                    <p className="text-[13px] font-medium text-[#0A0A0A]">{event.label}</p>
                    <p className="mono-num mt-0.5 text-[11px] text-[#A1A1AA]">{event.date}</p>
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
