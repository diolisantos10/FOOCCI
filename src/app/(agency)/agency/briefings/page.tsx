import { FileText, Plus, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_BRIEFINGS } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Briefings" };

export default function BriefingsPage() {
  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Briefings"
          subtitle={`${MOCK_BRIEFINGS.length} submitted briefs`}
          icon={FileText}
          iconColor="#D97706"
        >
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]">
            <Plus size={13} />
            New Briefing
          </button>
        </PageHeader>

        <div className="space-y-4">
          {MOCK_BRIEFINGS.map((briefing) => (
            <div
              key={briefing.id}
              className="rounded-xl border border-[#E5E5E2] bg-white"
              style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-[#F0F0EE] px-6 py-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <h3 className="text-[14px] font-semibold text-[#0A0A0A]">{briefing.projectName}</h3>
                    <Badge variant={briefing.status} />
                  </div>
                  <p className="text-[11px] text-[#A1A1AA]">
                    {briefing.clientName}
                    {" · "}
                    Submitted {briefing.submittedAt}
                    {" · "}
                    Due {briefing.deadline}
                  </p>
                </div>
                <Link
                  href={`/agency/projects/${briefing.projectId}`}
                  className="flex items-center gap-1 text-[11px] font-medium text-[#5B5BD6] hover:underline"
                >
                  View Project <ArrowRight size={11} />
                </Link>
              </div>

              {/* Content grid */}
              <div className="grid grid-cols-3 gap-0 border-b border-[#F0F0EE]">
                {[
                  { label: "Business Goal",   content: briefing.goal },
                  { label: "Target Audience", content: briefing.targetAudience },
                  { label: "Key Message",     content: `"${briefing.keyMessage}"`, italic: true },
                ].map((field, i) => (
                  <div
                    key={field.label}
                    className="px-6 py-4"
                    style={{ borderLeft: i > 0 ? "1px solid #F0F0EE" : "none" }}
                  >
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]">
                      {field.label}
                    </p>
                    <p
                      className="text-[12px] text-[#52525B] leading-relaxed"
                      style={{ fontStyle: field.italic ? "italic" : "normal" }}
                    >
                      {field.content}
                    </p>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-start gap-0 divide-x divide-[#F0F0EE]">
                <div className="flex-1 px-6 py-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]">
                    Deliverables Requested
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {briefing.deliverables.map((d) => (
                      <span
                        key={d}
                        className="inline-flex rounded-[5px] bg-[#F4F4F5] px-[7px] py-[2px] text-[11px] font-medium text-[#52525B]"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="w-[280px] flex-none px-6 py-4">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]">
                    Success Criteria
                  </p>
                  <p className="text-[12px] text-[#52525B] leading-relaxed">{briefing.successCriteria}</p>
                  {briefing.budget && (
                    <p className="mt-2 text-[11px] text-[#A1A1AA]">
                      Budget: <span className="font-semibold text-[#52525B]">{briefing.budget}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
