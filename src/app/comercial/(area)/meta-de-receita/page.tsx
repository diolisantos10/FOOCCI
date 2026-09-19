/**
 * Comercial → Painel → Meta de receita.
 *
 * A moldura vem do layout da área (`_moldura/MolduraDaSala.tsx`); esta página
 * só entrega o conteúdo, como todas as outras. A guarda é a mesma das demais
 * telas: o layout exige sessão, e a rota `/api/admin/sala-de-vendas/meta-de-receita`
 * recusa no servidor quem não pode ler nem gravar. Nunca foi rota pública.
 */

import { Suspense } from "react";
import { MetaDeReceitaClient } from "./MetaDeReceitaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meta de receita" };

export default function MetaDeReceitaPage() {
  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Suspense fallback={<div className="text-[13px] text-muted">Carregando…</div>}>
          <MetaDeReceitaClient />
        </Suspense>
      </div>
    </div>
  );
}
