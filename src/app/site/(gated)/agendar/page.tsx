/**
 * /site/agendar — marcar uma chamada curta com quem faz o Foocci.
 *
 * O caminho de conversão por conversa: o visitante escolhe um horário livre da
 * agenda do fundador e deixa nome + WhatsApp. Os horários vêm de /api/site/agenda
 * (gerenciados em /admin/agenda). Sem horário livre, o widget aponta o formulário
 * de demonstração — o site nunca oferece um botão que não leva a lugar nenhum.
 */

import type { Metadata } from "next";
import { CheckIcon } from "@/components/marketing/icons";
import { Eyebrow } from "@/components/marketing/premium";
import { SchedulerWidget } from "@/components/marketing/SchedulerWidget";

const TITLE = "Agendar demonstração | Foocci para restaurantes";
const DESCRIPTION =
  "Escolha um horário e veja o Foocci funcionando ao vivo, com quem faz o produto. Uma chamada curta, direta e sem compromisso.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const O_QUE_ROLA = [
  "Você mostra como o seu restaurante funciona hoje.",
  "A gente apresenta o Foocci na tela, ao vivo, com exemplos reais.",
  "Você sai sabendo se faz sentido — e qual configuração serve para você.",
];

export default function AgendarPage() {
  return (
    <section className="relative overflow-hidden bg-gray-50 py-16 lg:py-24">
      <div className="relative mx-auto max-w-6xl px-5 lg:px-8">
        <div className="grid items-start gap-10 lg:grid-cols-[5fr_6fr] lg:gap-14">
          {/* Copy */}
          <div>
            <Eyebrow>Demonstração ao vivo</Eyebrow>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl lg:text-5xl">
              Agende sua <span className="text-brand-500">demonstração</span>.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-gray-600">
              Uma chamada curta e direta, com o fundador. Você escolhe o horário,
              a gente liga no dia marcado e mostra o Foocci funcionando na tela.
            </p>
            <ul className="mt-8 space-y-3">
              {O_QUE_ROLA.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                  <span className="text-base text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-gray-500">
              Prefere ver antes de conversar?{" "}
              <a href="/site/demonstracao" className="font-semibold text-brand-600 hover:underline">
                Veja a demonstração em vídeo
              </a>
              .
            </p>
          </div>

          {/* Widget */}
          <SchedulerWidget />
        </div>
      </div>
    </section>
  );
}
