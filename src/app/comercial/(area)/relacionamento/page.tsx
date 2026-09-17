/**
 * Comercial → Follow-up e Pós-venda.
 *
 * Os desenhos nº 09 e nº 10 do CEO, numa tela com duas abas: são a mesma
 * pergunta feita dos dois lados do GANHO.
 *
 * ⚠️ **Não é a tela de CRM IA** (`/comercial/crm`), que é de outra frente. Ali
 * está o plano do dia — o que fazer agora. Aqui está a régua e a distribuição
 * da base — quais são os estados, quantos há em cada um e o que os aciona.
 */

import { RelacionamentoClient } from "./RelacionamentoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Follow-up e pós-venda · Sala de Vendas" };

export default function RelacionamentoPage() {
  return <RelacionamentoClient />;
}
