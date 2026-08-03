import { redirect } from "next/navigation";

/**
 * /admin/crm-agente foi unificada na CASA do Agente de CRM.
 *
 * A tela que morava aqui (escada por campanha + automações) vive agora em
 * /admin/agentes/crm, junto com o degrau do piloto, a prova A/B e os controles
 * governados — um lugar só para ver o agente trabalhando. Redirect permanente
 * de intenção: nenhum link antigo quebra.
 */
export default function AdminCrmAgenteRedirect() {
  redirect("/admin/agentes/crm");
}
