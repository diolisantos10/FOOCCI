"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/dashboard/customers", label: "Clientes", icon: "👤" },
  { href: "/dashboard/menu", label: "Cardápio", icon: "🍽" },
  { href: "/dashboard/orders", label: "Pedidos", icon: "📋" },
  { href: "/dashboard/conversations", label: "Conversas", icon: "💬" },
  { href: "/dashboard/settings/whatsapp", label: "WhatsApp", icon: "⚙️" },
  { href: "/dashboard/settings/ai",       label: "IA / Voz",  icon: "🤖" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-200 bg-white">
      {/* Brand */}
      <div className="flex h-16 items-center border-b border-gray-200 px-5">
        <span className="text-lg font-bold text-gray-900">CRM Restaurante</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User badge */}
      <div className="border-t border-gray-200 px-4 py-3">
        <p className="truncate text-sm font-medium text-gray-900">
          {session?.user?.name ?? "—"}
        </p>
        <p className="truncate text-xs text-gray-500">{session?.user?.role}</p>
      </div>
    </aside>
  );
}
