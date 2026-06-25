/**
 * /privacidade — PUBLIC privacy policy (no auth, no pre-launch gate).
 *
 * This route is intentionally OUTSIDE /site (which is password-gated) and is added
 * to middleware PUBLIC_PATHS, so it is reachable by anyone — including the Meta /
 * Google app-review crawlers, which require a publicly accessible privacy policy URL.
 *
 * Content is WhatsApp/Meta + Google aware because the product processes messages and
 * business data on behalf of restaurants. TODO(legal): final LGPD review before scale.
 */

import type { Metadata } from "next";
import Link from "next/link";

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
      <p className="mt-2 text-xs text-gray-500">Última atualização: 25 de junho de 2026</p>

      <Block heading="Quem somos">
        <p>
          O Foocci é uma plataforma de gestão e relacionamento para restaurantes. Oferecemos,
          entre outros recursos, atendimento e campanhas pelo WhatsApp, cardápio digital,
          pedidos e integrações com serviços da Meta (WhatsApp, Instagram, Facebook) e do
          Google (Meu Negócio e Analytics).
        </p>
        <p>
          Esta Política explica, em linguagem simples, quais dados tratamos, com que
          finalidade, e quais são os seus direitos.
        </p>
      </Block>

      <Block heading="Nosso papel: restaurante e cliente final">
        <p>
          Para os dados dos clientes finais (quem compra ou conversa com o restaurante), o
          <strong> restaurante é o responsável pelos dados (controlador)</strong> e o Foocci
          atua como <strong>operador</strong>, tratando esses dados apenas para prestar o
          serviço ao restaurante. Para os dados de cadastro do próprio restaurante na
          plataforma, o Foocci é o controlador.
        </p>
      </Block>

      <Block heading="Dados que tratamos">
        <p>Conforme os recursos utilizados, podemos tratar:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Dados de cadastro do restaurante (nome, e-mail, telefone, dados do negócio).</li>
          <li>Dados de contato de clientes do restaurante (nome e número de WhatsApp).</li>
          <li>
            Conteúdo de mensagens trocadas pelo WhatsApp, Instagram e Facebook entre o
            restaurante e seus clientes, para viabilizar o atendimento e as campanhas.
          </li>
          <li>Pedidos, itens e histórico de relacionamento usados em campanhas de CRM.</li>
          <li>
            Métricas de avaliações (Google Meu Negócio) e de tráfego do site (Google
            Analytics), quando o restaurante conecta essas integrações.
          </li>
        </ul>
      </Block>

      <Block heading="WhatsApp, Instagram e Facebook (Meta)">
        <p>
          Quando um restaurante conecta sua conta oficial da Meta, o Foocci passa a enviar e
          receber mensagens em nome do restaurante por meio das APIs oficiais da Meta. Usamos
          esse acesso exclusivamente para: atender clientes, registrar as conversas na Central
          de Conversas e enviar campanhas autorizadas pelo restaurante.
        </p>
        <p>
          Não usamos o conteúdo das mensagens para finalidades alheias à prestação do serviço
          e não vendemos esses dados. As credenciais de acesso às contas são armazenadas de
          forma criptografada.
        </p>
      </Block>

      <Block heading="Google (Meu Negócio e Analytics)">
        <p>
          Quando o restaurante conecta o Google, acessamos somente as informações necessárias
          para exibir avaliações do Meu Negócio e métricas de tráfego do Analytics dentro do
          painel do restaurante. O uso segue as políticas do Google, incluindo a Política de
          Dados de Usuário dos Serviços de API do Google.
        </p>
      </Block>

      <Block heading="Finalidades">
        <p>
          Tratamos dados para: operar o atendimento e as campanhas, melhorar a experiência,
          gerar relatórios para o restaurante, cumprir obrigações legais e garantir a
          segurança da plataforma. Não vendemos dados pessoais.
        </p>
      </Block>

      <Block heading="Compartilhamento">
        <p>
          Compartilhamos dados apenas com provedores que viabilizam a operação (por exemplo,
          infraestrutura de nuvem, Meta e Google), na medida necessária, e quando exigido por
          lei ou autoridade competente.
        </p>
      </Block>

      <Block heading="Armazenamento e segurança">
        <p>
          Adotamos medidas técnicas e organizacionais razoáveis para proteger as informações,
          incluindo criptografia de credenciais sensíveis e isolamento dos dados de cada
          restaurante. Nenhum sistema é totalmente seguro, mas trabalhamos para reduzir riscos.
        </p>
      </Block>

      <Block heading="Retenção e exclusão">
        <p>
          Mantemos os dados pelo tempo necessário às finalidades acima ou conforme exigido por
          lei. O restaurante pode solicitar a exclusão de dados de clientes que controla, e
          qualquer pessoa pode solicitar a exclusão dos seus dados pelos canais abaixo.
        </p>
      </Block>

      <Block heading="Seus direitos (LGPD)">
        <p>
          Você pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados, além
          de revogar consentimentos, conforme a Lei Geral de Proteção de Dados (LGPD).
        </p>
      </Block>

      <Block heading="Contato e exclusão de dados">
        <p>
          Para exercer seus direitos ou solicitar a exclusão de dados, fale com a gente em{" "}
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
    </main>
  );
}
