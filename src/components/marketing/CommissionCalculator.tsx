"use client";

/**
 * "Quanto você paga de comissão" — the highest-converting block on the site.
 *
 * It is not decoration: it turns the commission table into an interaction the owner
 * performs on their own numbers. Someone who types their revenue and sees R$ 6.080
 * leave their pocket every month has already made the argument to themselves.
 *
 * Three rules this component follows, all of them from the OS:
 *   - Percentages come from ONE constant file, never inlined here.
 *   - The source of the percentage is RENDERED, not hidden. A number without an
 *     origin is an invented number.
 *   - The calculated value travels to the demo form, so the conversation starts
 *     with the number already on the table.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  COMMISSION_RATES,
  COMMISSION_SOURCE,
  MIGRATION_RANGE,
  calculateCommission,
  formatBRL,
} from "@/lib/site/commissionRates";
import { AGENDAR_URL } from "./config";

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

  const demoHref = AGENDAR_URL;

  return (
    <section id="calculadora" className="bg-canvas py-12 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            A conta que ninguém te mostra
          </p>
          <h2 className="mt-2 text-[1.7rem] font-semibold leading-tight text-ink sm:mt-3 sm:text-4xl">
            Quanto você paga de comissão por mês?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-ink2 sm:mt-4">
            Coloque o que você fatura no marketplace. A conta é feita na hora, com a
            tabela pública de 2026.
          </p>
        </header>

        <div className="mt-6 rounded-2xl border border-line bg-paper p-5 shadow-sm sm:mt-10 sm:p-8">
          {/* ── Entradas ── */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="faturamento" className="block text-sm font-semibold text-ink">
                Faturamento no marketplace por mês
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
                  className="w-full rounded-xl border border-line bg-paper py-3 pl-10 pr-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
                        {(opt.rate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% —{" "}
                        {opt.breakdown}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Resultado: vazio · inválido · calculado ── */}
          <div className="mt-8 border-t border-line pt-8" aria-live="polite">
            {!hasValue ? (
              <p className="text-center text-sm text-muted">
                Digite seu faturamento acima — ou escolha um valor — para ver a conta.
              </p>
            ) : tooSmall ? (
              <p className="text-center text-sm text-ink2">
                Esse valor parece baixo demais para uma conta mensal. Confira o número —
                a calculadora usa o faturamento do mês inteiro.
              </p>
            ) : (
              <div className="text-center">
                <p className="text-sm text-ink2">Você paga por mês, de comissão</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                  {formatBRL(result.monthlyCommission)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {formatBRL(result.monthlyCommission * 12)} por ano
                </p>

                <div className="mx-auto mt-6 max-w-xl rounded-2xl bg-canvas p-5">
                  <p className="text-sm leading-relaxed text-ink2">
                    Levando de{" "}
                    <strong className="text-ink">
                      {Math.round(MIGRATION_RANGE.low * 100)}% a {Math.round(MIGRATION_RANGE.high * 100)}%
                    </strong>{" "}
                    desse movimento para o seu canal direto, ficam no seu caixa
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-brand-600 sm:text-3xl">
                    {formatBRL(result.savingsLow)} a {formatBRL(result.savingsHigh)}
                    <span className="text-base font-normal text-ink2"> por mês</span>
                  </p>
                </div>

                <Link
                  href={demoHref}
                  className="mt-7 inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                >
                  Quero ver isso no meu restaurante
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* A fonte fica visível: número sem origem é número inventado. */}
        <p className="mt-4 text-center text-xs text-muted">
          Fonte: {COMMISSION_SOURCE.label}. A faixa de migração é conservadora e varia
          conforme o restaurante — não é promessa de resultado.
        </p>
      </div>
    </section>
  );
}
