/** Comercial → Prospecção: os lotes, o interruptor e a fila do dia. */

import { Suspense } from "react";
import { ProspeccaoClient } from "./ProspeccaoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prospecção" };

export default function ProspeccaoPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
      <ProspeccaoClient />
    </Suspense>
  );
}
