/**
 * Comercial → Automações → Follow-up automático.
 *
 * A peça 09 do desenho do CEO: as três abas, o construtor da jornada em blocos
 * ligados, os resultados e a paleta à direita, e a tabela de automações ativas
 * no rodapé.
 *
 * ⛔ **O construtor é de LEITURA.** Ele desenha as jornadas que existem no
 * banco e no código. Não há onde gravar uma jornada nova — o motivo, e o que
 * falta para mudar isso, está escrito na própria tela.
 *
 * ⚠️ São as NOSSAS jornadas, sobre leads da Sala de Vendas. O follow-up que o
 * restaurante faz com os clientes dele vive em `src/services/crm/**`.
 */

import { FollowUpAutomaticoClient } from "./FollowUpAutomaticoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Follow-up automático · Sala de Vendas" };

export default function FollowUpAutomaticoPage() {
  return <FollowUpAutomaticoClient />;
}
