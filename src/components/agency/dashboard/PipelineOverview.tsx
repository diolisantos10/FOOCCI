import { MOCK_PROJECTS, PipelineStage } from "@/lib/agency/mock-data";
import Link from "next/link";

const STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: "briefing",   label: "Briefing",   color: "#A1A1AA" },
  { key: "diagnosis",  label: "Diagnosis",  color: "#D97706" },
  { key: "planning",   label: "Planning",   color: "#3B82F6" },
  { key: "production", label: "Production", color: "#8B5CF6" },
  { key: "review",     label: "Review",     color: "#F97316" },
  { key: "delivery",   label: "Delivery",   color: "#0D9488" },
  { key: "ongoing",    label: "Ongoing",    color: "#16A34A" },
  { key: "completed",  label: "Completed",  color: "#D0D0CC" },
];

const STATUS_DOT: Record<string, string> = {
  active:    "#16A34A",
  at_risk:   "#CA8A04",
  blocked:   "#DC2626",
  completed: "#A1A1AA",
  paused:    "#D0D0CC",
};

export function PipelineOverview() {
  const total = MOCK_PROJECTS.length;

  return (
    <div className="rounded-xl border border-[#E5E5E2] bg-white" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
      <div className="flex items-center justify-between border-b border-[#F0F0EE] px-5 py-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[#0A0A0A]">Pipeline</h2>
          <p className="text-[11px] text-[#A1A1AA]">{total} projects in motion</p>
        </div>
        <Link href="/agency/pipeline" className="text-[11px] font-medium text-[#5B5BD6] hover:underline">
          Full board →
        </Link>
      </div>
      <div className="px-5 py-4 space-y-[3px]">
        {STAGES.map(({ key, label, color }) => {
          const projects = MOCK_PROJECTS.filter((p) => p.stage === key);
          const pct = total > 0 ? (projects.length / total) * 100 : 0;
          return (
            <div key={key} className="group">
              <div className="flex items-center gap-3">
                {/* Stage label */}
                <div className="flex w-[80px] items-center gap-2 flex-none">
                  <span
                    className="h-[5px] w-[5px] flex-none rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[11px] text-[#71717A]">{label}</span>
                </div>

                {/* Bar */}
                <div className="flex-1 h-[4px] rounded-full bg-[#F0F0EE]">
                  {pct > 0 && (
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: color }}
                    />
                  )}
                </div>

                {/* Project pills */}
                <div className="flex w-[80px] items-center justify-end gap-1">
                  {projects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/agency/projects/${p.id}`}
                      title={p.name}
                      className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold text-white transition-transform hover:scale-110"
                      style={{ backgroundColor: STATUS_DOT[p.status] ?? "#D0D0CC" }}
                    >
                      {p.clientName[0]}
                    </Link>
                  ))}
                  {projects.length === 0 && (
                    <span className="text-[10px] text-[#D0D0CC]">—</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
