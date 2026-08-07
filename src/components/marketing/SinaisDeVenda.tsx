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
 *
 * ── 07/08/2026 — OS DOIS FATOS DEIXARAM DE DIVIDIR A MESMA MOLDURA ──
 *
 * O CEO leu a faixa no celular: *"esse aviso de cinquenta por cento no primeiro mês
 * está muito tímido. Isso é uma coisa incrível, tem que ser super destacada."*
 *
 * O defeito não era a cor da caixa. Era **empate de hierarquia**: os dois fatos
 * entravam como dois marcadores da mesma lista, mesmo tamanho, mesma moldura — e o
 * menor ganhava por VOLUME DE TEXTO. Medido no celular: a oferta ocupava 2 linhas,
 * o "sem aplicativo" ocupava 4. A maior alavanca comercial da casa lia como nota de
 * rodapé ao lado de um fato técnico.
 *
 * A correção é estrutural, não de pintura: a oferta virou **anúncio** (`OfertaPrimeiroMes`)
 * — superfície escura, o número em escala de manchete, moldura própria — e o fato do
 * navegador virou **linha de rodapé** (`SemAplicativo`), fora da moldura, em `muted`.
 * Um é oferta; o outro é resposta a objeção. Nunca mais no mesmo nível.
 *
 * Por que fundo `ink` e não laranja cheio: (a) a página já tem três botões
 * `brand-500` e o selo "Mais vendido" — um quarto bloco laranja vira ruído, não
 * destaque, e contraria o "90% neutro + 10% laranja"; (b) branco sobre `brand-500`
 * dá ~2,9:1 de contraste, o que reprova em texto pequeno. Sobre `ink`, o laranja é
 * o acento e o contraste é folgado. É o bloco mais escuro da página inteira: o olho
 * cai nele antes de qualquer cartão.
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

/**
 * A oferta em PEDAÇOS, para quem precisa dela em escala tipográfica diferente do
 * resto da frase (o anúncio abaixo põe o número em 76px e o resto em 26px).
 *
 * Existe para que o percentual continue saindo de `firstMonthDiscountPercent()` até
 * quando a frase é quebrada visualmente — a alternativa seria digitar "50" no JSX,
 * que é exatamente o que este arquivo inteiro foi criado para impedir.
 */
export const OFERTA = {
  get numero(): string {
    return String(firstMonthDiscountPercent());
  },
  chamada: "de desconto no primeiro mês",
  /* Uma palavra. Selo de duas linhas rouba a escala do número, que é o que
     precisa ser lido primeiro. Quem é o público e qual a condição vem na linha
     de baixo, onde cabe sem competir. */
  eyebrow: "Oferta",
  qualquerPlano: "em qualquer um dos três planos",
} as const;

/** O fato do navegador, escrito uma vez. */
export const SEM_APLICATIVO =
  "Funciona no navegador, no celular e no computador — nada para baixar na loja de aplicativos, nem para você nem para o seu cliente";

/**
 * O ANÚNCIO DA OFERTA. Uma peça só, com uma coisa só para dizer.
 *
 * A ordem de leitura do DOM é a ordem da frase — eyebrow, "50%", "de desconto no
 * primeiro mês", condição. Quem ouve a página com leitor de tela recebe a mesma
 * sentença que quem a vê; foi por isso que o número não ficou numa coluna à parte
 * do texto no HTML, só no CSS.
 */
export function OfertaPrimeiroMes({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-ink px-6 py-7 sm:px-9 sm:py-8 ${className}`}
    >
      {/* Brilho de marca. Decoração pura: `aria-hidden`, sem eventos, e maior que a
          caixa de propósito — quem corta é o `overflow-hidden` do pai. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-28 -top-52 h-[28rem] w-[38rem] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(249,115,22,0.30), transparent)" }}
      />

      {/* Duas colunas a partir de `lg` — não por gosto: no monitor a coluna única
          deixava metade da faixa vazia à direita, e o vazio ao lado de um número de
          84px lê como erro de montagem, não como respiro. */}
      <div className="relative lg:flex lg:items-center lg:gap-10">
        <div className="lg:shrink-0">
          <span className="inline-flex items-center rounded-full bg-brand-500 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white">
            {OFERTA.eyebrow}
          </span>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 sm:gap-x-6">
            <p className="flex items-start leading-[0.8]">
              <span className="text-[68px] font-semibold tabular-nums tracking-tight text-brand-400 sm:text-[84px]">
                {OFERTA.numero}
              </span>
              <span className="mt-1 text-[30px] font-semibold text-brand-400 sm:text-[38px]">%</span>
            </p>
            <p className="max-w-[15ch] text-[23px] font-semibold leading-[1.15] tracking-tight text-white sm:max-w-none sm:text-[30px]">
              {OFERTA.chamada}
            </p>
          </div>
        </div>

        <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-white/70 sm:text-[15px] lg:mt-0 lg:max-w-sm lg:border-l lg:border-white/15 lg:pl-10">
          Vale <span className="font-semibold text-white">{OFERTA.qualquerPlano}</span>, para todo
          cliente novo — com o produto inteiro, sem recorte.
        </p>
      </div>
    </div>
  );
}

/**
 * O FATO DO NAVEGADOR, em voz baixa. Continua antes dos preços porque é objeção
 * ("vou ter que instalar alguma coisa?") e objeção respondida tarde já virou saída —
 * mas fora da moldura da oferta, em `muted`, sem marcador. É rodapé de bloco, não
 * manchete.
 */
export function SemAplicativo({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12.5px] leading-relaxed text-muted ${className}`}>{SEM_APLICATIVO}.</p>
  );
}

type Props = {
  className?: string;
  /** `compacto` para uma linha discreta; `faixa` para o anúncio + a linha do navegador. */
  variante?: "faixa" | "compacto";
};

/**
 * Os dois fatos, agora em DOIS pesos. Fica logo abaixo do primeiro argumento da
 * página — não no rodapé: informação que remove objeção só vale antes de a objeção
 * virar saída.
 */
export function SinaisDeVenda({ className = "", variante = "faixa" }: Props) {
  if (variante === "compacto") {
    return (
      <p className={`text-sm leading-relaxed text-muted ${className}`}>
        <strong className="font-semibold text-brand-600">{ofertaPrimeiroMes()}</strong>
        {" · "}
        {SEM_APLICATIVO}.
      </p>
    );
  }

  return (
    <div className={className}>
      <OfertaPrimeiroMes />
      <SemAplicativo className="mt-3 px-1 text-center" />
    </div>
  );
}
