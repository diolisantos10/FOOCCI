/**
 * Comercial → Control Tower.
 *
 * A tela nova NÃO substitui nada: `/comercial/painel` (painel do gerente +
 * Revenue Supervisor) e `/comercial/supervisora` continuam onde estavam e
 * fazendo o que faziam. A torre é o andar de cima delas.
 */

import { TorreClient } from "./TorreClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Control Tower · Sala de Vendas" };

export default function TorrePage() {
  return (
    <div className="min-h-full bg-canvas">
      <TorreClient />
    </div>
  );
}
