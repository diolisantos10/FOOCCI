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
  ChevronRight,
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
    <aside className="flex h-screen w-56 flex-none flex-col" style={{ backgroundColor: "#111111" }}>
      {/* Logo */}
      <div className="flex h-14 items-center px-5 border-b" style={{ borderColor: "#1E1E1E" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{ backgroundColor: "#5B5BD6" }}
          >
            <span className="text-white text-[10px] font-bold tracking-wide">D</span>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white leading-tight">Dioli Agency</p>
            <p className="text-[10px] leading-tight" style={{ color: "#555555" }}>
              OS v1.0
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin" style={{ scrollbarColor: "#2A2A2A transparent" }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p
              className="mb-1 px-5 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "#3A3A3A" }}
            >
              {group.label}
            </p>
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-150"
                      style={{
                        backgroundColor: active ? "#1E1E2E" : "transparent",
                        color: active ? "#FFFFFF" : "#777777",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.backgroundColor = "#1A1A1A";
                          e.currentTarget.style.color = "#CCCCCC";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.color = "#777777";
                        }
                      }}
                    >
                      <Icon
                        size={14}
                        style={{ color: active ? "#5B5BD6" : "currentColor" }}
                        strokeWidth={active ? 2.5 : 1.75}
                      />
                      {item.label}
                      {active && (
                        <ChevronRight size={10} className="ml-auto" style={{ color: "#5B5BD6" }} />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Settings + User footer */}
      <div className="border-t px-2 py-3 space-y-0.5" style={{ borderColor: "#1E1E1E" }}>
        <Link
          href="/agency/settings"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-all"
          style={{ color: "#555555" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#1A1A1A";
            e.currentTarget.style.color = "#CCCCCC";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "#555555";
          }}
        >
          <Settings size={14} strokeWidth={1.75} />
          Settings
        </Link>
        <div className="flex items-center gap-2.5 rounded-md px-3 py-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white flex-none"
            style={{ backgroundColor: "#2D2D2D" }}
          >
            D
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium text-white">Dioli Santos</p>
            <p className="truncate text-[10px]" style={{ color: "#444444" }}>
              Agency Owner
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
