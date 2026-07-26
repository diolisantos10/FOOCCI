"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  icon: string;
  soon?: boolean;
}

interface Group {
  title: string;
  items: Tab[];
}

const GROUPS: Group[] = [
  {
    title: "Operação",
    items: [
      { href: "/settings/store",     label: "Loja",       icon: "🏪" },
      { href: "/settings/delivery",  label: "Entrega",    icon: "🛵" },
      { href: "/settings/operation", label: "Operação",   icon: "⏰" },
      { href: "/settings/payments",     label: "Pagamentos",  icon: "💳" },
      { href: "/settings/notas-fiscais", label: "Notas Fiscais", icon: "🧾" },
      { href: "/settings/impressoras", label: "Impressoras", icon: "🖨️" },
      { href: "/settings/sons",       label: "Sons e alertas", icon: "🔔" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/settings/team",     label: "Equipe",    icon: "👥" },
      { href: "/settings/policies", label: "Políticas", icon: "📄" },
    ],
  },
];

export default function SettingsNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: left sidebar */}
      <nav className="hidden w-52 shrink-0 flex-col overflow-y-auto border-r border-line bg-paper py-4 lg:flex">
        {GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="mb-1 px-4 text-[10px] font-bold uppercase tracking-widest text-muted">
              {group.title}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group mx-2 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-50 text-brand-600"
                      : "text-ink2 hover:bg-[#FAFAF8] hover:text-ink"
                  } ${item.soon ? "opacity-50 cursor-default pointer-events-none" : ""}`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.soon && (
                    <span className="rounded-full bg-line2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted">
                      breve
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Mobile: horizontal tab strip (faixa de altura fixa no topo, não encolhe) */}
      <nav className="flex shrink-0 overflow-x-auto border-b border-line bg-paper px-2 py-1.5 scrollbar-hide lg:hidden">
        {GROUPS.flatMap((g) => g.items).map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? "bg-brand-50 text-brand-600"
                  : "text-muted hover:text-ink"
              } ${item.soon ? "opacity-40 pointer-events-none" : ""}`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
