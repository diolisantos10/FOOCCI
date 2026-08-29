/**
 * As cláusulas que limitam quem assina, em destaque e sem clique.
 *
 * ── Por que este componente existe, e por que é UM só ───────────────────────
 *
 * CDC, art. 54 §4º: cláusula que implique limitação de direito do consumidor tem
 * de vir "com destaque, permitindo sua imediata e fácil compreensão". As duas
 * cláusulas mais duras do nosso Termo — a limitação de responsabilidade e a
 * vigência/cancelamento (com o apagamento dos dados em 60 dias) — estavam:
 *
 *   · em `/contratar/novo`, dentro do bloco que só abria ao clicar "Ler o Termo";
 *   · em `/contratar/[token]`, no fim de uma caixa com rolagem própria.
 *
 * Dois lugares, o mesmo defeito. Por isso o destaque é um componente e não duas
 * marcações parecidas: duas cópias é como as telas de aceite passam a mostrar
 * coisas diferentes, e a que ficar para trás é justamente a que alguém abre num
 * processo.
 *
 * ⚠️ O TEXTO NÃO É ESCRITO AQUI. Vem de `clausulasEmDestaque()`, que devolve as
 * seções do próprio `TERMS_SECTIONS`. Uma segunda redação "mais amigável" da
 * limitação de responsabilidade seria uma segunda cláusula — e valeria contra
 * nós, porque foi a que a pessoa leu em destaque.
 *
 * ── O destaque é visual E estrutural ────────────────────────────────────────
 *
 * Não basta ficar aberto: fica ANTES do corpo do Termo, com moldura âmbar, o
 * título de cada cláusula em negrito e um aviso dizendo por que aquele bloco
 * está ali. Âmbar e não vermelho de propósito — não é erro, é atenção; vermelho
 * nesta página é reservado para falha do servidor, e um vermelho que não é falha
 * ensina a ignorar o vermelho que é.
 */

import { clausulasEmDestaque } from "@/lib/billing/terms";

export function ClausulasEmDestaque({ className = "" }: { className?: string }) {
  const clausulas = clausulasEmDestaque();
  if (clausulas.length === 0) return null;

  return (
    <section
      aria-label="Cláusulas que limitam seus direitos"
      className={`rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5 ${className}`}
    >
      <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-900">
        Leia antes de aceitar
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-amber-900">
        Estas duas cláusulas limitam o que você pode cobrar da Foocci e o que acontece
        quando o contrato termina. Elas fazem parte do Termo abaixo e estão aqui em
        destaque para você ler sem procurar.
      </p>

      <div className="mt-4 space-y-4">
        {clausulas.map((c) => (
          <div key={c.title} className="rounded-xl border border-amber-200 bg-paper p-3 sm:p-4">
            <h4 className="text-sm font-semibold text-ink">{c.title}</h4>
            <p className="mt-1.5 text-sm leading-relaxed text-ink2">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
