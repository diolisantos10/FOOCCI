/**
 * /site/experimente — a DEGUSTAÇÃO. A única página do site comercial onde o
 * visitante não lê sobre o produto: ele entra no produto.
 *
 * Frente 3 do plano de lançamento (`docs/foocci-fase2-lancamento-plano.md`). A
 * Foocci Bakery é um tenant completo e marcado `isDemo`; daqui saem os três
 * endereços públicos dela.
 *
 * ─── ABA NOVA, NÃO IFRAME (decisão, com o motivo) ────────────────────────────
 * As três experiências abrem em `target="_blank"`. Iframe foi considerado e
 * recusado por quatro razões, na ordem em que pesam:
 *
 *  1. **Altura.** A loja é `fixed inset-0` (DESIGN.md §5) e os dois modos rendem
 *     componentes DIFERENTES: a Loja é catálogo + carrinho com barra fixa embaixo,
 *     o Garçom é conversa que cresce sem fim. Não existe uma altura de iframe certa
 *     para os dois — ou sobra moldura vazia, ou corta o CTA de adicionar.
 *  2. **Celular, que é a prioridade.** A 375px a loja JÁ ocupa a tela inteira. Um
 *     app de tela cheia dentro de uma faixa de 335px é pior do que o produto real —
 *     seria demonstrar o Foocci na pior versão possível dele.
 *  3. **Armazenamento particionado.** A loja guarda carrinho e carteira do cliente
 *     em local/sessionStorage e abre links de WhatsApp. Em iframe de outra origem o
 *     navegador particiona esse armazenamento e bloqueia parte da navegação — a
 *     degustação quebraria em silêncio, que é o pior tipo de quebra.
 *  4. **Recado.** Moldura dentro de página de vendas lê-se como vídeo/protótipo.
 *     Aba nova lê-se como "isto está rodando". É exatamente o que queremos provar.
 *
 * O preço da aba nova — perder o visitante para outra aba — é pago com
 * `rel="noopener"` e mantendo ESTA página viva atrás, com os botões de contratar.
 *
 * ─── HORÁRIO DA PADARIA ──────────────────────────────────────────────────────
 * A padaria abre 6h e fecha 20h/21h (13h no domingo). Fora disso a loja pausa o
 * ENVIO do pedido, e quem visita o site às 22h bateria nisso sem aviso. Resolvido
 * do lado da página, sem tocar no dado do restaurante: o estado real é lido do
 * banco, a página avisa antes do clique, mostra o horário da semana e empurra para
 * o cardápio de mesa (QR), que funciona a qualquer hora. Continua valendo a
 * recomendação ao CEO de abrir a vitrine 24h — decisão dele, não da tela.
 *
 * ─── FOTOS ───────────────────────────────────────────────────────────────────
 * Os 40 itens ainda não têm imagem (o CEO gera pelo botão do admin). A página conta
 * quantos já têm: enquanto for zero, ela declara isso em uma linha honesta e vende
 * o que ESTÁ em teste (o atendimento). Quando as fotos existirem, a linha some
 * sozinha — nada a reescrever aqui.
 *
 * Design: tokens do DESIGN.md (ink/ink2/muted/paper/canvas/line/line2 + brand-*),
 * ação primária brand-500/600, card `rounded-2xl`, botão `rounded-xl`, pesos 400/600.
 * Estados obrigatórios: carregando em `loading.tsx`; vazio e erro logo abaixo.
 */

import type { Metadata } from "next";
import QRCode from "qrcode";
import { PageHero } from "@/components/marketing/PageHero";
import { PrimaryCta, SecondaryCta } from "@/components/marketing/Cta";
import { Eyebrow, DotGrid, Halo } from "@/components/marketing/premium";
import {
  QrIcon,
  StorefrontIcon,
  SparklesIcon,
  CheckIcon,
} from "@/components/marketing/icons";
import { DEMO_URL, PRECOS_URL, EXPERIMENTE_URL } from "@/components/marketing/config";
import { getTastingState, type ScheduleLine } from "@/lib/site/demoTasting";
import { DEMO_BAKERY_SLUG } from "@/lib/demo-restaurant";
import { getPublicQrUrl } from "@/lib/public-url";

const TITLE = "Experimente o Foocci | Cardápio de mesa, loja e Garçom de IA";
const DESCRIPTION =
  "Entre na padaria de demonstração do Foocci e teste as três formas de pedir: o cardápio de mesa por QR, a loja de delivery e a mesma loja com o Garçom de IA. Nada é cobrado.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

/* ── Os três endereços da vitrine ─────────────────────────────────────────────
   Montados do slug canônico — nunca escritos à mão em três lugares. */
const QR_PATH = `/qr/${DEMO_BAKERY_SLUG}`;
const LOJA_PATH = `/pedido/${DEMO_BAKERY_SLUG}?modo=loja`;
const GARCOM_PATH = `/pedido/${DEMO_BAKERY_SLUG}`;

/**
 * O que muda entre a mesma loja sem IA e com IA. É o argumento de venda da página.
 * A última linha é de propósito idêntica dos dois lados: o que muda é o atendimento,
 * não o cardápio — e é isso que torna a comparação honesta.
 */
function contrastRows(menuLabel: string): { label: string; sem: string; com: string }[] {
  return [
    { label: "Como se pede", sem: "Navegando e clicando", com: "Escrevendo como você falaria" },
    { label: "Quando não se sabe o que quer", sem: "Você rola o cardápio", com: "Ele pergunta e sugere" },
    { label: "Bebida e sobremesa", sem: "Se você lembrar", com: "Ele oferece o que combina" },
    { label: "Restrição alimentar", sem: "Você confere item a item", com: "Você diz uma vez" },
    { label: "O cardápio", sem: menuLabel, com: menuLabel },
  ];
}

/* ── Peças ────────────────────────────────────────────────────────────────── */

function Bullet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <CheckIcon className="mt-[3px] h-4 w-4 shrink-0 text-brand-500" />
      <span className="text-[14px] leading-relaxed text-ink2">
        <strong className="font-semibold text-ink">{title}</strong> {children}
      </span>
    </li>
  );
}

function ExperienceHeader({
  step,
  icon,
  title,
  lead,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  lead: string;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{step}</span>
      </div>
      <h3 className="mt-4 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h3>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink2">{lead}</p>
    </>
  );
}

/**
 * A tabela do contraste.
 *
 * Duas formas, uma estrutura: no celular o rótulo fica ACIMA e os dois lados
 * dividem a linha (duas colunas também a 375px — comparar exige lado a lado, e
 * empilhar transformaria a comparação numa lista de dez itens soltos). A partir de
 * `sm` vira tabela de três colunas de verdade, com a coluna do Garçom tingida de
 * ponta a ponta — a faixa de fundo é decorativa e por isso não vive nas células.
 */
function ContrastTable({ menuLabel }: { menuLabel: string }) {
  const rows = contrastRows(menuLabel);
  const grid = "grid grid-cols-2 sm:grid-cols-3";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-paper">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-brand-50/50 sm:block"
      />
      <div className={`relative ${grid} border-b border-line`}>
        <div className="hidden sm:block" />
        <div className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted sm:px-4">
          Loja sem IA
        </div>
        <div className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-700 sm:px-4">
          Com o Garçom
        </div>
      </div>
      <ul className="relative divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className={`${grid} gap-x-2 px-3 py-3 sm:items-baseline sm:px-4`}>
            <p className="col-span-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted sm:col-span-1 sm:normal-case sm:tracking-normal sm:text-[13px] sm:font-normal sm:text-ink2">
              {r.label}
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-ink2 sm:mt-0">{r.sem}</p>
            <p className="mt-1.5 text-[13px] font-semibold leading-snug text-ink sm:mt-0">{r.com}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScheduleList({ schedule }: { schedule: ScheduleLine[] }) {
  return (
    <ul className="mt-3 space-y-1">
      {schedule.map((l) => (
        <li
          key={l.days}
          className={`flex items-baseline justify-between gap-3 text-[13px] ${
            l.isToday ? "font-semibold text-ink" : "text-ink2"
          }`}
        >
          <span>
            {l.days}
            {l.isToday && <span className="ml-1.5 text-[11px] font-normal text-muted">(hoje)</span>}
          </span>
          <span className="tabular-nums">{l.hours || "fechado"}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * O lugar do botão quando a vitrine NÃO está no ar.
 *
 * Mesma silhueta do CTA de verdade, de propósito: o cartão não muda de altura e o
 * visitante entende que ali existe uma porta que agora está fechada. Nunca um link
 * que responderia 404 — numa página que recebe campanha paga, isso é o pior final
 * possível para um clique bem-intencionado.
 */
function CtaEmPreparo({ block = false, className = "" }: { block?: boolean; className?: string }) {
  return (
    <span
      aria-disabled="true"
      className={`inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full border border-line2 bg-canvas px-6 py-3.5 text-base font-semibold text-muted ${
        block ? "w-full" : ""
      } ${className}`}
    >
      Em preparação
    </span>
  );
}

/* ── Página ───────────────────────────────────────────────────────────────── */

export default async function ExperimentePage() {
  const state = { status: "empty" } as Awaited<ReturnType<typeof getTastingState>>;

  const ok = state.status === "ok";
  /*
    Os botões acendem quando a vitrine existe. No estado de ERRO eles continuam
    acesos: os três endereços são públicos e estáveis, e o que falhou foi a nossa
    conferência — assumir que a loja caiu porque a consulta caiu seria inferir uma
    negação do silêncio (guardrail 1). Só o VAZIO — vitrine comprovadamente sem
    cardápio — apaga os botões.
  */
  const live = state.status !== "empty";
  /** "40 itens" para a frase corrida; "Os mesmos 40 itens" para a célula da tabela. */
  const itemsCount = ok ? `${state.itemCount} itens` : "o cardápio inteiro";
  const itemsLabel = ok ? `Os mesmos ${state.itemCount} itens` : "O mesmo cardápio";
  const semFoto = ok && state.photoCount === 0;

  /*
    O QR de verdade, gerado do endereço público da vitrine — quem estiver no
    computador escaneia com o celular e vive a cena da mesa, que é o que se está
    vendendo. Se a geração falhar, a página perde o quadradinho e mantém o botão:
    um enfeite nunca derruba a degustação.
  */
  let qrSvg: string | null = null;
  if (ok) {
    try {
      qrSvg = await QRCode.toString(getPublicQrUrl(DEMO_BAKERY_SLUG), {
        type: "svg",
        margin: 0,
        color: { dark: "#0B0B0B", light: "#FFFFFF" },
      });
    } catch {
      qrSvg = null;
    }
  }

  return (
    <>
      <PageHero
        badge="Degustação"
        title="Experimente o Foocci antes de contratar."
        subtitle="Abrimos uma padaria de demonstração no ar. Você entra como se fosse o cliente do restaurante e testa as três formas de pedir — inclusive a MESMA loja com e sem o Garçom de IA, para comparar."
      />

      {/* 1 · A vitrine, declarada — e o estado dela agora */}
      <section aria-labelledby="vitrine-title" className="relative overflow-hidden bg-canvas py-14 lg:py-20">
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" />
        <div className="relative mx-auto max-w-5xl px-5 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-paper p-6 sm:p-8">
            <Halo className="right-0 top-0 h-52 w-64" color="rgba(249,115,22,0.08)" />
            <div className="relative grid gap-8 lg:grid-cols-[1.35fr_1fr]">
              <div>
                <Eyebrow>Padaria de demonstração</Eyebrow>
                <h2
                  id="vitrine-title"
                  className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
                >
                  A Foocci Bakery não existe — e é de propósito.
                </h2>
                <ul className="mt-5 space-y-3.5">
                  <Bullet title="É uma vitrine, não um cliente.">
                    Não há endereço, forno nem entregador. A padaria foi criada só para
                    você experimentar o sistema por dentro.
                  </Bullet>
                  <Bullet title="Peça à vontade.">
                    Nada é cobrado, nenhum pagamento é processado e nenhum pedido chega a
                    ninguém. Pode ir até o fim do checkout.
                  </Bullet>
                  <Bullet title="É o produto real rodando.">
                    Não é vídeo nem protótipo: é a mesma tela que o seu cliente veria — com
                    a sua marca e o seu cardápio no lugar dos nossos.
                  </Bullet>
                </ul>
              </div>

              {/* Estado da padaria: os três casos, sem tela morta em nenhum deles */}
              <div className="rounded-2xl border border-line bg-canvas p-5">
                {state.status === "ok" ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`h-2 w-2 rounded-full ${state.isOpen ? "bg-green-500" : "bg-amber-500"}`}
                      />
                      <p className="text-sm font-semibold text-ink">
                        {state.isOpen ? "Padaria aberta agora" : "Padaria fechada agora"}
                      </p>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink2">
                      {state.isOpen ? (
                        <>Dá para pedir do começo ao fim — inclusive fechar o pedido.</>
                      ) : (
                        <>
                          {state.closedMessage} Você continua navegando o cardápio inteiro e
                          montando o carrinho; só o envio do pedido fica pausado. O{" "}
                          <strong className="font-semibold text-ink">cardápio de mesa (QR)</strong>{" "}
                          funciona a qualquer hora.
                        </>
                      )}
                    </p>
                    <div className="mt-4 border-t border-line pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Horário da padaria
                      </p>
                      <ScheduleList schedule={state.schedule} />
                    </div>
                  </>
                ) : state.status === "empty" ? (
                  /* VAZIO — a vitrine ainda não foi ao ar. Melhor dizer do que
                     entregar um botão que cai em 404 numa página com campanha. */
                  <>
                    <p className="text-sm font-semibold text-ink">
                      A padaria de demonstração está sendo preparada.
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink2">
                      Ela volta ao ar em instantes. Enquanto isso, a gente mostra o sistema
                      rodando com o cardápio do seu restaurante, ao vivo.
                    </p>
                    <SecondaryCta
                      label="Pedir uma demonstração"
                      href={DEMO_URL}
                      block
                      className="mt-4 !py-2.5 !text-sm"
                    />
                  </>
                ) : (
                  /* ERRO — não sabemos o estado. Não afirmamos nenhum dos dois lados
                     (guardrail 1) e damos o caminho de refazer a conferência. */
                  <>
                    <p className="text-sm font-semibold text-ink">
                      Não conseguimos conferir a padaria agora.
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink2">
                      Os endereços abaixo continuam valendo — só não deu para confirmar o
                      horário e o cardápio neste momento.
                    </p>
                    <SecondaryCta
                      label="Tentar de novo"
                      href={EXPERIMENTE_URL}
                      block
                      className="mt-4 !py-2.5 !text-sm"
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2 · As três experiências */}
      <section aria-labelledby="experiencias-title" className="bg-paper py-14 lg:py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Três experiências</Eyebrow>
            <h2
              id="experiencias-title"
              className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
            >
              Três jeitos de pedir. Teste os três.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink2">
              {live
                ? "Cada uma abre numa aba nova, para você voltar aqui quando quiser."
                : "As três voltam ao ar em instantes — enquanto isso, veja abaixo o que cada uma faz."}
            </p>
            {semFoto && (
              <p className="mx-auto mt-4 max-w-xl rounded-xl bg-canvas px-4 py-3 text-[13px] leading-relaxed text-ink2">
                As fotos dos pratos ainda estão em produção — o cardápio aparece sem imagem
                por enquanto. O que está em teste aqui é o{" "}
                <strong className="font-semibold text-ink">atendimento</strong>, e ele já está
                inteiro.
              </p>
            )}
          </div>

          {/* 2.1 · Cardápio de mesa (QR) */}
          <div className="mt-10 rounded-2xl border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(11,11,11,.03)] sm:p-8">
            <div className="grid gap-7 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <ExperienceHeader
                  step="Experiência 1 · na mesa"
                  icon={<QrIcon className="h-4 w-4" />}
                  title="Cardápio de mesa, por QR"
                  lead="É o que o cliente vê ao apontar a câmera para o código na mesa: o cardápio inteiro, com descrição e preço, sem baixar aplicativo e sem cadastro."
                />
                <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                  {qrSvg ? "Aponte a câmera do celular para o código — ou abra aqui mesmo." : "Abra e navegue como se estivesse sentado à mesa."}{" "}
                  Funciona a qualquer hora, mesmo com a padaria fechada.
                </p>
                <div className="mt-5">
                  {live ? (
                    <PrimaryCta
                      label="Abrir o cardápio de mesa"
                      href={QR_PATH}
                      newTab
                      className="w-full sm:w-auto"
                    />
                  ) : (
                    <CtaEmPreparo className="w-full sm:w-auto" />
                  )}
                </div>
              </div>

              {qrSvg && (
                <div className="hidden justify-self-center rounded-2xl border border-line bg-paper p-4 sm:block">
                  <div
                    aria-hidden
                    className="h-32 w-32 [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                  <p className="mt-2.5 text-center text-[11px] text-muted">Escaneie com o celular</p>
                </div>
              )}
            </div>
          </div>

          {/* 2.2 · O contraste — o argumento de venda da página */}
          <div className="mt-14">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow>O comparativo</Eyebrow>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                A mesma loja, sem IA e com IA.
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink2">
                Mesmo cardápio, mesmos preços, mesma marca — {itemsCount} nas duas. A única
                diferença é quem atende. Abra as duas e compare.
              </p>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-2">
              {/* Sem IA */}
              <div className="flex flex-col rounded-2xl border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(11,11,11,.03)] sm:p-7">
                <ExperienceHeader
                  step="Experiência 2 · sem IA"
                  icon={<StorefrontIcon className="h-4 w-4" />}
                  title="A loja, do jeito que você já conhece"
                  lead="A loja de delivery com a marca do restaurante: você navega pelas categorias, monta o carrinho e fecha o pedido sozinho, como em qualquer aplicativo."
                />
                <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                  Monte um pedido e vá até o fim — nada é cobrado.
                </p>
                <div className="mt-auto pt-5">
                  {live ? (
                    <SecondaryCta label="Abrir a loja sem IA" href={LOJA_PATH} newTab block withArrow />
                  ) : (
                    <CtaEmPreparo block />
                  )}
                </div>
              </div>

              {/* Com IA — o lado que vende, com o destaque de marca */}
              <div className="relative flex flex-col rounded-2xl border-2 border-brand-500 bg-paper p-6 shadow-[0_1px_2px_rgba(11,11,11,.04),0_28px_56px_-28px_rgba(249,115,22,0.40)] sm:p-7">
                <span className="absolute -top-3 left-6 whitespace-nowrap rounded-full bg-brand-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)]">
                  A diferença
                </span>
                <ExperienceHeader
                  step="Experiência 3 · com IA"
                  icon={<SparklesIcon className="h-4 w-4" />}
                  title="A mesma loja, com o Garçom de IA"
                  lead="Agora tem alguém atendendo. Escreva “um café e algo doce para levar” e veja o pedido se montar: ele sugere o que combina, monta o combo e respeita restrição alimentar."
                />
                <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                  Fale com suas palavras, como falaria no balcão.
                </p>
                <div className="mt-auto pt-5">
                  {live ? (
                    <PrimaryCta label="Abrir a loja com o Garçom" href={GARCOM_PATH} newTab block />
                  ) : (
                    <CtaEmPreparo block />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <ContrastTable menuLabel={itemsLabel} />
              <p className="mt-3 text-center text-[12.5px] leading-relaxed text-muted">
                O Garçom só oferece o que existe no cardápio do restaurante — um verificador
                barra a resposta que não bate com o cardápio antes de ela chegar ao cliente.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 · Fechamento — contratar é o caminho principal */}
      <section aria-labelledby="fechar-title" className="bg-canvas py-14 lg:py-20">
        <div className="mx-auto max-w-4xl px-5 lg:px-8">
          <div className="rounded-2xl border border-line bg-paper px-6 py-10 text-center sm:px-12">
            <h2
              id="fechar-title"
              className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
            >
              Gostou do que viu? Isso tudo com a sua marca e o seu cardápio.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink2">
              A padaria acima é o Foocci configurado em um restaurante. O seu fica igual — com
              o seu nome, as suas cores e os seus preços.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PrimaryCta label="Contratar agora" href={PRECOS_URL} className="w-full sm:w-auto" />
              <SecondaryCta
                label="Pedir uma demonstração"
                href={DEMO_URL}
                className="w-full sm:w-auto"
              />
            </div>
            <p className="mt-4 text-[13px] text-muted">
              “Contratar agora” abre os planos e preços — você escolhe lá.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
