/**
 * Hero (home) — o GANCHO, não a explicação.
 *
 * O CONCORRENTE NÃO APARECE AQUI (2026-08-05, ordem do CEO). O hero anterior
 * perguntava "quanto o {marketplace} leva do seu faturamento". Funcionava como
 * conta, mas queimava o primeiro impacto falando de outra empresa: a primeira
 * imagem que o dono forma do Foocci não pode ser a de alguém apontando para o
 * vizinho. Aquela pergunta NÃO foi descartada — ela foi para o topo da
 * `CommissionCalculator`, que é onde a comparação tem lastro (os números são os
 * dele, e a taxa é editável).
 *
 * O que ficou no lugar é a dor mais funda, não o sintoma: a comissão dói todo mês,
 * mas o que machuca de verdade é que **o cliente não é seu**. Quem recebe o pedido
 * fica com o nome, o telefone e o histórico — e cobra de novo para devolver a
 * mesma pessoa amanhã. Comissão é consequência; posse do cliente é a causa. É
 * também a única dor que o Foocci resolve inteira, e por isso ela abre o site.
 *
 * REESCRITA COMERCIAL ANTERIOR (2026-08-04): o hero de antes falava do NOSSO ponto
 * de vista ("todo mundo vende um pedaço; o Foocci faz os quatro conversarem") e
 * gastava cinco linhas de celular explicando posicionamento antes de qualquer
 * pergunta. Posicionamento é o que a gente pensa; dor é o que o dono sente.
 *
 * A tese dos "quatro serviços que não se falam" NÃO sumiu do site: ela é a
 * `FourContractsSection`, mais abaixo, onde tem espaço para ser argumentada.
 *
 * Ordem no CELULAR (pedido explícito do CEO, olhando o próprio telefone): a CENA
 * vem antes da copy — é a primeira coisa que a pessoa vê. No desktop a composição
 * lado a lado continua (texto à esquerda, cena à direita) via `order-*`.
 *
 * A cena é a arte aprovada renderizada como UMA fotografia composta
 * (`SITE_ASSETS.heroComposed`) — sem reinterpretação em CSS. Um fundo quente só
 * aparece se o arquivo faltar.
 */

import Image from "next/image";
import { PrimaryCta } from "./Cta";
import { Eyebrow } from "./premium";
import { hasAsset, SITE_ASSETS } from "./siteAssets";

export function HeroSection() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-paper">
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-5 pb-10 pt-6 sm:pt-8 lg:min-h-[36rem] lg:grid-cols-[1fr_1.1fr] lg:gap-8 lg:px-8 lg:pb-20 lg:pt-14">
        {/* ── Cena: PRIMEIRA no celular, à direita no desktop ─────────────────── */}
        <HostScene className="order-1 lg:order-2" />

        {/* ── Mensagem: o gancho em uma pergunta ──────────────────────────────── */}
        <div className="relative z-10 order-2 text-center lg:order-1 lg:max-w-xl lg:text-left">
          <span className="inline-flex items-center gap-3">
            <span aria-hidden className="hidden h-0.5 w-6 rounded-full bg-brand-500 lg:block" />
            <Eyebrow>Para donos de restaurante</Eyebrow>
          </span>

          {/*
            Duas frases curtas, e a virada na segunda. O laranja marca UMA expressão
            — "o cliente é seu" — e não meia manchete: a marca é 90% neutro + 10%
            laranja, e destaque em tudo é destaque em nada. `text-balance` distribui
            as linhas para nenhuma palavra ficar órfã na última.
          */}
          <h1
            id="hero-title"
            className="mt-3 text-balance text-[2.1rem] font-semibold leading-[1.08] tracking-tight text-ink sm:text-[2.7rem] lg:mt-4 lg:text-[3.05rem]"
          >
            Você faz a comida.{" "}
            <span className="block">
              Aqui, <span className="text-brand-500">o cliente é seu</span>.
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-ink2 sm:text-lg lg:mx-0 lg:mt-5">
            Quem recebe o pedido fica com o cliente — e cobra de novo para devolver a
            mesma pessoa amanhã. No Foocci, o canal, a base e o lucro são seus.
          </p>

          {/*
            `sm:justify-center lg:justify-start`: sem isso o botão ficava colado na
            esquerda no tablet enquanto todo o resto estava centrado — a linha vira
            `flex-row` no `sm`, e `flex-row` sem justify começa na esquerda.
          */}
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:mt-8 lg:justify-start">
            <PrimaryCta
              className="w-full sm:w-auto"
              href="#calculadora"
              label="Calcular minha economia"
            />
          </div>

          {/*
            Nada de "usamos a tabela pública de fulano": o Foocci não afirma a taxa de
            ninguém. A microcopy promete o que a calculadora realmente faz — a conta
            com os números que o próprio dono informa (trava jurídica de 04/08).
          */}
          <p className="mt-3 text-sm text-muted lg:mt-4">
            Sem cadastro: você informa quanto fatura e a taxa que paga hoje.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── Cena — a fotografia composta oficial (mascote anfitrião + balão + placa) ── */

function HostScene({ className = "" }: { className?: string }) {
  const composed = hasAsset(SITE_ASSETS.heroComposed);

  return (
    <div className={`relative mx-auto w-full max-w-xl lg:mr-0 lg:max-w-none ${className}`}>
      {/* brilho quente atrás da cena (atmosfera, não conteúdo) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-5 -z-10 rounded-[2.75rem] bg-gradient-to-tr from-brand-100/45 via-amber-50/70 to-transparent blur-2xl"
      />
      <div className="relative overflow-hidden rounded-[1.75rem] shadow-[0_34px_72px_-34px_rgba(120,72,20,0.55)] ring-1 ring-ink/[0.05] lg:rounded-[2rem]">
        {composed ? (
          <Image
            src={`/${SITE_ASSETS.heroComposed}`}
            alt="Mascote do Foocci recebendo clientes no balcão de um restaurante acolhedor, com o balão de fala: Olá! Sou o Foocci."
            width={1672}
            height={941}
            priority
            sizes="(min-width: 1024px) 52vw, 100vw"
            className="h-auto w-full"
          />
        ) : (
          <div
            aria-hidden
            className="aspect-[16/9] w-full bg-gradient-to-br from-[#f6e6d1] via-[#fbf1e6] to-[#f4e3cc]"
          />
        )}
      </div>
    </div>
  );
}
