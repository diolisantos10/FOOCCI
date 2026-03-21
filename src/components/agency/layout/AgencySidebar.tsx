"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  GitBranch,
  CheckSquare,
  Users,
  Palette,
  Cpu,
  Bot,
  FileDown,
  FileText,
  Settings,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Home",
    items: [
      { href: "/agency/dashboard", label: "Command Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/agency/projects", label: "Projects", icon: FolderKanban },
      { href: "/agency/pipeline", label: "Pipeline", icon: GitBranch },
      { href: "/agency/tasks", label: "Tasks", icon: CheckSquare },
    ],
  },
  {
    label: "Clients",
    items: [
      { href: "/agency/clients", label: "Clients", icon: Users },
      { href: "/agency/brand-assets", label: "Brand Assets", icon: Palette },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/agency/orchestrator", label: "Orchestrator", icon: Cpu },
      { href: "/agency/agents", label: "Agents", icon: Bot },
    ],
  },
  {
    label: "Library",
    items: [
      { href: "/agency/deliverables", label: "Deliverables", icon: FileDown },
      { href: "/agency/briefings", label: "Briefings", icon: FileText },
    ],
  },
];

export function AgencySidebar() {
  const pathname = usePathname();

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <aside
      className="flex h-screen w-[220px] flex-none flex-col"
      style={{ backgroundColor: "#0E0E0E", borderRight: "1px solid #1C1C1C" }}
    >
      {/* Logo mark */}
      <div className="flex h-[52px] flex-none items-center px-5" style={{ borderBottom: "1px solid #1C1C1C" }}>
        <div className="flex items-center gap-3">
          <div
            className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[6px]"
            style={{ backgroundColor: "#5B5BD6" }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="7" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="1" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="7" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-none text-white">Dioli Agency</p>
            <p className="mt-[3px] text-[10px] leading-none" style={{ color: "#404040" }}>
              Operating System
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-[18px]">
            <p
              className="mb-1 px-5 text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "#303030" }}
            >
              {group.label}
            </p>
            <ul className="space-y-px px-2">
              {group.items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="relative flex items-center gap-2.5 rounded-[7px] px-3 py-[7px] text-[13px] font-medium transition-colors duration-100"
                      style={{
                        backgroundColor: active ? "#1A1A1A" : "transparent",
                        color: active ? "#FFFFFF" : "#5A5A5A",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.backgroundColor = "#161616";
                          e.currentTarget.style.color = "#999999";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.color = "#5A5A5A";
                        }
                      }}
                    >
                      {/* Active left bar */}
                      {active && (
                        <span
                          className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full"
                          style={{ backgroundColor: "#5B5BD6" }}
                        />
                      )}
                      <Icon
                        size={14}
                        strokeWidth={active ? 2 : 1.75}
                        style={{ color: active ? "#5B5BD6" : "currentColor", flexShrink: 0 }}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex-none px-2 pb-3 pt-2" style={{ borderTop: "1px solid #1C1C1C" }}>
        <Link
          href="/agency/settings"
          className="flex items-center gap-2.5 rounded-[7px] px-3 py-[7px] text-[13px] font-medium transition-colors"
          style={{ color: "#404040" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#161616";
            e.currentTarget.style.color = "#999999";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "#404040";
          }}
        >
          <Settings size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          Settings
        </Link>

        {/* User chip */}
        <div className="mt-1 flex items-center gap-2.5 rounded-[7px] px-3 py-[7px]">
          <div
            className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ backgroundColor: "#2A2A2A", letterSpacing: "0.02em" }}
          >
            DS
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium leading-tight" style={{ color: "#888888" }}>
              Dioli Santos
            </p>
            <p className="truncate text-[10px] leading-tight" style={{ color: "#303030" }}>
              Owner
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
