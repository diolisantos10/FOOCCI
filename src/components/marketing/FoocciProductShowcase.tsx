/**
 * FoocciProductShowcase — illustrative composed product surface (pre-launch).
 * Server component.
 *
 * Reuses the shared mockup language (mockups.tsx): a guided-order phone next to a
 * CRM / campaign panel with floating context chips and a NON-interactive
 * "Enviar campanha" button. No real data, no metrics, no actions, no submission.
 * Stacks cleanly on mobile (chips are decorative and hidden on small screens).
 */

import type { ReactNode } from "react";
import { OrderMockup, AppFrame, MockRow, IconTile, Tag, Bar } from "./mockups";
import { Halo } from "./premium";
import {
  MegaphoneIcon,
  CartRefreshIcon,
  RepeatIcon,
  UsersIcon,
  SparklesIcon,
  CheckIcon,
  ArrowRightIcon,
} from "./icons";

function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-[0_10px_28px_-14px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.03] backdrop-blur ${className}`}
    >
      {children}
    </span>
  );
}

export function FoocciProductShowcase({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-3xl ${className}`} role="img" aria-label="Prévia ilustrativa do sistema Foocci: pedido guiado, CRM e campanha pronta para envio.">
      <Halo className="left-1/2 top-2 h-60 w-[34rem] -translate-x-1/2" color="rgba(249,115,22,0.10)" />

      <div className="relative grid items-center gap-5 sm:grid-cols-2 sm:gap-6 lg:gap-8">
        {/* Phone — guided order */}
        <div className="relative z-10 mx-auto w-full max-w-xs sm:mx-0 lg:translate-y-4">
          <OrderMockup />
        </div>

        {/* Campaign / CRM panel with a fake (non-interactive) send button */}
        <div className="relative z-0">
          <AppFrame label="Foocci · campanhas">
            <div className="flex items-center gap-3">
              <IconTile tone="brand" className="h-11 w-11">
                <MegaphoneIcon className="h-5 w-5" />
              </IconTile>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#0B0B0B]">Campanha CRM</p>
                <Bar w="w-24" className="mt-1.5" />
              </div>
              <Tag tone="brand">Pronta</Tag>
            </div>
            <div className="mt-3.5 space-y-2">
              <MockRow
                icon={<RepeatIcon className="h-4 w-4" />}
                title="Cliente recorrente"
                tone="success"
                trailing={<Bar w="w-10" />}
              />
              <MockRow
                icon={<CartRefreshIcon className="h-4 w-4" />}
                title="Oportunidade recuperada"
                tone="amber"
                trailing={<CheckIcon className="h-4 w-4 text-emerald-500" />}
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3.5">
              <span className="text-[11px] font-medium text-gray-400">Pré-visualização</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm">
                Enviar campanha
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </span>
            </div>
          </AppFrame>
        </div>
      </div>

      {/* Floating context chips (decorative; hidden on small to avoid overflow) */}
      <Chip className="absolute -left-2 top-1 hidden lg:inline-flex">
        <UsersIcon className="h-3.5 w-3.5 text-brand-500" />
        Cliente identificado
      </Chip>
      <Chip className="absolute -right-2 bottom-2 hidden lg:inline-flex">
        <SparklesIcon className="h-3.5 w-3.5 text-brand-500" />
        Sugestão inteligente
      </Chip>
    </div>
  );
}
