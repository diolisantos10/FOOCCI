/** Comercial → Central SDR / Gatekeeper. Tela nova; nada existente foi movido. */

import { SdrClient } from "./SdrClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Central SDR · Sala de Vendas" };

export default function SdrPage() {
  return (
    <div className="min-h-full bg-canvas">
      <SdrClient />
    </div>
  );
}
