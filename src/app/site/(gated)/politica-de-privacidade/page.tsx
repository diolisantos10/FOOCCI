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
const DESCRIPTION = "Entenda como o Foocci trata informações enviadas pelo site e canais de contato.";

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
          Esta Política de Privacidade explica, em linguagem simples, como o Foocci trata
          as informações enviadas por meio deste site. Ao usar o site, você concorda com as
          práticas descritas aqui.
        </p>
      </LegalBlock>

      <LegalBlock heading="Esta página cobre o site; o produto tem a sua própria">
        <p>
          Este documento trata do <strong>site comercial</strong> — o formulário de
          demonstração e mais nada. O tratamento de dados <strong>dentro do sistema
          Foocci</strong> (dados do restaurante, dos clientes finais, WhatsApp,
          pagamentos, notas fiscais e IA) é bem mais amplo e está em{" "}
          <a href="/privacidade" className="font-semibold text-brand-600 underline">
            foocci.com.br/privacidade
          </a>.
        </p>
      </LegalBlock>

      <LegalBlock heading="Quem somos e o que este site faz">
        <p>
          Este site apresenta o Foocci, sistema de vendas, relacionamento e fidelização
          para restaurantes, e permite que você solicite uma demonstração informando seus
          dados de contato.
        </p>
      </LegalBlock>

      <LegalBlock heading="Dados que coletamos">
        <p>
          Coletamos apenas o que você digita no formulário de demonstração:{" "}
          <strong>nome e WhatsApp</strong> (obrigatórios) e, se você quiser informar,{" "}
          <strong>nome do restaurante, cidade, tipo de restaurante e principal desafio</strong>.
          Registramos também a data do envio e a página de origem.
        </p>
        <p>
          <strong>Finalidade:</strong> entrar em contato para combinar a demonstração e
          apresentar uma proposta comercial. Não usamos esses dados para outra coisa, não
          vendemos e não compartilhamos com terceiros para fins de marketing.
        </p>
        <p>
          <strong>Base legal (LGPD, art. 7º, V):</strong> execução de procedimentos
          preliminares a pedido do titular — você nos procurou para pedir a demonstração.
        </p>
        <p>
          <strong>Compartilhamento operacional:</strong> os dados ficam no banco de dados do
          Foocci e o aviso de novo contato é enviado por um serviço de e-mail contratado,
          exclusivamente para nos notificar.
        </p>
      </LegalBlock>

      <LegalBlock heading="Seus direitos">
        <p>
          Você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento,
          bastando responder a mensagem que enviarmos ou usar o contato desta Política.
          Atendemos sem custo e sem exigir justificativa.
        </p>
      </LegalBlock>

      <LegalBlock heading="WhatsApp">
        <p>
          Ao informar seu WhatsApp você concorda que a gente entre em contato por lá para
          tratar da demonstração. É só pedir que paramos de enviar mensagens.
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
          o Foocci e melhorar a experiência do site. Não vendemos seus dados.
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
          Esta Política pode ser atualizada; quando isso acontecer publicamos a nova versão antes da
          abertura comercial. Dúvidas sobre privacidade serão tratadas pelos canais oficiais
          do Foocci quando disponibilizados.
        </p>
      </LegalBlock>
    </LegalShell>
  );
}
