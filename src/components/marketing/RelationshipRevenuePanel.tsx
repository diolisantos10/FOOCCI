/**
 * RelationshipRevenuePanel — visualizes the thesis "relacionamento vira
 * recorrência, recorrência vira faturamento" as a connected flow of neutral
 * labels. Server component, presentation only. No metrics. Reusable across pages.
 */

import { UsersIcon, RepeatIcon, MegaphoneIcon, CartRefreshIcon, ArrowRightIcon } from "./icons";
import { IconTile } from "./mockups";

const NODES = [
  { icon: UsersIcon, label: "Cliente identificado", tone: "brand" as const },
  { icon: RepeatIcon, label: "Cliente recorrente", tone: "success" as const },
  { icon: MegaphoneIcon, label: "Campanha pronta", tone: "brand" as const },
  { icon: CartRefreshIcon, label: "Oportunidade recuperada", tone: "amber" as const },
];

export function RelationshipRevenuePanel({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-gray-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_22px_48px_-26px_rgba(15,23,42,0.28)] ring-1 ring-gray-900/[0.02] sm:p-8 ${className}`}
    >
      <p className="text-center text-base font-semibold text-[#0B0B0B] sm:text-lg">
        Relacionamento vira recorrência.{" "}
        <span className="text-brand-500">Recorrência vira faturamento.</span>
      </p>
      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
        {NODES.map(({ icon: Icon, label, tone }, i) => (
          <div key={label} className="flex flex-col items-center gap-3 sm:flex-row">
            <span className="inline-flex w-full items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm sm:w-auto sm:min-w-[168px]">
              <IconTile tone={tone} className="h-8 w-8">
                <Icon className="h-4 w-4" />
              </IconTile>
              <span className="text-sm font-semibold text-[#0B0B0B]">{label}</span>
            </span>
            {i < NODES.length - 1 && (
              <ArrowRightIcon className="h-5 w-5 rotate-90 text-brand-300 sm:rotate-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
