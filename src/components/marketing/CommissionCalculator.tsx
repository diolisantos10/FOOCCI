"use client";

/**
 * "Quanto sobra no seu bolso" — o bloco que fecha a venda.
 *
 * REENQUADRAMENTO (2026-08-04, ordem do CEO). Antes o bloco entregava o CUSTO em
 * destaque ("você paga R$ 6.080 de comissão") e escondia a comparação lá embaixo,
 * em dois cards discretos. Ninguém acorda querendo calcular quanto paga: o dono
 * quer saber QUANTO SOBRA. Agora, assim que o número entra, a tela mostra na cara,
 * sem procurar:
 *
 *     No iFood você paga R$ X/mês. No Foocci, R$ 429 fixo.
 *     Você economiza R$ Y por mês (R$ Z por ano).
 *
 * A ECONOMIA é o maior número da tela — é o dado que vende. O custo continua
 * visível, mas como termo da comparação, não como manchete.
 *
 * Regras que este componente não quebra:
 *   - As porcentagens vêm de UM arquivo de constantes (`commissionRates.ts`), nunca
 *     escritas aqui; e a FONTE delas é renderizada, não escondida.
 *   - O preço fixo do Foocci vem de `plans.ts` — a MESMA fonte que a tabela de
 *     ancoragem e a página de planos leem. Sem valor fechado, o comparativo
 *     simplesmente não aparece, em vez de inventar cifra.
 *   - A economia tem a premissa escrita ao lado ("o mesmo faturamento pelo seu canal
 *     direto"), e a faixa conservadora de migração continua logo abaixo. Número
 *     grande sem premissa é promessa — e promessa numa página com campanha paga
 *     volta como reclamação.
 *   - Faturamento baixo demais para o plano compensar NÃO vira economia negativa:
 *     a tela diz a partir de quanto a conta vira, que é honesto e ainda vende.
 *   - Antes de calcular a tela não fica vazia: já mostra o mecanismo (a comissão é
 *     um % que sobe; o Foocci é fixo) com o próximo passo.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  COMMISSION_RATES,
  COMMISSION_SOURCE,
  MARKETPLACE_NAME,
  MIGRATION_RANGE,
  calculateCommission,
  formatBRL,
} from "@/lib/site/commissionRates";
import { planByIdOrNull } from "@/lib/site/plans";
import { DEMO_URL } from "./config";

type Delivery = keyof typeof COMMISSION_RATES;

/** Accepts "40.000", "40000", "R$ 40 mil" typing habits — digits are what matter. */
function parseRevenue(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function maskRevenue(raw: string): string {
  const n = parseRevenue(raw);
  return n ? n.toLocaleString("pt-BR") : "";
}

function formatPct(rate: number): string {
  return `${(rate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

const PRESETS = [20_000, 40_000, 80_000, 150_000];

export function CommissionCalculator() {
  const [revenueText, setRevenueText] = useState("");
  const [delivery, setDelivery] = useState<Delivery>("own");

  const revenue = parseRevenue(revenueText);
  const result = useMemo(() => calculateCommission(revenue, delivery), [revenue, delivery]);

  const hasValue = revenue > 0;
  // Below this, percentages produce numbers too small to argue with — say so instead
  // of showing a result that weakens the case.
  const tooSmall = hasValue && revenue < 1_000;

  const demoHref = DEMO_URL;

  // Preço fixo do Foocci: a MESMA fonte que a tabela de ancoragem lê (plano
  // Crescimento). Nunca um número solto aqui — se um dia o plano ficar sem valor,
  // o comparativo simplesmente não aparece, em vez de inventar uma cifra.
  const foocciFixed = planByIdOrNull("crescimento")?.monthly ?? null;

  const rate = COMMISSION_RATES[delivery].rate;
  const savings = foocciFixed === null ? 0 : result.monthlyCommission - foocciFixed;
  /** Faturamento a partir do qual o plano fixo custa menos que a comissão. */
  const breakEven = foocciFixed === null ? 0 : foocciFixed / rate;

  return (
    <section id="calculadora" className="scroll-mt-16 bg-canvas py-12 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            A conta que ninguém te mostra
          </p>
          <h2 className="mt-2 text-[1.7rem] font-semibold leading-tight text-ink sm:mt-3 sm:text-4xl">
            Quanto sobraria no seu bolso?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-ink2 sm:mt-4">
            Coloque o que você fatura no delivery hoje. A conta é feita na hora, com a
            tabela pública de comissões de 2026.
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

            <div>
              <span className="block text-sm font-semibold text-ink">Quem entrega?</span>
              <div className="mt-2 grid gap-2">
                {(Object.keys(COMMISSION_RATES) as Delivery[]).map((key) => {
                  const opt = COMMISSION_RATES[key];
                  const active = delivery === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setDelivery(key)}
                      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                        active
                          ? "border-brand-500 bg-brand-50/60"
                          : "border-line bg-paper hover:border-line2"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-ink">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {formatPct(opt.rate)} — {opt.breakdown}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Resultado: antes de calcular · inválido · calculado ── */}
          <div className="mt-8 border-t border-line pt-8" aria-live="polite">
            {!hasValue ? (
              /* Antes de calcular a tela não fica vazia: mostra o mecanismo. */
              <div>
                <ComparisonPair
                  marketplaceValue={`${formatPct(rate)} do que você fatura`}
                  marketplaceNote="A comissão sobe toda vez que você vende mais."
                  foocciFixed={foocciFixed}
                  dimmed
                />
                <p className="mt-4 text-center text-sm text-ink2">
                  Digite seu faturamento acima — ou toque num valor — para ver{" "}
                  <strong className="font-semibold text-ink">quanto sobra no seu bolso</strong>.
                </p>
              </div>
            ) : tooSmall ? (
              <p className="text-center text-sm text-ink2">
                Esse valor parece baixo demais para uma conta mensal. Confira o número —
                a calculadora usa o faturamento do mês inteiro.
              </p>
            ) : (
              <div>
                {/* 1 · A comparação, na cara: quanto lá, quanto aqui. */}
                <ComparisonPair
                  marketplaceValue={`${formatBRL(result.monthlyCommission)}/mês`}
                  marketplaceNote="Comissão que sobe toda vez que você vende mais."
                  foocciFixed={foocciFixed}
                />

                {/* 2 · A economia — o maior número da tela. É o dado que vende. */}
                {foocciFixed !== null && savings > 0 && (
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
                {foocciFixed !== null && savings <= 0 && (
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
                  A comissão do {MARKETPLACE_NAME}{" "}
                  <strong className="text-ink">cresce junto com o seu faturamento</strong>. O
                  Foocci é <strong className="text-ink">fixo</strong> — venda mais e continue
                  pagando o mesmo.
                </p>

                {/* 4 · O piso conservador: mesmo migrando pouco, já sobra. */}
                <p className="mx-auto mt-4 max-w-xl rounded-2xl bg-canvas p-4 text-center text-sm leading-relaxed text-ink2">
                  Começando devagar: levando de{" "}
                  <strong className="text-ink">
                    {Math.round(MIGRATION_RANGE.low * 100)}% a{" "}
                    {Math.round(MIGRATION_RANGE.high * 100)}%
                  </strong>{" "}
                  desse movimento para o seu canal direto, já ficam{" "}
                  <strong className="text-ink tabular-nums">
                    {formatBRL(result.savingsLow)} a {formatBRL(result.savingsHigh)}
                  </strong>{" "}
                  por mês no seu caixa.
                </p>

                <div className="text-center">
                  <Link
                    href={demoHref}
                    className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                  >
                    Quero essa economia no meu restaurante
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* A fonte fica visível: número sem origem é número inventado. */}
        <p className="mt-4 text-center text-xs leading-relaxed text-muted">
          Fonte: {COMMISSION_SOURCE.label}. A faixa de migração é conservadora e varia
          conforme o restaurante — não é promessa de resultado.
        </p>
      </div>
    </section>
  );
}

/* ── Os dois lados da conta, sempre no mesmo formato ─────────────────────────── */

function ComparisonPair({
  marketplaceValue,
  marketplaceNote,
  foocciFixed,
  dimmed = false,
}: {
  marketplaceValue: string;
  marketplaceNote: string;
  foocciFixed: number | null;
  dimmed?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          No {MARKETPLACE_NAME} você paga
        </p>
        <p
          className={`mt-1.5 text-2xl font-semibold tabular-nums sm:text-[1.75rem] ${
            dimmed ? "text-ink2" : "text-ink"
          }`}
        >
          {marketplaceValue}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{marketplaceNote}</p>
      </div>

      <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">
          No Foocci
        </p>
        <p className="mt-1.5 text-2xl font-semibold text-brand-600 tabular-nums sm:text-[1.75rem]">
          {foocciFixed === null ? (
            "sob demonstração"
          ) : (
            <>
              {formatBRL(foocciFixed)}
              <span className="text-sm font-normal text-ink2"> fixo/mês</span>
            </>
          )}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Valor fixo: não muda com o seu faturamento.
        </p>
      </div>
    </div>
  );
}
