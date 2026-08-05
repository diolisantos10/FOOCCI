/**
 * OS DOIS FATOS QUE O SITE INTEIRO NÃO CONTAVA (05/08/2026, ordem do CEO).
 *
 * Ele varreu o site e achou dois buracos, e os dois são de venda, não de estética:
 *
 *   1. *"Eu não vi no site, em lugar nenhum, 'aproveite e experimente o primeiro mês
 *      com cinquenta por cento de desconto, independente do plano'. Isso tem que
 *      estar em vários lugares, e não tem."*
 *
 *   2. *"Outra informação importantíssima que não está em nenhum lugar do site: não é
 *      um aplicativo que precisa ser baixado, não vai consumir o seu celular — ele
 *      funciona totalmente via navegador."*
 *
 * O desconto **existe e está cobrado certo** desde antes: `firstMonthDiscountCents`
 * em `lib/billing/pricing.ts` tira metade de um mês, em qualquer plano e qualquer
 * ciclo, com teste. Ou seja, o desconto já era dado e **não era contado para
 * ninguém** — o oposto exato do guardrail 7. A regra proíbe prometer o que não se
 * entrega; calar o que se entrega é o mesmo defeito virado do avesso, e sai mais caro.
 *
 * ── POR QUE ISTO É UM COMPONENTE, E NÃO TEXTO COPIADO EM CADA PÁGINA ──
 *
 * "Tem que estar em vários lugares" é exatamente a receita de nove textos diferentes
 * para a mesma promessa — foi o que aconteceu com os CTAs desta casa e custou uma
 * faxina inteira. Aqui a frase nasce UMA vez. Mais importante: o percentual vem de
 * `firstMonthDiscountPercent()`, calculado a partir da MESMA função que cobra o
 * cartão. Se um dia o desconto mudar para 30%, o site muda junto — e não é possível
 * o site anunciar 50% enquanto o checkout cobra outra coisa.
 *
 * ── A REDAÇÃO DO "SEM APLICATIVO", e por que ela não é a do CEO ao pé da letra ──
 *
 * "Não precisa baixar nada" seria mais forte e seria mentira em um caso: quem imprime
 * comanda usa uma ponte instalada no computador do balcão (`api/print-agent/pair`).
 * A frase abaixo diz o que é verdade em 100% dos casos — nada na loja de aplicativos,
 * nem para o lojista nem para o cliente dele — sem negar a ponte da impressora.
 * Guardrail 7 aplicado à vírgula: a promessa é grande o bastante sem precisar mentir.
 */

import { CycleCode, PlanCode, PLAN_CYCLE_CENTS, firstMonthDiscountCents } from "@/lib/billing/pricing";

/**
 * O desconto do primeiro mês em PORCENTAGEM, derivado do que o cartão realmente
 * paga — nunca digitado à mão numa frase.
 *
 * Lê o ciclo mensal do plano de entrada porque a regra é a mesma para todos
 * (`firstMonthDiscountCents` = metade de um mês, sempre); se um dia deixar de ser,
 * este número passa a estar errado de um jeito VISÍVEL, e é isso que se quer.
 */
export function firstMonthDiscountPercent(
  plan: PlanCode = "STARTER",
  cycle: CycleCode = "MENSAL",
): number {
  const umMes = PLAN_CYCLE_CENTS[plan][cycle];
  if (!umMes) return 0;
  return Math.round((firstMonthDiscountCents(plan, cycle) / umMes) * 100);
}

/** A oferta, escrita uma vez. */
export function ofertaPrimeiroMes(): string {
  return `${firstMonthDiscountPercent()}% de desconto no primeiro mês, em qualquer plano`;
}

/** O fato do navegador, escrito uma vez. */
export const SEM_APLICATIVO =
  "Funciona no navegador, no celular e no computador — nada para baixar na loja de aplicativos, nem para você nem para o seu cliente";

type Props = {
  className?: string;
  /** `compacto` para uma linha discreta; `faixa` para o bloco com moldura. */
  variante?: "faixa" | "compacto";
};

/**
 * A faixa dos dois fatos. Fica logo abaixo do primeiro argumento da página — não no
 * rodapé: informação que remove objeção só vale antes de a objeção virar saída.
 */
export function SinaisDeVenda({ className = "", variante = "faixa" }: Props) {
  const itens = [ofertaPrimeiroMes(), SEM_APLICATIVO];

  if (variante === "compacto") {
    return (
      <p className={`text-sm leading-relaxed text-muted ${className}`}>
        <strong className="font-semibold text-brand-600">{itens[0]}</strong>
        {" · "}
        {itens[1]}.
      </p>
    );
  }

  return (
    <div className={`rounded-2xl border border-brand-200 bg-brand-50/60 px-5 py-4 sm:px-6 ${className}`}>
      <ul className="mx-auto flex max-w-3xl flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-6">
        {itens.map((texto, i) => (
          <li key={texto} className="flex items-start gap-2.5 text-left sm:flex-1">
            {/* Marca de item própria: `list-disc` não permite cor nem alinhamento
                com a primeira linha do texto quando ele quebra em duas. */}
            <span
              aria-hidden
              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"
            />
            <span
              className={
                i === 0
                  ? "text-[14.5px] font-semibold leading-relaxed text-ink"
                  : "text-[14.5px] leading-relaxed text-ink2"
              }
            >
              {texto}.
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
