import { Settings, User, Bell, Palette, Shield, Database, ChevronRight } from "lucide-react";

export const metadata = { title: "Settings" };

const SETTING_GROUPS = [
  {
    label: "Account",
    icon: User,
    color: "#5B5BD6",
    items: [
      { label: "Profile", description: "Name, email, and personal preferences" },
      { label: "Appearance", description: "Theme, density, and display options" },
      { label: "Language & Region", description: "Locale, timezone, and date format" },
    ],
  },
  {
    label: "Notifications",
    icon: Bell,
    color: "#CA8A04",
    items: [
      { label: "Alert preferences", description: "When and how to be notified" },
      { label: "Project updates", description: "Pipeline changes and task completions" },
    ],
  },
  {
    label: "Design System",
    icon: Palette,
    color: "#EA580C",
    items: [
      { label: "Brand colors", description: "Customize accent and UI colors" },
      { label: "Typography", description: "Font and size preferences" },
    ],
  },
  {
    label: "Agents",
    icon: Settings,
    color: "#7C3AED",
    items: [
      { label: "Agent configuration", description: "Default behaviors and parameters" },
      { label: "Orchestrator rules", description: "Pipeline logic and agent selection rules" },
    ],
  },
  {
    label: "Data",
    icon: Database,
    color: "#0D9488",
    items: [
      { label: "Export data", description: "Download your workspace data" },
      { label: "Import", description: "Migrate from other tools" },
    ],
  },
  {
    label: "Security",
    icon: Shield,
    color: "#DC2626",
    items: [
      { label: "Access control", description: "Manage who can access the platform" },
      { label: "Audit log", description: "Track all actions taken in the system" },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      <div className="px-8 py-7">
        <div className="flex items-center gap-3 mb-7">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F4F4F5]">
            <Settings size={18} className="text-[#52525B]" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-[#0A0A0A]">Settings</h1>
            <p className="text-[13px] text-[#71717A]">Platform configuration and preferences</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {SETTING_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.label} className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
                {/* Group header */}
                <div className="flex items-center gap-3 border-b border-[#E8E8E5] px-5 py-4">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${group.color}15` }}
                  >
                    <Icon size={15} style={{ color: group.color }} strokeWidth={1.75} />
                  </div>
                  <h2 className="text-[13px] font-semibold text-[#0A0A0A]">{group.label}</h2>
                </div>

                {/* Items */}
                <div className="divide-y divide-[#F4F4F4]">
                  {group.items.map((item) => (
                    <button
                      key={item.label}
                      className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-[#FAFAF9] transition-colors group"
                    >
                      <div>
                        <p className="text-[13px] font-medium text-[#0A0A0A] group-hover:text-[#5B5BD6] transition-colors">
                          {item.label}
                        </p>
                        <p className="text-[11px] text-[#A1A1AA]">{item.description}</p>
                      </div>
                      <ChevronRight size={13} className="text-[#D4D4D0] group-hover:text-[#5B5BD6] transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Version info */}
        <div className="mt-8 rounded-xl border border-[#E8E8E5] bg-white px-5 py-4 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[#0A0A0A]">Dioli Agency OS</p>
              <p className="text-[11px] text-[#A1A1AA]">Version 1.0.0 · MVP · Internal use only</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3 py-1 text-[11px] font-semibold text-[#16A34A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                System operational
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
