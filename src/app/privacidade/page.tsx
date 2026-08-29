/**
 * /privacidade — a POLÍTICA DE PRIVACIDADE. Única, pública, sem portão.
 *
 * This route is intentionally OUTSIDE /site (which is password-gated) and is added
 * to middleware PUBLIC_PATHS, so it is reachable by anyone — including the Meta /
 * Google app-review crawlers, which require a publicly accessible privacy policy URL.
 *
 * Content is WhatsApp/Meta + Google + payments + fiscal aware because the product
 * processes messages and business data on behalf of restaurants.
 * TODO(legal): final LGPD review by counsel before scale.
 *
 * ⚠️ A DATA NÃO SE DIGITA AQUI. Ela vem de `@/lib/site/politicaPrivacidade`, que
 * é a mesma constante gravada em `SiteLead.consentPolicyVersion`. Era uma string
 * solta nesta página até 29/08/2026, e foi exatamente assim que o site chegou a
 * ter DUAS políticas com datas diferentes — esta, de 30/07, e a de pré-lançamento
 * em `/site/politica-de-privacidade`, de 04/06, que era a gravada no consentimento.
 * Enquanto a data mora na constante, a página que a pessoa lê e o registro do que
 * ela consentiu não têm como divergir.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { POLITICA_PRIVACIDADE_ATUALIZADA_EM } from "@/lib/site/politicaPrivacidade";

const TITLE = "Política de Privacidade | Foocci";
const DESCRIPTION =
  "Como o Foocci trata os dados de restaurantes e de seus clientes, incluindo mensagens de WhatsApp e integrações com Meta e Google.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

function Block({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export default function PrivacidadePublicaPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Foocci</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-900">Política de Privacidade</h1>
      <p className="mt-2 text-xs text-gray-500">
        Última atualização: {POLITICA_PRIVACIDADE_ATUALIZADA_EM}
      </p>

      <Block heading="Quem somos">
        <p>
          O Foocci é uma plataforma de gestão e relacionamento para restaurantes. Oferecemos,
          entre outros recursos, atendimento e campanhas pelo WhatsApp, cardápio digital,
          pedidos, pagamentos online, emissão de nota fiscal (opcional) e integrações com
          serviços da Meta (WhatsApp, Instagram, Facebook) e do Google (Meu Negócio e Analytics).
        </p>
        <p>
          Esta Política explica, em linguagem simples, quais dados tratamos, com que finalidade,
          com quem compartilhamos e quais são os seus direitos, em conformidade com a Lei Geral
          de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
        </p>
      </Block>

      <Block heading="Nosso papel: restaurante e cliente final">
        <p>
          Para os dados dos clientes finais (quem compra ou conversa com o restaurante), o{" "}
          <strong>restaurante é o responsável pelos dados (controlador)</strong> e o Foocci atua
          como <strong>operador</strong>, tratando esses dados apenas para prestar o serviço ao
          restaurante e conforme suas instruções. Para os dados de cadastro do próprio
          restaurante na plataforma, o Foocci é o controlador.
        </p>
      </Block>

      <Block heading="Dados que tratamos">
        <p>Conforme os recursos utilizados, podemos tratar:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Dados de cadastro do restaurante (nome, e-mail, telefone, dados do negócio e da equipe).</li>
          <li>Dados de contato de clientes do restaurante (nome, número de WhatsApp e, em pedidos com entrega, endereço).</li>
          <li>
            Conteúdo de mensagens trocadas pelo WhatsApp, Instagram e Facebook entre o
            restaurante e seus clientes, para viabilizar o atendimento e as campanhas.
          </li>
          <li>Pedidos, itens, valores e histórico de relacionamento usados em campanhas de CRM.</li>
          <li>Dados de pagamento processados pelos provedores contratados (ver seção de Pagamentos).</li>
          <li>
            Dados fiscais e o certificado digital do restaurante, quando a emissão de nota fiscal
            é ativada (ver seção de Notas fiscais).
          </li>
          <li>
            Métricas de avaliações (Google Meu Negócio) e de tráfego do site (Google Analytics),
            quando o restaurante conecta essas integrações.
          </li>
          <li>Dados técnicos de uso (registros de acesso, endereço IP e cookies essenciais) para segurança e funcionamento.</li>
        </ul>
      </Block>

      <Block heading="Bases legais (LGPD)">
        <p>Tratamos dados pessoais com fundamento em uma ou mais das seguintes bases legais:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Execução de contrato</strong> — para prestar os serviços contratados pelo restaurante.</li>
          <li><strong>Cumprimento de obrigação legal ou regulatória</strong> — por exemplo, guarda de documentos fiscais.</li>
          <li><strong>Legítimo interesse</strong> — para segurança, prevenção a fraudes e melhoria do serviço, sempre respeitando seus direitos.</li>
          <li><strong>Consentimento</strong> — quando aplicável, por exemplo para comunicações de marketing autorizadas pelo cliente do restaurante.</li>
        </ul>
      </Block>

      <Block heading="WhatsApp, Instagram e Facebook (Meta)">
        <p>
          Quando um restaurante conecta sua conta oficial da Meta, o Foocci passa a enviar e
          receber mensagens em nome do restaurante por meio das APIs oficiais da Meta. Usamos
          esse acesso exclusivamente para: atender clientes, registrar as conversas na Central de
          Conversas e enviar campanhas autorizadas pelo restaurante.
        </p>
        <p>
          Não usamos o conteúdo das mensagens para finalidades alheias à prestação do serviço e
          não vendemos esses dados. As credenciais de acesso às contas são armazenadas de forma
          criptografada.
        </p>
      </Block>

      <Block heading="Google (Meu Negócio e Analytics)">
        <p>
          Quando o restaurante conecta o Google, acessamos somente as informações necessárias
          para exibir avaliações do Meu Negócio e métricas de tráfego do Analytics dentro do
          painel do restaurante. O uso segue as políticas do Google, incluindo a Política de
          Dados de Usuário dos Serviços de API do Google, e é limitado às permissões concedidas.
        </p>
      </Block>

      <Block heading="Pagamentos online">
        <p>
          Quando o restaurante habilita pagamentos, as transações são processadas por provedores
          de pagamento contratados (por exemplo, Mercado Pago e SumUp). Os dados de cartão são
          coletados e processados diretamente por esses provedores, em ambiente próprio deles —{" "}
          <strong>o Foocci não armazena o número completo do cartão</strong>. Tratamos apenas as
          informações necessárias para vincular o pagamento ao pedido (como identificador da
          transação, valor e status).
        </p>
      </Block>

      <Block heading="Notas fiscais (opcional)">
        <p>
          Quando o restaurante ativa a emissão de nota fiscal, tratamos os dados fiscais do
          negócio e o <strong>certificado digital (A1)</strong> enviado pelo restaurante,{" "}
          <strong>armazenado de forma criptografada</strong>, exclusivamente para emitir os
          documentos fiscais em nome do restaurante junto à SEFAZ, por meio do gateway fiscal
          contratado. Documentos fiscais são mantidos pelo prazo exigido pela legislação.
        </p>
      </Block>

      <Block heading="Inteligência artificial e decisões automatizadas">
        <p>
          A plataforma usa inteligência artificial para apoiar o atendimento e sugerir ou redigir
          mensagens de campanha. Essas sugestões passam pela configuração e/ou aprovação do
          restaurante antes de irem ao cliente. Não tomamos decisões automatizadas com efeitos
          jurídicos relevantes sobre uma pessoa sem participação humana. Você pode solicitar
          informações sobre esse tratamento pelos canais abaixo.
        </p>
      </Block>

      <Block heading="Finalidades">
        <p>
          Tratamos dados para: operar o atendimento, os pedidos, os pagamentos e as campanhas;
          gerar relatórios para o restaurante; melhorar a experiência e a segurança da
          plataforma; e cumprir obrigações legais. <strong>Não vendemos dados pessoais.</strong>
        </p>
      </Block>

      <Block heading="Compartilhamento">
        <p>
          Compartilhamos dados apenas com provedores que viabilizam a operação — por exemplo,
          infraestrutura de nuvem, Meta, Google, provedores de pagamento e o gateway de nota
          fiscal — na medida necessária à prestação do serviço, e quando exigido por lei ou
          autoridade competente. Esses provedores tratam os dados conforme contratos e suas
          próprias políticas.
        </p>
      </Block>

      <Block heading="Cookies">
        <p>
          Usamos cookies e tecnologias similares essenciais para autenticação, segurança e
          funcionamento do painel. Quando o restaurante ativa o Google Analytics no seu site,
          cookies de medição podem ser usados conforme as políticas do Google. Você pode
          gerenciar cookies nas configurações do seu navegador.
        </p>
      </Block>

      <Block heading="Transferência internacional">
        <p>
          Alguns provedores podem tratar dados em servidores localizados fora do Brasil. Nesses
          casos, adotamos salvaguardas compatíveis com a LGPD para proteger as informações.
        </p>
      </Block>

      <Block heading="Armazenamento e segurança">
        <p>
          Adotamos medidas técnicas e organizacionais razoáveis para proteger as informações,
          incluindo criptografia de credenciais e certificados sensíveis, controle de acesso e
          isolamento dos dados de cada restaurante. Nenhum sistema é totalmente seguro, mas
          trabalhamos continuamente para reduzir riscos.
        </p>
      </Block>

      <Block heading="Retenção e exclusão">
        <p>
          Mantemos os dados pelo tempo necessário às finalidades desta Política ou conforme
          exigido por lei (documentos fiscais, por exemplo, seguem os prazos legais de guarda). O
          restaurante pode solicitar a exclusão de dados de clientes que controla, e qualquer
          pessoa pode solicitar a exclusão dos seus dados pelos canais abaixo, ressalvadas as
          hipóteses de guarda obrigatória.
        </p>
      </Block>

      <Block heading="Crianças e adolescentes">
        <p>
          O Foocci é uma ferramenta destinada a negócios e não é direcionada a menores de idade.
          Não coletamos intencionalmente dados de crianças. Se identificar esse tipo de dado,
          entre em contato para a remoção.
        </p>
      </Block>

      <Block heading="Seus direitos (LGPD)">
        <p>
          Você pode solicitar, a qualquer momento: confirmação da existência de tratamento;
          acesso, correção, anonimização, portabilidade ou exclusão dos seus dados; informação
          sobre compartilhamentos; e a revogação de consentimentos. Responderemos aos pedidos nos
          prazos previstos na LGPD. Como parte dos dados é controlada pelo restaurante, podemos
          encaminhar a solicitação a ele quando for o caso.
        </p>
      </Block>

      <Block heading="Contato e encarregado (DPO)">
        <p>
          Para exercer seus direitos, tirar dúvidas ou solicitar a exclusão de dados, fale com o
          nosso encarregado pelo tratamento de dados em{" "}
          <a className="font-medium text-blue-600 hover:underline" href="mailto:diolisantos10@gmail.com">
            diolisantos10@gmail.com
          </a>
          . Consulte também nossos{" "}
          <Link className="font-medium text-blue-600 hover:underline" href="/termos">
            Termos de Uso
          </Link>
          .
        </p>
      </Block>

      <Block heading="Alterações desta Política">
        <p>
          Podemos atualizar esta Política para refletir mudanças na plataforma ou na legislação.
          A versão vigente é sempre a publicada nesta página, com a data de última atualização no
          topo. Mudanças relevantes poderão ser comunicadas pelos canais do produto.
        </p>
      </Block>
    </main>
  );
}
