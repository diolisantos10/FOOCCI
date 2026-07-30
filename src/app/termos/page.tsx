/**
 * /termos — PUBLIC terms of use (no auth, no pre-launch gate).
 *
 * Outside the password-gated /site area and added to middleware PUBLIC_PATHS so it is
 * reachable by anyone, including the Meta / Google app-review crawlers that require a
 * publicly accessible terms URL. TODO(legal): final legal review by counsel before scale.
 */

import type { Metadata } from "next";
import Link from "next/link";

const TITLE = "Termos de Uso | Foocci";
const DESCRIPTION = "Termos de uso da plataforma Foocci para restaurantes e seus clientes.";

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

export default function TermosPublicosPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Foocci</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-900">Termos de Uso</h1>
      <p className="mt-2 text-xs text-gray-500">Última atualização: 30 de julho de 2026</p>

      <Block heading="1. Aceitação">
        <p>
          Ao acessar ou usar a plataforma Foocci, você concorda com estes Termos de Uso e com a
          nossa{" "}
          <Link className="font-medium text-blue-600 hover:underline" href="/privacidade">
            Política de Privacidade
          </Link>
          . Se você usa a plataforma em nome de um restaurante, declara ter poderes para
          representá-lo. Se não concordar, não utilize a plataforma.
        </p>
      </Block>

      <Block heading="2. Definições">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Plataforma</strong> — os sistemas, painéis e serviços oferecidos pelo Foocci.</li>
          <li><strong>Restaurante</strong> (ou lojista) — o cliente contratante que usa a plataforma para operar seu negócio.</li>
          <li><strong>Cliente final</strong> — a pessoa que compra ou conversa com o restaurante.</li>
        </ul>
      </Block>

      <Block heading="3. O que é o Foocci">
        <p>
          O Foocci é uma plataforma para restaurantes que reúne atendimento e campanhas pelo
          WhatsApp, cardápio digital, pedidos, pagamentos online, emissão de nota fiscal
          (opcional) e integrações com serviços da Meta e do Google.
        </p>
      </Block>

      <Block heading="4. Cadastro, conta e elegibilidade">
        <p>
          Para usar a plataforma é necessário criar uma conta com informações verdadeiras e
          atualizadas. O restaurante é responsável pela guarda das suas credenciais e por todo
          uso feito por sua equipe. Você deve ter capacidade legal para contratar.
        </p>
      </Block>

      <Block heading="5. Planos, assinatura e pagamento">
        <p>
          O acesso a determinados recursos pode depender de um plano ou assinatura. Valores,
          formas de cobrança e eventuais recursos pagos são informados no momento da contratação.
          O não pagamento pode levar à suspensão do acesso aos recursos correspondentes.
        </p>
      </Block>

      <Block heading="6. Responsabilidades do restaurante (proteção de dados)">
        <p>
          Em relação aos dados dos clientes finais, o restaurante é o{" "}
          <strong>controlador</strong> e o Foocci atua como <strong>operador</strong>. O
          restaurante é responsável por: obter as autorizações e bases legais necessárias para se
          comunicar com seus clientes; usar a plataforma conforme a LGPD; e atender às
          solicitações de titulares relativas aos dados que controla.
        </p>
      </Block>

      <Block heading="7. Uso do WhatsApp e mensagens">
        <p>
          Ao conectar uma conta oficial da Meta, o restaurante autoriza o Foocci a enviar e
          receber mensagens em seu nome pelas APIs oficiais. O restaurante concorda em seguir as
          políticas da Meta e do WhatsApp — incluindo regras sobre consentimento, modelos de
          mensagem e comunicação responsável — e a <strong>não enviar spam</strong> nem
          mensagens não autorizadas.
        </p>
      </Block>

      <Block heading="8. Pagamentos online">
        <p>
          Quando o restaurante habilita pagamentos, as transações são liquidadas por provedores
          de pagamento contratados (por exemplo, Mercado Pago e SumUp). O{" "}
          <strong>Foocci não é instituição financeira</strong> e não processa nem retém os
          valores dos pedidos: apenas integra a cobrança ao fluxo do pedido. Questões de
          liquidação, estornos e disputas seguem os termos do provedor de pagamento.
        </p>
      </Block>

      <Block heading="9. Notas fiscais">
        <p>
          A emissão de nota fiscal é um recurso opcional. A responsabilidade pela correção dos
          dados fiscais, pela situação tributária e pelo cumprimento das obrigações acessórias é{" "}
          <strong>do restaurante</strong>. O Foocci fornece a ferramenta de emissão em nome do
          restaurante, por meio de gateway fiscal, e não presta consultoria contábil ou fiscal.
        </p>
      </Block>

      <Block heading="10. Integrações de terceiros">
        <p>
          As integrações com Meta, Google, provedores de pagamento e gateway fiscal estão
          sujeitas aos termos e políticas desses provedores. O Foocci não se responsabiliza por
          mudanças, indisponibilidades ou decisões desses serviços que afetem as integrações.
        </p>
      </Block>

      <Block heading="11. Uso aceitável">
        <p>
          Você concorda em usar a plataforma de forma legal e responsável. É vedado, entre
          outros: prejudicar o funcionamento ou a segurança da plataforma; acessar dados sem
          autorização; enviar comunicações não solicitadas; e usar a plataforma para fins
          ilícitos ou que violem direitos de terceiros.
        </p>
      </Block>

      <Block heading="12. Propriedade intelectual">
        <p>
          A marca Foocci e os elementos da plataforma são protegidos. Não é permitido copiar,
          modificar, distribuir ou reutilizar sem autorização. O conteúdo cadastrado pelo
          restaurante (como cardápio e mensagens) permanece de sua titularidade.
        </p>
      </Block>

      <Block heading="13. Disponibilidade e suporte">
        <p>
          Buscamos manter a plataforma disponível e prestar suporte, mas podem ocorrer
          interrupções para manutenção, atualizações ou por fatores fora do nosso controle. Os
          pedidos e comandas essenciais foram desenhados para continuar funcionando mesmo diante
          de indisponibilidades pontuais de recursos acessórios.
        </p>
      </Block>

      <Block heading="14. Suspensão e encerramento">
        <p>
          O restaurante pode encerrar o uso a qualquer momento. Podemos suspender ou encerrar o
          acesso em caso de violação destes Termos, de exigência legal ou de risco à segurança.
          Após o encerramento, os dados são tratados conforme a Política de Privacidade e a
          legislação aplicável.
        </p>
      </Block>

      <Block heading="15. Limitação de responsabilidade">
        <p>
          A plataforma é fornecida no estado em que se encontra. Buscamos disponibilidade e
          precisão, mas não garantimos operação ininterrupta ou livre de erros. Na máxima medida
          permitida em lei, o Foocci não responde por danos indiretos, lucros cessantes ou perdas
          decorrentes de serviços de terceiros.
        </p>
      </Block>

      <Block heading="16. Indenização">
        <p>
          O restaurante concorda em manter o Foocci indene de reclamações de terceiros
          decorrentes do uso indevido da plataforma, do descumprimento destes Termos ou da
          violação de leis, inclusive as de proteção de dados.
        </p>
      </Block>

      <Block heading="17. Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o
          foro do domicílio do restaurante para dirimir controvérsias, salvo disposição legal em
          contrário.
        </p>
      </Block>

      <Block heading="18. Alterações">
        <p>
          Podemos atualizar estes Termos a qualquer momento. A versão vigente é sempre a publicada
          nesta página, com a data de última atualização no topo. Mudanças relevantes poderão ser
          comunicadas pelos canais do produto.
        </p>
      </Block>

      <Block heading="19. Contato">
        <p>
          Dúvidas? Fale com a gente em{" "}
          <a className="font-medium text-blue-600 hover:underline" href="mailto:diolisantos10@gmail.com">
            diolisantos10@gmail.com
          </a>
          .
        </p>
      </Block>
    </main>
  );
}
