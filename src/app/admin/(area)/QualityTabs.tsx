"use client";

/**
 * Qualidade — barra de abas que unifica o painel de auditoria e os Test Centers
 * dos agentes (Garçom, CRM, Analytics) num só hub.
 *
 * Faxina: em vez de 3 telas "Testes" soltas (achadas só por links espalhados),
 * tudo vira ABA do /admin/quality. Cada aba é uma rota existente — navegação
 * client-side, sem mover o corpo das páginas.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: Array<{ href: string; label: string }> = [
  { href: "/admin/quality", label: "🛡️ Auditoria" },
  { href: "/admin/agentes/waiter/testes", label: "🍽️ Testes Garçom" },
  { href: "/admin/agentes/crm/testes", label: "💬 Testes CRM" },
  { href: "/admin/agentes/analytics/testes", label: "📊 Testes Analytics" },
];

export function QualityTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 border-b border-gray-200">
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <p className="mt-1 pb-1 text-[11px] text-gray-400">
        Qualidade — auditoria dos agentes e os Test Centers (Garçom, CRM, Analytics) num só lugar.
      </p>
    </nav>
  );
}
