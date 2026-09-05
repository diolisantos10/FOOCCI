/**
 * "Quatro serviços ou um" — the anchoring block.
 *
 * The market sells menu, POS, AI service and loyalty CRM as four separate services.
 * Bought apart they cost roughly R$ 700/month and none of them exchanges data with the
 * others. That last part is the argument: the saving is the smaller half of it.
 *
 * The plan value comes from `plans.ts`; when it is still null the block argues without
 * a figure rather than inventing one.
 */

import { SEPARATE_STACK_MONTHLY, formatBRL } from "@/lib/site/commissionRates";
import { planByIdOrNull } from "@/lib/site/plans";

const SEPARATE = [
  { name: "Cardápio digital", note: "seu pedido, fora do marketplace" },
  // ⚠️ "nota fiscal" saiu daqui em 05/09/2026, por ordem do CEO: a casa NÃO
  // emite mais. Promessa em tabela comparativa não é detalhe de texto — é o que
  // o lojista compara com o que ele paga hoje, e é onde ele vai cobrar depois.
  { name: "PDV / gestão", note: "comanda e caixa" },
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
          {/*
            O título anterior era um trocadilho ("quatro que não se falam / um que
            conversa") — bonito de ler e lento de entender, e num site de venda o
            visitante não paga esse pedágio. Agora é uma PERGUNTA de compra, com as
            duas opções na cara. O argumento do dado que não circula não sumiu: virou
            a linha de baixo, que é o lugar de explicar.
          */}
          <h2 className="text-balance text-[1.7rem] font-semibold leading-tight text-ink sm:text-4xl">
            Você prefere contratar quatro serviços — ou os quatro em um?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-ink2 sm:mt-4">
            Cardápio, PDV, atendimento e CRM são quatro empresas diferentes lá fora:
            quatro contas, quatro suportes, e o que acontece num deles não chega no
            outro. No Foocci os quatro vêm juntos — e, principalmente, conversam entre si.
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
              O que está incluído
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
              <span className="w-16 text-center text-sm text-muted sm:w-24">serviço à parte</span>
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
            <>Um serviço no lugar de quatro — e a diferença que não cabe no preço: </>
          )}
          <strong className="text-ink">o dado atravessa</strong>. Quem pediu no delivery é
          o mesmo cliente que o CRM reconhece e que a IA atende pelo nome.
        </p>

        {/*
          SEM BOTÃO AQUI (05/08). Esta seção tinha um CTA para o formulário uma tela
          abaixo do CTA da calculadora — dois convites laranja idênticos em sequência,
          e o de cima aparece no momento em que o dono acabou de ver a economia DELE
          na tela. Numa disputa entre "logo depois do número dele" e "logo depois de
          uma tabela", quem fica é o primeiro. A home cumpre a regra de um CTA
          comercial por página com o da calculadora. Ver `DEMO_CTA_LABEL` no config.
        */}
      </div>
    </section>
  );
}
