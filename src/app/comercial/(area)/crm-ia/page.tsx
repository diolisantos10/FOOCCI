/**
 * Comercial → CRM → CRM IA (plano do dia).
 *
 * A peça 11 do desenho do CEO, fiel ao layout: seis indicadores, segmentos à
 * esquerda, plano do dia ao centro, copiloto à direita, e no rodapé as
 * oportunidades por segmento e a automação em destaque em blocos.
 *
 * ⚠️ **Não é `/comercial/crm`**, que continua de pé ao lado desta: lá está a
 * RÉGUA — os catorze estados de follow-up, o que aciona cada cadência e a
 * jornada do pós-venda. Aqui está o TRABALHO DO DIA — quem precisa de ação
 * agora, por qual canal e valendo quanto. São as duas metades da mesma
 * pergunta, e juntá-las numa tela só teria custado a régua, que já é provada
 * por teste.
 *
 * ⚠️ O CRM aqui é o NOSSO (leads da Sala de Vendas). O CRM do restaurante com
 * os clientes dele vive em `src/services/crm/**` e não aparece nesta tela.
 */

import { CrmIaClient } from "./CrmIaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM IA · Plano do dia · Sala de Vendas" };

export default function CrmIaPage() {
  return <CrmIaClient />;
}
