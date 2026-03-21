import { FolderKanban, Plus, Filter, ArrowUpDown } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_PROJECTS } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Projects" };

const STAGE_LABELS: Record<string, string> = {
  briefing: "Briefing",
  diagnosis: "Diagnosis",
  planning: "Planning",
  production: "Production",
  review: "Review",
  delivery: "Delivery",
  ongoing: "Ongoing",
  completed: "Completed",
};

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

export default function ProjectsPage() {
  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Projects"
          subtitle={`${MOCK_PROJECTS.length} total · ${MOCK_PROJECTS.filter((p) => p.status === "active").length} active`}
          icon={FolderKanban}
        >
          <button className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0A0A0A] hover:border-[#D4D4D0] transition-colors">
            <Filter size={13} />
            Filter
          </button>
          <Link
            href="/agency/orchestrator"
            className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#4C4CB8] transition-colors"
          >
            <Plus size={14} />
            New Project
          </Link>
        </PageHeader>

        {/* Filter tabs */}
        <div className="mb-5 flex items-center gap-2">
          {["All Projects", "Active", "At Risk", "Blocked", "Completed"].map((f, i) => (
            <button
              key={f}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                i === 0
                  ? "bg-[#0A0A0A] text-white"
                  : "bg-white border border-[#E8E8E5] text-[#71717A] hover:border-[#D4D4D0]"
              }`}
            >
              {f}
            </button>
          ))}
          <button className="ml-auto flex items-center gap-1.5 rounded-md border border-[#E8E8E5] bg-white px-3 py-1.5 text-[12px] font-medium text-[#71717A] hover:border-[#D4D4D0] transition-colors">
            <ArrowUpDown size={12} />
            Sort by deadline
          </button>
        </div>

        {/* Projects table */}
        <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 border-b border-[#E8E8E5] px-5 py-3 bg-[#FAFAF9]">
            {[
              { label: "Project", col: "col-span-4" },
              { label: "Client", col: "col-span-2" },
              { label: "Stage", col: "col-span-2" },
              { label: "Priority", col: "col-span-1" },
              { label: "Status", col: "col-span-1" },
              { label: "Deadline", col: "col-span-2" },
            ].map((col) => (
              <div
                key={col.label}
                className={`${col.col} text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]`}
              >
                {col.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-[#F4F4F4]">
            {MOCK_PROJECTS.map((project) => (
              <Link
                key={project.id}
                href={`/agency/projects/${project.id}`}
                className="grid grid-cols-12 items-center px-5 py-4 hover:bg-[#FAFAF9] transition-colors group"
              >
                {/* Name + goal */}
                <div className="col-span-4 min-w-0 pr-4">
                  <p className="text-[13px] font-semibold text-[#0A0A0A] group-hover:text-[#5B5BD6] transition-colors truncate">
                    {project.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#A1A1AA] truncate">{project.goal}</p>
                </div>
                {/* Client */}
                <div className="col-span-2">
                  <span className="inline-flex items-center rounded-md bg-[#F4F4F5] px-2 py-1 text-[11px] font-medium text-[#52525B]">
                    {project.clientName}
                  </span>
                </div>
                {/* Stage */}
                <div className="col-span-2">
                  <span
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium"
                    style={{ color: STAGE_COLORS[project.stage] }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: STAGE_COLORS[project.stage] }}
                    />
                    {STAGE_LABELS[project.stage]}
                  </span>
                </div>
                {/* Priority */}
                <div className="col-span-1">
                  <Badge variant={project.priority} />
                </div>
                {/* Status */}
                <div className="col-span-1">
                  <Badge variant={project.status} />
                </div>
                {/* Deadline */}
                <div className="col-span-2 text-[12px] text-[#71717A]">
                  {project.deadline}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
