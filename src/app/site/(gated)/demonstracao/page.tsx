/**
 * /site/demonstracao — the commercial conversion page. Inherits /site/layout.tsx.
 *
 * This is where a restaurant owner asks for a demo. `DemoForm` posts to
 * `/api/site/leads`, which PERSISTS the lead before attempting any notification —
 * a lost e-mail must never mean a lost lead.
 *
 * Before launch this page had no form at all (pre-launch mode); the copy still
 * used "em breve" everywhere. Kept the product preview sections — they are what
 * makes the form worth filling.
 */

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { youtubeEmbedUrl } from "@/lib/site/youtube";
import { PageHero } from "@/components/marketing/PageHero";
import { heroShot } from "@/components/marketing/HeroShot";
import { PRODUCT_SHOTS } from "@/components/marketing/siteAssets";
import { CheckIcon, UsersIcon, SparklesIcon, RepeatIcon } from "@/components/marketing/icons";
import { OrderMockup, CrmProfileMockup, InsightMockup } from "@/components/marketing/mockups";
import { FoocciProductShowcase } from "@/components/marketing/FoocciProductShowcase";
import { VisualStepCard } from "@/components/marketing/VisualStepCard";
import { RelationshipRevenuePanel } from "@/components/marketing/RelationshipRevenuePanel";
import { DotGrid, Halo, Eyebrow } from "@/components/marketing/premium";
import { PRELAUNCH_NOTE } from "@/components/marketing/config";
import { DemoForm } from "@/components/marketing/DemoForm";

export const dynamic = "force-dynamic";

const TITLE = "Demonstração | Foocci para restaurantes";
const DESCRIPTION =
  "Veja o Foocci funcionando com o cardápio do seu restaurante. Peça uma demonstração — sem compromisso.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  { icon: UsersIcon, title: "Cliente escolhe", copy: "O pedido começa simples, guiado pelo cardápio do restaurante." },
  { icon: SparklesIcon, title: "O sistema entende", copy: "O Foocci reconhece o cliente, salva o histórico e enxerga oportunidades." },
  { icon: RepeatIcon, title: "O relacionamento continua", copy: "Campanhas e reativação no momento certo trazem o cliente de volta." },
];

/**
 * O compromisso desta página, em três passos — e nenhum deles tem prazo.
 *
 * Quem faz a demonstração é uma PESSOA do Foocci (o SDR), não um vídeo automático
 * nem um robô: dizer isso com todas as letras é o que separa "deixei meu telefone
 * num site" de "combinei uma conversa". "Uma pessoa do Foocci" e não "nossa
 * equipe": equipe é abstração, pessoa é quem vai chamar.
 */
const DEPOIS_DE_ENVIAR = [
  "Seus dados chegam para uma pessoa do Foocci — ninguém mais recebe.",
  "Ela chama você no WhatsApp que você informou aqui, para entender o seu restaurante e combinar um horário.",
  "Na conversa, ela mostra o Foocci funcionando com o cardápio do seu restaurante. Sem compromisso e sem custo.",
];

const WILL_SHOW = [
  "Como o Foocci conduz o pedido a partir do seu cardápio.",
  "Como o WhatsApp se torna um canal de relacionamento.",
  "Como o CRM organiza seus clientes e oportunidades.",
  "Como campanhas e reativação ajudam o cliente a voltar.",
  "Qual configuração faz sentido para o seu tipo de restaurante.",
];

export default async function DemonstracaoPage() {
  // Vídeos publicados no admin (/admin/demo-videos). Sem vídeo → a seção não
  // existe: melhor página sem seção do que seção com quadro vazio.
  const videos = (
    await prisma.demoVideo.findMany({
      where:   { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select:  { id: true, title: true, description: true, youtubeUrl: true },
    })
  )
    .map((v) => ({ ...v, embedUrl: youtubeEmbedUrl(v.youtubeUrl) }))
    .filter((v): v is typeof v & { embedUrl: string } => v.embedUrl !== null);

  const hasVideos = videos.length > 0;

  return (
    <>
      <PageHero
        badge="Demonstração sem compromisso"
        title={
          <>
Veja o <span className="text-brand-500">Foocci</span> no seu restaurante.
          </>
        }
        subtitle={
          hasVideos
            ? "Assista ao Foocci funcionando de verdade nos vídeos abaixo — e, se quiser, preencha seus dados que a gente entra em contato."
            : "A gente mostra, com o seu cardápio, como o Foocci transforma atendimento, pedido e relacionamento na prática. Preencha abaixo que entramos em contato."
        }
        /* Quem chega aqui vai preencher um formulário para VER o produto — então
           a abertura já entrega uma amostra dele: a tela onde o pedido cai. Sem a
           captura do painel, a tela real de pedido confirmado; sem nem isso, a
           prévia ilustrada que esta página já usava. */
        visual={heroShot(
          [
            {
              kind: "browser",
              src: PRODUCT_SHOTS.painelPedidos,
              alt: "Painel do Foocci na tela do computador: a fila de pedidos do restaurante chegando em tempo real.",
              address: "foocci.com.br/orders",
            },
            {
              kind: "phone",
              src: "/site/waiter/passo-5-confirmacao.png",
              alt: "Tela de celular: o pedido confirmado, com os itens, o valor, a forma de pagamento e a previsão de entrega.",
            },
          ],
          <FoocciProductShowcase />,
        )}
        /* Aqui os botões NÃO são convite: são atalho para o formulário que já está
           nesta mesma página, mais abaixo. Por isso o rótulo é "Ir para o
           formulário" e não o `DEMO_CTA_LABEL` — quem já está na porta não precisa
           ser convidado a entrar, precisa saber onde é a maçaneta. */
        primaryLabel={hasVideos ? "Assistir à demonstração" : "Ir para o formulário"}
        primaryHref={hasVideos ? "#videos" : "#formulario"}
        secondaryLabel={hasVideos ? "Ir para o formulário" : undefined}
        secondaryHref={hasVideos ? "#formulario" : undefined}
        note={PRELAUNCH_NOTE}
      />

      {/* Demonstração em vídeo — só existe quando há vídeo publicado */}
      {hasVideos && (
        <section id="videos" aria-labelledby="videos-title" className="scroll-mt-20 bg-paper py-20 lg:py-24">
          <div className="mx-auto max-w-5xl px-5 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow>Demonstração em vídeo</Eyebrow>
              <h2 id="videos-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                Veja o Foocci funcionando.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-ink2">
                É só apertar o play e ver o sistema por dentro, do painel do
                restaurante ao pedido no celular do cliente.
              </p>
            </div>

            <div className="mt-12 space-y-10">
              {/* O primeiro vídeo é o principal — tela cheia da coluna */}
              <figure>
                <div className="overflow-hidden rounded-2xl border border-line shadow-sm">
                  <iframe
                    src={videos[0]!.embedUrl}
                    title={videos[0]!.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="aspect-video w-full"
                  />
                </div>
                <figcaption className="mt-3 text-center">
                  <span className="text-base font-semibold text-ink">{videos[0]!.title}</span>
                  {videos[0]!.description && (
                    <span className="block text-sm text-muted">{videos[0]!.description}</span>
                  )}
                </figcaption>
              </figure>

              {videos.length > 1 && (
                <div className="grid gap-8 sm:grid-cols-2">
                  {videos.slice(1).map((v) => (
                    <figure key={v.id}>
                      <div className="overflow-hidden rounded-2xl border border-line shadow-sm">
                        <iframe
                          src={v.embedUrl}
                          title={v.title}
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          referrerPolicy="strict-origin-when-cross-origin"
                          className="aspect-video w-full"
                        />
                      </div>
                      <figcaption className="mt-3">
                        <span className="text-sm font-semibold text-ink">{v.title}</span>
                        {v.description && <span className="block text-sm text-muted">{v.description}</span>}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-12 text-center">
              <a
                href="#formulario"
                className="inline-flex items-center justify-center rounded-full bg-brand-500 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
              >
                Gostou? Ir para o formulário
              </a>
              <p className="mt-2 text-sm text-muted">
                Preencha seus dados que a gente entra em contato pelo WhatsApp.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Three-step experience flow */}
      <section aria-labelledby="fluxo-title" className="relative overflow-hidden bg-paper py-20 lg:py-24">
        <div className="relative mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Como a experiência acontece</Eyebrow>
            <h2 id="fluxo-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Do pedido ao relacionamento, em três passos.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <VisualStepCard key={s.title} index={i + 1} icon={s.icon} title={s.title} copy={s.copy} />
            ))}
          </div>
          <div className="mt-10">
            <RelationshipRevenuePanel />
          </div>
        </div>
      </section>

      {/* Illustrative product screens */}
      <section aria-labelledby="previa-title" className="relative overflow-hidden bg-canvas py-20 lg:py-24">
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
        <Halo className="left-1/2 top-0 h-64 w-[40rem] -translate-x-1/2" color="rgba(249,115,22,0.07)" />
        <div className="relative mx-auto max-w-5xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Prévia</Eyebrow>
            <h2 id="previa-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Uma prévia de como o Foocci se parece.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink2">
              Pedido guiado, CRM e dados comerciais em uma só operação — pensados para
              o dia a dia do restaurante.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:items-center">
            <div className="lg:mt-10">
              <OrderMockup />
            </div>
            <CrmProfileMockup />
            <div className="sm:col-span-2 sm:mx-auto sm:max-w-sm lg:col-span-1 lg:mx-0 lg:mt-10 lg:max-w-none">
              <InsightMockup />
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-muted">
            Telas ilustrativas do produto.
          </p>
        </div>
      </section>

      {/* What a future demo will show */}
      <section id="formulario" aria-labelledby="demo-mostra-title" className="scroll-mt-20 bg-paper py-20">
        <div className="mx-auto max-w-2xl px-5 lg:px-8">
          <div className="rounded-2xl border border-line bg-paper p-7 shadow-sm ring-1 ring-ink/[0.03] sm:p-9">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              O que a demonstração vai mostrar
            </span>
            <h2 id="demo-mostra-title" className="sr-only">
              O que a demonstração vai mostrar
            </h2>
            <ul className="mt-6 space-y-3">
              {WILL_SHOW.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                  <span className="text-base text-ink2">{item}</span>
                </li>
              ))}
            </ul>
            {/*
              O QUE ACONTECE DEPOIS DE ENVIAR — a página não dizia, e essa é a
              pergunta que segura o dedo em cima do botão. Sem PRAZO de propósito:
              não existe compromisso de "em até X horas", e prometer prazo que não
              se cumpre é o contrário do que esta casa faz (guardrail 7). O que se
              promete aqui é o que de fato acontece: uma PESSOA recebe, chama no
              WhatsApp e mostra o produto com o cardápio do restaurante dela.
            */}
            <div className="mt-7 border-t border-line pt-7">
              <h3 className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-ink2">
                Depois que você enviar
              </h3>
              <ol className="mt-4 space-y-3.5">
                {DEPOIS_DE_ENVIAR.map((passo, i) => (
                  <li key={passo} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12.5px] font-semibold text-brand-600 ring-1 ring-brand-100"
                    >
                      {i + 1}
                    </span>
                    <span className="text-[15px] leading-relaxed text-ink2">{passo}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-7 border-t border-line pt-7">
              <DemoForm includeChallenge />
            </div>
          </div>
        </div>
      </section>

      {/*
        SEM FAIXA DE FECHAMENTO (05/08). Ela ficava logo ABAIXO do formulário e
        convidava a pessoa a pedir a demonstração que o formulário acima já estava
        pedindo — um botão que só podia rolar a tela de volta para onde ela já
        estava. É o caso mais claro de botão que ensina a ignorar o laranja.
      */}
    </>
  );
}
