/**
 * Hero (home) — o GANCHO, não a explicação.
 *
 * AS DUAS DORES, JUNTAS, NA PRIMEIRA TELA (2026-08-05, terceira versão do dia —
 * escolhida pelo CEO entre três, e a evolução vale mais que o texto final).
 *
 * O CONCORRENTE CONTINUA SEM NOME AQUI, e essa parte não mudou: a primeira imagem
 * que o dono forma do Foocci não pode ser a de alguém apontando para o vizinho. A
 * comparação com nome próprio mora no topo da `CommissionCalculator`, que é onde
 * ela tem lastro — os números são os DELE e a taxa é editável.
 *
 * O QUE MUDOU: a versão anterior escolhia UMA dor. Dizia "você vende mais todo mês
 * e ganha a mesma coisa" — a comissão pelo efeito dela, sem nomear a causa — e
 * deixava a posse do cliente para depois da rolagem. Era boa de ler e lenta de
 * agir: descrevia um sintoma que o dono precisa reconhecer antes de entender o que
 * a gente vende.
 *
 * O CEO, olhando o funil: *"as maiores dores são pagar comissão e atender cliente
 * que não é seu — isso tem que ficar muito claro logo quando eles entram"*. As duas
 * doem juntas e são a MESMA transação: o marketplace cobra a fatia E fica com a
 * pessoa. Separar as duas em telas diferentes desfaz o argumento, porque a resposta
 * do Foocci também é uma só.
 *
 * Por isso a manchete tem as duas metades numa frase — "pagar comissão PARA
 * ENTREGAR o seu cliente" — e a linha de apoio dá o contraste completo: taxa fixa
 * de um lado, cadastro do outro. Nome, telefone e histórico são ditos com todas as
 * letras porque "ser dono do cliente" é abstrato e "o telefone dele é seu" não é.
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
          {/*
            A SOBRANCELHA DIZ O QUE O PRODUTO É — e antes ela não dizia (05/08).

            A varredura de percurso derrubou o hero num ponto só: em toda a primeira
            tela do celular não havia UMA palavra explicando o que o Foocci é. Tinha
            o mascote, a dor ("você vende mais e ganha a mesma coisa") e um botão de
            calcular. As palavras cardápio, pedido, PDV, CRM e sistema só apareciam
            depois de rolar — "sistema para restaurantes" só no rodapé.

            Para quem chega de anúncio isso pode ser um curso, uma consultoria ou uma
            maquininha. Ele tem três minutos e nenhuma paciência para adivinhar.

            Quem carrega a categoria é a sobrancelha, que existe exatamente para isso
            e estava gasta com um público que a manchete já deixa óbvio.
          */}
          <span className="inline-flex items-center gap-3">
            <span aria-hidden className="hidden h-0.5 w-6 rounded-full bg-brand-500 lg:block" />
            <Eyebrow>Sistema completo para restaurantes</Eyebrow>
          </span>

          {/*
            "Chega de" e não "pare de": os dois mandam parar, mas o primeiro é o que o
            dono já disse sozinho, na cozinha, no fim de um mês ruim. Comando soa como
            anúncio; desabafo soa como ele.

            A frase junta as duas dores numa transação só — a comissão é o preço que
            ele paga PARA perder o cliente. É por isso que "para entregar" carrega o
            peso: não são duas queixas, é uma troca ruim.

            O laranja marca a virada e para em "o seu cliente" — não em "o seu cliente
            para outro". A primeira versão pintava as duas últimas de quatro linhas no
            celular: metade da manchete em laranja é a marca gritando, não enfatizando
            (90% neutro + 10% laranja, e destaque em tudo é destaque em nada). Medido
            na captura de 375px, não no olho. `text-balance` evita palavra órfã.
          */}
          <h1
            id="hero-title"
            className="mt-3 text-balance text-[2.1rem] font-semibold leading-[1.08] tracking-tight text-ink sm:text-[2.7rem] lg:mt-4 lg:text-[3.05rem]"
          >
            Chega de pagar comissão para entregar{" "}
            <span className="text-brand-500">o seu cliente</span> para outro.
          </h1>

          {/*
            A linha de apoio dá o contraste inteiro em duas metades: o que acontece lá
            (fatia + o cliente fica) e o que muda aqui (taxa fixa + o cadastro é seu).

            "Nome, telefone e histórico" está escrito com todas as letras de propósito.
            "Ser dono do seu cliente" é abstrato e não se compra; "o telefone dele fica
            no seu cadastro" é concreto e se entende na primeira leitura.

            "Marketplace" sem nome próprio: é um fato do negócio de quem lê, não uma
            afirmação sobre a tabela de ninguém (trava jurídica de 04/08, e decisão do
            CEO de 05/08 de manter o concorrente fora do primeiro impacto).
          */}
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-ink2 sm:text-lg lg:mx-0 lg:mt-5">
            Cada pedido no marketplace leva uma fatia do seu faturamento — e o cliente
            continua sendo deles. No Foocci a taxa é fixa e o cliente é seu: nome,
            telefone e histórico no seu cadastro.
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
              /*
                "quanto eu economizo" e não "minha economia": o primeiro é a pergunta
                que ele tem na cabeça depois de ler a manchete; o segundo já pressupõe
                que existe economia. Prometer menos e entregar o número dele é o que
                faz a calculadora ser lida como ferramenta, não como propaganda.
              */
              label="Calcular quanto eu economizo"
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
