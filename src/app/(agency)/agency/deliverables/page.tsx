"use client";

import { useState, useMemo } from "react";
import { FileDown, Plus, Search, ChevronDown, X, ExternalLink, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { DeliverableStatus } from "@/lib/agency/mock-data";
import { useAgencyStore } from "@/lib/agency/store";
import Link from "next/link";

const TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  "Strategy Document": { bg: "#F3E8FF", text: "#6D28D9" },
  "Copywriting":       { bg: "#CCFBF1", text: "#0F766E" },
  "Brand Document":    { bg: "#FFEDD5", text: "#C2410C" },
  "Performance Report":{ bg: "#EEF2FF", text: "#4338CA" },
  "Design Files":      { bg: "#FEF9C3", text: "#A16207" },
};

const STATUS_META: Record<DeliverableStatus, { label: string; bg: string; text: string; next: string }> = {
  draft:     { label: "Draft",     bg: "#F4F4F5", text: "#71717A",  next: "→ In Review" },
  in_review: { label: "In Review", bg: "#FFF7ED", text: "#C2410C",  next: "→ Approved"  },
  approved:  { label: "Approved",  bg: "#F0FDF4", text: "#15803D",  next: "→ Delivered" },
  delivered: { label: "Delivered", bg: "#EFF6FF", text: "#1D4ED8",  next: "→ Draft"     },
};

const STATUS_CYCLE: Record<DeliverableStatus, DeliverableStatus> = {
  draft: "in_review", in_review: "approved", approved: "delivered", delivered: "draft",
};

// (computed dynamically from store below)
const ALL_STATUSES: { key: DeliverableStatus; label: string }[] = [
  { key: "draft",     label: "Draft" },
  { key: "in_review", label: "In Review" },
  { key: "approved",  label: "Approved" },
  { key: "delivered", label: "Delivered" },
];

export default function DeliverablesPage() {
  const { deliverables: allDeliverables, updateDeliverableStatus } = useAgencyStore();

  const ALL_TYPES    = useMemo(() => Array.from(new Set(allDeliverables.map((d) => d.type))).sort(),        [allDeliverables]);
  const ALL_PROJECTS = useMemo(() => Array.from(new Set(allDeliverables.map((d) => d.projectName))).sort(), [allDeliverables]);

  const [filterStatus,  setFilterStatus]  = useState("All");
  const [filterType,    setFilterType]    = useState("All");
  const [filterProject, setFilterProject] = useState("All");
  const [search,        setSearch]        = useState("");

  function cycleStatus(id: string, current: DeliverableStatus) {
    updateDeliverableStatus(id, STATUS_CYCLE[current]);
  }

  const filtered = useMemo(() => {
    return allDeliverables.filter((d) => {
      const status = d.status;
      if (filterStatus  !== "All" && status    !== filterStatus)  return false;
      if (filterType    !== "All" && d.type    !== filterType)    return false;
      if (filterProject !== "All" && d.projectName !== filterProject) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!d.name.toLowerCase().includes(q) && !d.projectName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allDeliverables, filterStatus, filterType, filterProject, search]);

  const hasFilters = filterStatus !== "All" || filterType !== "All" || filterProject !== "All" || !!search.trim();

  function clearFilters() {
    setFilterStatus("All"); setFilterType("All"); setFilterProject("All"); setSearch("");
  }

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Deliverables"
          subtitle={`${filtered.length} of ${allDeliverables.length} outputs`}
          icon={FileDown}
          iconColor="#5B5BD6"
        >
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]">
            <Plus size={13} />
            Log Deliverable
          </button>
        </PageHeader>

        {/* Toolbar */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#C0C0BC]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deliverables..."
              className="h-[34px] w-52 rounded-lg border border-[#E5E5E2] bg-white pl-8 pr-3 text-[12px] text-[#0A0A0A] placeholder-[#C0C0BC] outline-none transition-colors focus:border-[#5B5BD6]"
            />
          </div>

          {/* Status */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-[34px] cursor-pointer appearance-none rounded-lg border border-[#E5E5E2] bg-white pl-3 pr-7 text-[12px] text-[#52525B] outline-none transition-colors focus:border-[#5B5BD6]"
            >
              <option value="All">All Status</option>
              {ALL_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
          </div>

          {/* Type */}
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-[34px] cursor-pointer appearance-none rounded-lg border border-[#E5E5E2] bg-white pl-3 pr-7 text-[12px] text-[#52525B] outline-none transition-colors focus:border-[#5B5BD6]"
            >
              <option value="All">All Types</option>
              {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-[11px] text-[#A1A1AA] transition-colors hover:text-[#52525B]">
              <X size={11} /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div
          className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white"
          style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
        >
          <div className="grid grid-cols-12 border-b border-[#F0F0EE] bg-[#FAFAF9] px-5 py-3">
            {[
              { label: "Deliverable", span: "col-span-4" },
              { label: "Project",     span: "col-span-3" },
              { label: "Type",        span: "col-span-2" },
              { label: "Status",      span: "col-span-2" },
              { label: "Date",        span: "col-span-1" },
            ].map((col, i) => (
              <div key={i} className={`${col.span} text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]`}>
                {col.label}
              </div>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EEEEFD]">
                <FileDown size={18} className="text-[#A1A1AA]" />
              </div>
              <p className="text-[13px] font-medium text-[#52525B]">No deliverables found</p>
              <p className="mt-1 text-[11px] text-[#A1A1AA]">
                {hasFilters ? (
                  <button onClick={clearFilters} className="text-[#5B5BD6] underline underline-offset-2">Clear filters</button>
                ) : "Deliverables produced by agents will appear here."}
              </p>
            </div>
          ) : (
            filtered.map((d, i) => {
              const typeStyle    = TYPE_STYLE[d.type] ?? { bg: "#F4F4F5", text: "#52525B" };
              const currentStatus = d.status;
              const statusMeta   = STATUS_META[currentStatus];
              return (
                <div
                  key={d.id}
                  className="grid grid-cols-12 items-center px-5 py-4 transition-colors hover:bg-[#FAFAF9]"
                  style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F5F5F3" : "none" }}
                >
                  {/* Name */}
                  <div className="col-span-4 flex min-w-0 items-center gap-3 pr-4">
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#EEEEFD]">
                      <FileDown size={13} className="text-[#5B5BD6]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[#0A0A0A]">{d.name}</p>
                      <p className="text-[10px] text-[#A1A1AA]">{d.agentName}</p>
                    </div>
                  </div>

                  {/* Project */}
                  <div className="col-span-3 min-w-0 pr-4">
                    <Link
                      href={`/agency/projects/${d.projectId}`}
                      className="block truncate text-[12px] font-medium text-[#5B5BD6] hover:underline"
                    >
                      {d.projectName}
                    </Link>
                    <p className="text-[10px] text-[#A1A1AA]">{d.clientName}</p>
                  </div>

                  {/* Type */}
                  <div className="col-span-2">
                    <span
                      className="inline-flex rounded-[5px] px-[7px] py-[2px] text-[10px] font-semibold"
                      style={{ backgroundColor: typeStyle.bg, color: typeStyle.text }}
                    >
                      {d.type}
                    </span>
                  </div>

                  {/* Status — clickable to cycle */}
                  <div className="col-span-2">
                    <button
                      onClick={() => cycleStatus(d.id, currentStatus)}
                      className="group/s flex items-center gap-1.5 rounded-[5px] px-[7px] py-[2px] transition-all hover:opacity-80"
                      title={`${statusMeta.next}`}
                      style={{ backgroundColor: statusMeta.bg, color: statusMeta.text }}
                    >
                      <span className="text-[11px] font-semibold">{statusMeta.label}</span>
                      <RefreshCw
                        size={8}
                        className="flex-none opacity-0 transition-opacity group-hover/s:opacity-70"
                      />
                    </button>
                  </div>

                  {/* Date */}
                  <div className="mono-num text-[11px] text-[#A1A1AA]">{d.producedAt.slice(5)}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Legend */}
        {allDeliverables.length > 0 && (
          <p className="mt-3 text-[10px] text-[#C0C0BC]">
            Click a status badge to advance it through the workflow: Draft → In Review → Approved → Delivered
          </p>
        )}
      </div>
    </div>
  );
}
