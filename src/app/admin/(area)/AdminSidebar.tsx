"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } catch { /* ignore */ }
    router.replace("/admin/login");
  }

  const navItems = [
    { href: "/admin/restaurants",                          label: "Restaurantes", icon: "🏪" },
    { href: "/admin/agents",                               label: "Agentes",      icon: "🤖" },
    { href: "/admin/build-os",                             label: "Build OS",     icon: "🛠️" },
    { href: "/admin/preflight",                            label: "Pré-piloto",   icon: "✅" },
    { href: "/admin/manual-operacional",                   label: "Manual",       icon: "📖" },
    { href: "/admin/diagnostics/restaurant-mismatch",      label: "Diagnóstico",  icon: "🔍" },
    { href: "/admin/diagnostics/cart-recovery-qa",         label: "QA Recovery",  icon: "🧪" },
    { href: "/admin/diagnostics/whatsapp-pedido-identity", label: "WA Identity",   icon: "🔗" },
    { href: "/admin/diagnostics/whatsapp-routing-test",    label: "WA Routing Lab", icon: "🧬" },
    { href: "/admin/agentes/waiter/testes",                label: "Waiter Testes", icon: "🧠" },
    { href: "/admin/agentes/crm/testes",                   label: "CRM Testes",    icon: "📞" },
  ];

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-gray-800 bg-gray-900">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 border-b border-gray-800 px-4">
        <span className="text-base font-bold tracking-tight text-white">Foocci</span>
        <span className="rounded-full bg-violet-900/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-300">
          admin
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          Plataforma
        </p>
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-violet-900/50 text-violet-200"
                      : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                  }`}
                >
                  <span className="text-[15px] leading-none">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-800 px-3 py-3">
        <p className="text-[11px] text-gray-500 mb-2 px-1">Admin Foocci</p>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors disabled:opacity-50"
        >
          <span className="text-[13px]">↩</span>
          {loggingOut ? "Saindo…" : "Sair"}
        </button>
      </div>
    </aside>
  );
}
