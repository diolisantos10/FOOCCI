/**
 * /site/termos-de-uso — plain-language starter terms of use.
 *
 * Starter legal content — requires legal review before public launch.
 * Wording reflects PRE-LAUNCH reality: no active forms, WhatsApp or lead capture.
 * TODO(legal): NOT legal advice. Requires final legal review before launch.
 */

import type { Metadata } from "next";
import { LegalShell, LegalBlock } from "@/components/marketing/LegalShell";

const TITLE = "Termos de Uso | Foocci";
const DESCRIPTION = "Veja os termos básicos de uso do site público do Foocci.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

export default function TermosPage() {
  return (
    <LegalShell title="Termos de Uso" lastUpdated="4 de junho de 2026">
      <LegalBlock heading="Aceitação">
        <p>
          Ao acessar e usar este site, você concorda com estes Termos de Uso. Se não
          concordar, por favor não utilize o site.
        </p>
      </LegalBlock>

      <LegalBlock heading="Finalidade do site">
        <p>
          Este é o site institucional do Foocci, destinado a apresentar o produto e a
          proposta da empresa.
        </p>
      </LegalBlock>

      <LegalBlock heading="Status de pré-lançamento">
        <p>
          O Foocci está em fase piloto e pré-lançamento. Neste momento, o site não
          disponibiliza formulários, captação de leads, agendamento de demonstração ou
          canais de venda ativos.
        </p>
        <p>
          Caso esses recursos sejam ativados futuramente, as informações enviadas por você
          serão tratadas conforme a Política de Privacidade.
        </p>
      </LegalBlock>

      <LegalBlock heading="Propriedade intelectual">
        <p>
          A marca Foocci, os textos, o layout e os demais elementos do site são protegidos.
          Não é permitido copiar ou reutilizar sem autorização.
        </p>
      </LegalBlock>

      <LegalBlock heading="Uso aceitável">
        <p>
          Você concorda em usar o site de forma legal, sem tentar prejudicar seu
          funcionamento, sua segurança ou outros usuários.
        </p>
      </LegalBlock>

      <LegalBlock heading="Limitações">
        <p>
          O site é fornecido no estado em que se encontra. Buscamos manter as informações
          corretas e atualizadas, mas elas podem mudar sem aviso prévio.
        </p>
      </LegalBlock>

      <LegalBlock heading="Links externos">
        <p>
          Eventualmente, o site poderá conter links para serviços de terceiros. Não nos
          responsabilizamos pelo conteúdo ou pelas práticas desses serviços.
        </p>
      </LegalBlock>

      <LegalBlock heading="Alterações">
        <p>
          Podemos atualizar estes Termos a qualquer momento. A versão vigente é sempre a
          publicada nesta página.
        </p>
      </LegalBlock>

      <LegalBlock heading="Contato">
        <p>Em caso de dúvidas, fale com a gente pelos canais oficiais do Foocci.</p>
      </LegalBlock>
    </LegalShell>
  );
}
