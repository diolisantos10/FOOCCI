/**
 * A faixa de fechamento das páginas internas. Server component.
 *
 * É ELA o "um CTA comercial por página" (ver `DEMO_CTA_LABEL` no config): vem no
 * fim, depois do argumento, que é onde o convite se paga. Por isso o rótulo e o
 * destino agora nascem certos por padrão — quem monta a página passa só o título.
 * Enquanto o padrão era `PRIMARY_CTA_LABEL` ("Ver como o Foocci funciona"), cada
 * página escrevia o próprio rótulo à mão, e foi assim que nasceram nove textos
 * para a mesma porta.
 */

import { DEMO_URL, DEMO_CTA_LABEL } from "./config";
import { PrimaryCta } from "./Cta";

export function CtaBand({
  title,
  label = DEMO_CTA_LABEL,
  href = DEMO_URL,
}: {
  title: string;
  label?: string;
  href?: string;
}) {
  // Drift do DESIGN.md corrigido de passagem: gray-* e hex literal viraram tokens,
  // e o cartão saiu de `rounded-3xl` para o `rounded-2xl` do design system.
  return (
    <section className="bg-paper py-20">
      <div className="mx-auto max-w-4xl px-5 lg:px-8">
        <div className="rounded-2xl border border-line bg-canvas px-6 py-12 text-center sm:px-12">
          <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h2>
          <div className="mt-7 flex justify-center">
            {/* `demoCta`: é ele o CTA da página — a barra fixa do celular sai da
                frente quando esta faixa entra na dobra. */}
            <PrimaryCta label={label} href={href} demoCta />
          </div>
        </div>
      </div>
    </section>
  );
}
