/**
 * Loja não encontrada — o 404 da superfície do CLIENTE FINAL.
 *
 * Existe por causa do `not-found.tsx` da raiz, que é de marca Foocci: sem este
 * arquivo, quem digitasse errado o link de uma loja cairia na página comercial do
 * Foocci, com menu de planos e preços. O `DESIGN.md` §0 é explícito — a loja é
 * white-label e nunca mostra a marca da plataforma para o cliente do restaurante.
 *
 * Sem cor de marca aqui, e de propósito: a loja não foi encontrada, então NÃO
 * EXISTE `--brand-primary` para vestir. Só os neutros. Ausência de informação não
 * é informação: a tela não afirma que a loja fechou nem que nunca existiu — diz o
 * que se sabe (o endereço não abre) e o que fazer (conferir o link com o
 * restaurante).
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Loja não encontrada",
  robots: { index: false, follow: false },
};

export default function LojaNaoEncontrada() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 text-center shadow-[0_1px_2px_rgba(11,11,11,.03)]">
        <p className="text-4xl" aria-hidden>
          🔍
        </p>
        <h1 className="mt-3 text-xl font-semibold leading-snug text-ink">
          Não encontramos essa loja
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink2">
          O endereço pode estar com um erro de digitação, ou o link pode ter mudado.
          Confira o link direto com o restaurante — pelo WhatsApp, pelo cardápio ou
          pelo QR da mesa.
        </p>
      </div>
    </main>
  );
}
