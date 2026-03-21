import { FileText, Plus, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_BRIEFINGS } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Briefings" };

export default function BriefingsPage() {
  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Briefings"
          subtitle={`${MOCK_BRIEFINGS.length} briefings submitted`}
          icon={FileText}
          iconColor="#CA8A04"
        >
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#4C4CB8] transition-colors">
            <Plus size={14} />
            New Briefing
          </button>
        </PageHeader>

        <div className="space-y-4">
          {MOCK_BRIEFINGS.map((briefing) => (
            <div
              key={briefing.id}
              className="rounded-xl border border-[#E8E8E5] bg-white p-6 shadow-card hover:shadow-card-hover transition-shadow"
            >
              {/* Header row */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <h3 className="text-[15px] font-semibold text-[#0A0A0A]">{briefing.projectName}</h3>
                    <Badge variant={briefing.status} />
                  </div>
                  <p className="text-[12px] text-[#71717A]">
                    {briefing.clientName} · Submitted {briefing.submittedAt} · Deadline {briefing.deadline}
                  </p>
                </div>
                <Link
                  href={`/agency/projects/${briefing.projectId}`}
                  className="flex items-center gap-1 text-[12px] text-[#5B5BD6] hover:underline"
                >
                  View Project <ChevronRight size={12} />
                </Link>
              </div>

              {/* Briefing content */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA] mb-1.5">Business Goal</p>
                  <p className="text-[12px] text-[#52525B] leading-relaxed">{briefing.goal}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA] mb-1.5">Target Audience</p>
                  <p className="text-[12px] text-[#52525B] leading-relaxed">{briefing.targetAudience}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA] mb-1.5">Key Message</p>
                  <p className="text-[12px] text-[#52525B] leading-relaxed italic">&ldquo;{briefing.keyMessage}&rdquo;</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[#F4F4F4] pt-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA] mb-1.5">Deliverables Requested</p>
                  <div className="flex flex-wrap gap-1.5">
                    {briefing.deliverables.map((d) => (
                      <span key={d} className="rounded-md bg-[#F4F4F5] px-2 py-0.5 text-[10px] font-medium text-[#52525B]">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA] mb-1.5">Success Criteria</p>
                  <p className="text-[12px] text-[#52525B]">{briefing.successCriteria}</p>
                </div>
              </div>

              {briefing.budget && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Budget:</span>
                  <span className="text-[12px] font-semibold text-[#0A0A0A]">{briefing.budget}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
