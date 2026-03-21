import { MOCK_PROJECTS, PipelineStage } from "@/lib/agency/mock-data";
import Link from "next/link";

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: "briefing", label: "Briefing" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "planning", label: "Planning" },
  { key: "production", label: "Production" },
  { key: "review", label: "Review" },
  { key: "delivery", label: "Delivery" },
  { key: "ongoing", label: "Ongoing" },
  { key: "completed", label: "Completed" },
];

const STAGE_COLORS: Record<PipelineStage, string> = {
  briefing: "#A1A1AA",
  diagnosis: "#CA8A04",
  planning: "#2563EB",
  production: "#7C3AED",
  review: "#EA580C",
  delivery: "#0D9488",
  ongoing: "#16A34A",
  completed: "#E8E8E5",
};

const STATUS_DOT: Record<string, string> = {
  active: "#16A34A",
  at_risk: "#CA8A04",
  blocked: "#DC2626",
  completed: "#A1A1AA",
  paused: "#A1A1AA",
};

export function PipelineOverview() {
  return (
    <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-[#E8E8E5] px-5 py-4">
        <h2 className="text-[14px] font-semibold text-[#0A0A0A]">Pipeline Overview</h2>
        <Link href="/agency/pipeline" className="text-[12px] text-[#5B5BD6] hover:underline">
          Full board →
        </Link>
      </div>
      <div className="p-5">
        <div className="space-y-2">
          {STAGES.map(({ key, label }) => {
            const projects = MOCK_PROJECTS.filter((p) => p.stage === key);
            return (
              <div key={key} className="flex items-center gap-3">
                <div className="flex w-24 items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full flex-none"
                    style={{ backgroundColor: STAGE_COLORS[key] }}
                  />
                  <span className="text-[12px] text-[#71717A] truncate">{label}</span>
                </div>
                <div className="flex-1 flex items-center gap-1.5">
                  {projects.length === 0 ? (
                    <div className="h-6 rounded-md border border-dashed border-[#E8E8E5] flex-1 max-w-xs" />
                  ) : (
                    projects.map((p) => (
                      <Link
                        key={p.id}
                        href={`/agency/projects/${p.id}`}
                        className="group flex items-center gap-1.5 rounded-md border border-[#E8E8E5] bg-[#FAFAF9] px-2.5 py-1 text-[11px] font-medium text-[#52525B] hover:border-[#5B5BD6] hover:text-[#5B5BD6] transition-colors"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full flex-none"
                          style={{ backgroundColor: STATUS_DOT[p.status] }}
                        />
                        {p.clientName}
                      </Link>
                    ))
                  )}
                </div>
                <span className="text-[11px] font-medium text-[#A1A1AA] w-4 text-right">
                  {projects.length > 0 ? projects.length : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
