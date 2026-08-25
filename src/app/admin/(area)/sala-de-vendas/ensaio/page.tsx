/** Admin → Sala de Vendas → Ensaio. O TA respondendo, sem enviar nada. */

import { Suspense } from "react";
import { EnsaioClient } from "./EnsaioClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ensaio do TA · Sala de Vendas" };

export default function EnsaioPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
      <EnsaioClient />
    </Suspense>
  );
}
