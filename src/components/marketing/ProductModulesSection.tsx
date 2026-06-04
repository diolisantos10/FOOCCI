/**
 * Product modules grid. Server component.
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

const MODULES = [
  { icon: MenuBookIcon, title: "Cardápio Digital Inteligente", benefit: "Mostra, organiza e conduz o cliente até o pedido." },
  { icon: SparklesIcon, title: "Pedido Guiado com IA", benefit: "Ajuda o cliente a montar o pedido e sugere complementos." },
  { icon: ChatIcon, title: "WhatsApp Inteligente", benefit: "Organiza conversas e direciona para a compra." },
  { icon: UsersIcon, title: "CRM para Restaurantes", benefit: "Reúne quem comprou, quem voltou e quem sumiu." },
  { icon: MegaphoneIcon, title: "Campanhas e Reativação", benefit: "Permite criar ações para trazer clientes de volta." },
  { icon: CartRefreshIcon, title: "Recuperação de Carrinho", benefit: "Ajuda a resgatar pedidos que ficaram pelo caminho." },
  { icon: ChartIcon, title: "Dashboard Comercial", benefit: "Dá clareza sobre vendas e relacionamento." },
  { icon: RepeatIcon, title: "Fidelização e Recorrência", benefit: "Constrói o hábito do cliente voltar." },
];

export function ProductModulesSection() {
  return (
    <section id="solucoes" className="scroll-mt-20 bg-gray-50 py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-500">
            Soluções
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Tudo conectado para o restaurante vender melhor.
          </h2>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map(({ icon: Icon, title, benefit }) => (
            <div
              key={title}
              className="group rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#0B0B0B]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{benefit}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
