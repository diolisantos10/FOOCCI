/**
 * O FECHO DA HOME — o último parágrafo antes do rodapé.
 *
 * O QUE ESTAVA ESCRITO AQUI ATÉ 05/08/2026, e por que era o pior defeito do site:
 *
 *   > "Uma nova forma de vender, relacionar e fidelizar **está chegando**.
 *   >  O Foocci **está sendo preparado** para…"
 *
 * Era a faixa de pré-lançamento que sobrou no ar. Enquanto ela dizia que o produto
 * ainda ia existir, `/contratar/novo` já cobrava cartão e prometia loja e acesso
 * prontos NA HORA. A home é a página que o dono abre vindo do anúncio; ele lia o
 * site inteiro sendo convencido e, na última linha, era informado de que ainda não
 * era hora. Fechava a aba achando que voltaria depois.
 *
 * Não é exagero de redação: é o guardrail 7 ao contrário. A casa proíbe vender como
 * pronto o que está em piloto — e esta seção fazia o inverso, anunciava como futuro
 * o que já está à venda. Mentira nas duas direções custa a mesma confiança.
 *
 * ── SOBRE O BOTÃO, porque ele contraria uma regra que eu mesmo escrevi hoje ──
 *
 * `config.ts` diz "no máximo UM CTA comercial por página", e a home já gasta o dela
 * na calculadora — logo depois de a pessoa ver a economia DELA na tela, que é o pico
 * emocional. Mantive os dois, e a razão é o percurso e não a teoria: quem chega até
 * aqui rolou o site inteiro e está a uma tela do rodapé. Fechar sem pedir nada é
 * deixar sair de mãos vazias justamente o visitante que leu tudo.
 *
 * A regra continua valendo para as outras páginas. A exceção mora aqui, no ponto de
 * uso, como o próprio `config.ts` manda — e está registrada em `docs/decisoes.md`.
 *
 * O segundo botão NÃO é comercial: leva à degustação, que é prova, não convite.
 * Ele existe para o desconfiado — o que não pede demonstração antes de ver a coisa
 * funcionando. Os dois botões antigos ("Ver como funciona" / "Conhecer a proposta")
 * mandavam o visitante para MAIS duas páginas institucionais: fim de leitura que
 * vira começo de leitura.
 */

import Image from "next/image";
import { PrimaryCta, SecondaryCta } from "./Cta";
import { DEMO_CTA_LABEL, DEMO_URL, EXPERIMENTE_URL } from "./config";

export function FinalCTASection() {
  return (
    <section aria-labelledby="fechamento-title" className="bg-canvas py-12 lg:py-24">
      <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
        {/* Transparent cutout — the mascot floats free on the section bg, so the
            solid version's off-white canvas would read as a faint box here. */}
        <Image
          src="/brand/foocci/foocci-mascot-cutout.png"
          alt=""
          aria-hidden
          width={448}
          height={852}
          className="mx-auto mb-4 h-20 w-auto drop-shadow-sm lg:mb-6 lg:h-24"
        />

        {/*
          O tempo verbal é o conserto. "Está chegando" virou PRESENTE, e o presente
          aqui é verificável: há restaurantes usando hoje. A frase não promete
          resultado — promete que a porta está aberta, que é a única coisa que este
          bloco precisa dizer.
        */}
        <h2 id="fechamento-title" className="text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          O Foocci já está no ar — e pode estar no seu restaurante esta semana.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-ink2 lg:mt-4 lg:text-lg">
          Cardápio, pedido, PDV e CRM no mesmo sistema, com o seu cliente no seu
          cadastro. Deixe seus dados e uma pessoa do Foocci mostra como fica na sua
          operação.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row lg:mt-8">
          {/*
            `demoCta` marca este como O botão comercial da página: a barra fixa do
            celular lê a marca e se apaga quando ele está na tela, para não empilhar
            dois botões laranja idênticos na mesma dobra.
          */}
          <PrimaryCta
            className="w-full sm:w-auto"
            href={DEMO_URL}
            label={DEMO_CTA_LABEL}
            demoCta
          />
          {/*
            Aba nova de propósito: a degustação leva para dentro da loja de
            demonstração, e perder a página de vendas no caminho é perder o botão
            de contratar.
          */}
          <SecondaryCta
            className="w-full sm:w-auto"
            href={EXPERIMENTE_URL}
            label="Experimentar antes"
            newTab
          />
        </div>

        {/*
          Microcopy honesta sobre o que acontece depois do clique. A versão anterior
          dizia "Fale com a gente" — em texto morto, sem link, e sem que existisse
          telefone, WhatsApp ou e-mail em lugar nenhum do site. Convite sem porta é
          a forma mais barata de perder o visitante que JÁ decidiu falar com você.
        */}
        <p className="mt-4 text-sm text-muted">
          São dois campos: seu nome e seu WhatsApp. Sem cadastro e sem compromisso.
        </p>
      </div>
    </section>
  );
}
