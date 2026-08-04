/**
 * /site/atendimento-com-ia — o carro-chefe nº 1: o Garçom de IA que atende o
 * cliente final. Herda /site/layout.tsx. Página estática (server component, sem
 * fetch — não precisa dos estados loading/vazio/erro).
 *
 * O coração da página é `WaiterRealShowcase`: as CINCO telas reais do pedido pelo
 * Garçom, capturadas no celular do CEO (03/08) e já publicadas. Aqui elas ganham
 * casa própria, com uma faixa curta que nomeia o que o agente faz antes de mostrar
 * a prova. Toda conversão aponta pro FORMULÁRIO de demonstração (DEMO_URL).
 *
 * Design: tokens do DESIGN.md (ink/ink2/muted/paper/canvas/line + escala brand-*),
 * ação primária brand-500/600, card rounded-2xl, pesos 400/600.
 */

import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBand } from "@/components/marketing/CtaBand";
import { WaiterRealShowcase } from "@/components/marketing/WaiterRealShowcase";
import { Eyebrow } from "@/components/marketing/premium";
import {
  ChatIcon,
  SparklesIcon,
  TrendingUpIcon,
  CheckIcon,
} from "@/components/marketing/icons";
import { DEMO_URL, DEMO_CTA_LABEL, SOLUCOES_URL } from "@/components/marketing/config";

const TITLE = "Atendimento com IA | O garçom de IA do Foocci";
const DESCRIPTION =
  "Um garçom de IA que atende o seu cliente pelo próprio cardápio: sugere pratos, monta o pedido, oferece o extra e não inventa nada que você não tem. Veja as telas reais.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const CAPACIDADES = [
  {
    icon: ChatIcon,
    title: "Atende no seu tom",
    copy: "Responde pelo cardápio, pelo WhatsApp e pelo QR da mesa — com a personalidade que você definir, sem parecer robô.",
  },
  {
    icon: SparklesIcon,
    title: "Sugere e monta o pedido",
    copy: "“Quero uma sugestão” e ele responde com pratos reais, foto e preço — e ainda respeita restrição e alergia.",
  },
  {
    icon: TrendingUpIcon,
    title: "Vende o extra",
    copy: "Antes de fechar, oferece bebida, sobremesa e adicional — o “mais alguma coisa?” que aumenta o tíquete sem ser chato.",
  },
  {
    icon: CheckIcon,
    title: "Não inventa prato",
    copy: "Toda resposta é conferida contra o seu cardápio real antes de sair. E toda madrugada um simulador testa o atendimento.",
  },
];

export default function AtendimentoComIaPage() {
  return (
    <>
      <PageHero
        badge="Atendimento com IA"
        title="Um garçom de IA que atende, sugere e vende — pelo seu cardápio."
        subtitle="O cliente conversa, escolhe e paga numa tela só. O Garçom conduz o pedido do “oi” à confirmação, sem app, sem cadastro e sem fila de atendente."
        primaryLabel={DEMO_CTA_LABEL}
        primaryHref={DEMO_URL}
        secondaryLabel="Ver as outras soluções"
        secondaryHref={SOLUCOES_URL}
      />

      {/* O que o Garçom faz — nomeado antes da prova */}
      <section aria-labelledby="capacidades-title" className="bg-paper py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>O que ele faz</Eyebrow>
            <h2 id="capacidades-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Um atendente que trabalha o pedido inteiro.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink2">
              Não é um chat que responde pergunta — é um garçom que conduz a venda,
              do primeiro contato ao pagamento.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPACIDADES.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="rounded-2xl border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(11,11,11,0.03)]">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink2">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* A prova: as 5 telas reais do pedido pelo Garçom (prints do CEO) */}
      <WaiterRealShowcase />

      <CtaBand
        title="Veja o Garçom atendendo com o cardápio do seu restaurante."
        label={DEMO_CTA_LABEL}
        href={DEMO_URL}
      />
    </>
  );
}
