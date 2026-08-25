/**
 * /site/crm — o carro-chefe nº 2: o CRM de relacionamento e reativação. Herda
 * /site/layout.tsx. Página estática (server component, sem fetch — não precisa dos
 * estados loading/vazio/erro).
 *
 * O coração da página é `CrmRealShowcase`: telas reconstruídas dos prints reais do
 * painel, com NÚMEROS reais de um restaurante operando no Foocci (jul/2026). A
 * faixa curta antes da prova fala com o LOJISTA — o que o CRM faz por ele. UM CTA
 * comercial, no fim, para o FORMULÁRIO de demonstração — ver a regra em
 * `DEMO_CTA_LABEL` (config do site).
 *
 * Design: tokens do DESIGN.md (ink/ink2/muted/paper/canvas/line + escala brand-*),
 * ação primária brand-500/600, card rounded-2xl, pesos 400/600.
 */

import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { heroShot } from "@/components/marketing/HeroShot";
import { PRODUCT_SHOTS, SITE_ASSETS } from "@/components/marketing/siteAssets";
import { CtaBand } from "@/components/marketing/CtaBand";
import { CrmRealShowcase } from "@/components/marketing/CrmRealShowcase";
import { Eyebrow } from "@/components/marketing/premium";
import {
  UsersIcon,
  MegaphoneIcon,
  TrendingUpIcon,
} from "@/components/marketing/icons";
import { SOLUCOES_URL } from "@/components/marketing/config";

const TITLE = "CRM para restaurantes | Traga o cliente de volta com o Foocci";
const DESCRIPTION =
  "O CRM do Foocci classifica a base sozinho, dispara as campanhas certas no automático e prova, pedido a pedido, quanto trouxe de volta. Veja telas reais, com números reais.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const VALOR = [
  {
    icon: UsersIcon,
    title: "Classifica a base sozinho",
    copy: "Cada cliente entra numa faixa — quente, morno, frio, perdido — e é reclassificado todo dia. Sem planilha, sem esforço seu.",
  },
  {
    icon: MegaphoneIcon,
    title: "Campanhas no automático",
    copy: "Boas-vindas, aniversário, cliente sumido, carrinho abandonado: cada uma com o próprio público e horário. Você não aperta botão.",
  },
  {
    icon: TrendingUpIcon,
    title: "Prova quanto trouxe",
    copy: "O Foocci não estima. Mostra a mensagem enviada, o pedido que veio depois e quanto valeu — conversão a conversão.",
  },
];

export default function CrmPage() {
  return (
    <>
      <PageHero
        badge="CRM"
        title="Seu cliente não deveria sumir depois do primeiro pedido."
        subtitle="O CRM do Foocci monta uma base viva, vê quem está esfriando e age antes de perder — e prova, em reais, quanto cada mensagem trouxe de volta."
        /* O hero NÃO convida para o formulário (05/08) — mesmo motivo da página do
           Garçom: convite antes da prova, para quem acabou de pousar. O botão leva
           às telas reais do painel, com os números de julho, mais abaixo. O convite
           é a `CtaBand`, no fim. */
        primaryLabel="Ver as telas reais"
        primaryHref="#crm-na-pratica"
        secondaryLabel="Ver as outras soluções"
        secondaryHref={SOLUCOES_URL}
        /* O CRM é tela de PAINEL, não de celular: quem lê esta página é o dono,
           e o que ele quer ver é o próprio painel. Sem a captura, entra a foto do
           dono conferindo o movimento no salão — a mesma cena, sem prometer tela
           que não está fotografada. */
        visual={heroShot([
          {
            kind: "browser",
            src: PRODUCT_SHOTS.painelCrm,
            alt: "Painel do Foocci na tela do computador: as campanhas de CRM e o retorno que cada uma trouxe.",
            address: "foocci.com.br/crm",
          },
          {
            kind: "photo",
            src: SITE_ASSETS.journey[2]!,
            focus: "50% 38%",
            alt: "Dono de restaurante, de avental, sorrindo enquanto confere o tablet no salão iluminado.",
          },
        ])}
      />

      {/* O que o CRM faz pelo lojista — antes da prova em números */}
      <section aria-labelledby="valor-title" className="bg-paper py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>O que ele faz por você</Eyebrow>
            <h2 id="valor-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Relacionamento que roda sozinho — e se paga.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink2">
              O trabalho de trazer o cliente de volta acontece no automático. Você só
              vê o resultado no painel.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {VALOR.map(({ icon: Icon, title, copy }) => (
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

      {/* A prova: telas reais do painel, números reais (jul/2026) */}
      <CrmRealShowcase />

      {/* O único CTA comercial da página — rótulo e destino pelo padrão da `CtaBand`. */}
      <CtaBand title="Ficou com dúvida sobre o CRM? Fale com os nossos agentes." />
    </>
  );
}
