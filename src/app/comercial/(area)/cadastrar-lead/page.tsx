/**
 * Comercial → Leads → Cadastrar lead.
 *
 * A tela que faltava. Em 19/09/2026 um lead da campanha paga ficou 20 horas
 * fora do Foocci porque a integração falhou e não havia **nenhum** lugar no
 * sistema para digitá-lo à mão. Esta é a porta.
 *
 * ⚠️ A guarda é a da área: o `layout.tsx` de `(area)` exige sessão interna e
 * redireciona quem não tem. A escrita é recusada de novo no servidor, na rota
 * `/api/admin/sala-de-vendas/cadastrar-lead` — a moldura nunca é a fechadura.
 */

import { CadastrarLeadClient } from "./CadastrarLeadClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cadastrar lead" };

export default function CadastrarLeadPage() {
  return <CadastrarLeadClient />;
}
