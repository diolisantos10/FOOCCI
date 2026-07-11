"use client";

/**
 * Central WhatsApp — barra de abas que unifica as telas de WhatsApp num só hub.
 *
 * Faxina: em vez de 4 entradas soltas na sidebar + um simulador órfão fora do
 * menu, tudo vira ABA da Central WhatsApp. Cada aba é uma rota que já existe —
 * navegação client-side, sem mover o corpo das páginas (seguro).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: Array<{ href: string; label: string }> = [
  { href: "/admin/agents/whatsapp", label: "🎛️ Cockpit" },
  { href: "/admin/diagnostics/whatsapp-text-ordering", label: "🧾 Pedido por Texto" },
  { href: "/admin/diagnostics/whatsapp-text-ordering/simulator", label: "💬 Simulador" },
  { href: "/admin/diagnostics/whatsapp-routing-test", label: "🧬 Roteamento" },
];

export function CentralWhatsAppTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 border-b border-gray-700/60">
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-violet-500 text-white"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <p className="mt-1 pb-1 text-[11px] text-gray-500">
        Central WhatsApp — cockpit, pedido por texto, simulador e roteamento num só lugar.
      </p>
    </nav>
  );
}
