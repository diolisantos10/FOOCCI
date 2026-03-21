"use client";

import { useState, useMemo } from "react";
import {
  CheckSquare, Plus, Search, ChevronDown, X, AlertCircle, CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_TASKS, TaskStatus } from "@/lib/agency/mock-data";
import Link from "next/link";

const GROUPS = [
  { key: "blocked",     label: "Blocked",     color: "#DC2626" },
  { key: "in_progress", label: "In Progress", color: "#5B5BD6" },
  { key: "pending",     label: "Pending",     color: "#A1A1AA" },
  { key: "done",        label: "Done",        color: "#16A34A" },
] as const;

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  pending:     "in_progress",
  in_progress: "done",
  done:        "pending",
  blocked:     "pending",
};

const ALL_PROJECTS = Array.from(new Set(MOCK_TASKS.map((t) => t.projectName))).sort();
const ALL_AGENTS   = Array.from(new Set(MOCK_TASKS.map((t) => t.agentName))).sort();

export default function TasksPage() {
  const [localStatuses, setLocalStatuses] = useState<Record<string, TaskStatus>>({});
  const [filterGroup,   setFilterGroup]   = useState("all");
  const [filterProject, setFilterProject] = useState("All");
  const [filterAgent,   setFilterAgent]   = useState("All");
  const [search,        setSearch]        = useState("");

  function getStatus(id: string, orig: TaskStatus): TaskStatus {
    return localStatuses[id] ?? orig;
  }

  function cycleStatus(id: string, current: TaskStatus) {
    setLocalStatuses((prev) => ({ ...prev, [id]: STATUS_CYCLE[current] }));
  }

  const filteredTasks = useMemo(() => {
    return MOCK_TASKS.filter((t) => {
      const status = localStatuses[t.id] ?? t.status;
      if (filterGroup !== "all" && status !== filterGroup) return false;
      if (filterProject !== "All" && t.projectName !== filterProject) return false;
      if (filterAgent   !== "All" && t.agentName   !== filterAgent)   return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [localStatuses, filterGroup, filterProject, filterAgent, search]);

  const openCount = MOCK_TASKS.filter((t) => getStatus(t.id, t.status) !== "done").length;
  const doneCount = MOCK_TASKS.filter((t) => getStatus(t.id, t.status) === "done").length;
  const hasFilters = filterGroup !== "all" || filterProject !== "All" || filterAgent !== "All" || !!search.trim();

  function clearFilters() {
    setFilterGroup("all"); setFilterProject("All"); setFilterAgent("All"); setSearch("");
  }

  const visibleGroups = GROUPS.filter((g) => filterGroup === "all" || filterGroup === g.key);

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Tasks"
          subtitle={`${openCount} open · ${doneCount} completed`}
          icon={CheckSquare}
          iconColor="#0D9488"
        >
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]">
            <Plus size={13} />
            Add Task
          </button>
        </PageHeader>

        {/* Toolbar */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#C0C0BC]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="h-[34px] w-48 rounded-lg border border-[#E5E5E2] bg-white pl-8 pr-3 text-[12px] text-[#0A0A0A] placeholder-[#C0C0BC] outline-none transition-colors focus:border-[#5B5BD6]"
            />
          </div>

          {/* Status */}
          <div className="relative">
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="h-[34px] cursor-pointer appearance-none rounded-lg border border-[#E5E5E2] bg-white pl-3 pr-7 text-[12px] text-[#52525B] outline-none transition-colors focus:border-[#5B5BD6]"
            >
              <option value="all">All Status</option>
              {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
          </div>

          {/* Project */}
          <div className="relative">
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="h-[34px] cursor-pointer appearance-none rounded-lg border border-[#E5E5E2] bg-white pl-3 pr-7 text-[12px] text-[#52525B] outline-none transition-colors focus:border-[#5B5BD6]"
            >
              <option value="All">All Projects</option>
              {ALL_PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
          </div>

          {/* Agent */}
          <div className="relative">
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="h-[34px] cursor-pointer appearance-none rounded-lg border border-[#E5E5E2] bg-white pl-3 pr-7 text-[12px] text-[#52525B] outline-none transition-colors focus:border-[#5B5BD6]"
            >
              <option value="All">All Agents</option>
              {ALL_AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-[11px] text-[#A1A1AA] transition-colors hover:text-[#52525B]">
              <X size={11} /> Clear
            </button>
          )}
        </div>

        {/* Empty state (no results at all) */}
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#EAEAE8] py-16">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#F4F4F5]">
              <CheckSquare size={18} className="text-[#C0C0BC]" />
            </div>
            <p className="text-[13px] font-medium text-[#52525B]">No tasks found</p>
            <p className="mt-1 text-[11px] text-[#A1A1AA]">
              {hasFilters ? (
                <button onClick={clearFilters} className="text-[#5B5BD6] underline underline-offset-2">Clear filters</button>
              ) : "Tasks from active projects will appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {visibleGroups.map((group) => {
              const tasks = filteredTasks.filter((t) => getStatus(t.id, t.status) === group.key);
              if (tasks.length === 0) return null;

              return (
                <div key={group.key}>
                  {/* Group label */}
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: group.color }} />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: group.color }}>
                      {group.label}
                    </span>
                    <span className="rounded-full bg-[#F4F4F5] px-2 py-0.5 text-[10px] font-semibold text-[#A1A1AA]">
                      {tasks.length}
                    </span>
                  </div>

                  <div
                    className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white"
                    style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
                  >
                    {tasks.map((task, i) => {
                      const status   = getStatus(task.id, task.status);
                      const isDone   = status === "done";
                      const isBlocked = status === "blocked";
                      const isInProg  = status === "in_progress";

                      const checkBorderColor = isBlocked ? "#DC2626" : isDone ? "#16A34A" : isInProg ? "#5B5BD6" : "#D0D0CC";
                      const checkBgColor     = isDone ? "#DCFCE7" : isBlocked ? "#FEE2E2" : isInProg ? "#EEEEFD" : "transparent";

                      return (
                        <div
                          key={task.id}
                          className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[#FAFAF9]"
                          style={{ borderBottom: i < tasks.length - 1 ? "1px solid #F5F5F3" : "none" }}
                        >
                          {/* Clickable checkbox */}
                          <button
                            onClick={() => cycleStatus(task.id, status)}
                            className="mt-0.5 flex-none"
                            title={isDone ? "Mark pending" : isBlocked ? "Unblock" : "Advance status"}
                          >
                            <div
                              className="flex h-[16px] w-[16px] items-center justify-center rounded-[4px] border-[1.5px] transition-all hover:opacity-70"
                              style={{ borderColor: checkBorderColor, backgroundColor: checkBgColor }}
                            >
                              {isDone    && <CheckCircle2 size={10} style={{ color: "#16A34A" }} strokeWidth={2.5} />}
                              {isInProg  && <span className="h-[6px] w-[6px] rounded-full bg-[#5B5BD6]" />}
                              {isBlocked && <AlertCircle  size={10} style={{ color: "#DC2626" }} strokeWidth={2.5} />}
                            </div>
                          </button>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-[13px] font-medium text-[#0A0A0A] transition-all"
                              style={{ opacity: isDone ? 0.4 : 1, textDecoration: isDone ? "line-through" : "none" }}
                            >
                              {task.title}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-[#A1A1AA]">{task.description}</p>
                            <div className="mt-1.5 flex items-center gap-2">
                              <Link
                                href={`/agency/projects/${task.projectId}`}
                                className="text-[11px] font-medium text-[#5B5BD6] hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {task.clientName}
                              </Link>
                              <span className="text-[#E0E0E0]">·</span>
                              <span className="text-[11px] text-[#A1A1AA]">{task.agentName}</span>
                            </div>
                          </div>

                          {/* Meta */}
                          <div className="flex flex-none items-center gap-2">
                            <Badge variant={task.priority} />
                            <span className="mono-num text-[11px] text-[#A1A1AA]">{task.dueDate.slice(5)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
