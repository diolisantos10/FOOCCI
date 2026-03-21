import { FileDown, Plus, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_DELIVERABLES } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Deliverables" };

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  "Strategy Document": { bg: "#EDE9FE", text: "#6D28D9" },
  "Copywriting":       { bg: "#CCFBF1", text: "#0D6E63" },
  "Brand Document":    { bg: "#FFEDD5", text: "#C2410C" },
  "Performance Report":{ bg: "#DBEAFE", text: "#1D4ED8" },
  "Design Files":      { bg: "#FEF9C3", text: "#A16207" },
};

export default function DeliverablesPage() {
  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Deliverables"
          subtitle={`${MOCK_DELIVERABLES.length} total deliverables across all projects`}
          icon={FileDown}
          iconColor="#5B5BD6"
        >
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#4C4CB8] transition-colors">
            <Plus size={14} />
            Log Deliverable
          </button>
        </PageHeader>

        {/* Filter bar */}
        <div className="mb-5 flex items-center gap-2">
          {["All", "Draft", "In Review", "Approved", "Delivered"].map((f, i) => (
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
        </div>

        {/* Table */}
        <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 border-b border-[#E8E8E5] bg-[#FAFAF9] px-5 py-3">
            {[
              { label: "Deliverable", col: "col-span-4" },
              { label: "Project", col: "col-span-3" },
              { label: "Type", col: "col-span-2" },
              { label: "Status", col: "col-span-1" },
              { label: "Produced", col: "col-span-1" },
              { label: "", col: "col-span-1" },
            ].map((col) => (
              <div key={col.label} className={`${col.col} text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]`}>
                {col.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-[#F4F4F4]">
            {MOCK_DELIVERABLES.map((d) => {
              const typeStyle = TYPE_COLORS[d.type] ?? { bg: "#F4F4F5", text: "#52525B" };
              return (
                <div key={d.id} className="grid grid-cols-12 items-center px-5 py-4 hover:bg-[#FAFAF9] transition-colors">
                  {/* Name */}
                  <div className="col-span-4 flex items-center gap-3 pr-4">
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#EEF2FF]">
                      <FileDown size={13} className="text-[#5B5BD6]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#0A0A0A] truncate">{d.name}</p>
                      <p className="text-[10px] text-[#A1A1AA]">{d.agentName}</p>
                    </div>
                  </div>
                  {/* Project */}
                  <div className="col-span-3 min-w-0 pr-4">
                    <Link
                      href={`/agency/projects/${d.projectId}`}
                      className="text-[12px] text-[#5B5BD6] hover:underline truncate block"
                    >
                      {d.projectName}
                    </Link>
                    <p className="text-[10px] text-[#A1A1AA]">{d.clientName}</p>
                  </div>
                  {/* Type */}
                  <div className="col-span-2">
                    <span
                      className="inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold"
                      style={{ backgroundColor: typeStyle.bg, color: typeStyle.text }}
                    >
                      {d.type}
                    </span>
                  </div>
                  {/* Status */}
                  <div className="col-span-1">
                    <Badge variant={d.status} />
                  </div>
                  {/* Produced */}
                  <div className="col-span-1 text-[11px] text-[#A1A1AA]">{d.producedAt}</div>
                  {/* Link */}
                  <div className="col-span-1 flex justify-end">
                    {d.link ? (
                      <a href={d.link} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={13} className="text-[#A1A1AA] hover:text-[#5B5BD6] transition-colors" />
                      </a>
                    ) : (
                      <ExternalLink size={13} className="text-[#E8E8E5]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
