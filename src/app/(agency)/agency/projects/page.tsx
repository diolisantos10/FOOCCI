"use client";

import { useState, useMemo } from "react";
import { FolderKanban, Plus, Search, ChevronDown, X } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_PROJECTS } from "@/lib/agency/mock-data";
import Link from "next/link";

const STAGE_META: Record<string, { label: string; color: string }> = {
  briefing:   { label: "Briefing",   color: "#A1A1AA" },
  diagnosis:  { label: "Diagnosis",  color: "#D97706" },
  planning:   { label: "Planning",   color: "#3B82F6" },
  production: { label: "Production", color: "#8B5CF6" },
  review:     { label: "Review",     color: "#F97316" },
  delivery:   { label: "Delivery",   color: "#0D9488" },
  ongoing:    { label: "Ongoing",    color: "#16A34A" },
  completed:  { label: "Completed",  color: "#A1A1AA" },
};

const STATUS_CHIPS = ["All", "Active", "At Risk", "Blocked", "Completed"] as const;
const STATUS_MAP: Record<string, string> = {
  "Active": "active", "At Risk": "at_risk", "Blocked": "blocked", "Completed": "completed",
};
const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const ALL_CLIENTS = Array.from(new Set(MOCK_PROJECTS.map((p) => p.clientName))).sort();
const ALL_STAGES  = ["briefing","diagnosis","planning","production","review","delivery","ongoing","completed"] as const;

export default function ProjectsPage() {
  const [statusFilter, setStatusFilter] = useState("All");
  const [clientFilter, setClientFilter] = useState("All");
  const [stageFilter,  setStageFilter]  = useState("All");
  const [search,       setSearch]       = useState("");
  const [sortBy,       setSortBy]       = useState<"deadline" | "priority">("deadline");

  const filtered = useMemo(() => {
    let list = [...MOCK_PROJECTS];
    if (statusFilter !== "All") list = list.filter((p) => p.status === STATUS_MAP[statusFilter]);
    if (clientFilter !== "All") list = list.filter((p) => p.clientName === clientFilter);
    if (stageFilter  !== "All") list = list.filter((p) => p.stage === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q) || p.goal.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) =>
      sortBy === "priority"
        ? (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
        : a.deadline.localeCompare(b.deadline),
    );
    return list;
  }, [statusFilter, clientFilter, stageFilter, search, sortBy]);

  const hasFilters = statusFilter !== "All" || clientFilter !== "All" || stageFilter !== "All" || !!search.trim();

  function clearFilters() {
    setStatusFilter("All"); setClientFilter("All"); setStageFilter("All"); setSearch("");
  }

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Projects"
          subtitle={`${filtered.length} of ${MOCK_PROJECTS.length} projects`}
          icon={FolderKanban}
        >
          <Link
            href="/agency/orchestrator"
            className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]"
          >
            <Plus size={13} />
            New Project
          </Link>
        </PageHeader>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#C0C0BC]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="h-[34px] w-52 rounded-lg border border-[#E5E5E2] bg-white pl-8 pr-3 text-[12px] text-[#0A0A0A] placeholder-[#C0C0BC] outline-none transition-colors focus:border-[#5B5BD6]"
            />
          </div>

          <div className="relative">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="h-[34px] cursor-pointer appearance-none rounded-lg border border-[#E5E5E2] bg-white pl-3 pr-7 text-[12px] text-[#52525B] outline-none transition-colors focus:border-[#5B5BD6]"
            >
              <option value="All">All Clients</option>
              {ALL_CLIENTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
          </div>

          <div className="relative">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="h-[34px] cursor-pointer appearance-none rounded-lg border border-[#E5E5E2] bg-white pl-3 pr-7 text-[12px] text-[#52525B] outline-none transition-colors focus:border-[#5B5BD6]"
            >
              <option value="All">All Stages</option>
              {ALL_STAGES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
          </div>

          <div className="relative ml-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "deadline" | "priority")}
              className="h-[34px] cursor-pointer appearance-none rounded-lg border border-[#E5E5E2] bg-white pl-3 pr-7 text-[12px] text-[#52525B] outline-none transition-colors focus:border-[#5B5BD6]"
            >
              <option value="deadline">Sort: Deadline</option>
              <option value="priority">Sort: Priority</option>
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-[11px] text-[#A1A1AA] transition-colors hover:text-[#52525B]"
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>

        {/* Status chips */}
        <div className="mb-5 flex items-center gap-1.5">
          {STATUS_CHIPS.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="rounded-[6px] px-3 py-1.5 text-[12px] font-medium transition-all"
              style={
                statusFilter === f
                  ? { backgroundColor: "#0A0A0A", color: "#FFFFFF" }
                  : { backgroundColor: "#FFFFFF", color: "#71717A", border: "1px solid #E5E5E2" }
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* Table */}
        <div
          className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white"
          style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
        >
          <div className="grid grid-cols-12 border-b border-[#F0F0EE] bg-[#FAFAF9] px-5 py-3">
            {[
              { label: "Project",  span: "col-span-4" },
              { label: "Client",   span: "col-span-2" },
              { label: "Stage",    span: "col-span-2" },
              { label: "Priority", span: "col-span-1" },
              { label: "Status",   span: "col-span-2" },
              { label: "Due",      span: "col-span-1" },
            ].map((col) => (
              <div key={col.label} className={`${col.span} text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]`}>
                {col.label}
              </div>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#F4F4F5]">
                <FolderKanban size={18} className="text-[#C0C0BC]" />
              </div>
              <p className="text-[13px] font-medium text-[#52525B]">No projects match your filters</p>
              <p className="mt-1 text-[11px] text-[#A1A1AA]">
                {hasFilters ? (
                  <>Try adjusting your criteria or{" "}
                    <button onClick={clearFilters} className="text-[#5B5BD6] underline underline-offset-2">clear all filters</button>.
                  </>
                ) : "Add a project via the Orchestrator to get started."}
              </p>
            </div>
          ) : (
            filtered.map((project, i) => {
              const stage = STAGE_META[project.stage] ?? { label: project.stage, color: "#A1A1AA" };
              return (
                <Link
                  key={project.id}
                  href={`/agency/projects/${project.id}`}
                  className="group grid grid-cols-12 items-center px-5 py-4 transition-colors hover:bg-[#FAFAF9]"
                  style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F5F5F3" : "none" }}
                >
                  <div className="col-span-4 min-w-0 pr-5">
                    <p className="truncate text-[13px] font-semibold text-[#0A0A0A] transition-colors group-hover:text-[#5B5BD6]">
                      {project.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#A1A1AA]">{project.goal}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="inline-flex rounded-[5px] bg-[#F4F4F5] px-[7px] py-[2px] text-[11px] font-medium text-[#52525B]">
                      {project.clientName}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: stage.color }}>
                      <span className="h-[5px] w-[5px] flex-none rounded-full" style={{ backgroundColor: stage.color }} />
                      {stage.label}
                    </span>
                  </div>
                  <div className="col-span-1"><Badge variant={project.priority} /></div>
                  <div className="col-span-2"><Badge variant={project.status} /></div>
                  <div className="col-span-1 mono-num text-[12px] text-[#A1A1AA]">{project.deadline.slice(5)}</div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
