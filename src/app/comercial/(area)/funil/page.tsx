/** Admin → Sala de Vendas → Funil. */

import { Suspense } from "react";
import { FunilClient } from "./FunilClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funil · Sala de Vendas" };

export default function FunilPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
      <FunilClient />
    </Suspense>
  );
}
