/**
 * O MENU DA SALA — 10 itens em cima, as abas do grupo embaixo.
 *
 * ── POR QUE ISTO É UM COMPONENTE DE CLIENTE ─────────────────────────────────
 *
 * Porque a barra de dentro depende de QUAL endereço está aberto, e o layout é
 * de servidor: ele não sabe o caminho. Em vez de espalhar uma barra de abas
 * copiada dentro de cada uma das 24 páginas — que é o jeito garantido de uma
 * delas ficar para trás no dia da próxima mudança —, a barra nasce uma vez
 * aqui, em cima do mesmo `GRUPOS` que desenha o menu.
 *
 * ⚠️ Ele recebe o menu JÁ FILTRADO pelo papel, do servidor. A lista de papéis
 * não atravessa para o navegador, e nada aqui decide permissão: aba que não
 * chegou não é desenhada, e a rota continua recusando sozinha quem digitar o
 * endereço à mão. A moldura não é a fechadura.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { grupoDoCaminho, type Grupo } from "@/lib/sala/rotas";

export function MenuDaSala({ menu }: { menu: Grupo[] }) {
  const caminho = usePathname() ?? "";
  const grupo = grupoDoCaminho(menu, caminho);

  return (
    <>
      <nav aria-label="Seções da área comercial" className="overflow-x-auto">
        <ul className="flex min-w-max gap-1 px-3 pb-1.5">
          {menu.map((g) => {
            const ativo = g.rotulo === grupo?.rotulo;
            return (
              <li key={g.rotulo}>
                <Link
                  href={g.href}
                  aria-current={ativo ? "page" : undefined}
                  className={`block rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    ativo
                      ? "bg-canvas text-ink"
                      : "text-ink2 hover:bg-canvas hover:text-ink"
                  }`}
                >
                  {g.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Grupo de uma aba só não ganha barra: uma barra com um item é ruído que
          finge que existe escolha. E a ficha do lead mantém a barra de Leads,
          porque ela é o detalhe de uma linha daquela lista — não outro lugar. */}
      {grupo && grupo.abas.length > 1 ? (
        <nav
          aria-label={`Telas de ${grupo.rotulo}`}
          className="overflow-x-auto border-t border-line bg-canvas"
        >
          <ul className="flex min-w-max gap-1 px-3 py-1.5">
            {grupo.abas.map((a) => {
              const ativa = caminho === a.href || caminho.startsWith(`${a.href}/`);
              return (
                <li key={a.href}>
                  <Link
                    href={a.href}
                    aria-current={ativa ? "page" : undefined}
                    className={`block rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                      ativa
                        ? "bg-paper text-ink shadow-sm"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {a.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </>
  );
}
