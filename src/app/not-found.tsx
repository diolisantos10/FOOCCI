/**
 * A página de "não encontrei" do Foocci — a saída que não existia.
 *
 * ANTES (medido em produção, 05/08/2026): `/site/qualquer-coisa` devolvia a tela
 * padrão do Next — "404: This page could not be found." Em inglês, sem menu, sem
 * rodapé e sem um único link. Fim de percurso: a pessoa ou digita outro endereço
 * de cabeça, ou vai embora.
 *
 * ⚠️ POR QUE ESTE ARQUIVO ESTÁ NA RAIZ DO `app/`, e não em `app/site/`:
 * o `not-found.tsx` de um segmento só é usado quando alguém chama `notFound()`
 * DENTRO daquele segmento. Endereço que não casa com rota nenhuma — que é
 * exatamente o caso de `/site/qualquer-coisa` — cai sempre no `not-found.tsx` da
 * RAIZ. Um arquivo dentro de `site/` não seria renderizado nunca, e o defeito
 * continuaria em produção parecendo corrigido.
 *
 * Consequência assumida: este arquivo é o 404 de TODO endereço solto do domínio.
 * Como ele não fica dentro de `site/layout.tsx`, a moldura de marketing é montada
 * aqui à mão — é o preço de estar na raiz. As duas superfícies que NÃO podem
 * usar a marca Foocci (a loja do cliente e o cardápio de mesa) têm o próprio
 * `not-found.tsx`, em `app/pedido/` e `app/qr/`: lá o `notFound()` é chamado de
 * dentro do segmento e a moldura white-label manda.
 *
 * SEM CTA COMERCIAL LARANJA no corpo da página (regra de um CTA por página,
 * `marketing/config.ts`). Quem chega aqui não errou de produto, errou de
 * endereço: o que ele precisa é de mapa, não de oferta. O convite comercial
 * continua a um toque, no botão do cabeçalho, que é o mesmo de todas as páginas.
 * Nenhum rótulo é escrito à mão — os destinos vêm de `NAV_LINKS`.
 *
 * Estados do DESIGN.md §6.1: não há dado de servidor nesta tela, então não há
 * carregando/vazio/erro a tratar — ela É o tratamento de um erro.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { NAV_LINKS } from "@/components/marketing/config";

export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <MarketingHeader />

      <main className="flex-1">
        {/* `max-w-6xl px-5 lg:px-8` é a MESMA calha do cabeçalho e do rodapé — com
            `max-w-3xl` aqui fora, o título nascia 190px à direita da logo a 1280px.
            A largura do texto se resolve por dentro. */}
        <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-20 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Erro 404
            </p>
            <h1 className="mt-3 text-balance text-[1.75rem] font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
              Essa página não existe — ou mudou de endereço.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink2">
              O link pode estar quebrado, ou a página pode ter saído do ar. Não
              é nada do seu lado — e daqui você chega em qualquer canto do site.
            </p>

            <div className="mt-7">
              <Link
                href="/site"
                className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-[15px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              >
                Voltar para o início
              </Link>
            </div>

            {/* O mapa: os mesmos destinos do menu, lidos da fonte única. Em cartão e
              não em lista corrida porque, no celular, alvo de toque pequeno em
              página de erro é o segundo beco sem saída. */}
            <nav
              aria-labelledby="atalhos-404"
              className="mt-10 border-t border-line pt-8"
            >
              <h2
                id="atalhos-404"
                className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-ink2"
              >
                Ou vá direto para
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {NAV_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3.5 text-sm font-semibold text-ink shadow-[0_1px_2px_rgba(11,11,11,.03)] transition-colors hover:border-brand-500 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      {l.label}
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Nenhum link comercial escrito à mão aqui: quem quiser falar com a
              gente tem o "Contato" do rodapé, logo abaixo, e o botão do
              cabeçalho — os dois com o rótulo único do `config.ts`. */}
            <p className="mt-8 text-sm leading-relaxed text-muted">
              Se você chegou aqui por um link nosso, ele envelheceu — e a gente
              quer saber. O contato está no rodapé desta página.
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
