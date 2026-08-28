/**
 * Comercial → Cadastro frio.
 *
 * O espaço que o CEO pediu em 28/08/2026: *"um espaço dentro do comercial onde
 * eu possa colocar os agentes para alimentar cadastros frios pelo navegador ao
 * invés de usar o Google Drive."*
 */

import { Suspense } from "react";
import { FriosClient } from "./FriosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cadastro frio" };

export default function FriosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
      <FriosClient />
    </Suspense>
  );
}
