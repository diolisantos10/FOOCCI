/**
 * Admin → Sala de Vendas → Atendimento.
 *
 * A tela de quatro áreas do item 5 do comando. É onde o SDR passa o dia.
 */

import { Suspense } from "react";
import { AtendimentoClient } from "./AtendimentoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atendimento · Sala de Vendas" };

export default function AtendimentoPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
      <AtendimentoClient />
    </Suspense>
  );
}
