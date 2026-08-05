/**
 * HeroShot — a ABERTURA VISUAL das páginas de `/site`. Server-only (usa `fs`).
 *
 * ─── O problema que ele resolve ──────────────────────────────────────────────
 * Seis das oito páginas do site abriam só com texto, badge e botão. O CEO
 * resumiu em 05/08: *"o site está só com texto, botão e detalhes gráficos"*.
 * Cada página passa a abrir com um elemento visual PRÓPRIO, que fala daquela
 * seção — e as oito aberturas precisam parecer um sistema, não oito soluções.
 *
 * ─── O sistema, em uma frase ────────────────────────────────────────────────
 * **Um cartão, três conteúdos.** Todas as aberturas dividem o mesmo cartão —
 * mesmo raio, mesmo anel, mesma sombra quente e o mesmo halo âmbar que a home
 * já usa atrás da cena do mascote. O que muda é o que vive dentro dele:
 *
 *   • `phone`   — a captura de uma tela REAL do celular, num aparelho, com o
 *                 rodapé cortado pela borda do cartão (o topo da conversa é o
 *                 que importa; o corte é intencional e mantém a altura sob
 *                 controle no celular, onde a maioria acessa).
 *   • `browser` — a captura de uma tela REAL do painel, numa janela de
 *                 navegador. Aqui a janela É o cartão: moldura dentro de
 *                 moldura é ruído.
 *   • `photo`   — fotografia da cena (as fotos já aprovadas do repositório).
 *                 `shape: "circle"` existe porque `journey-4` e `journey-5` são
 *                 recortes REDONDOS com cantos brancos: em `object-cover`
 *                 retangular apareceria o branco. Redondas sobre o fundo quente,
 *                 elas ficam certas — e viram o mesmo medalhão que a jornada usa.
 *
 * ─── Degradação: a razão de existir do `pickShot` ───────────────────────────
 * As capturas do produto (`PRODUCT_SHOTS`) são geradas por outra frente e podem
 * não existir na hora do build. A página declara uma CADEIA de candidatos, do
 * melhor para o mais garantido, e o primeiro arquivo que existir é o que entra.
 * O último candidato de toda cadeia é um arquivo versionado no repositório —
 * então nunca existe buraco no layout. Se nem isso houver, `heroShot` devolve
 * `null` e o `PageHero` volta sozinho ao formato centralizado.
 *
 * ─── Peso ───────────────────────────────────────────────────────────────────
 * `priority` é do HeroShot, não do véu de fundo do hero: quem carrega
 * significado ganha a fila. O `sizes` de cada peça é o tamanho real que ela
 * ocupa em cada largura — o dono de restaurante abre isto no 4G.
 *
 * Design: tokens do DESIGN.md (ink/ink2/muted/paper/canvas/line/line2 + brand-*),
 * cartão `rounded-2xl`+, pesos 400/600.
 */

import type { ReactNode } from "react";
import Image from "next/image";
import { hasAsset } from "./siteAssets";

/* ── Vocabulário ──────────────────────────────────────────────────────────── */

type ShotBase = {
  /** Caminho do arquivo em /public, com ou sem barra inicial. */
  src: string;
  /**
   * O que a imagem MOSTRA — nunca "imagem do Foocci". Quem usa leitor de tela
   * precisa receber a mesma informação que a captura entrega a quem enxerga.
   */
  alt: string;
};

export type ShotCandidate =
  | (ShotBase & { kind: "phone" })
  | (ShotBase & { kind: "browser"; address?: string })
  | (ShotBase & {
      kind: "photo";
      shape?: "fill" | "circle";
      /**
       * `object-position` do recorte. As fotos do repositório são QUADRADAS e o
       * cartão é 4:3 — no centro puro, o rosto de quem está sentado à mesa fica
       * cortado no topo. Quem conhece o enquadramento é quem escolhe a foto.
       */
      focus?: string;
    });

/** Normaliza para o formato que `hasAsset` entende (relativo, sem barra). */
function rel(src: string): string {
  return src.replace(/^\//, "");
}

/** URL pública (sempre com barra inicial). */
function pub(src: string): string {
  return src.startsWith("/") ? src : `/${src}`;
}

/**
 * O primeiro candidato cujo arquivo existe em /public. Server-only.
 * Exportado à parte para quem precisar decidir a copy pelo visual escolhido.
 */
export function pickShot(candidates: ShotCandidate[]): ShotCandidate | null {
  for (const c of candidates) {
    if (hasAsset(rel(c.src))) return c;
  }
  return null;
}

/* ── O cartão comum ───────────────────────────────────────────────────────── */

/**
 * A moldura que dá unidade às oito aberturas. O halo quente é o mesmo da cena
 * do mascote na home (`HeroSection`) — é o que faz uma foto de restaurante e
 * uma captura de painel parecerem da mesma família.
 */
function ShotFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-5 -z-10 rounded-[2.75rem] bg-gradient-to-tr from-brand-100/45 via-amber-50/70 to-transparent blur-2xl"
      />
      <div
        className={`relative overflow-hidden rounded-[1.75rem] shadow-[0_34px_72px_-34px_rgba(120,72,20,0.5)] ring-1 ring-ink/[0.05] lg:rounded-[2rem] ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

/** O fundo quente de dentro do cartão, quando o conteúdo não o preenche. */
const WARM_SURFACE = "bg-gradient-to-br from-[#fbf1e6] via-paper to-[#fdf3e9]";

/* ── As três peças ────────────────────────────────────────────────────────── */

/**
 * Captura de celular dentro do aparelho. A base sai pela borda de baixo do
 * cartão de propósito: em 375px um telefone inteiro teria ~450px de altura e
 * empurraria o resto da página para fora da primeira tela.
 */
function PhoneShot({ src, alt, priority }: { src: string; alt: string; priority: boolean }) {
  return (
    <ShotFrame className={WARM_SURFACE}>
      <div className="aspect-[4/3] w-full">
        <div className="absolute inset-x-0 top-5 mx-auto w-[54%] max-w-[292px] sm:top-7">
          {/* o aparelho: bezel escuro fino, como o do produto real */}
          <div className="overflow-hidden rounded-[1.6rem] bg-ink p-1.5 shadow-[0_18px_40px_-16px_rgba(11,11,11,0.45)] sm:rounded-[1.9rem] sm:p-2">
            <Image
              src={pub(src)}
              alt={alt}
              width={660}
              height={1434}
              priority={priority}
              sizes="(min-width: 1024px) 292px, (min-width: 640px) 260px, 200px"
              className="h-auto w-full rounded-[1.25rem] bg-paper sm:rounded-[1.5rem]"
            />
          </div>
        </div>
      </div>
    </ShotFrame>
  );
}

/**
 * Captura do painel numa janela de navegador. A barra de endereço não é enfeite:
 * ela repete o argumento que o site inteiro faz — isto roda no navegador.
 */
function BrowserShot({
  src,
  alt,
  address = "foocci.com.br",
  priority,
}: {
  src: string;
  alt: string;
  address?: string;
  priority: boolean;
}) {
  return (
    <ShotFrame className="border border-line bg-paper">
      <div className="flex items-center gap-1.5 border-b border-line bg-canvas px-3.5 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line2" />
          <span className="h-2.5 w-2.5 rounded-full bg-line2" />
          <span className="h-2.5 w-2.5 rounded-full bg-line2" />
        </span>
        <span className="ml-2 flex-1 truncate rounded-lg bg-paper px-2.5 py-1 text-[11px] text-muted ring-1 ring-line">
          {address}
        </span>
      </div>
      <Image
        src={pub(src)}
        alt={alt}
        width={1600}
        height={1000}
        priority={priority}
        sizes="(min-width: 1024px) 620px, (min-width: 640px) 640px, 335px"
        className="h-auto w-full"
      />
    </ShotFrame>
  );
}

/** Fotografia da cena — cheia, ou em medalhão quando o recorte é redondo. */
function PhotoShot({
  src,
  alt,
  shape = "fill",
  focus = "50% 50%",
  priority,
}: {
  src: string;
  alt: string;
  shape?: "fill" | "circle";
  focus?: string;
  priority: boolean;
}) {
  const sizes = "(min-width: 1024px) 620px, (min-width: 640px) 640px, 335px";
  if (shape === "circle") {
    return (
      <ShotFrame className={WARM_SURFACE}>
        <div className="flex aspect-[4/3] w-full items-center justify-center p-6 sm:p-8">
          <div className="relative aspect-square h-full max-h-full overflow-hidden rounded-full ring-1 ring-ink/[0.06]">
            <Image
              src={pub(src)}
              alt={alt}
              fill
              priority={priority}
              sizes="(min-width: 1024px) 420px, 300px"
              className="object-cover"
            />
          </div>
        </div>
      </ShotFrame>
    );
  }
  return (
    <ShotFrame>
      <div className="relative aspect-[4/3] w-full">
        <Image
          src={pub(src)}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          style={{ objectPosition: focus }}
          className="object-cover"
        />
      </div>
    </ShotFrame>
  );
}

/* ── A porta de entrada ───────────────────────────────────────────────────── */

/**
 * Devolve a abertura visual da página, ou `fallback`, ou `null`.
 *
 * É uma FUNÇÃO e não um componente de propósito: quem chama precisa saber se
 * sobrou algo para desenhar, porque `PageHero` muda de layout (duas colunas ×
 * centralizado) conforme exista visual ou não. Um componente que renderiza
 * `null` deixaria uma coluna vazia no grid — exatamente o buraco que este
 * arquivo existe para evitar.
 */
export function heroShot(
  candidates: ShotCandidate[],
  fallback: ReactNode = null,
  { priority = true }: { priority?: boolean } = {},
): ReactNode {
  const shot = pickShot(candidates);
  if (!shot) return fallback;
  switch (shot.kind) {
    case "phone":
      return <PhoneShot src={shot.src} alt={shot.alt} priority={priority} />;
    case "browser":
      return <BrowserShot src={shot.src} alt={shot.alt} address={shot.address} priority={priority} />;
    case "photo":
      return (
        <PhotoShot src={shot.src} alt={shot.alt} shape={shot.shape} focus={shot.focus} priority={priority} />
      );
  }
}
