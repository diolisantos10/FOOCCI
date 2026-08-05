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
 */

import { useState } from "react";
import Link from "next/link";
import {
  MARKETPLACE_NAME,
  MIGRATION_RANGE,
  ASSUMED_RATE_PERCENT,
  formatBRL,
} from "@/lib/site/commissionRates";
import { planByIdOrNull } from "@/lib/site/plans";
import { DEMO_URL } from "./config";

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

export function CommissionCalculator() {
  const [revenueText, setRevenueText] = useState("");
  const [rateText, setRateText] = useState(DEFAULT_RATE_PERCENT);

  const revenue = parseRevenue(revenueText);
  const ratePercent = parseRate(rateText);
  const rate = ratePercent / 100;

  const hasValue = revenue > 0 && ratePercent > 0 && ratePercent <= MAX_PLAUSIBLE_RATE;
  // Abaixo disso as porcentagens produzem números pequenos demais para argumentar —
  // melhor dizer isso do que mostrar um resultado que enfraquece a conta.
  const tooSmall = revenue > 0 && revenue < 1_000;
  const rateOutOfRange = ratePercent > MAX_PLAUSIBLE_RATE;

  const demoHref = DEMO_URL;

  // Preço fixo do Foocci: a MESMA fonte que a tabela de ancoragem lê (plano
  // Crescimento). Nunca um número solto aqui — se um dia o plano ficar sem valor,
  // o comparativo simplesmente não aparece, em vez de inventar uma cifra.
  const foocciFixed = planByIdOrNull("crescimento")?.monthly ?? null;

  // Toda a conta sai de dois números: o faturamento e a taxa, ambos informados por
  // quem está lendo. A faixa de migração é nossa e vem rotulada como conservadora.
  const monthlyCommission = revenue * rate;
  const savingsLow = monthlyCommission * MIGRATION_RANGE.low;
  const savingsHigh = monthlyCommission * MIGRATION_RANGE.high;

  const savings = foocciFixed === null ? 0 : monthlyCommission - foocciFixed;
  /** Só existe economia para mostrar quando a comissão passa da mensalidade fixa. */
  const hasSavings = foocciFixed !== null && savings > 0;
  /** Faturamento a partir do qual o plano fixo custa menos que a taxa informada. */
  const breakEven = foocciFixed === null || rate <= 0 ? 0 : foocciFixed / rate;

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
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-ink2 sm:mt-4">
            Coloque o que você fatura no delivery e a taxa que você paga hoje. A conta é
            feita na hora, com os seus números — e mostra quanto sobraria no seu bolso
            com o Foocci.
          </p>
        </header>

        <div className="mt-6 rounded-2xl border border-line bg-paper p-5 shadow-sm sm:mt-10 sm:p-8">
          {/* ── Entradas ── */}
          <div className="grid gap-6 sm:grid-cols-2">
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
                  onChange={(e) => setRevenueText(e.target.value)}
                  placeholder="40.000"
                  className="w-full rounded-xl border border-line bg-paper py-3 pl-10 pr-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setRevenueText(String(p))}
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
                  onChange={(e) => setRateText(e.target.value)}
                  placeholder="23"
                  aria-describedby="taxa-ajuda"
                  className="w-full rounded-xl border border-line bg-paper py-3 pl-3 pr-9 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                  %
                </span>
              </div>
              <p id="taxa-ajuda" className="mt-2 text-xs leading-relaxed text-muted">
                Some tudo que sai do seu faturamento no aplicativo: comissão, taxa de
                pagamento e entrega. O valor exato está no seu extrato — este aqui é só
                um ponto de partida.
              </p>
            </div>
          </div>

          {/* ── Resultado: antes de calcular · inválido · calculado ── */}
          <div className="mt-8 border-t border-line pt-8" aria-live="polite">
            {tooSmall ? (
              <p className="text-center text-sm text-ink2">
                Esse valor parece baixo demais para uma conta mensal. Confira o número —
                a calculadora usa o faturamento do mês inteiro.
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

                {/* 2 · A economia — o maior número da tela. É o dado que vende. */}
                {hasSavings && (
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

                {/* Faturamento em que o plano ainda não compensa: dizer, não esconder. */}
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

                {/* 3 · A virada conceitual, em uma linha. */}
                <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-ink2">
                  Uma taxa por pedido{" "}
                  <strong className="text-ink">cresce junto com o seu faturamento</strong>. O
                  Foocci é <strong className="text-ink">fixo</strong> — venda mais e continue
                  pagando o mesmo.
                </p>

                {/*
                  4 · O piso conservador: mesmo migrando pouco, já sobra. Só aparece
                  quando existe economia — abaixo do ponto de equilíbrio ele argumentaria
                  com trocados e enfraqueceria a conta em vez de sustentá-la.
                */}
                {hasSavings && (
                  <p className="mx-auto mt-4 max-w-xl rounded-2xl bg-canvas p-4 text-center text-sm leading-relaxed text-ink2">
                    Começando devagar: levando de{" "}
                    <strong className="text-ink">
                      {Math.round(MIGRATION_RANGE.low * 100)}% a{" "}
                      {Math.round(MIGRATION_RANGE.high * 100)}%
                    </strong>{" "}
                    desse movimento para o seu canal direto, já ficam{" "}
                    <strong className="text-ink tabular-nums">
                      {formatBRL(savingsLow)} a {formatBRL(savingsHigh)}
                    </strong>{" "}
                    por mês no seu caixa.
                  </p>
                )}

                <div className="text-center">
                  <Link
                    href={demoHref}
                    className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                  >
                    {hasSavings
                      ? "Quero essa economia no meu restaurante"
                      : "Quero ver funcionando no meu restaurante"}
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
