"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSidebar } from "./SidebarContext";

// ── Nav structure ──────────────────────────────────────────────────────────────

type NavItem = {
  href:    string;
  label:   string;
  icon:    string;
  exact?:  boolean;
  soon?:   boolean;
  /**
   * Subpath prefixes that should NOT trigger this item's active state.
   * Useful when a more specific sidebar item handles that subpath.
   */
  ignoreSubpaths?: string[];
  /**
   * Additional path prefixes that DO trigger this item's active state,
   * even when the pathname does not start with item.href.
   */
  extraActivePaths?: string[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const HOME_ITEM: NavItem = {
  href:  "/dashboard",
  label: "Início",
  icon:  "▦",
  exact: true,
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Atendimento",
    items: [
      { href: "/orders",      label: "Pedidos",   icon: "📋" },
      { href: "/atendimento", label: "Chat",       icon: "🎧" },
      { href: "/menu",        label: "Cardápio",   icon: "🍽️" },
      { href: "/agente-ia",   label: "Agente IA",  icon: "🤖" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/promotions", label: "Promoções", icon: "🎁" },
      { href: "/crm",        label: "CRM",       icon: "📊" },
      { href: "/marca",      label: "Marca",     icon: "🎨" },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { href: "/test-ai",     label: "Testar IA",    icon: "💬", extraActivePaths: ["/chat-sim"] },
      { href: "/ai-simulator", label: "Simulador IA", icon: "🔬" },
      { href: "/waiter-lab",  label: "Waiter Lab",   icon: "🧪" },
      { href: "/settings",    label: "Configurações", icon: "⚙️" },
      { href: "/integracoes", label: "Integrações",   icon: "🔌" },
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { open, close } = useSidebar();

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    // Extra paths take precedence — always active regardless of href
    if (item.extraActivePaths?.some((p) => pathname.startsWith(p))) return true;
    if (!pathname.startsWith(item.href)) return false;
    if (item.ignoreSubpaths?.some((p) => pathname.startsWith(p))) return false;
    return true;
  }

  return (
    <>
      {/* Mobile overlay — tap outside to close */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel
          Mobile: fixed drawer, slides in from left (z-50)
          Desktop: static, always visible (lg:static, lg:translate-x-0) */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex h-screen w-56 shrink-0 flex-col
          border-r border-[#E5E5E5] bg-white
          transition-transform duration-200 ease-in-out
          lg:static lg:z-auto lg:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Brand */}
        <div className="flex h-14 items-center justify-between border-b border-[#E5E5E5] px-4">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold tracking-tight text-[#0B0B0B]">
              Foocci
            </span>
            <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-600">
              beta
            </span>
          </div>
          {/* Close button — mobile only */}
          <button
            type="button"
            onClick={close}
            aria-label="Fechar menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
          >
            ✕
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          {/* Standalone home item */}
          <div className="mb-3">
            {(() => {
              const active = pathname === HOME_ITEM.href;
              return (
                <Link
                  href={HOME_ITEM.href}
                  onClick={close}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-brand-50 text-brand-600"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <span className="text-[15px] leading-none">{HOME_ITEM.icon}</span>
                  {HOME_ITEM.label}
                </Link>
              );
            })()}
          </div>

          <ul className="space-y-4">
            {NAV_GROUPS.map((group) => (
              <li key={group.label}>
                <div className="mb-3 border-t border-gray-100" />
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item);

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={close}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                            active
                              ? "bg-brand-50 font-semibold text-brand-600"
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
                            <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-gray-400">
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
        <div className="border-t border-[#E5E5E5] px-3 py-3">
          <p className="truncate text-xs font-semibold text-gray-800">
            {session?.user?.name ?? "—"}
          </p>
          <p className="truncate text-[10px] uppercase tracking-wide text-gray-400">
            {session?.user?.role}
          </p>
        </div>
      </aside>
    </>
  );
}
