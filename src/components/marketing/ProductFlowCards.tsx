/**
 * ProductFlowCards — four connected capability cards. Server component.
 *
 * Shows the system working end to end (pedido → cliente → campanha → recuperação)
 * with dotted connectors. Pre-launch: neutral labels, no metrics, no claims.
 */

import type { ComponentType } from "react";
import { MenuBookIcon, UsersIcon, MegaphoneIcon, CartRefreshIcon } from "./icons";

type Card = { icon: ComponentType<{ className?: string }>; title: string; copy: string };

const CARDS: Card[] = [
  { icon: MenuBookIcon, title: "Pedido guiado", copy: "Ajuda o cliente a escolher com menos fricção." },
  { icon: UsersIcon, title: "Cliente identificado", copy: "Reconhece histórico, preferências e recorrência." },
  { icon: MegaphoneIcon, title: "Campanha no momento certo", copy: "Cria comunicações relevantes para trazer o cliente de volta." },
  { icon: CartRefreshIcon, title: "Oportunidade recuperada", copy: "Reativa pedidos e conversas que poderiam se perder." },
];

export function ProductFlowCards({ className = "" }: { className?: string }) {
  return (
    <ol className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {CARDS.map(({ icon: Icon, title, copy }, i) => (
        <li key={title} className="relative flex">
          {/* dotted connector to the next card (lg) */}
          {i < CARDS.length - 1 && (
            <span
              aria-hidden
              className="absolute -right-3 top-10 hidden w-6 border-t-2 border-dotted border-brand-300 lg:block"
            />
          )}
          <div className="flex h-full w-full flex-col rounded-2xl border border-gray-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_34px_-22px_rgba(15,23,42,0.22)] ring-1 ring-gray-900/[0.02]">
            <div className="flex items-center justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold tabular-nums text-gray-200">0{i + 1}</span>
            </div>
            <h3 className="mt-4 text-base font-semibold leading-snug text-[#0B0B0B]">{title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600">{copy}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
