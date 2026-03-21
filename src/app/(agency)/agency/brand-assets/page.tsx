import { Palette, Upload, Image, Type, Eye, Mic, FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { MOCK_BRAND_ASSETS, MOCK_CLIENTS } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Brand Assets" };

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; bg: string; color: string }> = {
  logo:             { label: "Logo",           icon: Image,    bg: "#EDE9FE", color: "#7C3AED" },
  color_palette:    { label: "Color Palette",  icon: Palette,  bg: "#FFEDD5", color: "#EA580C" },
  typography:       { label: "Typography",     icon: Type,     bg: "#DBEAFE", color: "#2563EB" },
  tone_of_voice:    { label: "Tone of Voice",  icon: Mic,      bg: "#CCFBF1", color: "#0D9488" },
  visual_reference: { label: "Visual Ref.",    icon: Eye,      bg: "#FEF9C3", color: "#CA8A04" },
  guideline:        { label: "Guideline",      icon: FileText, bg: "#F4F4F5", color: "#71717A" },
};

export default function BrandAssetsPage() {
  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Brand Assets"
          subtitle={`${MOCK_BRAND_ASSETS.length} assets across ${MOCK_CLIENTS.length} clients`}
          icon={Palette}
          iconColor="#EA580C"
        >
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#4C4CB8] transition-colors">
            <Upload size={14} />
            Upload Asset
          </button>
        </PageHeader>

        {/* Per-client sections */}
        {MOCK_CLIENTS.map((client) => {
          const clientAssets = MOCK_BRAND_ASSETS.filter((a) => a.clientId === client.id);
          return (
            <div key={client.id} className="mb-8">
              {/* Client header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F4F5] text-[14px] font-bold text-[#52525B]">
                    {client.name[0]}
                  </div>
                  <div>
                    <h2 className="text-[14px] font-semibold text-[#0A0A0A]">{client.name}</h2>
                    <p className="text-[11px] text-[#A1A1AA]">{client.industry}</p>
                  </div>
                  <span className="rounded-full bg-[#F4F4F5] px-2 py-0.5 text-[10px] font-medium text-[#71717A]">
                    {clientAssets.length} assets
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/agency/clients/${client.id}`}
                    className="text-[12px] text-[#5B5BD6] hover:underline"
                  >
                    View client →
                  </Link>
                  <button className="flex items-center gap-1 text-[12px] text-[#71717A] hover:text-[#0A0A0A] transition-colors border border-[#E8E8E5] rounded-md px-2.5 py-1">
                    <Plus size={11} />
                    Add
                  </button>
                </div>
              </div>

              {clientAssets.length > 0 ? (
                <div className="grid grid-cols-4 gap-3">
                  {clientAssets.map((asset) => {
                    const config = TYPE_CONFIG[asset.type] ?? TYPE_CONFIG["guideline"]!;
                    const Icon = config.icon;
                    return (
                      <div
                        key={asset.id}
                        className="rounded-xl border border-[#E8E8E5] bg-white p-4 shadow-card hover:shadow-card-hover transition-shadow"
                      >
                        <div
                          className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
                          style={{ backgroundColor: config.bg }}
                        >
                          <Icon size={18} style={{ color: config.color }} strokeWidth={1.75} />
                        </div>
                        <p className="text-[13px] font-semibold text-[#0A0A0A] mb-0.5">{asset.name}</p>
                        <p
                          className="text-[10px] font-semibold uppercase tracking-wide mb-2"
                          style={{ color: config.color }}
                        >
                          {config.label}
                        </p>
                        {asset.description && (
                          <p className="text-[11px] text-[#71717A] leading-relaxed line-clamp-2">
                            {asset.description}
                          </p>
                        )}
                        <p className="mt-3 text-[10px] text-[#A1A1AA]">Uploaded {asset.uploadedAt}</p>
                      </div>
                    );
                  })}

                  {/* Add asset card */}
                  <button className="rounded-xl border-2 border-dashed border-[#E8E8E5] flex flex-col items-center justify-center gap-2 py-6 hover:border-[#5B5BD6] transition-colors group">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F4F5] group-hover:bg-[#EEF2FF] transition-colors">
                      <Plus size={16} className="text-[#A1A1AA] group-hover:text-[#5B5BD6] transition-colors" />
                    </div>
                    <p className="text-[11px] font-medium text-[#A1A1AA] group-hover:text-[#5B5BD6] transition-colors">
                      Add asset
                    </p>
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-[#E8E8E5] py-8 text-center">
                  <p className="text-[13px] text-[#A1A1AA]">No brand assets yet for {client.name}.</p>
                  <button className="mt-2 text-[12px] text-[#5B5BD6] hover:underline">Upload first asset →</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
