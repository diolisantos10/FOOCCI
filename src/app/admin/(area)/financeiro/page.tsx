/**
 * Admin → Financeiro.
 *
 * A conta que o CEO pediu em 29/08/2026: *"a gente precisa saber qual é o custo
 * desses produtos todos os dias (…) contabilizar absolutamente tudo que é
 * gasto."*
 */

import { Suspense } from "react";
import { FinanceiroClient } from "./FinanceiroClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro" };

export default function FinanceiroPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Carregando…</div>}>
      <FinanceiroClient />
    </Suspense>
  );
}
