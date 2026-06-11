/**
 * CRM section. Server component.
 * Careful wording: "ajuda a organizar" / "permite criar campanhas" — no claims
 * of automated behavior that isn't validated here. The customer-base mockup uses
 * the shared mockup language (mockups.tsx) for visual consistency.
 */

import { UsersIcon, RepeatIcon, CartRefreshIcon, StarIcon, HeartIcon } from "./icons";
import { PrimaryCta } from "./Cta";
import { AppFrame, MockRow, Bar } from "./mockups";

const SEGMENTS = [
  { icon: UsersIcon, label: "Cliente novo", tone: "sky" as const },
  { icon: RepeatIcon, label: "Cliente recorrente", tone: "success" as const },
  { icon: CartRefreshIcon, label: "Cliente sumido", tone: "amber" as const },
  { icon: StarIcon, label: "Cliente VIP", tone: "brand" as const },
  { icon: HeartIcon, label: "Aniversariante", tone: "rose" as const },
];

export function CRMSection() {
  return (
    <section id="crm" aria-labelledby="crm-title" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2 lg:px-8">
        <div>
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">CRM</span>
          <h2 id="crm-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Seus clientes não deveriam desaparecer depois do pedido.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-gray-600">
            Com o Foocci, seu restaurante começa a construir uma base viva de clientes:
            quem comprou, quem voltou, quem sumiu e quem pode receber uma campanha especial.
          </p>
          <p className="mt-4 text-base text-gray-500">
            CRM para restaurante não precisa ser complicado. Precisa mostrar quem
            merece atenção e qual oportunidade pode virar venda.
          </p>
          <div className="mt-7">
            <PrimaryCta withArrow />
          </div>
        </div>

        <AppFrame label="Foocci · base de clientes" className="lg:ml-auto lg:max-w-md">
          <div className="space-y-2">
            {SEGMENTS.map(({ icon: Icon, label, tone }) => (
              <MockRow
                key={label}
                icon={<Icon className="h-4 w-4" />}
                title={label}
                tone={tone}
                trailing={<Bar w="w-14" />}
              />
            ))}
          </div>
        </AppFrame>
      </div>
    </section>
  );
}
