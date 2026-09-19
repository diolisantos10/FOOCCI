"use client";

/**
 * O ERRO DE TODA TELA DA MOLDURA.
 *
 * Mesma razão do `loading.tsx` ao lado: o estado de erro passa a existir por
 * estrutura, não por lembrança. Sem ele, uma página que estoura no servidor
 * mostra a tela de erro genérica do Next — que não diz o que houve, não diz se
 * algo foi alterado e não oferece saída.
 *
 * ⚠️ O texto do erro é mostrado, mas fora do caminho: a pessoa precisa primeiro
 * saber que **nada foi perdido** e como tentar de novo. O detalhe técnico serve
 * a quem for relatar.
 */

export default function ErroDaSala({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-[72ch] rounded-2xl border border-line bg-paper p-5">
        <h1 className="text-[17px] font-semibold text-ink">Não deu para abrir esta tela.</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink2">
          O erro foi ao carregar, não ao salvar: nada foi perdido e nada foi
          alterado. Tente de novo — se repetir, avise a gestão da área com a
          hora e o endereço da tela.
        </p>
        <p className="mt-2 break-words text-[12px] leading-relaxed text-muted">
          {error.digest ? `Código: ${error.digest} · ` : ""}
          {error.message || "O servidor não explicou o motivo."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-xl border border-brand-500 bg-brand-500 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
