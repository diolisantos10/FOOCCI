"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
    label: "Vendas",
    items: [
      { href: "/orders",      label: "Pedidos",   icon: "📋" },
      { href: "/atendimento", label: "Central de Conversas", icon: "🎧" },
      { href: "/menu",        label: "Cardápio",   icon: "🍽️" },
      { href: "/precificacao", label: "CMV & Precificação", icon: "🧮" },
      { href: "/agente-ia",   label: "Agentes IA", icon: "✨", ignoreSubpaths: ["/agente-ia/whatsapp"] },
      { href: "/analytics",   label: "Analytics",  icon: "📈" },
    ],
  },
  {
    label: "Marketing",
    items: [
      // Promoções foi desplugada da navegação — os cupons agora são definidos
      // dentro de cada campanha (CRM → Campanhas). A página segue existindo por URL.
      { href: "/crm",        label: "CRM",       icon: "📊" },
      { href: "/canais",     label: "Canais",    icon: "🔗" },
      { href: "/marca",      label: "Marca",     icon: "🎨" },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { href: "/settings",          label: "Configurações",   icon: "⚙️" },
      { href: "/integracoes",       label: "Integrações",     icon: "🔌" },
      { href: "/menu-enhancement",  label: "Fotos do Cardápio", icon: "📸" },
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
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
          className="fixed inset-0 z-40 bg-ink/45 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel
          Mobile: fixed drawer, slides in from left (z-50)
          Desktop: static, always visible (lg:static, lg:translate-x-0) */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex h-screen w-60 shrink-0 flex-col
          border-r border-line bg-paper
          transition-transform duration-200 ease-in-out
          lg:static lg:z-auto lg:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Brand — Foocci logomark + wordmark, kept isolated as pure branding.
            The partner restaurant + logged-in user live in the TopBar account
            cluster (top-right), so this stays untouched. */}
        <div className="relative flex items-center justify-center border-b border-line px-4 py-4">
          <Link href="/dashboard" onClick={close} className="flex items-center">
            {/* Só a logo (wordmark) — logo e anagrama nunca juntos. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/foocci/foocci-wordmark.png" alt="Foocci" className="h-7" />
          </Link>
          {/* Close button — mobile only (absoluto pra não desalinhar a logo centralizada) */}
          <button
            type="button"
            onClick={close}
            aria-label="Fechar menu"
            className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-[#F4F4F2] hover:text-ink2 lg:hidden"
          >
            ✕
          </button>
        </div>

        {/* Nav — scrollbar hidden (scrolls invisibly) for a cleaner look */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                      : "text-ink2 hover:bg-[#F4F4F2] hover:text-ink"
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
                <div className="mb-3 border-t border-line" />
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
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
                                ? "text-muted hover:bg-[#FAFAF8]"
                                : "text-ink2 hover:bg-[#F4F4F2] hover:text-ink"
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="text-[15px] leading-none">{item.icon}</span>
                            {item.label}
                          </span>
                          {item.soon && (
                            <span className="shrink-0 rounded-full bg-[#F4F4F2] px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-muted">
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

        {/* Footer */}
        <div className="border-t border-line px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Foocci · v1</p>
        </div>
      </aside>
    </>
  );
}
