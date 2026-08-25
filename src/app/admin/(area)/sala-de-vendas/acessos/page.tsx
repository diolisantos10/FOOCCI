/**
 * Admin → Sala de Vendas → Acessos.
 *
 * A tela fica atrás da moldura do Admin, e a rota faz a recusa fina: só
 * `ADMIN_SECRET` ou sessão de CEO/Diretor cria gente. Um SDR que digite este
 * endereço vê o formulário e recebe 403 ao enviar — a tela é conveniência, a
 * trava está na rota.
 */

import { Suspense } from "react";
import { AcessosClient } from "./AcessosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Criar acesso · Sala de Vendas" };

export default function AcessosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
      <AcessosClient />
    </Suspense>
  );
}
