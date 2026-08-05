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
 * ── SOBRE O BOTÃO ──
 *
 * De manhã este fecho ganhou DOIS botões, e eu abri uma exceção na regra de "um CTA
 * comercial por página" para justificar o de cima. À noite o CEO desfez a exceção,
 * e o argumento dele é melhor que o meu: o "agende uma demonstração" vive no header
 * e na barra fixa do celular, então já está na tela aqui embaixo. Repetir o convite
 * a dois centímetros de onde ele já está não insiste — ensina a ignorar o laranja.
 *
 * O que sobrou é a OUTRA porta, a que o topo não oferece: ver o produto funcionando
 * sem falar com ninguém. Para quem rolou a home inteira e ainda não clicou em marcar
 * conversa, o que falta não é mais um convite — é prova.
 *
 * Os dois botões originais ("Ver como funciona" / "Conhecer a proposta") mandavam o
 * visitante para MAIS duas páginas institucionais: fim de leitura que vira começo de
 * leitura. Esse defeito continua morto.
 */

import Image from "next/image";
import { PrimaryCta } from "./Cta";
import { EXPERIMENTE_CTA_LABEL, EXPERIMENTE_URL } from "./config";

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
          cadastro. Antes de falar com a gente, entre numa loja Foocci de verdade e
          peça como um cliente seu pediria.
        </p>

        {/*
          UM BOTÃO SÓ, e ele NÃO é o comercial (decisão do CEO, 05/08 à noite):
          *"tira esse botão daí porque no topo já tem 'agende uma demonstração' —
          que é onde a gente vai transferir ele pro SDR"*.

          Ele tem razão e o argumento é de funil, não de estética: o "agende uma
          demonstração" vive no header (fixo) e na barra do celular, então ele está
          na tela o tempo todo, inclusive aqui embaixo. Repetir o mesmo convite a
          dois centímetros de onde ele já está não insiste — ensina o visitante a
          ignorar a cor laranja, e aí o que importa perde força.

          O que o fecho ganha em troca é a OUTRA porta, a que o topo não oferece:
          ver o produto funcionando sem falar com ninguém. Para quem rolou a home
          inteira e ainda não clicou em marcar conversa, o que falta não é mais um
          convite — é prova.

          (Isto também desfaz a exceção que eu tinha aberto de manhã para a home ter
          dois CTAs comerciais. Volta a valer a regra de um por página, e o da home
          é o da calculadora — logo depois de a pessoa ver a economia dela.)
        */}
        <div className="mt-6 flex justify-center lg:mt-8">
          {/*
            Aba nova de propósito: a degustação leva para DENTRO da loja de
            demonstração, e perder a página de vendas no caminho é perder o botão
            de agendar.
          */}
          <PrimaryCta
            className="w-full sm:w-auto"
            href={EXPERIMENTE_URL}
            label={EXPERIMENTE_CTA_LABEL}
            newTab
          />
        </div>

        {/*
          A microcopy diz o que tem do outro lado do clique. A versão anterior falava
          dos dois campos do formulário — que agora não é mais o destino deste botão.
          Microcopy que descreve outro botão é pior que microcopy nenhuma.
        */}
        <p className="mt-4 text-sm text-muted">
          É uma padaria de demonstração, já montada: você pede como um cliente pediria.
        </p>
      </div>
    </section>
  );
}
