/** Comercial → Hunter IA / Inteligência Comercial. Tela nova; nada existente foi movido. */

import { HunterClient } from "./HunterClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hunter IA · Sala de Vendas" };

export default function HunterPage() {
  return (
    <div className="min-h-full bg-canvas">
      <HunterClient />
    </div>
  );
}
