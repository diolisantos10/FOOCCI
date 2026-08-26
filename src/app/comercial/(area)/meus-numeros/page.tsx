/** Comercial → Meus números. O painel de quem vende. */

import { Suspense } from "react";
import { MeusNumerosClient } from "./MeusNumerosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meus números · Comercial" };

export default function MeusNumerosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
      <MeusNumerosClient />
    </Suspense>
  );
}
