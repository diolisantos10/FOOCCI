/** Endereço antigo: a régua agora é uma aba do CRM único. */

import { redirect } from "next/navigation";
import { ROTAS } from "@/lib/sala/rotas";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM IA · Sala de Vendas" };

export default function CrmPage() {
  redirect(`${ROTAS.crmIa}?aba=regua`);
}
