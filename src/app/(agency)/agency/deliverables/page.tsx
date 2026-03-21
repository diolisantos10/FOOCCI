import { FileDown, Plus, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_DELIVERABLES } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Deliverables" };

const TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  "Strategy Document": { bg: "#F3E8FF", text: "#6D28D9" },
  "Copywriting":       { bg: "#CCFBF1", text: "#0F766E" },
  "Brand Document":    { bg: "#FFEDD5", text: "#C2410C" },
  "Performance Report":{ bg: "#EEF2FF", text: "#4338CA" },
  "Design Files":      { bg: "#FEF9C3", text: "#A16207" },
};

const FILTERS = ["All", "Draft", "In Review", "Approved", "Delivered"];

export default function DeliverablesPage() {
  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Deliverables"
          subtitle={`${MOCK_DELIVERABLES.length} outputs across all projects`}
          icon={FileDown}
          iconColor="#5B5BD6"
        >
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]">
            <Plus size={13} />
            Log Deliverable
          </button>
        </PageHeader>

        {/* Filters */}
        <div className="mb-5 flex items-center gap-1.5">
          {FILTERS.map((f, i) => (
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

        {/* Table */}
        <div
          className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white"
          style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
        >
          {/* Header */}
          <div className="grid grid-cols-12 border-b border-[#F0F0EE] bg-[#FAFAF9] px-5 py-3">
            {[
              { label: "Deliverable", span: "col-span-4" },
              { label: "Project",     span: "col-span-3" },
              { label: "Type",        span: "col-span-2" },
              { label: "Status",      span: "col-span-1" },
              { label: "Date",        span: "col-span-1" },
              { label: "",            span: "col-span-1" },
            ].map((col, i) => (
              <div
                key={i}
                className={`${col.span} text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]`}
              >
                {col.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          {MOCK_DELIVERABLES.map((d, i) => {
            const typeStyle = TYPE_STYLE[d.type] ?? { bg: "#F4F4F5", text: "#52525B" };
            return (
              <div
                key={d.id}
                className="grid grid-cols-12 items-center px-5 py-4 transition-colors hover:bg-[#FAFAF9]"
                style={{ borderBottom: i < MOCK_DELIVERABLES.length - 1 ? "1px solid #F5F5F3" : "none" }}
              >
                {/* Name */}
                <div className="col-span-4 flex items-center gap-3 pr-4 min-w-0">
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
                    className="truncate block text-[12px] font-medium text-[#5B5BD6] hover:underline"
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
                {/* Status */}
                <div className="col-span-1">
                  <Badge variant={d.status} />
                </div>
                {/* Date */}
                <div className="col-span-1 text-[11px] text-[#A1A1AA] mono-num">{d.producedAt.slice(5)}</div>
                {/* Link */}
                <div className="col-span-1 flex justify-end">
                  <ExternalLink size={12} className={d.link ? "cursor-pointer text-[#5B5BD6] hover:text-[#4848C2]" : "text-[#E5E5E2]"} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
