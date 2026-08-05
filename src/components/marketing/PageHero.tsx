/**
 * PageHero — a abertura de TODA página interna de `/site`. Server component.
 *
 * ─── Dois heros viraram um (05/08) ───────────────────────────────────────────
 * Existiam `PageHero` (texto centralizado) e `InternalVisualHero` (texto +
 * visual em duas colunas) fazendo quase a mesma coisa, com a mesma cena de
 * restaurante ao fundo copiada nos dois arquivos. Isso é o drift #8 do
 * `DESIGN.md` — primitivo reimplementado — e cobrava o preço de sempre: quando
 * o CEO pediu imagem em todas as páginas, havia dois lugares para consertar e
 * duas chances de ficarem diferentes.
 *
 * Agora é um só: com `visual`, o hero é de duas colunas; sem `visual`, ele é
 * centralizado. `InternalVisualHero` foi aposentado.
 *
 * ─── Ordem no celular: título → IMAGEM → botões ─────────────────────────────
 * Medido, não achado. Com a imagem depois dos botões ela começava a ~630px em
 * 375px de largura — fora da primeira tela de um iPhone SE. Entre o subtítulo e
 * os botões, ela entra a ~470px: aparece na primeira tela e, de quebra, os
 * botões passam a vir DEPOIS da prova, que é a ordem que converte.
 *
 * Isso é feito com posicionamento explícito de grade (`row-start`/`col-start`)
 * no `lg`, e NÃO duplicando os botões em dois blocos com `hidden`: dois links de
 * mesmo nome acessível é ruído para quem usa leitor de tela e mentira para quem
 * mede clique.
 *
 * (Na HOME a cena vem antes até do título, por pedido explícito do CEO olhando o
 * próprio telefone. Lá a cena é paisagem e ocupa ~190px; aqui as capturas são de
 * celular, em retrato, e subir tanto empurraria o h1 para fora da tela.)
 *
 * ─── A cena de restaurante ao fundo ─────────────────────────────────────────
 * Ela é VÉU, não conteúdo: 25–30% de opacidade sob um gradiente para branco.
 * Por isso perdeu o `priority` — quem carrega significado é o `visual`, e num
 * 4G a fila importa. `quality` reduzida pelo mesmo motivo: é desfoque atrás de
 * um véu, ninguém vê o detalhe.
 */

import type { ReactNode } from "react";
import Image from "next/image";
import { PrimaryCta, SecondaryCta } from "./Cta";
import { hasAsset, SITE_ASSETS } from "./siteAssets";

type PageHeroProps = {
  badge: string;
  title: ReactNode;
  subtitle: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  note?: string;
  /**
   * A abertura visual da página (ver `heroShot`). Quando presente, o hero vira
   * duas colunas no desktop. Quando `null`, volta ao centralizado — é assim que
   * a página continua inteira mesmo se nenhuma imagem existir.
   */
  visual?: ReactNode;
  /** Cena de restaurante esmaecida atrás do hero (hospitalidade). Padrão: ligada. */
  ambient?: boolean;
};

/** A pílula de seção — a mesma nas duas formas do hero. */
function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
      {children}
    </span>
  );
}

export function PageHero({
  badge,
  title,
  subtitle,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  note,
  visual = null,
  ambient = true,
}: PageHeroProps) {
  const hasCta = Boolean(primaryLabel || secondaryLabel);
  const warm = ambient && hasAsset(SITE_ASSETS.heroBackground);
  const twoCols = Boolean(visual);

  return (
    <section aria-labelledby="page-hero-title" className="relative overflow-hidden bg-paper">
      {warm ? (
        /* O restaurante como palco — bem atrás do conteúdo, esmaecido no branco */
        <>
          <Image
            src={`/${SITE_ASSETS.heroBackground}`}
            alt=""
            aria-hidden
            fill
            quality={45}
            sizes="100vw"
            className={`-z-20 object-cover object-center ${twoCols ? "opacity-25" : "opacity-30"}`}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-paper/75 via-paper/88 to-paper"
          />
        </>
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-canvas to-paper"
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(249,115,22,0.07),transparent)]"
      />

      {twoCols ? (
        <div className="mx-auto grid max-w-7xl gap-x-12 px-5 pb-14 pt-12 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:px-8 lg:pb-20 lg:pt-20">
          {/* 1 · quem é esta página */}
          <div className="relative z-10 text-center lg:col-start-1 lg:row-start-1 lg:text-left">
            <Badge>{badge}</Badge>
            <h1
              id="page-hero-title"
              /* 2.7rem e não 2.9: com o visual ao lado a coluna de texto tem
                 ~560px, e o título mais longo do site (/sobre) virava um bloco de
                 cinco linhas coladas que engolia o subtítulo. O respiro entre
                 linhas (1.13) é o mesmo motivo. */
              className="mt-5 text-[2rem] font-semibold leading-[1.13] tracking-tight text-ink sm:text-4xl lg:text-[2.7rem]"
            >
              {title}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink2 lg:mx-0">{subtitle}</p>
          </div>

          {/* 2 · a prova (no celular entra aqui; no desktop ocupa a coluna toda) */}
          <div className="relative z-10 mt-9 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">{visual}</div>

          {/* 3 · o que fazer com isso */}
          {(hasCta || note) && (
            <div className="relative z-10 mt-9 text-center lg:col-start-1 lg:row-start-2 lg:mt-8 lg:text-left">
              {hasCta && (
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                  {primaryLabel && <PrimaryCta label={primaryLabel} href={primaryHref} className="w-full sm:w-auto" />}
                  {secondaryLabel && (
                    <SecondaryCta label={secondaryLabel} href={secondaryHref} className="w-full sm:w-auto" />
                  )}
                </div>
              )}
              {note && <p className="mt-4 text-sm text-muted">{note}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-3xl px-5 pb-12 pt-16 text-center lg:px-8 lg:pb-16 lg:pt-20">
          <Badge>{badge}</Badge>
          <h1
            id="page-hero-title"
            className="mt-5 text-3xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-4xl lg:text-5xl"
          >
            {title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink2">{subtitle}</p>
          {hasCta && (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {primaryLabel && <PrimaryCta label={primaryLabel} href={primaryHref} className="w-full sm:w-auto" />}
              {secondaryLabel && (
                <SecondaryCta label={secondaryLabel} href={secondaryHref} className="w-full sm:w-auto" />
              )}
            </div>
          )}
          {note && <p className="mt-4 text-sm text-muted">{note}</p>}
        </div>
      )}
    </section>
  );
}
