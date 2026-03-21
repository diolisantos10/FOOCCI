import { FolderKanban, Plus, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_PROJECTS } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Projects" };

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

export default function ProjectsPage() {
  const active = MOCK_PROJECTS.filter((p) => p.status === "active").length;

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Projects"
          subtitle={`${MOCK_PROJECTS.length} total · ${active} active`}
          icon={FolderKanban}
        >
          <button className="flex items-center gap-1.5 rounded-lg border border-[#E5E5E2] bg-white px-3.5 py-2 text-[12px] font-medium text-[#52525B] transition-colors hover:border-[#D0D0CC]">
            <SlidersHorizontal size={12} />
            Filter
          </button>
          <Link
            href="/agency/orchestrator"
            className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]"
          >
            <Plus size={13} />
            New Project
          </Link>
        </PageHeader>

        {/* Filter chips */}
        <div className="mb-5 flex items-center gap-1.5">
          {["All", "Active", "At Risk", "Blocked", "Completed"].map((f, i) => (
            <button
              key={f}
              className="rounded-[6px] px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={
                i === 0
                  ? { backgroundColor: "#0A0A0A", color: "#FFFFFF" }
                  : { backgroundColor: "#FFFFFF", color: "#71717A", border: "1px solid #E5E5E2" }
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* Projects table */}
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
              <div
                key={col.label}
                className={`${col.span} text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]`}
              >
                {col.label}
              </div>
            ))}
          </div>

          {MOCK_PROJECTS.map((project, i) => {
            const stage = STAGE_META[project.stage] ?? { label: project.stage, color: "#A1A1AA" };
            return (
              <Link
                key={project.id}
                href={`/agency/projects/${project.id}`}
                className="group grid grid-cols-12 items-center px-5 py-4 transition-colors hover:bg-[#FAFAF9]"
                style={{ borderBottom: i < MOCK_PROJECTS.length - 1 ? "1px solid #F5F5F3" : "none" }}
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
                <div className="col-span-1">
                  <Badge variant={project.priority} />
                </div>
                <div className="col-span-2">
                  <Badge variant={project.status} />
                </div>
                <div className="col-span-1 text-[12px] text-[#A1A1AA] mono-num">
                  {project.deadline.slice(5)}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
