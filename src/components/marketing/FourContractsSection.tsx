/**
 * "Quatro contratos ou um" — the anchoring block.
 *
 * The market sells menu, POS, AI service and loyalty CRM as four separate categories.
 * Bought apart they cost roughly R$ 700/month and none of them exchanges data with the
 * others. That last part is the argument: the saving is the smaller half of it.
 *
 * The plan value comes from `plans.ts`; when it is still null the block argues without
 * a figure rather than inventing one.
 */

import Link from "next/link";
import { SEPARATE_STACK_MONTHLY, formatBRL } from "@/lib/site/commissionRates";
import { planByIdOrNull } from "@/lib/site/plans";
import { AGENDAR_URL } from "./config";

const SEPARATE = [
  { name: "Cardápio digital", note: "seu pedido, fora do marketplace" },
  { name: "PDV / gestão", note: "comanda, caixa e nota fiscal" },
  { name: "Atendimento por IA", note: "quem responde o cliente" },
  { name: "CRM de fidelidade", note: "quem faz ele voltar" },
];

export function FourContractsSection() {
  const crescimento = planByIdOrNull("crescimento");
  const price = crescimento?.monthly ?? null;
  const savingPct = price
    ? Math.round(((SEPARATE_STACK_MONTHLY - price) / SEPARATE_STACK_MONTHLY) * 100)
    : null;

  return (
    <section className="bg-paper py-12 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <header className="text-center">
          <h2 className="text-[1.7rem] font-semibold leading-tight text-ink sm:text-4xl">
            Quatro contratos que não se falam. Ou um que conversa.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-ink2 sm:mt-4">
            No mercado brasileiro, isso aqui são quatro categorias diferentes, de quatro
            empresas diferentes. Você paga quatro vezes — e o dado de uma não chega na outra.
          </p>
        </header>

        {/*
          Uma lista só, com as duas colunas de valor ao lado. A primeira versão
          repetia os quatro itens em dois cards empilhados — no celular isso custava
          quase duas telas para dizer a mesma coisa duas vezes.
        */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-line">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-line bg-canvas px-4 py-2.5 sm:gap-x-6 sm:px-6">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">
              O que você contrata
            </span>
            <span className="w-16 text-center text-xs font-semibold uppercase tracking-widest text-muted sm:w-24">
              Separado
            </span>
            <span className="w-16 text-center text-xs font-semibold uppercase tracking-widest text-brand-600 sm:w-24">
              Foocci
            </span>
          </div>

          {SEPARATE.map((s) => (
            <div
              key={s.name}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-line bg-paper px-4 py-3 sm:gap-x-6 sm:px-6"
            >
              <span>
                <span className="block text-sm font-semibold text-ink">{s.name}</span>
                <span className="block text-xs text-muted">{s.note}</span>
              </span>
              <span className="w-16 text-center text-sm text-muted sm:w-24">contrato</span>
              <span aria-label="incluído" className="w-16 text-center text-brand-500 sm:w-24">
                ✓
              </span>
            </div>
          ))}

          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 bg-canvas px-4 py-4 sm:gap-x-6 sm:px-6">
            <span className="text-sm font-semibold text-ink">Por mês</span>
            <span className="w-16 text-center sm:w-24">
              <span className="block text-base font-semibold text-ink sm:text-lg">
                ~{formatBRL(SEPARATE_STACK_MONTHLY)}
              </span>
            </span>
            <span className="w-16 text-center sm:w-24">
              {price ? (
                <span className="block text-base font-semibold text-brand-600 sm:text-lg">
                  {formatBRL(price)}
                </span>
              ) : (
                <span className="block text-xs font-semibold text-brand-600">
                  na demonstração
                </span>
              )}
            </span>
          </div>
        </div>

        <p className="mt-5 text-center text-sm leading-relaxed text-ink2">
          {savingPct ? (
            <>
              <strong className="text-ink">{savingPct}% menos</strong> que a soma dos quatro
              — e a diferença que não cabe no preço:{" "}
            </>
          ) : (
            <>Um contrato no lugar de quatro — e a diferença que não cabe no preço: </>
          )}
          <strong className="text-ink">o dado atravessa</strong>. Quem pediu no delivery é
          o mesmo cliente que o CRM reconhece e que a IA atende pelo nome.
        </p>

        <div className="mt-7 text-center">
          <Link
            href={AGENDAR_URL}
            className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            Ver funcionando no meu restaurante
          </Link>
        </div>
      </div>
    </section>
  );
}
