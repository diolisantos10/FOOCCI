/**
 * FoocciWordmark — a marca da casa, do arquivo oficial. Um lugar só.
 *
 * ── Por que este componente existe ──────────────────────────────────────────
 * Em 24/08/2026 o CEO abriu `/contratar/novo` e disse que **tinham mudado a
 * logomarca**. Ninguém mudou: aquelas telas **nasceram** com uma imitação —
 * `f<span class="text-brand-500">oo</span>cci`, a marca desenhada com texto e
 * CSS — no commit `16cf3b5` (05/08/2026, PR #107), que criou o checkout. Como
 * elas nunca passaram pelo asset, a marca "mudava" a cada mudança de fonte, de
 * peso ou de tom de laranja, e ninguém percebia.
 *
 * O brand book já mandava o contrário desde o início:
 * `docs/foocci-site/brand-implementation-v1.md` — *"Wordmark oficial no
 * header/footer/gate (substitui o texto)"*, arquivo
 * `public/brand/foocci/foocci-wordmark.png` (200×50, transparente).
 *
 * Marca aproximada anda em bando: eram TRÊS telas, todas do fluxo de
 * contratação — justamente onde o cliente está prestes a pagar e onde parecer
 * outra empresa custa mais caro. Este componente existe para que a próxima tela
 * não tenha como errar: quem precisa da marca importa daqui.
 *
 * 🚫 Não desenhe a marca com texto, não use `O°`, não redesenhe em SVG à mão.
 *    Se o arquivo não servir para um caso novo, o caminho é o brand book — não
 *    uma aproximação local.
 */

import Image from "next/image";
import Link from "next/link";

/** O arquivo oficial. Nenhuma tela escreve este caminho à mão. */
export const WORDMARK_SRC = "/brand/foocci/foocci-wordmark.png";

export function FoocciWordmark({
  className = "h-6 w-auto",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={WORDMARK_SRC}
      alt="Foocci"
      width={200}
      height={50}
      priority={priority}
      className={className}
    />
  );
}

/** A marca como link para o site — o uso mais comum fora do painel. */
export function FoocciWordmarkLink({
  href = "/site",
  className = "h-6 w-auto",
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link href={href} aria-label="Foocci — início" className="inline-flex items-center">
      <FoocciWordmark className={className} />
    </Link>
  );
}
