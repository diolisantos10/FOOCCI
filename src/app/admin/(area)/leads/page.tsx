/**
 * /admin/leads — endereço antigo da lista "Contatos do site".
 *
 * A lista virou o CRM DA FOOCCI: mesma base, agora com funil, origem de verdade,
 * histórico de contato e performance. O endereço antigo continua funcionando
 * porque ele está em e-mails de aviso já enviados e em links salvos — quebrar
 * essas portas é como se perde acesso a uma base que ninguém mais acha.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminLeadsPage() {
  redirect("/admin/foocci-crm");
}
