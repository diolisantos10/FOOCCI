/**
 * Revenue ← recurrence ← relationship — the V3 commercial argument. Server component.
 *
 * The page's dark anchor: makes explicit that revenue grows as a CONSEQUENCE of
 * relationship, without cold sales language. Left: thesis + proof points. Right:
 * the campaign mockup (white card pops on near-black) + approved opportunity
 * labels. No numbers, no fake metrics. Carries the home #crm anchor.
 */

import {
  CheckIcon,
  RepeatIcon,
  MegaphoneIcon,
  CartRefreshIcon,
  UsersIcon,
  ChatIcon,
} from "./icons";
import { CampaignMockup } from "./mockups";

const POINTS = [
  "Mais pedidos diretos",
  "Clientes recorrentes",
  "Campanhas mais relevantes",
  "Oportunidades recuperadas",
  "CRM simples para restaurante",
  "Atendimento com contexto",
];

const LABELS = [
  { icon: RepeatIcon, label: "Cliente recorrente" },
  { icon: UsersIcon, label: "Cliente em risco" },
  { icon: MegaphoneIcon, label: "Campanha enviada" },
  { icon: CartRefreshIcon, label: "Pedido recuperado" },
  { icon: ChatIcon, label: "Histórico salvo" },
];

export function RevenueRelationshipSection() {
  return (
    <section id="crm" aria-labelledby="faturamento-title" className="relative scroll-mt-20 overflow-hidden bg-[#0B0B0B] py-20 lg:py-28">
      {/* restrained warm glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/4 top-0 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(249,115,22,0.16),transparent)]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        {/* Thesis + points */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-400">
            Relacionamento → recorrência → faturamento
          </span>
          <h2
            id="faturamento-title"
            className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl"
          >
            Relacionamento que vira recorrência.{" "}
            <span className="text-brand-400">Recorrência que vira faturamento.</span>
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-400">
            Quando o restaurante conhece o cliente, conduz melhor o pedido e continua a
            conversa depois da compra, cada atendimento deixa de ser uma venda isolada e
            passa a ser parte de uma relação que cresce.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                <span className="text-base text-gray-200">{p}</span>
              </li>
            ))}
          </ul>

          <figure className="mt-10 border-l-2 border-brand-500/60 pl-5">
            <blockquote className="text-lg font-semibold text-white">
              “Marketplace entrega pedido.{" "}
              <span className="text-brand-400">Relacionamento constrói cliente.”</span>
            </blockquote>
          </figure>
        </div>

        {/* Opportunity mockup + approved labels */}
        <div className="relative mx-auto w-full max-w-sm">
          <div
            aria-hidden
            className="absolute -inset-5 -z-10 rounded-[2rem] bg-white/[0.04] ring-1 ring-white/10"
          />
          <CampaignMockup />
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {LABELS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-gray-200"
              >
                <Icon className="h-3.5 w-3.5 text-brand-400" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
