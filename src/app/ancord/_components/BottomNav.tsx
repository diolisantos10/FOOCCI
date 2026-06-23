"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/ancord", label: "Início", emoji: "🏠", exact: true },
  { href: "/ancord/estudar", label: "Estudar", emoji: "⚡", exact: false },
  { href: "/ancord/simulado", label: "Simulado", emoji: "📝", exact: false },
  { href: "/ancord/modulos", label: "Módulos", emoji: "📚", exact: false },
  { href: "/ancord/tutor", label: "Tutor", emoji: "🤖", exact: false },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {ITEMS.map((it) => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-brand-600" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <span className={`text-lg leading-none ${active ? "scale-110" : ""} transition-transform`}>
                {it.emoji}
              </span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
