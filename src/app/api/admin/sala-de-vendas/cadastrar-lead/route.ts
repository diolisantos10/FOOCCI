/**
 * POST /api/admin/sala-de-vendas/cadastrar-lead
 *
 * A rota do cadastro à mão. ⛔ **Nunca pública** — mesma guarda das outras
 * telas da sala comercial, e o auditor, que lê e não escreve, é recusado aqui.
 *
 * ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
 *
 * Não escreve em `SiteLead`. Não dispara mensagem. Ela valida o corpo e chama
 * `cadastrarLeadAMao`, que entrega à porta única do nascimento do lead
 * (`importarMetaLead`). O disparo está pausado por ordem do CEO, e nada neste
 * caminho o aciona: cadastrar é cadastrar.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas, somenteLeitura } from "../_guarda";
import {
  cadastroAMaoSchema,
  cadastrarLeadAMao,
} from "@/services/leads/cadastrarLeadAMao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "sala-de-vendas.cadastrar-lead");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "Quem audita não cria lead." },
      { status: 403 },
    );
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const lido = cadastroAMaoSchema.safeParse(corpo);
  if (!lido.success) {
    // O nome do campo vai junto: um "dados inválidos" mudo faz o vendedor
    // reescrever a ficha inteira procurando qual linha o servidor recusou.
    const primeiro = lido.error.issues[0];
    return NextResponse.json(
      {
        ok: false,
        error: primeiro?.message ?? "Dados inválidos.",
        campo: primeiro?.path?.[0] ?? null,
      },
      { status: 400 },
    );
  }

  try {
    const resultado = await cadastrarLeadAMao(lido.data, {
      userId: portao.sessao.userId,
      nome: portao.sessao.nome,
    });

    if (resultado.status === "recusado") {
      return NextResponse.json({ ok: false, error: resultado.motivo }, { status: 400 });
    }

    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    console.error("[cadastrar-lead] falhou:", e);
    return NextResponse.json(
      { ok: false, error: "Não deu para cadastrar. O lead NÃO foi salvo — tente de novo." },
      { status: 500 },
    );
  }
}
