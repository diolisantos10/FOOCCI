import { GitBranch, AlertCircle, Clock, Plus } from "lucide-react";
import { MOCK_PROJECTS, PipelineStage, Project } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Pipeline" };

const COLUMNS: { key: PipelineStage; label: string; color: string; dot: string }[] = [
  { key: "briefing",   label: "Briefing",   color: "#8E8E9A", dot: "#C0C0BC" },
  { key: "diagnosis",  label: "Diagnosis",  color: "#D97706", dot: "#D97706" },
  { key: "planning",   label: "Planning",   color: "#3B82F6", dot: "#3B82F6" },
  { key: "production", label: "Production", color: "#8B5CF6", dot: "#8B5CF6" },
  { key: "review",     label: "Review",     color: "#F97316", dot: "#F97316" },
  { key: "delivery",   label: "Delivery",   color: "#0D9488", dot: "#0D9488" },
  { key: "ongoing",    label: "Ongoing",    color: "#16A34A", dot: "#16A34A" },
  { key: "completed",  label: "Completed",  color: "#A1A1AA", dot: "#D0D0CC" },
];

const STATUS_META: Record<string, { color: string; label: string }> = {
  active:    { color: "#16A34A", label: "Active" },
  at_risk:   { color: "#CA8A04", label: "At Risk" },
  blocked:   { color: "#DC2626", label: "Blocked" },
  completed: { color: "#A1A1AA", label: "Done" },
  paused:    { color: "#C0C0BC", label: "Paused" },
};

function KanbanCard({ project }: { project: Project }) {
  const status    = STATUS_META[project.status] ?? { color: "#A1A1AA", label: project.status };
  const isCritical = project.priority === "critical";
  const isHighRisk = project.status === "at_risk" || project.status === "blocked";

  return (
    <Link
      href={`/agency/projects/${project.id}`}
      className="group block rounded-xl border bg-white p-4 transition-all hover:border-[#5B5BD6]"
      style={{
        borderColor: isHighRisk ? "#FECACA" : "#E5E5E2",
        boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
      }}
    >
      {/* Top row: status + priority */}
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: status.color }}>
          <span className="h-[5px] w-[5px] flex-none rounded-full" style={{ backgroundColor: status.color }} />
          {status.label}
        </span>
        {isCritical && (
          <span className="rounded-[4px] bg-[#FEE2E2] px-[5px] py-[2px] text-[9px] font-bold uppercase tracking-wide text-[#991B1B]">
            Critical
          </span>
        )}
        {!isCritical && project.priority === "high" && (
          <span className="rounded-[4px] bg-[#FFF0E8] px-[5px] py-[2px] text-[9px] font-semibold uppercase tracking-wide text-[#9A3412]">
            High
          </span>
        )}
      </div>

      {/* Project name */}
      <p className="text-[12.5px] font-semibold leading-snug text-[#0A0A0A] transition-colors group-hover:text-[#5B5BD6] line-clamp-2">
        {project.name}
      </p>

      {/* Client */}
      <p className="mt-1 text-[11px] text-[#A1A1AA]">{project.clientName}</p>

      {/* Footer */}
      <div className="mt-3.5 flex items-center justify-between border-t border-[#F5F5F3] pt-3">
        <div className="flex items-center gap-1 text-[10px] text-[#C0C0BC]">
          <Clock size={9} />
          <span className="mono-num">{project.deadline.slice(5)}</span>
        </div>
        {isHighRisk && (
          <AlertCircle
            size={12}
            style={{ color: project.status === "blocked" ? "#DC2626" : "#CA8A04" }}
          />
        )}
      </div>
    </Link>
  );
}

export default function PipelinePage() {
  const total = MOCK_PROJECTS.length;

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">

        {/* Page header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF6FF]">
              <GitBranch size={15} strokeWidth={1.75} className="text-[#3B82F6]" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-[#0A0A0A]" style={{ letterSpacing: "-0.01em" }}>
                Pipeline
              </h1>
              <p className="text-[12px] text-[#A1A1AA]">{total} projects across 8 stages</p>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[11px] text-[#A1A1AA]">
            {[
              { color: "#16A34A", label: "Active" },
              { color: "#CA8A04", label: "At Risk" },
              { color: "#DC2626", label: "Blocked" },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* Kanban board */}
        <div className="flex gap-3 overflow-x-auto pb-6" style={{ scrollbarWidth: "none" }}>
          {COLUMNS.map((col) => {
            const colProjects = MOCK_PROJECTS.filter((p) => p.stage === col.key);
            return (
              <div key={col.key} className="w-[216px] flex-none">
                {/* Column header */}
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: col.dot }} />
                    <span
                      className="text-[11px] font-semibold uppercase tracking-[0.07em]"
                      style={{ color: col.color }}
                    >
                      {col.label}
                    </span>
                  </div>
                  <span
                    className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-bold"
                    style={{
                      backgroundColor: colProjects.length > 0 ? `${col.dot}18` : "#F0F0EE",
                      color: colProjects.length > 0 ? col.color : "#C0C0BC",
                    }}
                  >
                    {colProjects.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-2 min-h-[100px]">
                  {colProjects.map((project) => (
                    <KanbanCard key={project.id} project={project} />
                  ))}
                  {colProjects.length === 0 && (
                    <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-[#EAEAE8] py-8">
                      <span className="text-[10px] font-medium text-[#D0D0CC]">Empty</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add column spacer */}
          <div className="w-4 flex-none" />
        </div>
      </div>
    </div>
  );
}
