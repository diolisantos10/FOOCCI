/**
 * /site/demonstracao — ROTA APOSENTADA (06/08/2026, decisão do CEO, confirmada duas vezes).
 *
 * A página morreu; o FORMULÁRIO não. Ele virou a última seção de `/site/precos`
 * (`id="demonstracao"`), com o preço na frente — uma página a menos, o mesmo lead.
 * O componente `DemoForm` mudou de endereço inteiro, sem uma linha reescrita: a
 * preservação do que foi digitado quando o servidor falha, a validação de WhatsApp
 * no servidor, a captura da origem da visita e o código do lead continuam sendo o
 * mesmo código, agora montado noutra página.
 *
 * POR QUE ISTO AQUI NÃO É UM `rm`: esta rota foi divulgada e está em índice de
 * busca. Um 404 numa porta de lead não aparece em relatório nenhum — some o lead,
 * e ninguém fica sabendo. 308 permanente para o novo endereço, com a âncora do
 * formulário: quem vinha pedir demonstração cai vendo o formulário, não o topo dos
 * planos.
 *
 * O fragmento (`#demonstracao`) viaja no `Location` e é respeitado pelo navegador —
 * é ele que faz a promessa do link antigo continuar valendo.
 *
 * ⚠️ O ENDEREÇO NÃO É DIGITADO AQUI. Sai de `DEMO_URL`, a fonte única do config —
 * a mesma constante que os onze CTAs do site leem. Duas cópias do destino é como
 * o redirecionamento passa a apontar para o lugar errado no dia da próxima mudança.
 *
 * ⚠️ FICOU ÓRFÃO: os vídeos de demonstração (`/admin/demo-videos`) eram exibidos
 * SÓ nesta página. Publicar um vídeo hoje não o mostra em lugar nenhum. Não havia
 * vídeo publicado quando isto foi escrito — a seção nem existia —, mas a decisão
 * de onde eles passam a morar é de produto, não de interface, e está registrada
 * para o Diretor.
 */

import { permanentRedirect } from "next/navigation";
import { DEMO_URL } from "@/components/marketing/config";

export default function DemonstracaoPage() {
  permanentRedirect(DEMO_URL);
}
