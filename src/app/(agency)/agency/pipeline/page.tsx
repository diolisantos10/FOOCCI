import { GitBranch, AlertCircle, Clock } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { MOCK_PROJECTS, PipelineStage, Project } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Pipeline" };

const COLUMNS: { key: PipelineStage; label: string; color: string; bg: string }[] = [
  { key: "briefing",   label: "Briefing",   color: "#A1A1AA", bg: "#F4F4F5" },
  { key: "diagnosis",  label: "Diagnosis",  color: "#CA8A04", bg: "#FEF9C3" },
  { key: "planning",   label: "Planning",   color: "#2563EB", bg: "#DBEAFE" },
  { key: "production", label: "Production", color: "#7C3AED", bg: "#EDE9FE" },
  { key: "review",     label: "Review",     color: "#EA580C", bg: "#FFEDD5" },
  { key: "delivery",   label: "Delivery",   color: "#0D9488", bg: "#CCFBF1" },
  { key: "ongoing",    label: "Ongoing",    color: "#16A34A", bg: "#DCFCE7" },
  { key: "completed",  label: "Completed",  color: "#71717A", bg: "#F4F4F5" },
];

const STATUS_INDICATOR: Record<string, { color: string; label: string }> = {
  active:    { color: "#16A34A", label: "Active" },
  at_risk:   { color: "#CA8A04", label: "At Risk" },
  blocked:   { color: "#DC2626", label: "Blocked" },
  completed: { color: "#71717A", label: "Done" },
  paused:    { color: "#A1A1AA", label: "Paused" },
};

function PipelineCard({ project, stageColor }: { project: Project; stageColor: string }) {
  const indicator = STATUS_INDICATOR[project.status] ?? { color: "#A1A1AA", label: project.status };
  return (
    <Link
      href={`/agency/projects/${project.id}`}
      className="block rounded-lg border border-[#E8E8E5] bg-white p-3.5 shadow-card hover:shadow-card-hover hover:border-[#5B5BD6] transition-all group"
    >
      {/* Status bar */}
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: indicator.color }} />
          <span style={{ color: indicator.color }}>{indicator.label}</span>
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
          style={{
            backgroundColor: project.priority === "critical" ? "#FEE2E2" : project.priority === "high" ? "#FFEDD5" : "#F4F4F5",
            color: project.priority === "critical" ? "#B91C1C" : project.priority === "high" ? "#C2410C" : "#71717A",
          }}
        >
          {project.priority}
        </span>
      </div>

      {/* Project name */}
      <p className="text-[12px] font-semibold text-[#0A0A0A] leading-snug group-hover:text-[#5B5BD6] transition-colors line-clamp-2">
        {project.name}
      </p>

      {/* Client */}
      <p className="mt-1 text-[11px] text-[#A1A1AA]">{project.clientName}</p>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-[#F4F4F4] pt-2.5">
        <div className="flex items-center gap-1 text-[10px] text-[#A1A1AA]">
          <Clock size={9} />
          {project.deadline}
        </div>
        {project.status === "at_risk" && (
          <AlertCircle size={12} className="text-[#CA8A04]" />
        )}
        {project.status === "blocked" && (
          <AlertCircle size={12} className="text-[#DC2626]" />
        )}
      </div>
    </Link>
  );
}

export default function PipelinePage() {
  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Pipeline"
          subtitle="All projects organized by stage"
          icon={GitBranch}
          iconColor="#2563EB"
        >
          <div className="flex items-center gap-2 text-[12px] text-[#71717A]">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#16A34A]" /> Active
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#CA8A04]" /> At Risk
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#DC2626]" /> Blocked
            </span>
          </div>
        </PageHeader>

        {/* Kanban board */}
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const colProjects = MOCK_PROJECTS.filter((p) => p.stage === col.key);
            return (
              <div key={col.key} className="flex-none w-52">
                {/* Column header */}
                <div
                  className="mb-2.5 flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ backgroundColor: col.bg }}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="text-[12px] font-semibold" style={{ color: col.color }}>
                      {col.label}
                    </span>
                  </div>
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: col.color, color: "white" }}
                  >
                    {colProjects.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-2 min-h-24">
                  {colProjects.map((project) => (
                    <PipelineCard key={project.id} project={project} stageColor={col.color} />
                  ))}
                  {colProjects.length === 0 && (
                    <div className="rounded-lg border-2 border-dashed border-[#E8E8E5] py-6 flex items-center justify-center">
                      <span className="text-[11px] text-[#D4D4D0]">Empty</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
