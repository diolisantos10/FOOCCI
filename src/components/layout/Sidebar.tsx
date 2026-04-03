"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

// ── Nav structure ──────────────────────────────────────────────────────────────

type NavItem = {
  href:   string;
  label:  string;
  icon:   string;
  exact?: boolean;
  soon?:  boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Vendas",
    items: [
      { href: "/menu",           label: "Cardápio",   icon: "🍽",  exact: false },
      { href: "/orders",         label: "Pedidos",    icon: "📋",  exact: false },
      { href: "/web-menu",       label: "Web Menu",   icon: "🌐",  exact: true  },
      { href: "/conversations",  label: "Conversas",  icon: "💬",  exact: false },
      { href: "/settings/agent", label: "Agente WA",  icon: "🤖",  exact: false },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/dashboard",  label: "Dashboard",      icon: "▦",  exact: true  },
      { href: "/settings",   label: "Configurações",  icon: "⚙️",  exact: true  },
      { href: "/chat-sim",   label: "Testar IA",      icon: "🧪",  exact: false },
    ],
  },
  {
    label: "Crescimento",
    items: [
      { href: "/customers",  label: "Clientes",   icon: "👤",  exact: false            },
      { href: "/crm",        label: "CRM",        icon: "📊",  exact: false, soon: true },
      { href: "/marketing",  label: "Marketing",  icon: "📢",  exact: false, soon: true },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { href: "/personalizacao",  label: "Personalização",  icon: "🎨",  exact: false, soon: true },
      { href: "/integracoes",     label: "Integrações",      icon: "🔌",  exact: false, soon: true },
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-200 bg-white">
      {/* Brand */}
      <div className="flex h-14 items-center border-b border-gray-100 px-4">
        <span className="text-base font-bold tracking-tight text-gray-900">Foocci</span>
        <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-600">
          beta
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        <ul className="space-y-4">
          {NAV_GROUPS.map((group, groupIdx) => (
            <li key={group.label}>
              {/* Divider above (not first group) */}
              {groupIdx > 0 && <div className="mb-3 border-t border-gray-100" />}

              {/* Group label */}
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {group.label}
              </p>

              {/* Items */}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-brand-50 text-brand-700"
                            : item.soon
                              ? "text-gray-400 hover:bg-gray-50 hover:text-gray-500"
                              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="text-[15px] leading-none">{item.icon}</span>
                          {item.label}
                        </span>
                        {item.soon && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-gray-400 leading-none">
                            breve
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      {/* User badge */}
      <div className="border-t border-gray-100 px-3 py-3">
        <p className="truncate text-xs font-semibold text-gray-800">
          {session?.user?.name ?? "—"}
        </p>
        <p className="truncate text-[10px] text-gray-400 uppercase tracking-wide">
          {session?.user?.role}
        </p>
      </div>
    </aside>
  );
}
