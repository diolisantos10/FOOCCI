/**
 * CRM section. Server component.
 * Careful wording: "ajuda a organizar" / "permite criar campanhas" — no claims
 * of automated behavior that isn't validated here.
 */

import { UsersIcon, RepeatIcon, CartRefreshIcon, StarIcon, HeartIcon } from "./icons";

const SEGMENTS = [
  { icon: UsersIcon, label: "Cliente novo", color: "text-sky-600 bg-sky-50" },
  { icon: RepeatIcon, label: "Cliente recorrente", color: "text-emerald-600 bg-emerald-50" },
  { icon: CartRefreshIcon, label: "Cliente sumido", color: "text-amber-600 bg-amber-50" },
  { icon: StarIcon, label: "Cliente VIP", color: "text-brand-600 bg-brand-50" },
  { icon: HeartIcon, label: "Aniversariante", color: "text-rose-600 bg-rose-50" },
];

export function CRMSection() {
  return (
    <section id="crm" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2 lg:px-8">
        <div>
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">CRM</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Seus clientes não deveriam desaparecer depois do pedido.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-gray-600">
            Com a Foocci, seu restaurante começa a construir uma base viva de clientes:
            quem comprou, quem voltou, quem sumiu e quem pode receber uma campanha especial.
          </p>
          <p className="mt-4 text-base text-gray-500">
            A Foocci ajuda a organizar esses clientes e permite criar campanhas para o
            momento certo.
          </p>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Base de clientes
          </p>
          <div className="mt-4 space-y-3">
            {SEGMENTS.map(({ icon: Icon, label, color }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3"
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-gray-800">{label}</span>
                <span className="ml-auto h-2 w-16 rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
