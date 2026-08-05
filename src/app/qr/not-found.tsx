/**
 * Cardápio de mesa não encontrado — 404 da superfície do CLIENTE FINAL.
 *
 * Mesmo motivo do `pedido/not-found.tsx`: o `not-found.tsx` da raiz é de marca
 * Foocci, e quem lê um QR com endereço velho não pode cair na página comercial da
 * plataforma. Sem cor de marca — a loja não foi encontrada, então não existe
 * `--brand-primary` para vestir.
 *
 * O próximo passo aqui é diferente do da loja: quem está com o celular na mesa
 * resolve chamando o garçom, não conferindo link.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cardápio não encontrado",
  robots: { index: false, follow: false },
};

export default function CardapioNaoEncontrado() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 text-center shadow-[0_1px_2px_rgba(11,11,11,.03)]">
        <p className="text-4xl" aria-hidden>
          🍽️
        </p>
        <h1 className="mt-3 text-xl font-semibold leading-snug text-ink">
          Não encontramos esse cardápio
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink2">
          O QR pode estar desatualizado. Chame alguém do salão e peça o cardápio
          atualizado — é o caminho mais rápido.
        </p>
      </div>
    </main>
  );
}
