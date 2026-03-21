import { Palette, Upload, ImageIcon, Type, Eye, Mic, FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { MOCK_BRAND_ASSETS, MOCK_CLIENTS } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Brand Assets" };

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; bg: string; color: string }> = {
  logo:             { label: "Logo",          icon: ImageIcon, bg: "#EDE9FE", color: "#7C3AED" },
  color_palette:    { label: "Color Palette", icon: Palette,   bg: "#FFEDD5", color: "#EA580C" },
  typography:       { label: "Typography",    icon: Type,      bg: "#DBEAFE", color: "#2563EB" },
  tone_of_voice:    { label: "Tone of Voice", icon: Mic,       bg: "#CCFBF1", color: "#0D9488" },
  visual_reference: { label: "Visual Ref.",   icon: Eye,       bg: "#FEF9C3", color: "#CA8A04" },
  guideline:        { label: "Guideline",     icon: FileText,  bg: "#F4F4F5", color: "#71717A" },
};

export default function BrandAssetsPage() {
  const totalAssets = MOCK_BRAND_ASSETS.length;

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Brand Assets"
          subtitle={`${totalAssets} assets across ${MOCK_CLIENTS.length} clients`}
          icon={Palette}
          iconColor="#EA580C"
        >
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]">
            <Upload size={13} />
            Upload Asset
          </button>
        </PageHeader>

        {/* Per-client sections */}
        {MOCK_CLIENTS.map((client) => {
          const assets = MOCK_BRAND_ASSETS.filter((a) => a.clientId === client.id);
          return (
            <div key={client.id} className="mb-8">
              {/* Client section header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F4F5] text-[13px] font-bold text-[#52525B]">
                    {client.name[0]}
                  </div>
                  <div>
                    <h2 className="text-[14px] font-semibold text-[#0A0A0A]">{client.name}</h2>
                    <p className="text-[11px] text-[#A1A1AA]">{client.industry}</p>
                  </div>
                  <span className="rounded-full bg-[#F4F4F5] px-2 py-0.5 text-[10px] font-medium text-[#A1A1AA]">
                    {assets.length} assets
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/agency/clients/${client.id}`} className="text-[11px] font-medium text-[#5B5BD6] hover:underline">
                    Client profile →
                  </Link>
                  <button className="flex items-center gap-1 rounded-lg border border-[#E5E5E2] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#71717A] transition-colors hover:border-[#D0D0CC]">
                    <Plus size={11} /> Add asset
                  </button>
                </div>
              </div>

              {assets.length > 0 ? (
                <div className="grid grid-cols-4 gap-3">
                  {assets.map((asset) => {
                    const config = TYPE_CONFIG[asset.type] ?? TYPE_CONFIG["guideline"]!;
                    const Icon   = config.icon;
                    return (
                      <div
                        key={asset.id}
                        className="rounded-xl border border-[#E5E5E2] bg-white p-4 transition-all hover:border-[#D0D0CC]"
                        style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
                      >
                        <div
                          className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg"
                          style={{ backgroundColor: config.bg }}
                        >
                          <Icon size={16} strokeWidth={1.75} style={{ color: config.color }} />
                        </div>
                        <p className="text-[12.5px] font-semibold text-[#0A0A0A] mb-0.5">{asset.name}</p>
                        <p
                          className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-2"
                          style={{ color: config.color }}
                        >
                          {config.label}
                        </p>
                        {asset.description && (
                          <p className="text-[11px] text-[#71717A] leading-relaxed line-clamp-2">
                            {asset.description}
                          </p>
                        )}
                        <p className="mt-3 text-[10px] text-[#C0C0BC]">{asset.uploadedAt}</p>
                      </div>
                    );
                  })}

                  {/* Add placeholder */}
                  <button className="group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#EAEAE8] py-6 transition-all hover:border-[#5B5BD6]">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F4F5] transition-colors group-hover:bg-[#EEEEFD]">
                      <Plus size={15} className="text-[#C0C0BC] transition-colors group-hover:text-[#5B5BD6]" />
                    </div>
                    <p className="text-[11px] font-medium text-[#C0C0BC] transition-colors group-hover:text-[#5B5BD6]">
                      Add asset
                    </p>
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-[#EAEAE8] py-10 text-center">
                  <p className="text-[13px] text-[#A1A1AA]">No brand assets for {client.name} yet.</p>
                  <button className="mt-1.5 text-[12px] font-medium text-[#5B5BD6] hover:underline">
                    Upload first asset →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
