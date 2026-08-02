/**
 * The three differentiators nobody else publishes.
 *
 * Ordered by strength, from OS §2.3. Each block opens with the FEAR the owner already
 * has and only then names the mechanism — an owner who has been burned by a WhatsApp
 * ban does not want to hear about features first.
 *
 * Every claim here is defensible in a sales meeting, and nothing in pilot is sold as
 * finished (guardrail 7). The text-ordering pilot and "guaranteed printing" are
 * deliberately absent.
 */

// Texto curto de propósito. Agressivo, aqui, é dizer a coisa em uma frase que o dono
// termina de ler — não empilhar parágrafo.
const ITEMS = [
  {
    fear: "“E se a IA inventar um prato que eu não tenho?”",
    title: "A IA é impedida de mentir",
    body:
      "Toda resposta é conferida contra o seu cardápio real antes de sair, e um simulador testa o atendimento toda madrugada.",
    proof: "Quase ninguém publica como garante isso. A maioria não garante.",
  },
  {
    fear: "“Já tentei WhatsApp e quase perdi o número.”",
    title: "O número não queima",
    body:
      "Silêncio das 21h às 8h, teto diário, descanso por cliente, intervalo aleatório — e registro do que já foi enviado para cada pessoa.",
    proof: "É o medo nº 1 de quem já tentou, e quase ninguém o enfrenta.",
  },
  {
    fear: "“Meus clientes somem e eu descubro tarde.”",
    title: "O resgate acontece antes de perder",
    body:
      "O sistema vê o cliente esfriando — quente, morno, frio — e age no meio do caminho.",
    proof: "CRM comum reativa quem já foi embora. Aqui a conversa começa antes.",
  },
];

export function DifferentiatorsSection() {
  return (
    <section id="diferenciais" className="bg-canvas py-12 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            O que só tem aqui
          </p>
          <h2 className="mt-2 text-[1.7rem] font-semibold leading-tight text-ink sm:mt-3 sm:text-4xl">
            Três coisas que o concorrente não escreve no site dele.
          </h2>
        </header>

        <div className="mt-8 space-y-4">
          {ITEMS.map((item, i) => (
            <article
              key={item.title}
              className="rounded-2xl border border-line bg-paper p-5 sm:p-7"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-6">
                <span
                  aria-hidden
                  className="hidden text-2xl font-semibold text-brand-500 sm:block sm:pt-1"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <p className="text-sm italic text-muted">{item.fear}</p>
                  <h3 className="mt-1.5 text-xl font-semibold text-ink sm:text-2xl">
                    <span aria-hidden className="mr-2 text-brand-500 sm:hidden">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {item.title}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-ink2">{item.body}</p>
                  <p className="mt-2 border-l-2 border-brand-500 pl-3 text-sm text-ink2">
                    {item.proof}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
