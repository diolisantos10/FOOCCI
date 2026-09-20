"use client";

/**
 * Um CRM, duas lentes. O plano do dia e a régua de 14 estados deixaram de ser
 * duas portas concorrentes: vivem no mesmo endereço e compartilham a mesma
 * navegação. O endereço antigo redireciona para a aba Régua, preservando
 * favoritos sem manter dois produtos divergentes no menu.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CrmIaClient } from "./CrmIaClient";
import { CrmClient } from "../crm/CrmClient";
import { cx } from "../_pecas/Pecas";

type Aba = "plano" | "regua";

export function CrmUnificadoClient() {
  const params = useSearchParams();
  const [aba, setAba] = useState<Aba>(params.get("aba") === "regua" ? "regua" : "plano");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-line bg-paper p-1" role="tablist" aria-label="Áreas do CRM IA">
        <button
          role="tab"
          aria-selected={aba === "plano"}
          onClick={() => setAba("plano")}
          className={cx("rounded-lg px-4 py-2 text-[13px] font-semibold", aba === "plano" ? "bg-canvas text-ink" : "text-muted")}
        >
          Plano do dia
        </button>
        <button
          role="tab"
          aria-selected={aba === "regua"}
          onClick={() => setAba("regua")}
          className={cx("rounded-lg px-4 py-2 text-[13px] font-semibold", aba === "regua" ? "bg-canvas text-ink" : "text-muted")}
        >
          Régua, cadências e pós-venda
        </button>
      </div>
      {aba === "plano" ? <CrmIaClient /> : <CrmClient />}
    </div>
  );
}
