"use client";

/**
 * A MOLDURA DAS TELAS NOVAS DA ÁREA COMERCIAL.
 *
 * ── POR QUE UM ARQUIVO SÓ PARA ISSO ─────────────────────────────────────────
 *
 * Quatro telas nasceram juntas e precisam das mesmas quatro respostas:
 * carregando, sem acesso, erro (com o botão de tentar de novo) e vazio. Copiar
 * esse bloco quatro vezes garante que, na quinta, uma delas fique sem o "tentar
 * de novo" — e a tela que falha em silêncio é a que ensina que o sistema mente.
 *
 * ── E A PEÇA MAIS IMPORTANTE DAQUI É `NaoMedido` ────────────────────────────
 *
 * Toda leitura desta frente devolve uma lista `naoMedido`: as frases que
 * explicam por que um número está vazio. A regra da casa é que ausência de
 * informação não é informação — então o vazio aparece **com o motivo escrito**,
 * e nunca como um zero tranquilizador.
 *
 * ⚠️ Esta pasta começa com `_` de propósito: o Next não cria rota a partir dela.
 */

import type { ReactNode } from "react";

/** O ciclo de vida de toda tela desta frente. */
export type Estado<T> =
  | { fase: "carregando" }
  | { fase: "semAcesso"; porque: string | null }
  | { fase: "erro"; detalhe: string | null }
  | { fase: "pronto"; dados: T };

/** Busca um painel de leitura e devolve o estado já traduzido. */
export async function buscarPainel<T>(url: string): Promise<Estado<T>> {
  try {
    const r = await fetch(url, { cache: "no-store" });

    if (r.status === 401 || r.status === 403) {
      let porque: string | null = null;
      try {
        porque = ((await r.json()) as { error?: string }).error ?? null;
      } catch {
        // Corpo ilegível não muda o veredito: continua sendo "sem acesso".
      }
      return { fase: "semAcesso", porque };
    }

    const j = (await r.json()) as { ok: boolean; data?: T; error?: string };
    if (!j.ok || !j.data) return { fase: "erro", detalhe: j.error ?? null };

    return { fase: "pronto", dados: j.data };
  } catch (e) {
    return { fase: "erro", detalhe: e instanceof Error ? e.message : null };
  }
}

export function Carregando({ oQue }: { oQue: string }) {
  return (
    <p className="p-6 text-[13px] text-muted" role="status">
      {oQue}
    </p>
  );
}

export function SemAcesso({ porque }: { porque: string | null }) {
  return (
    <div className="p-6">
      <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink2">
        {porque ?? "Esta tela não está aberta para o seu perfil."}
      </p>
      <p className="mt-1.5 max-w-[68ch] text-[12.5px] leading-relaxed text-muted">
        Isso não é falha: é a fechadura da porta fazendo o trabalho dela. Quem
        libera é a gestão da área comercial.
      </p>
    </div>
  );
}

export function Erro({ detalhe, tentarDeNovo }: { detalhe: string | null; tentarDeNovo: () => void }) {
  return (
    <div className="p-6">
      <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink2">
        Não deu para carregar esta tela. Nada foi perdido e nada foi alterado —
        esta página só lê.
      </p>
      {detalhe && (
        <p className="mt-1.5 max-w-[68ch] break-words text-[12px] leading-relaxed text-muted">
          {detalhe}
        </p>
      )}
      <button
        type="button"
        onClick={tentarDeNovo}
        className="mt-3 rounded-xl border border-line2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas"
      >
        Tentar de novo
      </button>
    </div>
  );
}

/**
 * O vazio explicado.
 *
 * `motivo` é obrigatório. Um componente de vazio que aceitasse ser usado sem
 * explicação viraria, na primeira pressa, a caixa cinza escrita "sem dados" —
 * que é a forma mais educada de esconder um defeito.
 */
export function Vazio({ motivo }: { motivo: string }) {
  return (
    <p className="rounded-xl border border-dashed border-line2 bg-paper p-4 text-[12.5px] leading-relaxed text-muted">
      {motivo}
    </p>
  );
}

/** As frases de "não medido" que a leitura devolveu. Some quando não há nenhuma. */
export function NaoMedido({ frases }: { frases: readonly string[] }) {
  if (!frases.length) return null;

  return (
    <section
      aria-label="O que não foi medido, e por quê"
      className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4"
    >
      <h2 className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-amber-800">
        O que não foi medido — e o motivo
      </h2>
      <ul className="mt-2 space-y-1.5">
        {frases.map((f) => (
          <li key={f} className="max-w-[78ch] text-[12.5px] leading-relaxed text-amber-900">
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Cabecalho({
  titulo,
  explicacao,
  acao,
}: {
  titulo: string;
  explicacao: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">{titulo}</h1>
        <p className="mt-1 max-w-[72ch] text-[13.5px] leading-relaxed text-muted">{explicacao}</p>
      </div>
      {acao}
    </header>
  );
}

export function Cartao({
  titulo,
  children,
  aviso,
}: {
  titulo: string;
  children: ReactNode;
  aviso?: string;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-line bg-paper">
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-ink2">{titulo}</h2>
        {aviso && <p className="mt-1 max-w-[72ch] text-[12px] leading-relaxed text-muted">{aviso}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** O número com rótulo. `valor === null` vira "não medido", nunca zero. */
export function Numero({
  rotulo,
  valor,
  porqueNulo,
  detalhe,
}: {
  rotulo: string;
  valor: number | null;
  porqueNulo?: string;
  detalhe?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper p-3.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">{rotulo}</p>
      {valor === null ? (
        <p className="mt-1 text-[13px] leading-snug text-amber-800">
          não medido
          {porqueNulo && <span className="mt-0.5 block text-[11.5px] text-muted">{porqueNulo}</span>}
        </p>
      ) : (
        <p className="mt-0.5 tabular-nums text-[22px] font-semibold leading-tight text-ink">{valor}</p>
      )}
      {valor !== null && detalhe && (
        <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{detalhe}</p>
      )}
    </div>
  );
}

/** As abas de uma tela. Estado no componente pai — a URL não muda. */
export function Abas<T extends string>({
  abas,
  atual,
  aoTrocar,
}: {
  abas: readonly { chave: T; rotulo: string }[];
  atual: T;
  aoTrocar: (c: T) => void;
}) {
  return (
    <div role="tablist" aria-label="Seções desta tela" className="mb-5 flex flex-wrap gap-1.5">
      {abas.map((a) => (
        <button
          key={a.chave}
          type="button"
          role="tab"
          aria-selected={a.chave === atual}
          onClick={() => aoTrocar(a.chave)}
          className={
            a.chave === atual
              ? "rounded-xl bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-paper"
              : "rounded-xl border border-line2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas"
          }
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Centavos em reais. Um lugar só, para as quatro telas não divergirem. */
export function emReais(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
