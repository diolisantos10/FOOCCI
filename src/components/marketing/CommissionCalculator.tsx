"use client";

/**
 * "Quanto sobra no seu bolso" — o bloco que fecha a venda.
 *
 * REENQUADRAMENTO (2026-08-04, ordem do CEO). Antes o bloco entregava o CUSTO em
 * destaque ("você paga R$ 6.080 de comissão") e escondia a comparação lá embaixo,
 * em dois cards discretos. Ninguém acorda querendo calcular quanto paga: o dono
 * quer saber QUANTO SOBRA. Agora, assim que o número entra, a tela mostra na cara,
 * sem procurar: quanto sai hoje, quanto custa aqui, e — no maior número da tela —
 * quanto sobra por mês e por ano.
 *
 * ⚠️ TRAVA JURÍDICA (2026-08-04, decisão do CEO) — leia antes de mexer:
 * publicidade comparativa é permitida no Brasil desde que seja **verdadeira,
 * comprovável e não denigra** o concorrente. Por isso, aqui:
 *
 *   1. O Foocci **NÃO afirma** qual é a taxa do marketplace. **Quem informa a taxa é
 *      o próprio dono**, num campo editável — o valor que vem preenchido é ponto de
 *      partida, e o rótulo diz isso com todas as letras. A conta é feita com os
 *      números DELE, o que blinda juridicamente e converte mais.
 *   2. O nome do marketplace aparece só como **texto descritivo** (`MARKETPLACE_NAME`).
 *      Nunca logo, símbolo ou as cores dele.
 *   3. O tom é **factual**: taxa variável × mensalidade fixa. Nada de "abusivo",
 *      "rouba" ou qualquer adjetivo que deprecie.
 *   4. Todo número que aparece na tela ou é digitado pelo dono, ou vem de fonte
 *      nossa (o preço do plano). Não existe terceira origem.
 *
 * As demais regras que este componente não quebra:
 *   - O preço fixo do Foocci vem de `plans.ts` — a MESMA fonte que a tabela de
 *     ancoragem e a página de planos leem. Sem valor fechado, o comparativo
 *     simplesmente não aparece, em vez de inventar cifra.
 *   - A economia tem a premissa escrita ao lado ("o mesmo faturamento pelo seu canal
 *     direto"), e a faixa conservadora de migração continua logo abaixo. Número
 *     grande sem premissa é promessa — e promessa numa página com campanha paga
 *     volta como reclamação.
 *   - Faturamento baixo demais para o plano compensar NÃO vira economia negativa:
 *     a tela diz a partir de quanto a conta vira, que é honesto e ainda vende.
 *   - Antes de calcular a tela não fica vazia: já mostra o mecanismo (a taxa é um %
 *     que sobe com a venda; o Foocci é fixo) com o próximo passo.
 *
 * ── Três correções de 05/08/2026 (varredura de percurso em produção, no celular) ──
 *
 *  1. **A faixa conservadora mentia.** "Começando devagar" multiplicava a comissão
 *     pela fatia migrada e chamava aquilo de "no seu caixa" SEM descontar a
 *     mensalidade — o número grande logo acima descontava, e este não. A conta
 *     inteira mudou-se para `@/lib/site/savings`, que é puro e tem teste. Quando a
 *     faixa não fecha, a tela DIZ que não fecha (guardrail 7 em forma numérica).
 *  2. **Faltava trava para cima.** Havia trava embaixo ("parece baixo demais") e na
 *     taxa ("parece alta demais"), mas 999.999.999 produzia "você economiza
 *     R$ 229.999.571 por mês" — um zero a mais transformava a ferramenta mais
 *     confiável do site em piada. Agora existe `MAX_PLAUSIBLE_REVENUE`, com o
 *     mesmo tom das outras duas.
 *  3. **No celular o resultado nascia fora da tela** (a 375px o bloco "Você
 *     economiza" começava 221px abaixo da dobra, sem rolagem). Duas medidas, e a
 *     primeira é a que vale sem JavaScript nenhum: o miolo entre o campo e o
 *     resultado foi comprimido no celular. A segunda é a rolagem até o resultado
 *     quando a conta fecha — condicionada a ele estar mesmo fora de vista, então
 *     no desktop ela nunca dispara.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MARKETPLACE_NAME,
  ASSUMED_RATE_PERCENT,
  formatBRL,
} from "@/lib/site/commissionRates";
import {
  migrationSavings,
  MIGRATION_LOW,
  MIGRATION_HIGH,
  type MigrationSavings,
} from "@/lib/site/savings";
import { planByIdOrNull } from "@/lib/site/plans";
import { DEMO_URL, DEMO_CTA_LABEL } from "./config";

/** Accepts "40.000", "40000", "R$ 40 mil" typing habits — digits are what matter. */
function parseRevenue(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function maskRevenue(raw: string): string {
  const n = parseRevenue(raw);
  return n ? n.toLocaleString("pt-BR") : "";
}

/** "23", "23,5" e "23.5" são a mesma coisa para quem digita no celular. */
function parseRate(raw: string): number {
  const n = Number(raw.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatPct(percent: number): string {
  return `${percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

const PRESETS = [20_000, 40_000, 80_000, 150_000];

/**
 * Ponto de partida do campo de taxa — NÃO é uma afirmação sobre a tabela de ninguém.
 * O campo é editável e o rótulo pede o número do próprio dono; este valor existe só
 * para a tela nascer com uma conta plausível em vez de zerada.
 *
 * Vem de `commissionRates` porque a página de planos usa a MESMA premissa: dois
 * números diferentes para a mesma suposição, em duas páginas do mesmo site, é o
 * furo que o visitante nota e o advogado do concorrente também.
 */
const DEFAULT_RATE_PERCENT = String(ASSUMED_RATE_PERCENT);
/** Acima disso o número quase certamente é erro de digitação, não taxa. */
const MAX_PLAUSIBLE_RATE = 90;
/**
 * Teto do faturamento — a trava que faltava, e ela é irmã das outras duas.
 *
 * R$ 5 milhões de delivery POR MÊS são ~R$ 165 mil por dia: existe, mas não é um
 * restaurante que se atende por formulário — é conversa. Acima disso o caso quase
 * sempre é zero a mais, e a calculadora respondia com "você economiza
 * R$ 229.999.571 por mês" em vez de desconfiar. Número absurdo dito com convicção
 * queima a credibilidade de TODOS os outros números da página.
 */
const MAX_PLAUSIBLE_REVENUE = 5_000_000;

export function CommissionCalculator() {
  const [revenueText, setRevenueText] = useState("");
  const [rateText, setRateText] = useState(DEFAULT_RATE_PERCENT);

  const revenue = parseRevenue(revenueText);
  const ratePercent = parseRate(rateText);
  const rate = ratePercent / 100;

  // Abaixo disso as porcentagens produzem números pequenos demais para argumentar —
  // melhor dizer isso do que mostrar um resultado que enfraquece a conta.
  const tooSmall = revenue > 0 && revenue < 1_000;
  const tooBig = revenue > MAX_PLAUSIBLE_REVENUE;
  const rateOutOfRange = ratePercent > MAX_PLAUSIBLE_RATE;

  const hasValue =
    revenue > 0 && !tooSmall && !tooBig && ratePercent > 0 && !rateOutOfRange;

  const demoHref = DEMO_URL;

  // Preço fixo do Foocci: a MESMA fonte que a tabela de ancoragem lê (plano
  // Crescimento). Nunca um número solto aqui — se um dia o plano ficar sem valor,
  // o comparativo simplesmente não aparece, em vez de inventar uma cifra.
  const foocciFixed = planByIdOrNull("crescimento")?.monthly ?? null;

  // Toda a conta sai de dois números: o faturamento e a taxa, ambos informados por
  // quem está lendo. A faixa de migração é nossa e vem rotulada como conservadora.
  // A aritmética inteira mora em `savings.ts` — pura, com teste, e a MESMA que a
  // página de planos usa. Duas cópias da mesma conta foi como o erro nasceu.
  const conta = migrationSavings({
    monthlyRevenue: revenue,
    ratePercent,
    planMonthly: foocciFixed ?? 0,
  });
  const monthlyCommission = conta.monthlyCommission;

  const savings = foocciFixed === null ? 0 : monthlyCommission - foocciFixed;
  /** Só existe economia para mostrar quando a comissão passa da mensalidade fixa. */
  const hasSavings = foocciFixed !== null && savings > 0;
  /** Faturamento a partir do qual o plano fixo custa menos que a taxa informada. */
  const breakEven = foocciFixed === null ? 0 : conta.breakEvenFull;

  /*
    ROLAR ATÉ O RESULTADO — a segunda metade da correção do celular.
    Só dispara quando (a) houve interação de verdade, (b) a conta fecha e (c) o
    resultado está mesmo fora de vista. No desktop a condição (c) é falsa e nada
    acontece. O atraso deixa a pessoa terminar de digitar antes de a tela se mexer,
    e `prefers-reduced-motion` desliga a animação — a rolagem continua, sem o efeito.
  */
  const resultadoRef = useRef<HTMLDivElement>(null);
  const interagiu = useRef(false);

  useEffect(() => {
    if (!interagiu.current || !hasValue) return;
    const alvo = resultadoRef.current;
    if (!alvo) return;

    const t = window.setTimeout(() => {
      const caixa = alvo.getBoundingClientRect();
      // "Fora de vista" = sobra menos de 160px de tela abaixo do topo do
      // resultado — não dá para ler nem a comparação, quanto mais o número grande.
      if (caixa.top < window.innerHeight - 160) return;
      const semAnimacao = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      alvo.scrollIntoView({ block: "start", behavior: semAnimacao ? "auto" : "smooth" });
    }, 450);

    return () => window.clearTimeout(t);
  }, [hasValue, revenue, ratePercent]);

  return (
    <section id="calculadora" className="scroll-mt-16 bg-canvas py-12 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/*
          É AQUI que o marketplace é nomeado — e em nenhum lugar antes (ordem do CEO,
          05/08). No hero a menção só serviria para o visitante conhecer o Foocci
          falando de outra empresa. Neste bloco ela é legítima: os números são do
          próprio dono, a taxa é editável, e a pergunta é exatamente a que a
          calculadora responde na linha de baixo.
        */}
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            A conta que ninguém te mostra
          </p>
          <h2 className="mt-2 text-balance text-[1.7rem] font-semibold leading-tight text-ink sm:mt-3 sm:text-4xl">
            Quanto o {MARKETPLACE_NAME} leva do seu faturamento todo mês?
          </h2>
          {/* Uma linha a menos no celular (`text-[15px]`) é uma linha a mais de
              resultado acima da dobra — ver a correção 3 no topo do arquivo. */}
          <p className="mx-auto mt-2.5 max-w-2xl text-[15px] leading-relaxed text-ink2 sm:mt-4 sm:text-base">
            Coloque o que você fatura no delivery e a taxa que você paga hoje. A conta é
            feita na hora, com os seus números — e mostra quanto sobraria no seu bolso
            com o Foocci.
          </p>
        </header>

        <div className="mt-5 rounded-2xl border border-line bg-paper p-5 shadow-sm sm:mt-10 sm:p-8">
          {/* ── Entradas ── */}
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <div>
              <label htmlFor="faturamento" className="block text-sm font-semibold text-ink">
                Faturamento no delivery por mês
              </label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                  R$
                </span>
                <input
                  id="faturamento"
                  inputMode="numeric"
                  autoComplete="off"
                  value={maskRevenue(revenueText)}
                  onChange={(e) => {
                    interagiu.current = true;
                    setRevenueText(e.target.value);
                  }}
                  placeholder="40.000"
                  className="w-full rounded-xl border border-line bg-paper py-3 pl-10 pr-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      interagiu.current = true;
                      setRevenueText(String(p));
                    }}
                    className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink2 transition-colors hover:border-brand-500 hover:text-brand-600"
                  >
                    {formatBRL(p)}
                  </button>
                ))}
              </div>
            </div>

            {/*
              A TAXA É INFORMADA PELO DONO — o Foocci não afirma a tabela de ninguém
              (ver trava jurídica no topo do arquivo). O campo nasce preenchido só para
              a tela não abrir zerada, e o rótulo diz, sem rodeio, que é para ajustar.
            */}
            <div>
              <label htmlFor="taxa" className="block text-sm font-semibold text-ink">
                Taxa que você paga hoje{" "}
                <span className="font-normal text-ink2">(ajuste se for diferente)</span>
              </label>
              <div className="relative mt-2">
                <input
                  id="taxa"
                  inputMode="decimal"
                  autoComplete="off"
                  value={rateText}
                  onChange={(e) => {
                    interagiu.current = true;
                    setRateText(e.target.value);
                  }}
                  placeholder="23"
                  aria-describedby="taxa-ajuda"
                  className="w-full rounded-xl border border-line bg-paper py-3 pl-3 pr-9 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                  %
                </span>
              </div>
              {/* Encurtado no celular (era quatro linhas) sem perder o que importa:
                  o QUE somar e ONDE conferir. Ver correção 3 no topo do arquivo. */}
              <p id="taxa-ajuda" className="mt-2 text-xs leading-relaxed text-muted">
                Some tudo que sai no aplicativo: comissão, taxa de pagamento e entrega. O
                valor exato está no seu extrato.
              </p>
            </div>
          </div>

          {/* ── Resultado: antes de calcular · inválido · calculado ── */}
          <div
            ref={resultadoRef}
            className="mt-6 scroll-mt-16 border-t border-line pt-6 sm:mt-8 sm:pt-8"
            aria-live="polite"
          >
            {tooSmall ? (
              <p className="text-center text-sm text-ink2">
                Esse valor parece baixo demais para uma conta mensal. Confira o número —
                a calculadora usa o faturamento do mês inteiro.
              </p>
            ) : tooBig ? (
              /* A trava de cima, no mesmo tom das outras duas: desconfiar do número
                 em vez de repetir com convicção o que quase sempre é um zero a mais. */
              <p className="text-center text-sm text-ink2">
                Esse valor parece alto demais para um mês só. Confira o número — se for
                esse mesmo, a sua operação passa do que cabe numa calculadora: fale com a
                gente que a conta a gente faz junto.
              </p>
            ) : rateOutOfRange ? (
              <p className="text-center text-sm text-ink2">
                Essa taxa parece alta demais. Confira o número — ele é a porcentagem que
                sai do seu faturamento, não o valor em reais.
              </p>
            ) : !hasValue ? (
              /* Antes de calcular a tela não fica vazia: mostra o mecanismo. */
              <div>
                <ComparisonPair
                  marketplaceValue={ratePercent > 0 ? formatPct(ratePercent) : "—"}
                  marketplaceNote="Da sua venda — e em reais sobe toda vez que você vende mais."
                  foocciFixed={foocciFixed}
                  dimmed
                />
                <p className="mt-4 text-center text-sm text-ink2">
                  {ratePercent > 0 ? (
                    <>
                      Digite seu faturamento acima — ou toque num valor — para ver{" "}
                      <strong className="font-semibold text-ink">
                        quanto sobra no seu bolso
                      </strong>
                      .
                    </>
                  ) : (
                    <>
                      Informe também a taxa que você paga hoje para a conta fechar com os
                      seus números.
                    </>
                  )}
                </p>
              </div>
            ) : (
              <div>
                {/* 1 · A comparação, na cara: quanto lá, quanto aqui. */}
                <ComparisonPair
                  marketplaceLabel={`Com os ${formatPct(ratePercent)} que você informou`}
                  marketplaceValue={formatBRL(monthlyCommission)}
                  marketplaceSuffix="/mês"
                  marketplaceNote="Em reais, sobe toda vez que você vende mais."
                  foocciFixed={foocciFixed}
                />

                {/*
                  2 · A economia — o maior número da tela. É o dado que vende.

                  ⚠️ E ele NÃO aparece quando a faixa conservadora é negativa. Com
                  R$ 2.000/mês a 23% a conta de migração total dá R$ 31 — verdadeira,
                  mas exibida a 3rem em laranja ela vira manchete de um cenário que a
                  linha de baixo desmente ("no ritmo realista, a mensalidade não se
                  paga"). Tamanho é hierarquia, e hierarquia também afirma: número
                  minúsculo com tratamento de manchete é o melhor caso vendido como
                  resultado. Nesse faturamento quem manda é o ponto de equilíbrio,
                  no cartão calmo logo abaixo.
                */}
                {hasSavings && conta.outcome !== "negativo" && (
                  <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-5 text-center sm:p-7">
                    <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
                      Você economiza
                    </p>
                    <p className="mt-1 text-[3rem] font-semibold leading-none tracking-tight text-brand-600 tabular-nums sm:text-[4.25rem]">
                      {formatBRL(savings)}
                    </p>
                    <p className="mt-2 text-base font-semibold text-ink sm:text-lg">
                      por mês —{" "}
                      <span className="tabular-nums">{formatBRL(savings * 12)}</span> por ano
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink2">
                      Considerando esse mesmo faturamento vindo pelo seu canal direto, sem
                      comissão — só a mensalidade fixa.
                    </p>
                  </div>
                )}

                {/* Faturamento em que o plano ainda não compensa: dizer, não esconder.
                    Dois motivos diferentes levam a este cartão, e cada um merece a
                    frase que é verdadeira para ele. */}
                {foocciFixed !== null && !hasSavings && (
                  <div className="mt-4 rounded-2xl border border-line bg-canvas p-5 text-center">
                    <p className="text-sm leading-relaxed text-ink2">
                      Nesse faturamento, a comissão ainda é menor que a mensalidade fixa. A
                      conta passa a sobrar para você a partir de{" "}
                      <strong className="text-ink">{formatBRL(breakEven)}</strong> por mês no
                      delivery — e o cliente vira seu desde o primeiro pedido.
                    </p>
                  </div>
                )}

                {foocciFixed !== null && hasSavings && conta.outcome === "negativo" && (
                  <div className="mt-4 rounded-2xl border border-line bg-canvas p-5 text-center">
                    <p className="text-sm leading-relaxed text-ink2">
                      Nesse faturamento a conta ainda não compensa. Mesmo levando{" "}
                      <strong className="text-ink">todo</strong> o movimento para o canal
                      direto sobrariam{" "}
                      <strong className="text-ink tabular-nums">{formatBRL(savings)}</strong> por
                      mês — e no ritmo realista de {PCT_BAIXO}% a {PCT_ALTO}% a mensalidade
                      ainda não se paga. Ela passa a sobrar a partir de{" "}
                      <strong className="text-ink tabular-nums">
                        {formatBRL(conta.breakEvenLow)}
                      </strong>{" "}
                      por mês no delivery — e o cliente vira seu desde o primeiro pedido.
                    </p>
                  </div>
                )}

                {/* 3 · A virada conceitual, em uma linha. */}
                <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-ink2">
                  Uma taxa por pedido{" "}
                  <strong className="text-ink">cresce junto com o seu faturamento</strong>. O
                  Foocci é <strong className="text-ink">fixo</strong> — venda mais e continue
                  pagando o mesmo.
                </p>

                {/*
                  4 · O piso conservador — e o número que o site errava. Ver a
                  correção 1 no topo do arquivo: o que aparece aqui já vem LÍQUIDO,
                  com a mensalidade descontada, e quando a faixa não fecha a frase
                  diz isso em vez de sumir com a informação.
                */}
                {hasSavings && conta.outcome !== "negativo" && <FaixaConservadora conta={conta} />}

                {/*
                  O ÚNICO CTA comercial da home, e ele mora aqui de propósito: só
                  existe depois que o visitante viu a conta com os NÚMEROS DELE na
                  tela. Ele é a conclusão do argumento, não uma faixa repetida — por
                  isso sobreviveu à limpeza de 05/08 e o da `FourContractsSection`,
                  uma tela abaixo, não. O rótulo é o mesmo do site inteiro: dois
                  textos diferentes conforme o resultado da conta faziam a mesma
                  porta ter dois nomes na mesma página.
                */}
                <div className="text-center">
                  <Link
                    href={demoHref}
                    data-demo-cta
                    className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                  >
                    {DEMO_CTA_LABEL}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/*
          A origem de cada número fica visível: número sem origem é número inventado —
          e, quando o número seria sobre o concorrente, inventar também é risco jurídico.
        */}
        <p className="mt-4 text-center text-xs leading-relaxed text-muted">
          A conta usa a taxa que <strong className="font-semibold">você informou</strong> e o
          preço fixo do plano Crescimento do Foocci. Não afirmamos a tabela de nenhum
          aplicativo — confira a sua no extrato. A faixa de migração é conservadora e varia
          conforme o restaurante: não é promessa de resultado.
        </p>
      </div>
    </section>
  );
}

/* ── "Começando devagar" — a faixa conservadora, agora líquida ───────────────── */

const PCT_BAIXO = Math.round(MIGRATION_LOW * 100);
const PCT_ALTO = Math.round(MIGRATION_HIGH * 100);

/**
 * Dois finais possíveis aqui, e nenhum deles esconde nada:
 *
 *  - `positivo` — mesmo na ponta baixa já sobra dinheiro DEPOIS da mensalidade.
 *  - `parcial`  — só a ponta alta cobre a mensalidade; a tela diz a partir de
 *                 quanto a ponta baixa também cobre.
 *
 * O terceiro (`negativo` — nenhuma das pontas cobre, que era o caso em que o site
 * dizia "já ficam R$ 92 no seu caixa" para quem pagaria R$ 429/mês) não passa por
 * aqui: ele toma conta do bloco inteiro, no cartão do ponto de equilíbrio, porque
 * naquele faturamento a manchete tem de ser o equilíbrio e não a economia.
 */
function FaixaConservadora({ conta }: { conta: MigrationSavings }) {
  const caixa = "mx-auto mt-4 max-w-xl rounded-2xl bg-canvas p-4 text-center text-sm leading-relaxed text-ink2";
  const num = "font-semibold text-ink tabular-nums";

  if (conta.outcome === "positivo") {
    return (
      <p className={caixa}>
        Começando devagar: levando de{" "}
        <strong className="font-semibold text-ink">
          {PCT_BAIXO}% a {PCT_ALTO}%
        </strong>{" "}
        desse movimento para o seu canal direto —{" "}
        <strong className="font-semibold text-ink">já descontada a mensalidade</strong> —,
        sobram{" "}
        <strong className={num}>
          {formatBRL(conta.netLow)} a {formatBRL(conta.netHigh)}
        </strong>{" "}
        por mês no seu caixa.
      </p>
    );
  }

  if (conta.outcome === "parcial") {
    return (
      <p className={caixa}>
        Começando devagar, depende do ritmo: levando{" "}
        <strong className="font-semibold text-ink">{PCT_ALTO}%</strong> desse movimento
        sobram <strong className={num}>{formatBRL(conta.netHigh)}</strong> por mês, já
        descontada a mensalidade. Com{" "}
        <strong className="font-semibold text-ink">{PCT_BAIXO}%</strong>, ela ainda não se
        paga — essa ponta fecha a partir de{" "}
        <strong className={num}>{formatBRL(conta.breakEvenLow)}</strong> por mês no
        delivery.
      </p>
    );
  }

  // `negativo` — tratado pelo cartão do ponto de equilíbrio, acima. Repetir aqui
  // seria dizer duas vezes a mesma má notícia na mesma tela.
  return null;
}

/* ── Os dois lados da conta, sempre no mesmo formato ─────────────────────────── */

function ComparisonPair({
  marketplaceLabel,
  marketplaceValue,
  marketplaceSuffix,
  marketplaceNote,
  foocciFixed,
  dimmed = false,
}: {
  /** Diz DE ONDE veio o número do marketplace — por padrão, do próprio visitante. */
  marketplaceLabel?: string;
  marketplaceValue: string;
  marketplaceSuffix?: string;
  marketplaceNote: string;
  foocciFixed: number | null;
  dimmed?: boolean;
}) {
  // DUAS COLUNAS TAMBÉM NO CELULAR, de propósito: empilhado, o lado do marketplace
  // ocupava meia tela e empurrava a economia para fora do campo de visão — que é
  // exatamente o "tem que procurar" que este bloco veio resolver. Lado a lado, a
  // comparação é uma faixa compacta e o número grande vem logo em seguida.
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
        <p className="text-[10.5px] font-semibold uppercase leading-tight tracking-widest text-muted sm:text-[11px]">
          {marketplaceLabel ?? `No ${MARKETPLACE_NAME} você paga`}
        </p>
        <p
          className={`mt-1.5 text-xl font-semibold tabular-nums sm:text-[1.75rem] ${
            dimmed ? "text-ink2" : "text-ink"
          }`}
        >
          {marketplaceValue}
          {marketplaceSuffix && (
            <span className="text-xs font-normal text-ink2 sm:text-sm">{marketplaceSuffix}</span>
          )}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{marketplaceNote}</p>
      </div>

      <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5">
        <p className="text-[10.5px] font-semibold uppercase leading-tight tracking-widest text-brand-600 sm:text-[11px]">
          No Foocci você paga
        </p>
        <p className="mt-1.5 text-xl font-semibold text-brand-600 tabular-nums sm:text-[1.75rem]">
          {foocciFixed === null ? (
            <span className="text-base">sob demonstração</span>
          ) : (
            <>
              {formatBRL(foocciFixed)}
              <span className="text-xs font-normal text-ink2 sm:text-sm">/mês</span>
            </>
          )}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Fixo: não muda quando você vende mais.
        </p>
      </div>
    </div>
  );
}
