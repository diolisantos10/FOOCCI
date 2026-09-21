/**
 * Comercial → Foocci University: a maçaneta da Academia Comercial.
 *
 * ── POR QUE ESTA TELA EXISTE ────────────────────────────────────────────────
 *
 * A Academia Comercial foi construída, homologada e publicada em produção em
 * 21/09/2026 — e ficou DESLIGADA, porque o conhecimento dela entra como
 * rascunho e só vira ativo quando uma PESSOA publica a versão. A trava está
 * certa e continua de pé (`supervisora/academiaInterruptor.ts`: o código nunca
 * publica sozinho). O que faltava era a mão humana ter onde apertar: existia a
 * rota administrativa e não existia botão nenhum em tela nenhuma.
 *
 * Porta sem maçaneta é porta trancada. Esta é a maçaneta.
 */

import { Suspense } from "react";
import { UniversityClient } from "./UniversityClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Foocci University" };

export default function UniversityPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Carregando…</div>}>
      <UniversityClient />
    </Suspense>
  );
}
