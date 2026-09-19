/**
 * O CARREGANDO DE TODA TELA DA MOLDURA.
 *
 * Aqui, e não copiado em vinte páginas: o App Router desenha este arquivo
 * enquanto a página de servidor ainda busca. Uma tela nova nasce com estado de
 * carregamento sem ninguém lembrar de escrevê-lo — o oposto de um bloco copiado,
 * que só falta onde ninguém olhou.
 *
 * Esqueleto, e não texto sozinho: o "pulo" de layout quando o conteúdo chega é
 * o que faz a pessoa clicar no lugar errado.
 */
export default function CarregandoDaSala() {
  return (
    <div className="p-4 sm:p-6" role="status" aria-live="polite">
      <span className="sr-only">Carregando a tela…</span>
      <div className="h-6 w-56 max-w-full animate-pulse rounded-xl bg-line2" />
      <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded-xl bg-line2" />
      <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-line2" />
        ))}
      </div>
      <div className="mt-4 h-52 animate-pulse rounded-2xl bg-line2" />
    </div>
  );
}
