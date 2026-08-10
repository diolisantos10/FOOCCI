/**
 * /site/como-funciona — a JORNADA. Herda /site/layout.tsx.
 *
 * ─── DECISÃO 04/08: enxugar, não aposentar ───────────────────────────────────
 * A página carregava `WaiterRealShowcase` e `CrmRealShowcase` — exatamente os dois
 * blocos que viraram o CORAÇÃO de `/site/atendimento-com-ia` e `/site/crm` quando o
 * menu de produto virou página por item. Resultado: o visitante via a mesma prova
 * duas vezes, e a página deixava de responder à própria pergunta ("como isso
 * funciona junto?") para virar um resumo pior das outras duas.
 *
 * Os dois showcases saíram daqui. Ela ficou com o que é só dela e não existe em
 * lugar nenhum: a JORNADA (os cinco passos), o BASTIDOR e o CICLO — o argumento de
 * INTEGRAÇÃO, que é o diferencial declarado do produto. No lugar dos showcases
 * entrou um índice honesto: "quer ver a prova? ela está nestas páginas".
 *
 * Aposentar por redirect foi considerado e recusado: a URL está no sitemap com
 * conteúdo próprio e indexado, é linkada no rodapé, no CTA fixo do celular
 * (`StickyMobileCta`) e em dois pontos de `/site/sobre`. Trocar uma página que
 * responde a uma pergunta real por um 308 é perder posição de busca e um passo do
 * funil para não escrever trinta linhas — com campanha paga rodando, é o pior
 * negócio dos dois. Nenhum link ficou quebrado.
 *
 * Design: tokens do DESIGN.md. Nesta passagem o `bg-gray-50`, o `text-gray-500` e
 * os `#0B0B0B` literais desta página viraram `canvas`/`muted`/`ink` (drift #4 e #5).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/marketing/PageHero";
import { heroShot } from "@/components/marketing/HeroShot";
import { PRODUCT_SHOTS } from "@/components/marketing/siteAssets";
import { CtaBand } from "@/components/marketing/CtaBand";
import {
  ArrowRightIcon,
  QrIcon,
  SparklesIcon,
  MenuBookIcon,
  UsersIcon,
  MegaphoneIcon,
  ChartIcon,
  RepeatIcon,
} from "@/components/marketing/icons";
import { FoocciProductShowcase } from "@/components/marketing/FoocciProductShowcase";
import { VisualStepCard } from "@/components/marketing/VisualStepCard";
import { VisualStoryBlock } from "@/components/marketing/VisualStoryBlock";
import { MascotHostScene } from "@/components/marketing/MascotHostScene";
import { DotGrid, Eyebrow, PremiumCard } from "@/components/marketing/premium";
import {
  PROPOSTA_URL,
  PRELAUNCH_NOTE,
  ATENDIMENTO_IA_URL,
  CRM_URL,
  EXPERIMENTE_URL,
} from "@/components/marketing/config";

const TITLE = "Como funciona o Foocci | Sistema inteligente para restaurantes";
const DESCRIPTION =
  "Entenda como o Foocci conecta pedido, atendimento, WhatsApp, IA e CRM para ajudar restaurantes a vender mais e fazer clientes voltarem.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  { icon: QrIcon, title: "Cliente chega", desc: "Recepção acolhedora e experiência personalizada desde o primeiro contato — pelo WhatsApp, QR Code ou link." },
  { icon: SparklesIcon, title: "Pedido guiado", desc: "Cardápio inteligente e sugestões que aumentam satisfação e valor do pedido." },
  { icon: UsersIcon, title: "CRM ativo", desc: "Dados que geram contexto e constroem relacionamentos relevantes." },
  { icon: MegaphoneIcon, title: "Campanha", desc: "Comunicação no momento certo, com ofertas que fazem sentido." },
  { icon: RepeatIcon, title: "Cliente volta", desc: "Experiências memoráveis criam preferência e geram recorrência natural." },
];

const FLOW = [
  { icon: UsersIcon, label: "Cliente" },
  { icon: MenuBookIcon, label: "Pedido" },
  { icon: ChartIcon, label: "Histórico" },
  { icon: MegaphoneIcon, label: "Campanha" },
  { icon: RepeatIcon, label: "Retorno" },
];

/**
 * O índice que substituiu os dois showcases duplicados: esta página conta a
 * jornada; a PROVA de cada etapa mora na página dedicada.
 */
const APROFUNDAR = [
  {
    href: ATENDIMENTO_IA_URL,
    eyebrow: "Atendimento",
    title: "O Garçom de IA, tela por tela",
    desc: "As telas reais do pedido pelo celular: como ele sugere, monta o combo e respeita restrição.",
  },
  {
    href: CRM_URL,
    eyebrow: "Relacionamento",
    title: "O CRM, por dentro do painel",
    desc: "Como o cliente é classificado sozinho, e como a campanha certa sai no momento certo.",
  },
  {
    href: EXPERIMENTE_URL,
    eyebrow: "Degustação",
    title: "Entrar e testar você mesmo",
    desc: "A padaria de demonstração está no ar: peça pelo QR da mesa, pela loja e com o Garçom.",
  },
];

export default function ComoFuncionaPage() {
  return (
    <>
      <PageHero
        badge="Como funciona"
        title="Da primeira mensagem ao próximo pedido."
        subtitle="O Foocci conecta atendimento, cardápio, WhatsApp, CRM e inteligência comercial para ajudar seu restaurante a vender melhor antes, durante e depois do pedido."
        primaryLabel="Conhecer a proposta"
        primaryHref={PROPOSTA_URL}
        note={PRELAUNCH_NOTE}
        /* A jornada abre no momento em que ela dá dinheiro: o "mais alguma
           coisa?". Sem captura, fica a prévia ilustrada do sistema, que é o que
           esta página já mostrava — degradar nunca deixa buraco. */
        visual={heroShot(
          [
            {
              kind: "phone",
              src: PRODUCT_SHOTS.atendimentoCelular,
              alt: "Tela de celular: a conversa do cliente com o Garçom de IA, do pedido à confirmação.",
            },
            {
              kind: "phone",
              src: "/site/waiter/passo-3-extras.png",
              alt: "Tela de celular: antes de fechar o pedido, o Garçom oferece bebida e sobremesa que combinam com o prato escolhido.",
            },
          ],
          <FoocciProductShowcase />,
        )}
      />

      {/* 1. A jornada — os cinco passos */}
      <section aria-labelledby="jornada-title" className="relative overflow-hidden bg-canvas py-20 lg:py-24">
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>A jornada Foocci</Eyebrow>
            <h2 id="jornada-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Da primeira mensagem ao próximo pedido, passo a passo.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <VisualStepCard key={s.title} index={i + 1} icon={s.icon} title={s.title} copy={s.desc} />
            ))}
          </div>
        </div>
      </section>

      {/* 2. Bastidor — o mascote e o contexto que trabalha por trás */}
      <VisualStoryBlock
        tone="warm"
        reverse
        eyebrow="Bastidor"
        titleId="bastidor-title"
        title="O Foocci trabalha no bastidor."
        visual={<MascotHostScene />}
      >
        <p>
          Enquanto o cliente vive uma experiência simples, o Foocci organiza
          contexto, histórico e oportunidades no bastidor.
        </p>
        <p className="text-base text-muted">
          O Foocci não rouba o protagonismo do restaurante. Ele apoia a experiência:
          o cliente vê a sua marca e o seu atendimento, enquanto a inteligência
          comercial trabalha por trás para conduzir a venda e manter o relacionamento.
        </p>
      </VisualStoryBlock>

      {/* 3. O ciclo — o argumento de integração, que é só desta página */}
      <section aria-labelledby="fluxo-title" className="relative overflow-hidden bg-canvas py-20 lg:py-24">
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
        <div className="relative mx-auto max-w-5xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Do atendimento ao retorno</Eyebrow>
            <h2 id="fluxo-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Um ciclo que transforma pedido em recorrência.
            </h2>
          </div>
          <div className="mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
            {FLOW.map(({ icon: Icon, label }, i) => (
              <div key={label} className="flex flex-col items-center gap-3 sm:flex-row">
                <PremiumCard className="flex items-center gap-3 px-5 py-4 sm:min-w-[140px]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-base font-semibold text-ink">{label}</span>
                </PremiumCard>
                {i < FLOW.length - 1 && (
                  <ArrowRightIcon className="h-5 w-5 rotate-90 text-brand-400 sm:rotate-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Onde ver a prova — o índice que substituiu os showcases repetidos */}
      <section aria-labelledby="aprofundar-title" className="bg-paper py-20 lg:py-24">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Ver por dentro</Eyebrow>
            <h2 id="aprofundar-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Esta é a jornada. A prova está aqui.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink2">
              Cada etapa tem uma página com as telas reais — e uma loja de demonstração
              no ar para você usar.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {APROFUNDAR.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group flex flex-col rounded-2xl border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(11,11,11,.03)] transition-colors hover:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              >
                <Eyebrow>{c.eyebrow}</Eyebrow>
                <h3 className="mt-3 text-lg font-semibold tracking-tight text-ink">{c.title}</h3>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink2">{c.desc}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600">
                  Abrir
                  <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 5. O único CTA comercial da página — rótulo e destino pelo padrão da `CtaBand`. */}
      <CtaBand title="Veja o Foocci funcionando, ao vivo." />
    </>
  );
}
