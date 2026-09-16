/**
 * A CONFERÊNCIA DO CANAL — a tela que responde "as chaves da Meta funcionam?".
 *
 * A operação de WhatsApp da Foocci mora na Sala Comercial. Além da conferência
 * do número e dos modelos já sincronizados, esta tela concentra a submissão dos
 * três modelos oficiais usados para descobrir o decisor na prospecção fria.
 */

import { ConferenciaClient } from "./ConferenciaClient";
import { ModelosClient } from "./ModelosClient";
import { TemplatesFriosClient } from "./TemplatesFriosClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Canal de vendas — conferência" };

export default function Page() {
  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">
            O WhatsApp de vendas
          </h1>
          <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
            Esta tela pergunta à Meta, agora, se as chaves que estão no ar
            alcançam o número da Foocci, de qual conta ela fala, quanto a Meta
            deixa falar por dia — e mostra o texto exato que o lead recebe.
            Nenhum botão daqui manda mensagem para ninguém.
          </p>
        </header>

        <ConferenciaClient />
        <TemplatesFriosClient />
        <ModelosClient />
      </div>
    </div>
  );
}
