/**
 * /site/termos-de-uso — plain-language starter terms of use.
 *
 * TODO(legal): starter document, NOT legal advice. Requires final legal review
 * before production use.
 */

import type { Metadata } from "next";
import { LegalShell, LegalBlock } from "@/components/marketing/LegalShell";

const TITLE = "Termos de Uso | Foocci";
const DESCRIPTION = "Veja os termos básicos de uso do site público da Foocci.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
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
          Este é o site institucional e comercial da Foocci, destinado a apresentar o
          produto e permitir solicitações de demonstração e contato.
        </p>
      </LegalBlock>

      <LegalBlock heading="Solicitações de demonstração e contato">
        <p>
          Os formulários e canais de contato servem para você solicitar uma demonstração
          ou falar com a Foocci. As informações enviadas são tratadas conforme a Política
          de Privacidade.
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
          O site pode conter links para serviços de terceiros, como o WhatsApp. Não nos
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
        <p>Em caso de dúvidas, fale com a gente pelos canais oficiais da Foocci.</p>
      </LegalBlock>
    </LegalShell>
  );
}
