import { notFound } from "next/navigation";
import {
  Users,
  Building2,
  Globe,
  FolderKanban,
  Palette,
  ArrowLeft,
  Plus,
  Calendar,
} from "lucide-react";
import { MOCK_CLIENTS, MOCK_PROJECTS, MOCK_BRAND_ASSETS } from "@/lib/agency/mock-data";
import { Badge } from "@/components/agency/ui/Badge";
import Link from "next/link";

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const client = MOCK_CLIENTS.find((c) => c.id === params.id);
  if (!client) notFound();

  const projects = MOCK_PROJECTS.filter((p) => p.clientId === client.id);
  const assets = MOCK_BRAND_ASSETS.filter((a) => a.clientId === client.id);

  const ASSET_TYPE_LABELS = {
    logo: "Logo",
    color_palette: "Color Palette",
    typography: "Typography",
    tone_of_voice: "Tone of Voice",
    visual_reference: "Visual Reference",
    guideline: "Guideline",
  };

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      {/* Back + Header */}
      <div className="border-b border-[#E8E8E5] bg-white px-8 py-5">
        <Link
          href="/agency/clients"
          className="mb-3 flex items-center gap-1.5 text-[12px] text-[#71717A] hover:text-[#0A0A0A] transition-colors"
        >
          <ArrowLeft size={13} />
          Back to Clients
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#F4F4F5] text-[20px] font-bold text-[#52525B]">
              {client.name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[22px] font-bold text-[#0A0A0A]">{client.name}</h1>
                <Badge variant={client.status} />
              </div>
              <div className="mt-1 flex items-center gap-4 text-[12px] text-[#71717A]">
                <span className="flex items-center gap-1">
                  <Building2 size={11} /> {client.industry}
                </span>
                {client.website && (
                  <span className="flex items-center gap-1">
                    <Globe size={11} /> {client.website}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar size={11} /> Since {client.createdAt}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg border border-[#E8E8E5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0A0A0A] hover:border-[#D4D4D0] transition-colors">
              Edit Client
            </button>
            <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#4C4CB8] transition-colors">
              <Plus size={14} />
              New Project
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 px-8 py-6">
        {/* Left: Projects */}
        <div className="col-span-2 space-y-5">
          {/* About */}
          <div className="rounded-xl border border-[#E8E8E5] bg-white p-5 shadow-card">
            <h2 className="mb-2 text-[13px] font-semibold text-[#0A0A0A]">About</h2>
            <p className="text-[13px] text-[#52525B] leading-relaxed">{client.description}</p>
          </div>

          {/* Projects */}
          <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-[#E8E8E5] px-5 py-4">
              <div className="flex items-center gap-2">
                <FolderKanban size={15} className="text-[#5B5BD6]" />
                <h2 className="text-[13px] font-semibold text-[#0A0A0A]">Projects</h2>
                <span className="rounded-full bg-[#F4F4F5] px-2 py-0.5 text-[11px] font-medium text-[#52525B]">
                  {projects.length}
                </span>
              </div>
              <button className="flex items-center gap-1 text-[12px] text-[#5B5BD6] hover:underline">
                <Plus size={12} /> New project
              </button>
            </div>
            <div className="divide-y divide-[#F4F4F4]">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/agency/projects/${project.id}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-[#FAFAF9] transition-colors"
                >
                  <div>
                    <p className="text-[13px] font-medium text-[#0A0A0A]">{project.name}</p>
                    <p className="mt-0.5 text-[11px] text-[#A1A1AA]">{project.goal}</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center rounded-md bg-[#F4F4F5] px-2 py-0.5 text-[11px] font-medium text-[#52525B] capitalize">{project.stage}</span>
                    <Badge variant={project.priority} />
                    <span className="text-[11px] text-[#A1A1AA]">{project.deadline}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Brand Assets + Stats */}
        <div className="space-y-5">
          {/* Stats */}
          <div className="rounded-xl border border-[#E8E8E5] bg-white p-5 shadow-card">
            <h2 className="mb-4 text-[13px] font-semibold text-[#0A0A0A]">At a Glance</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Active Projects", value: client.activeProjects },
                { label: "Total Projects", value: client.totalProjects },
                { label: "Brand Assets", value: assets.length },
                { label: "Since", value: client.createdAt.split("-")[0] },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-[#FAFAF9] p-3">
                  <p className="text-[10px] text-[#A1A1AA] uppercase tracking-wide">{stat.label}</p>
                  <p className="mt-1 text-[18px] font-bold text-[#0A0A0A]">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Brand Assets */}
          <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-[#E8E8E5] px-5 py-4">
              <div className="flex items-center gap-2">
                <Palette size={15} className="text-[#EA580C]" />
                <h2 className="text-[13px] font-semibold text-[#0A0A0A]">Brand Assets</h2>
              </div>
              <button className="flex items-center gap-1 text-[12px] text-[#5B5BD6] hover:underline">
                <Plus size={12} /> Upload
              </button>
            </div>
            {assets.length > 0 ? (
              <div className="divide-y divide-[#F4F4F4]">
                {assets.map((asset) => (
                  <div key={asset.id} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFEDD5] flex-none">
                      <Palette size={13} className="text-[#EA580C]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[#0A0A0A]">{asset.name}</p>
                      <p className="text-[11px] text-[#A1A1AA]">
                        {ASSET_TYPE_LABELS[asset.type]}
                      </p>
                      {asset.description && (
                        <p className="mt-0.5 text-[11px] text-[#71717A] truncate">{asset.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-[12px] text-[#A1A1AA]">No brand assets yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
