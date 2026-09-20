import { Suspense } from "react";
import { TreinamentoClient } from "./TreinamentoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Centro de Treinamento" };

export default function TreinamentoPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando o centro de treinamento…</div>}>
      <TreinamentoClient />
    </Suspense>
  );
}
