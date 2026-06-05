/**
 * Product modules grid. Server component.
 * Benefit copy describes capability/direction without overpromising.
 */

import {
  MenuBookIcon,
  SparklesIcon,
  ChatIcon,
  UsersIcon,
  MegaphoneIcon,
  CartRefreshIcon,
  ChartIcon,
  RepeatIcon,
} from "./icons";
import { SectionHeading } from "./SectionHeading";
import { DotGrid, Halo, PremiumCard } from "./premium";

const MODULES = [
  { icon: MenuBookIcon, title: "Cardápio Digital Inteligente", benefit: "Uma experiência de pedido visual, simples e feita para conversão." },
  { icon: SparklesIcon, title: "Pedido Guiado com IA", benefit: "A Foocci ajuda o cliente a escolher e concluir o pedido com menos atrito." },
  { icon: ChatIcon, title: "WhatsApp Inteligente", benefit: "Atendimento com mais contexto, organização e continuidade." },
  { icon: UsersIcon, title: "CRM para Restaurantes", benefit: "Clientes, histórico, recorrência e oportunidades em um só lugar." },
  { icon: MegaphoneIcon, title: "Campanhas e Reativação", benefit: "Mensagens mais inteligentes para clientes certos, no momento certo." },
  { icon: CartRefreshIcon, title: "Recuperação de Carrinho", benefit: "Novas chances para clientes que começaram um pedido e não concluíram." },
  { icon: ChartIcon, title: "Dashboard Comercial", benefit: "Dados simples para entender vendas, clientes e oportunidades." },
  { icon: RepeatIcon, title: "Fidelização e Recorrência", benefit: "Relacionamento contínuo para clientes comprarem mais vezes." },
];

export function ProductModulesSection() {
  return (
    <section id="solucoes" aria-labelledby="solucoes-title" className="relative scroll-mt-20 overflow-hidden bg-gray-50 py-20 lg:py-24">
      <DotGrid className="[mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
      <Halo className="left-1/2 top-0 h-64 w-[40rem] -translate-x-1/2" color="rgba(249,115,22,0.07)" />
      <div className="relative mx-auto max-w-6xl px-5 lg:px-8">
        <SectionHeading
          id="solucoes-title"
          eyebrow="Soluções"
          title="Tudo conectado para o restaurante vender melhor."
          subtitle="Um só sistema — do cardápio ao retorno do cliente — sem ferramentas soltas."
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map(({ icon: Icon, title, benefit }) => (
            <PremiumCard key={title} hover className="group p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 transition-colors group-hover:bg-brand-100">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#0B0B0B]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{benefit}</p>
            </PremiumCard>
          ))}
        </div>
      </div>
    </section>
  );
}
