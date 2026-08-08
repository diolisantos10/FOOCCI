/**
 * A porta da Sala dos Agentes para a tela.
 *
 * Rota FINA de propósito: toda a inteligência mora em `@/services/agents/sala`,
 * construído em paralelo contra o mesmo contrato. Aqui só existe o portão de
 * admin e a tradução para JSON.
 *
 * Por que a tela não importa o serviço direto num server component: a Sala
 * precisa dos três estados obrigatórios (carregando / vazio / erro) com um
 * "Tentar de novo" que funcione, e isso pede um limite de cliente. A vitrine do
 * `interface` também já registrou o motivo estrutural — tela de admin consome
 * rota `/api/admin/*`, porque o cookie de admin não atravessa o middleware do
 * NextAuth nas rotas de tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getSalaDosAgentes } from "@/services/agents/sala";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sala = await getSalaDosAgentes();
    return NextResponse.json({ ok: true, data: sala });
  } catch (e) {
    // O alerta carrega a própria evidência (guardrail 6): a tela imprime este
    // texto no estado de erro, para quem for consertar não precisar adivinhar.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Falha ao montar a Sala dos Agentes." },
      { status: 500 },
    );
  }
}
