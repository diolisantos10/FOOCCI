/**
 * O MENU DA SALA — agora na LATERAL, como no desenho do CEO.
 *
 * ── O QUE MUDOU EM 19/09/2026, E POR QUÊ ────────────────────────────────────
 *
 * Ele nasceu como barra horizontal no topo. O desenho do CEO tem uma coluna
 * branca de 230px à esquerda, com ícone + rótulo e o item ativo em pílula. A
 * auditoria mediu: era essa a diferença que fazia as telas não parecerem um
 * sistema só. O menu não mudou de conteúdo — mudou de lugar. Os mesmos grupos,
 * a mesma ordem, as mesmas abas e a MESMA régua de papel.
 *
 * As abas do grupo aberto deixaram de ser uma segunda barra: viram as linhas
 * recuadas embaixo do item ativo. Uma barra horizontal a menos, e o percurso
 * "onde eu estou" passa a caber numa olhada só.
 *
 * ⚠️ **O item ativo é LARANJA, e não a pílula azul do desenho.** É a única
 * divergência deliberada: azul é a cor de ação do desenho, laranja é a cor de
 * ação desta casa (`DESIGN.md` §1, "zero indigo/purple, ação = brand-500"). Ter
 * o menu da área comercial em azul e o resto do Foocci em laranja ensinaria que
 * são dois produtos. O desenho manda na FORMA — pílula, ícone, lugar; a marca
 * manda na cor.
 *
 * ⚠️ Ele recebe o menu JÁ FILTRADO pelo papel, do servidor. Nada aqui decide
 * permissão: aba que não chegou não é desenhada, e a rota continua recusando
 * sozinha quem digitar o endereço à mão. A moldura não é a fechadura.
 */

"use client";

import Link from "next/link";
import type { Grupo } from "@/lib/sala/rotas";

/** Um risco por grupo. Emoji não: ele muda de cara em cada sistema operacional. */
function Icone({ rotulo }: { rotulo: string }) {
  const t = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const d: Record<string, React.ReactNode> = {
    Painel: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></>,
    Prospecção: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
    SDR: <><path d="M15 3H6v18h9" /><path d="M15 3v18" /><circle cx="12.5" cy="12" r="1" /></>,
    Atendimento: <><path d="M21 12a9 9 0 1 1-4.2-7.6L21 3l-1.4 4.2A8.9 8.9 0 0 1 21 12z" /></>,
    Leads: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5.5M17 14.5a6 6 0 0 1 4 5.5" /></>,
    Vendas: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
    CRM: <><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" /></>,
    Automações: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></>,
    Relatórios: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    Configurações: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" aria-hidden="true" {...t}>
      {d[rotulo] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

export function MenuDaSala({
  menu,
  grupoAtivo,
  caminho,
}: {
  menu: Grupo[];
  /** Qual grupo a moldura já apurou como aberto — um cálculo só, não dois. */
  grupoAtivo: string | null;
  caminho: string;
}) {
  return (
    <nav aria-label="Seções da área comercial" className="p-2.5">
      <ul className="flex flex-col gap-0.5">
        {menu.map((g) => {
          const ativo = g.rotulo === grupoAtivo;
          return (
            <li key={g.rotulo}>
              <Link
                href={g.href}
                aria-current={ativo ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
                  ativo
                    ? "bg-brand-50 text-brand-600"
                    : "text-ink2 hover:bg-chip hover:text-ink"
                }`}
              >
                <Icone rotulo={g.rotulo} />
                <span className="truncate">{g.rotulo}</span>
              </Link>

              {/* Grupo de uma aba só não ganha sublista: uma lista com um item é
                  ruído que finge que existe escolha. */}
              {ativo && g.abas.length > 1 ? (
                <ul className="mb-1 ml-[22px] mt-0.5 flex flex-col gap-0.5 border-l border-line pl-2.5">
                  {g.abas.map((a) => {
                    const ativa = caminho === a.href || caminho.startsWith(`${a.href}/`);
                    return (
                      <li key={a.href}>
                        <Link
                          href={a.href}
                          aria-current={ativa ? "page" : undefined}
                          className={`block truncate rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors ${
                            ativa
                              ? "bg-chip font-semibold text-ink"
                              : "text-muted hover:text-ink"
                          }`}
                        >
                          {a.rotulo}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
