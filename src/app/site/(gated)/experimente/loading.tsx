/**
 * Estado CARREGANDO de `/site/experimente` (DESIGN.md §6.1).
 *
 * A página consulta o banco para saber se a padaria de vitrine está no ar e se
 * está aberta agora. Enquanto essa consulta corre, o App Router mostra este
 * esqueleto — sem tela branca e sem pulo de layout: as alturas aqui espelham as da
 * página real (herói, cartão da vitrine, cartão do QR, os dois cartões do
 * comparativo).
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-line2 ${className}`} />;
}

export default function ExperimenteLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando a degustação…</span>

      {/* Herói */}
      <section className="bg-paper">
        <div className="mx-auto max-w-3xl px-5 pb-12 pt-16 lg:px-8 lg:pb-16 lg:pt-20">
          <div className="flex flex-col items-center">
            <Bar className="h-6 w-32 rounded-full" />
            <Bar className="mt-5 h-9 w-full max-w-lg" />
            <Bar className="mt-2.5 h-9 w-3/4 max-w-md" />
            <Bar className="mt-5 h-4 w-full max-w-xl" />
            <Bar className="mt-2 h-4 w-2/3 max-w-lg" />
          </div>
        </div>
      </section>

      {/* Cartão da vitrine */}
      <section className="bg-canvas py-14 lg:py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <div className="rounded-2xl border border-line bg-paper p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
              <div>
                <Bar className="h-3 w-40" />
                <Bar className="mt-4 h-7 w-full max-w-sm" />
                <div className="mt-6 space-y-3">
                  <Bar className="h-4 w-full" />
                  <Bar className="h-4 w-11/12" />
                  <Bar className="h-4 w-10/12" />
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-canvas p-5">
                <Bar className="h-4 w-40" />
                <Bar className="mt-3 h-3 w-full" />
                <Bar className="mt-2 h-3 w-4/5" />
                <div className="mt-5 space-y-2">
                  <Bar className="h-3 w-full" />
                  <Bar className="h-3 w-full" />
                  <Bar className="h-3 w-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* As três experiências */}
      <section className="bg-paper py-14 lg:py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <div className="mx-auto flex max-w-2xl flex-col items-center">
            <Bar className="h-3 w-32" />
            <Bar className="mt-4 h-8 w-full max-w-md" />
            <Bar className="mt-4 h-4 w-3/4" />
          </div>

          <div className="mt-10 rounded-2xl border border-line bg-paper p-6 sm:p-8">
            <Bar className="h-9 w-9 rounded-xl" />
            <Bar className="mt-4 h-6 w-64" />
            <Bar className="mt-3 h-4 w-full max-w-lg" />
            <Bar className="mt-5 h-12 w-full max-w-[16rem] rounded-full" />
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-2xl border border-line bg-paper p-6 sm:p-7">
                <Bar className="h-9 w-9 rounded-xl" />
                <Bar className="mt-4 h-6 w-56" />
                <Bar className="mt-3 h-4 w-full" />
                <Bar className="mt-2 h-4 w-5/6" />
                <Bar className="mt-6 h-12 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
