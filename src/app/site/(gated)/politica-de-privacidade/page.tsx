/**
 * /site/politica-de-privacidade — plain-language starter privacy policy.
 *
 * Starter legal content — requires legal review before public launch.
 * Wording reflects PRE-LAUNCH reality: no active forms, WhatsApp or lead capture.
 * TODO(legal): NOT legal advice. Requires final legal / LGPD review before launch.
 */

import type { Metadata } from "next";
import { LegalShell, LegalBlock } from "@/components/marketing/LegalShell";

const TITLE = "Política de Privacidade | Foocci";
const DESCRIPTION = "Entenda como a Foocci trata informações enviadas pelo site e canais de contato.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

export default function PoliticaPage() {
  return (
    <LegalShell title="Política de Privacidade" lastUpdated="4 de junho de 2026">
      <LegalBlock heading="Introdução">
        <p>
          Esta Política de Privacidade explica, em linguagem simples, como a Foocci trata
          as informações enviadas por meio deste site. Ao usar o site, você concorda com as
          práticas descritas aqui.
        </p>
      </LegalBlock>

      <LegalBlock heading="Status de pré-lançamento">
        <p>
          A Foocci está em fase piloto e pré-lançamento. Neste momento, o site apresenta a
          proposta e informações institucionais e não possui formulários de captação,
          agendamento de demonstração, canais de venda ou atendimento por WhatsApp ativos.
        </p>
        <p>
          Recursos de contato, demonstração e comerciais poderão ser ativados em uma etapa
          futura. Quando isso acontecer, esta Política será atualizada para descrever os
          dados tratados.
        </p>
      </LegalBlock>

      <LegalBlock heading="Dados que poderão ser coletados">
        <p>
          Como não há formulários ativos hoje, o site não coleta dados de cadastro neste
          momento. Quando recursos de demonstração ou contato forem disponibilizados,
          poderemos coletar dados informados por você, como nome, WhatsApp, nome do
          restaurante, cidade e tipo de restaurante.
        </p>
      </LegalBlock>

      <LegalBlock heading="WhatsApp e canais de contato">
        <p>
          Não há canal de WhatsApp comercial ativo neste momento. Caso um canal de contato
          seja disponibilizado futuramente, as informações compartilhadas serão tratadas
          apenas para responder e dar andamento ao seu contato.
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
          Quando dados forem coletados, serão usados para responder solicitações, apresentar
          a Foocci e melhorar a experiência do site. Não vendemos seus dados.
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
          Enquanto o site está em pré-lançamento, esta Política pode ser atualizada antes da
          abertura comercial. Dúvidas sobre privacidade serão tratadas pelos canais oficiais
          da Foocci quando disponibilizados.
        </p>
      </LegalBlock>
    </LegalShell>
  );
}
