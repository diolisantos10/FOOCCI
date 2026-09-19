"use client";

/**
 * A MOLDURA COMUM DA ÁREA COMERCIAL — uma peça só, para todas as telas.
 *
 * ── POR QUE UMA PEÇA E NÃO UMA VERSÃO POR TELA ──────────────────────────────
 *
 * O CEO desenhou 13 telas e todas têm a MESMA borda: barra superior escura,
 * lateral branca de 230px, título de página e corpo. Auditado em 19/09/2026:
 * nenhuma delas tinha essa borda — o menu era uma barra horizontal e cada tela
 * começava do zero. O efeito não é estético: telas sem moldura comum não são
 * lidas como um sistema, são lidas como cinco ferramentas diferentes, e quem
 * trabalha nelas reaprende onde fica cada coisa a cada clique.
 *
 * Escrita uma vez aqui, ela não pode divergir entre telas — que é o defeito que
 * a versão-por-tela garante no terceiro mês.
 *
 * ── O QUE FOI ADAPTADO DO DESENHO, E POR QUÊ (regra de `00-MOLDURA-COMUM.md`) ─
 *
 *   · **Nome do produto** — o desenho diz "Atendimento & Vendas WhatsApp"; aqui
 *     é o FOOCCI. Adaptação prevista na própria régua.
 *   · **Sino com contador vermelho** — NÃO desenhado. Não existe fonte de
 *     notificação nesta área; sino que nunca acende ensina a operação a confiar
 *     num aviso que não vem. Regra 3 do documento: ato que não existe não vira
 *     botão.
 *   · **Cartão de plano no rodapé da lateral** — o desenho mostra cota de
 *     conversas. A Foocci não vende por cota e o dado não existe. O cartão fica
 *     (regra 2), escrito **"não medido" com o motivo** — nunca um número
 *     inventado nem um zero.
 *   · **Foto da pessoa** — não temos foto no cadastro interno; entram as
 *     iniciais. Depende de imagem não arquivada para ir além disso.
 *
 * ⚠️ Pasta com `_`: o Next não cria rota a partir dela.
 * ⚠️ A moldura NÃO é a fechadura. Ela recebe o menu já filtrado pelo servidor;
 * quem autoriza é a rota.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { grupoDoCaminho, type Grupo } from "@/lib/sala/rotas";
import { MenuDaSala } from "../_pecas/MenuDaSala";
import { SairDoComercial } from "../SairDoComercial";

/** As iniciais de quem está logado. Sem foto no cadastro, é o que é verdade. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0]![0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]![0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * A BUSCA DO Ctrl+K — e ela busca de verdade.
 *
 * ⚠️ A régua desta casa: *atalho que abre caixa que não busca nada é a tela
 * mentindo*. Então esta caixa procura no que a moldura de fato conhece — **as
 * telas que ESTA pessoa alcança**, pelo mesmo menu já filtrado pelo servidor.
 * Ela não promete procurar lead, conversa ou venda: o texto do campo diz
 * "Buscar telas da área comercial", e é isso que ela faz.
 *
 * O desenho do CEO escreve "Buscar leads, conversas ou vendas...". Isso exige
 * uma rota de busca que ainda não existe. Prometer no placeholder o que a caixa
 * não faz seria pior que o placeholder honesto — quando a busca de lead existir,
 * é aqui que ela entra, sem mudar o atalho nem o lugar.
 */
function PaletaDeBusca({
  aberta,
  fechar,
  menu,
}: {
  aberta: boolean;
  fechar: () => void;
  menu: Grupo[];
}) {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  const telas = useMemo(
    () =>
      menu.flatMap((g) =>
        g.abas.map((a) => ({ href: a.href, rotulo: a.rotulo, grupo: g.rotulo })),
      ),
    [menu],
  );

  const achados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (!t) return telas;
    return telas.filter(
      (x) =>
        x.rotulo.toLowerCase().includes(t) ||
        x.grupo.toLowerCase().includes(t) ||
        x.href.toLowerCase().includes(t),
    );
  }, [telas, termo]);

  useEffect(() => {
    if (aberta) {
      setTermo("");
      campo.current?.focus();
    }
  }, [aberta]);

  if (!aberta) return null;

  function ir(href: string) {
    fechar();
    router.push(href);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/45 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Buscar telas da área comercial"
      onClick={fechar}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
          <Lupa className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={campo}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") fechar();
              if (e.key === "Enter" && achados[0]) ir(achados[0].href);
            }}
            placeholder="Buscar telas da área comercial…"
            aria-label="Buscar telas da área comercial"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted"
          />
          <kbd className="hidden shrink-0 rounded-md border border-line2 bg-canvas px-1.5 py-0.5 text-[10.5px] text-muted sm:block">
            Esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {achados.length === 0 ? (
            /* O vazio diz o que a caixa procura — e o que ela NÃO procura.
               Vazio mudo aqui faria a pessoa achar que o lead não existe. */
            <p className="px-3 py-4 text-[12.5px] leading-relaxed text-muted">
              Nenhuma tela com “{termo}”. Esta busca procura <strong>telas</strong>{" "}
              da área comercial — ainda não procura lead, conversa nem venda.
            </p>
          ) : (
            <ul>
              {achados.map((x) => (
                <li key={x.href}>
                  <button
                    type="button"
                    onClick={() => ir(x.href)}
                    className="flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-canvas"
                  >
                    <span className="truncate text-[13.5px] font-semibold text-ink">
                      {x.rotulo}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-muted">{x.grupo}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Lupa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

/**
 * O rodapé da lateral. Ver o cabeçalho deste arquivo: o cartão do desenho mostra
 * cota de conversas, dado que não existe aqui. Ele fica, dizendo isso.
 */
function RodapeDaLateral() {
  return (
    <div className="border-t border-line p-3">
      <div className="rounded-2xl border border-line bg-canvas p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[.04em] text-muted">
          Consumo do mês
        </p>
        <p className="mt-1 text-[12.5px] italic leading-snug text-muted">não medido</p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
          A área comercial da Foocci não trabalha por cota de conversas, e não há
          medidor de uso nesta sala. Número inventado aqui viraria meta falsa.
        </p>
      </div>
    </div>
  );
}

export function MolduraDaSala({
  menu,
  nome,
  cargo,
  children,
}: {
  menu: Grupo[];
  nome: string;
  cargo: string;
  children: React.ReactNode;
}) {
  const [gaveta, setGaveta] = useState(false);
  const [busca, setBusca] = useState(false);
  const caminho = usePathname() ?? "";
  const grupo = grupoDoCaminho(menu, caminho);

  // O atalho do desenho. Ele só existe porque a busca existe — ver `PaletaDeBusca`.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBusca((v) => !v);
      }
      if (e.key === "Escape") setBusca(false);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  // Trocar de tela fecha a gaveta do celular. Sem isso, o menu fica por cima da
  // tela que a pessoa acabou de pedir.
  useEffect(() => {
    setGaveta(false);
  }, [caminho]);

  const fecharBusca = useCallback(() => setBusca(false), []);

  const lateral = (
    <div className="flex h-full min-h-0 w-[230px] shrink-0 flex-col border-r border-line bg-paper">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MenuDaSala menu={menu} grupoAtivo={grupo?.rotulo ?? null} caminho={caminho} />
      </div>
      <RodapeDaLateral />
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* ── A BARRA ESCURA (≈64px) ──────────────────────────────────────── */}
      <header className="flex h-16 shrink-0 items-center gap-2 bg-nav px-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => setGaveta((v) => !v)}
          aria-label={gaveta ? "Fechar o menu" : "Abrir o menu"}
          aria-expanded={gaveta}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white transition-colors hover:bg-nav-soft lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none"
            stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <Link href="/comercial" className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true" fill="none"
              stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-4.2-7.6L21 3l-1.4 4.2A8.9 8.9 0 0 1 21 12z" />
              <path d="M8.5 9.5c.5 3 3 5.5 6 6l1.5-1.5-2.2-1.3-1.3 1a7 7 0 0 1-2.2-2.2l1-1.3L10 8z" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-semibold leading-tight text-white">
              Comercial Foocci
            </span>
            <span className="hidden truncate text-[11.5px] leading-tight text-nav-text sm:block">
              Mais conversas. Mais vendas.
            </span>
          </span>
        </Link>

        {/* O campo de busca do desenho. No celular vira só a lupa — o campo
            largo comeria o nome do produto numa tela de 375px. */}
        <button
          type="button"
          onClick={() => setBusca(true)}
          className="ml-auto hidden min-w-0 max-w-md flex-1 items-center gap-2 rounded-full bg-paper px-3.5 py-2 text-left text-[13px] text-muted transition-colors hover:bg-canvas md:flex"
        >
          <Lupa className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Buscar telas da área comercial…</span>
          <kbd className="shrink-0 rounded-md border border-line2 bg-canvas px-1.5 py-0.5 text-[10.5px] text-ink2">
            Ctrl + K
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => setBusca(true)}
          aria-label="Buscar telas da área comercial"
          className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white transition-colors hover:bg-nav-soft md:hidden"
        >
          <Lupa className="h-[18px] w-[18px]" />
        </button>

        {/* O bloco da pessoa. Sem sino: não há fonte de notificação — ver o topo. */}
        <div className="flex shrink-0 items-center gap-2 md:ml-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-nav-soft text-[12.5px] font-semibold text-white">
            {iniciais(nome)}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[14ch] truncate text-[12.5px] font-semibold leading-tight text-white">
              {nome}
            </span>
            <span className="block max-w-[16ch] truncate text-[11px] leading-tight text-nav-text">
              {cargo}
            </span>
          </span>
          <SairDoComercial />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden lg:flex">{lateral}</aside>

        {/* A gaveta do celular e do tablet: a MESMA lateral, não uma segunda
            versão do menu. Duas listas divergiriam na primeira mudança. */}
        {gaveta ? (
          <div className="fixed inset-0 top-16 z-40 flex lg:hidden" role="dialog" aria-modal="true"
            aria-label="Menu da área comercial">
            <div className="h-full">{lateral}</div>
            <button
              type="button"
              aria-label="Fechar o menu"
              onClick={() => setGaveta(false)}
              className="h-full flex-1 bg-ink/45 backdrop-blur-sm"
            />
          </div>
        ) : null}

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <PaletaDeBusca aberta={busca} fechar={fecharBusca} menu={menu} />
    </div>
  );
}
