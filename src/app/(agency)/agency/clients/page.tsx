import { Users, Plus, Building2, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_CLIENTS } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Clients" };

export default function ClientsPage() {
  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Clients"
          subtitle={`${MOCK_CLIENTS.length} clients registered`}
          icon={Users}
        >
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#4C4CB8] transition-colors">
            <Plus size={14} />
            Create Client
          </button>
        </PageHeader>

        {/* Filter bar */}
        <div className="mb-5 flex items-center gap-2">
          {["All", "Active", "Onboarding", "Inactive"].map((f) => (
            <button
              key={f}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                f === "All"
                  ? "bg-[#0A0A0A] text-white"
                  : "bg-white border border-[#E8E8E5] text-[#71717A] hover:border-[#D4D4D0]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Client cards */}
        <div className="grid grid-cols-3 gap-4">
          {MOCK_CLIENTS.map((client) => (
            <Link
              key={client.id}
              href={`/agency/clients/${client.id}`}
              className="group block rounded-xl border border-[#E8E8E5] bg-white p-5 shadow-card hover:shadow-card-hover hover:border-[#5B5BD6] transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F4F4F5] text-[15px] font-bold text-[#52525B]">
                    {client.name[0]}
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#0A0A0A] group-hover:text-[#5B5BD6] transition-colors">
                      {client.name}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Building2 size={10} className="text-[#A1A1AA]" />
                      <p className="text-[11px] text-[#A1A1AA]">{client.industry}</p>
                    </div>
                  </div>
                </div>
                <Badge variant={client.status} />
              </div>

              {/* Description */}
              <p className="text-[12px] text-[#71717A] leading-relaxed mb-4 line-clamp-2">
                {client.description}
              </p>

              {/* Stats */}
              <div className="flex items-center justify-between border-t border-[#F4F4F4] pt-3">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-[11px] text-[#A1A1AA]">Active</p>
                    <p className="text-[14px] font-bold text-[#0A0A0A]">{client.activeProjects}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#A1A1AA]">Total</p>
                    <p className="text-[14px] font-bold text-[#0A0A0A]">{client.totalProjects}</p>
                  </div>
                </div>
                {client.website && (
                  <div className="flex items-center gap-1 text-[11px] text-[#A1A1AA]">
                    <ExternalLink size={10} />
                    {client.website}
                  </div>
                )}
              </div>
            </Link>
          ))}

          {/* Add client card */}
          <button className="rounded-xl border-2 border-dashed border-[#E8E8E5] bg-transparent p-5 flex flex-col items-center justify-center gap-2 hover:border-[#5B5BD6] hover:bg-white transition-all group">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F4F4F5] group-hover:bg-[#EEF2FF] transition-colors">
              <Plus size={18} className="text-[#A1A1AA] group-hover:text-[#5B5BD6] transition-colors" />
            </div>
            <p className="text-[13px] font-medium text-[#A1A1AA] group-hover:text-[#5B5BD6] transition-colors">
              Add new client
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
