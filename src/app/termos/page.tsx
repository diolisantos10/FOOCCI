/**
 * /termos — PUBLIC terms of use (no auth, no pre-launch gate).
 *
 * Outside the password-gated /site area and added to middleware PUBLIC_PATHS so it is
 * reachable by anyone, including the Meta / Google app-review crawlers that require a
 * publicly accessible terms URL. TODO(legal): final legal review before scale.
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
      <p className="mt-2 text-xs text-gray-500">Última atualização: 25 de junho de 2026</p>

      <Block heading="Aceitação">
        <p>
          Ao acessar ou usar a plataforma Foocci, você concorda com estes Termos de Uso e com
          a nossa{" "}
          <Link className="font-medium text-blue-600 hover:underline" href="/privacidade">
            Política de Privacidade
          </Link>
          . Se não concordar, não utilize a plataforma.
        </p>
      </Block>

      <Block heading="O que é o Foocci">
        <p>
          O Foocci é uma plataforma para restaurantes que reúne atendimento e campanhas pelo
          WhatsApp, cardápio digital, pedidos e integrações com serviços da Meta e do Google.
        </p>
      </Block>

      <Block heading="Conta e responsabilidade do restaurante">
        <p>
          O restaurante é responsável pelas informações que cadastra, pelo uso da plataforma
          por sua equipe e por obter as autorizações necessárias para se comunicar com seus
          clientes. O restaurante deve manter suas credenciais em segurança.
        </p>
      </Block>

      <Block heading="Uso do WhatsApp e mensagens">
        <p>
          Ao conectar uma conta oficial da Meta, o restaurante autoriza o Foocci a enviar e
          receber mensagens em seu nome pelas APIs oficiais. O restaurante concorda em seguir
          as políticas da Meta e do WhatsApp, incluindo regras sobre consentimento, modelos de
          mensagem e comunicação responsável, sem envio de spam.
        </p>
      </Block>

      <Block heading="Integrações de terceiros">
        <p>
          As integrações com Meta e Google estão sujeitas aos termos e políticas desses
          provedores. O Foocci não se responsabiliza por mudanças, indisponibilidades ou
          decisões desses serviços que afetem as integrações.
        </p>
      </Block>

      <Block heading="Uso aceitável">
        <p>
          Você concorda em usar a plataforma de forma legal e responsável, sem prejudicar seu
          funcionamento, sua segurança ou terceiros, e sem enviar comunicações não autorizadas.
        </p>
      </Block>

      <Block heading="Propriedade intelectual">
        <p>
          A marca Foocci e os elementos da plataforma são protegidos. Não é permitido copiar,
          modificar ou reutilizar sem autorização.
        </p>
      </Block>

      <Block heading="Limitação de responsabilidade">
        <p>
          A plataforma é fornecida no estado em que se encontra. Buscamos disponibilidade e
          precisão, mas não garantimos operação ininterrupta ou livre de erros. Na máxima
          medida permitida em lei, o Foocci não responde por danos indiretos.
        </p>
      </Block>

      <Block heading="Alterações">
        <p>
          Podemos atualizar estes Termos a qualquer momento. A versão vigente é sempre a
          publicada nesta página.
        </p>
      </Block>

      <Block heading="Contato">
        <p>
          Dúvidas? Fale com a gente em{" "}
          <a className="font-medium text-blue-600 hover:underline" href="mailto:contato@foocci.com.br">
            contato@foocci.com.br
          </a>
          .
        </p>
      </Block>
    </main>
  );
}
