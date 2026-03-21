import { Users, Plus, Globe, FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_CLIENTS } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Clients" };

export default function ClientsPage() {
  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Clients"
          subtitle={`${MOCK_CLIENTS.length} registered clients`}
          icon={Users}
        >
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]">
            <Plus size={13} />
            New Client
          </button>
        </PageHeader>

        {/* Filter */}
        <div className="mb-5 flex items-center gap-1.5">
          {["All", "Active", "Onboarding", "Inactive"].map((f, i) => (
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

        {/* Client cards */}
        <div className="grid grid-cols-3 gap-4">
          {MOCK_CLIENTS.map((client) => (
            <Link
              key={client.id}
              href={`/agency/clients/${client.id}`}
              className="group block rounded-xl border border-[#E5E5E2] bg-white p-5 transition-all hover:border-[#5B5BD6]"
              style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
            >
              {/* Card header */}
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#F4F4F5] text-[15px] font-bold text-[#52525B]">
                    {client.name[0]}
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#0A0A0A] transition-colors group-hover:text-[#5B5BD6]">
                      {client.name}
                    </p>
                    <p className="text-[11px] text-[#A1A1AA]">{client.industry}</p>
                  </div>
                </div>
                <Badge variant={client.status} />
              </div>

              {/* Description */}
              <p className="mb-4 text-[12px] text-[#71717A] leading-relaxed line-clamp-2">
                {client.description}
              </p>

              {/* Footer stats */}
              <div className="flex items-center justify-between border-t border-[#F5F5F3] pt-3.5">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <FolderKanban size={11} className="text-[#A1A1AA]" />
                    <span className="text-[12px] font-semibold text-[#0A0A0A]">{client.activeProjects}</span>
                    <span className="text-[11px] text-[#A1A1AA]">active</span>
                  </div>
                  <div className="text-[11px] text-[#C0C0BC]">
                    {client.totalProjects} total
                  </div>
                </div>
                {client.website && (
                  <div className="flex items-center gap-1 text-[11px] text-[#C0C0BC]">
                    <Globe size={10} />
                    {client.website}
                  </div>
                )}
              </div>
            </Link>
          ))}

          {/* Add client placeholder */}
          <button
            className="group flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-[#EAEAE8] py-10 transition-all hover:border-[#5B5BD6] hover:bg-white"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4F4F5] transition-colors group-hover:bg-[#EEEEFD]">
              <Plus size={18} className="text-[#C0C0BC] transition-colors group-hover:text-[#5B5BD6]" />
            </div>
            <p className="text-[12px] font-medium text-[#C0C0BC] transition-colors group-hover:text-[#5B5BD6]">
              Add new client
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
