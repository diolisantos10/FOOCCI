/** Comercial → CRM IA. Tela nova; nada existente foi movido. */

import { CrmClient } from "./CrmClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM IA · Sala de Vendas" };

export default function CrmPage() {
  return (
    <div className="min-h-full bg-canvas">
      <CrmClient />
    </div>
  );
}
