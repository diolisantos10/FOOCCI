import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";

export const metadata = { title: "Marketing" };

const SECTIONS = [
  {
    href:        "/crm",
    icon:        "📊",
    label:       "CRM",
    description: "Motor de receita: veja oportunidades diárias, clientes inativos, VIPs e configure automações de WhatsApp.",
  },
  {
    href:        "/promotions",
    icon:        "🎁",
    label:       "Promoções",
    description: "Crie e gerencie promoções, cupons, combos e descontos para atrair e fidelizar clientes.",
  },
  {
    href:        "/settings/experience",
    icon:        "✨",
    label:       "Experiência",
    description: "Configure cores, logo e identidade visual do restaurante no cardápio digital.",
  },
];

export default function MarketingPage() {
  return (
    <>
      <TopBar title="Marketing" />
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <p className="text-sm text-gray-500">
            Gerencie a experiência da marca e o agente de IA que representa seu restaurante.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-brand-200 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-xl">
                  {s.icon}
                </span>
                <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
                  {s.label}
                </p>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {s.description}
              </p>
            </Link>
          ))}
        </div>

        {/* Future campaigns teaser */}
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Em breve</p>
          <p className="text-sm font-medium text-gray-700">Campanhas e automações</p>
          <p className="mt-1 text-xs text-gray-400">
            Envio em massa pelo WhatsApp e análise de conversão por campanha.
          </p>
        </div>
      </div>
    </>
  );
}
