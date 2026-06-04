/**
 * /site/politica-de-privacidade — plain-language starter privacy policy.
 *
 * TODO(legal): starter document, NOT legal advice. Requires final legal / LGPD
 * review before production use.
 */

import type { Metadata } from "next";
import { LegalShell, LegalBlock } from "@/components/marketing/LegalShell";

const TITLE = "Política de Privacidade | Foocci";
const DESCRIPTION = "Entenda como a Foocci trata informações enviadas pelo site e canais de contato.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

export default function PoliticaPage() {
  return (
    <LegalShell title="Política de Privacidade" lastUpdated="4 de junho de 2026">
      <LegalBlock heading="Introdução">
        <p>
          Esta Política de Privacidade explica, em linguagem simples, como a Foocci trata
          as informações enviadas por meio deste site e dos canais de contato. Ao usar o
          site, você concorda com as práticas descritas aqui.
        </p>
      </LegalBlock>

      <LegalBlock heading="Dados coletados pelos formulários">
        <p>
          Quando você solicita uma demonstração ou entra em contato, podemos coletar dados
          como nome, WhatsApp, nome do restaurante, cidade, tipo de restaurante e o principal
          desafio informado.
        </p>
      </LegalBlock>

      <LegalBlock heading="Dados de WhatsApp e contato">
        <p>
          Se você optar por falar pelo WhatsApp, a conversa e os dados compartilhados nesse
          canal são tratados para responder e dar andamento ao seu contato.
        </p>
      </LegalBlock>

      <LegalBlock heading="Cookies e análise de uso">
        <p>
          O site pode usar cookies e ferramentas de análise para entender o uso das páginas
          e melhorar a experiência. Você pode gerenciar cookies nas configurações do seu
          navegador.
        </p>
      </LegalBlock>

      <LegalBlock heading="Finalidade do uso dos dados">
        <p>
          Usamos os dados para responder solicitações, apresentar a Foocci, preparar
          demonstrações e melhorar nossos serviços.
        </p>
      </LegalBlock>

      <LegalBlock heading="Compartilhamento">
        <p>
          Não vendemos seus dados. Podemos compartilhar informações apenas com prestadores
          que apoiam a operação do site e do atendimento, na medida necessária.
        </p>
      </LegalBlock>

      <LegalBlock heading="Armazenamento e segurança">
        <p>
          Adotamos medidas razoáveis para proteger as informações. Nenhum sistema é totalmente
          seguro, mas trabalhamos para reduzir riscos.
        </p>
      </LegalBlock>

      <LegalBlock heading="Seus direitos">
        <p>
          Você pode solicitar acesso, correção ou exclusão dos seus dados, conforme a
          legislação aplicável, incluindo a LGPD.
        </p>
      </LegalBlock>

      <LegalBlock heading="Contato">
        <p>
          Para tratar de privacidade, fale com a gente pelos canais oficiais da Foocci —
          a página de demonstração ou o WhatsApp.
        </p>
      </LegalBlock>
    </LegalShell>
  );
}
