/**
 * RelationshipRevenuePanel — visualizes the thesis "relacionamento vira
 * recorrência, recorrência vira faturamento" as a connected flow of neutral
 * labels. Server component, presentation only. No metrics. Reusable across pages.
 *
 * ⚠️ A linha só vira HORIZONTAL no `lg`, e isso não é gosto: quatro cartões de
 * 168px + setas + respiro somam ~832px, e no tablet (768px) o contêiner tem 728.
 * Com `sm:flex-row` a página inteira ganhava 22px de rolagem lateral — foi assim
 * que `/site/sobre` estourava a 768px. Empilhado é a forma segura; a linha é o
 * luxo de quem tem largura.
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
      className={`rounded-2xl border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_22px_48px_-26px_rgba(15,23,42,0.28)] ring-1 ring-ink/[0.02] sm:p-8 ${className}`}
    >
      <p className="text-center text-base font-semibold text-ink sm:text-lg">
        Relacionamento vira recorrência.{" "}
        <span className="text-brand-500">Recorrência vira faturamento.</span>
      </p>
      <div className="mt-6 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:justify-center">
        {NODES.map(({ icon: Icon, label, tone }, i) => (
          <div key={label} className="flex flex-col items-center gap-3 lg:flex-row">
            <span className="inline-flex w-full items-center gap-2.5 rounded-xl border border-line bg-paper px-4 py-3 shadow-sm lg:w-auto lg:min-w-[168px]">
              <IconTile tone={tone} className="h-8 w-8">
                <Icon className="h-4 w-4" />
              </IconTile>
              <span className="text-sm font-semibold text-ink">{label}</span>
            </span>
            {i < NODES.length - 1 && (
              <ArrowRightIcon className="h-5 w-5 rotate-90 text-brand-300 lg:rotate-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
