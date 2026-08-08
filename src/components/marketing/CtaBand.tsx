/**
 * A faixa de fechamento das páginas internas. Server component.
 *
 * É ELA o "um CTA comercial por página" (ver `DEMO_CTA_LABEL` no config): vem no
 * fim, depois do argumento, que é onde o convite se paga. Por isso o rótulo e o
 * destino nascem certos por padrão — quem monta a página passa só o título.
 * Enquanto o padrão era `PRIMARY_CTA_LABEL` ("Ver como o Foocci funciona"), cada
 * página escrevia o próprio rótulo à mão, e foi assim que nasceram nove textos
 * para a mesma porta.
 *
 * ── REDESENHO DE 05/08 (à noite) ──
 *
 * O CEO, olhando o fim da página do CRM: *"essa parte no final está meio esquisita,
 * queria que fizesse alguma coisa melhor"*. Ele estava certo, e o defeito tinha
 * nome: a faixa era um retângulo cinza-claro sobre fundo branco, com um título e um
 * botão soltos no meio de muito ar. Parecia um aviso que sobrou da página anterior,
 * não o fecho dela.
 *
 * Três correções, nesta ordem de importância:
 *
 *  1. **Faltava a linha do meio.** Título e botão, sem nada entre eles, obrigam o
 *     título a fazer dois trabalhos — resumir e convencer. Agora há uma frase de
 *     apoio que diz o que acontece DEPOIS do clique: quem clica em "agende uma
 *     demonstração" está marcando conversa com uma pessoa, e saber disso antes é o
 *     que faz o clique valer (e o SDR receber gente que sabe o que pediu).
 *
 *  2. **Faltava peso.** `bg-canvas` sobre `bg-paper` é um degrau de contraste quase
 *     invisível — o cartão não lia como bloco. O fecho passa a inverter: seção clara
 *     e cartão com a moldura quente da marca, que é o mesmo tratamento do cartão de
 *     economia da calculadora. O fim da página é o lugar onde o laranja tem que
 *     aparecer.
 *
 *  3. **Sobrava ar.** `py-20` na seção mais `py-12` no cartão empilhava mais de uma
 *     dobra de celular só de espaço vazio entre o último argumento e o convite.
 *
 * O `subtitle` tem padrão e é sobrescrevível: página que precisar de outra promessa
 * passa a sua, mas nenhuma página fica SEM a linha do meio por esquecimento.
 */

import { DEMO_URL, DEMO_CTA_LABEL } from "./config";
import { PrimaryCta } from "./Cta";

/**
 * O que a pessoa recebe ao clicar. Não promete prazo ("em 24h") porque não há
 * ninguém garantindo esse prazo hoje — prometer atendimento que a operação não
 * sustenta é o guardrail 7 aplicado ao comercial.
 *
 * ⚠️ E NÃO PROMETE QUANTIDADE DE CAMPO. Esta frase dizia *"São dois campos: seu
 * nome e seu WhatsApp"* enquanto o formulário já tinha SEIS — ela envelheceu
 * sozinha, num commit que ninguém ligou a ela, e passou meses mentindo em quatro
 * páginas ao mesmo tempo. Número de campo em texto de marketing é uma promessa
 * que quebra a cada mudança de formulário: descreva o que a pessoa GANHA, não a
 * conta do que ela digita. Há teste para isso (`promessaDeCampos.test.ts`).
 */
const DEFAULT_SUBTITLE =
  "Uma pessoa do Foocci mostra o sistema rodando com o cardápio e os números do seu restaurante. Você deixa seu contato e a gente chama.";

export function CtaBand({
  title,
  subtitle = DEFAULT_SUBTITLE,
  label = DEMO_CTA_LABEL,
  href = DEMO_URL,
}: {
  title: string;
  /** Passe `null` para omitir de propósito — e só faça isso se o título já disser. */
  subtitle?: string | null;
  label?: string;
  href?: string;
}) {
  return (
    <section className="bg-paper py-14 lg:py-20">
      <div className="mx-auto max-w-4xl px-5 lg:px-8">
        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 px-6 py-10 text-center sm:px-12 sm:py-12">
          <h2 className="mx-auto max-w-2xl text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h2>

          {subtitle && (
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-ink2">
              {subtitle}
            </p>
          )}

          <div className="mt-7 flex justify-center">
            {/* `demoCta`: é ele o CTA da página — a barra fixa do celular sai da
                frente quando esta faixa entra na dobra. */}
            <PrimaryCta className="w-full sm:w-auto" label={label} href={href} demoCta />
          </div>
        </div>
      </div>
    </section>
  );
}
