/**
 * A META DE RECEITA DO COMERCIAL — a única porta que a grava.
 *
 *   GET  ?competencia=AAAA-MM → a meta do mês (ou "sem meta"), o histórico e
 *                               as competências já cadastradas
 *   POST { competencia, valorCentavos, motivo? }
 *
 * ── ⚠️ QUEM PODE MUDAR ──────────────────────────────────────────────────────
 *
 * Ler é de quem já lê o Painel e o Revenue Supervisor — saber qual é a meta é
 * dado de gestão e de auditoria. **Mudar é do dono**: `MASTER_CEO` e
 * `DIRETOR_FOOCCI`, a mesma régua de `PAPEIS_DOS_ACESSOS`. Meta é a cifra
 * contra a qual o time inteiro é medido; gerente que ajusta o próprio alvo
 * transforma o indicador em decoração.
 *
 * ⛔ Não existe rota, campo nem parâmetro de **previsão** aqui. Meta é o número
 * que o CEO digita; previsão seria conta nossa sobre o futuro.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, vePelaOperacaoToda } from "../_guarda";
import {
  competenciaDe,
  competenciaValida,
  definirMeta,
  historicoDaMeta,
  lerMeta,
  metasCadastradas,
} from "@/services/salaDeVendas/metaDeReceita";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quem decide a cifra. Não é a mesma lista de quem a lê, e é de propósito. */
const PODE_MUDAR_META = new Set(["MASTER_CEO", "DIRETOR_FOOCCI"]);

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_meta_de_receita");
  if (!portao.ok) return portao.resposta;

  if (!vePelaOperacaoToda(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "A meta da operação é de gestão e auditoria." },
      { status: 403 },
    );
  }

  const pedida = req.nextUrl.searchParams.get("competencia");
  if (pedida && !competenciaValida(pedida)) {
    return NextResponse.json(
      { ok: false, error: "competência inválida — use AAAA-MM" },
      { status: 400 },
    );
  }
  const competencia = pedida ?? competenciaDe(new Date());

  const [meta, historico, cadastradas] = await Promise.all([
    lerMeta(prisma, competencia),
    historicoDaMeta(prisma, { limite: 20 }),
    metasCadastradas(prisma),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      competencia,
      meta,
      historico,
      cadastradas: cadastradas.map((m) => ({
        competencia: m.competencia,
        valorCentavos: m.valorCentavos,
        definidoPorNome: m.definidoPorNome,
        atualizadoEm: m.atualizadoEm,
      })),
      podeMudar: PODE_MUDAR_META.has(portao.sessao.role),
    },
  });
}

interface Corpo {
  competencia?: unknown;
  valorCentavos?: unknown;
  motivo?: unknown;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "definir_meta_de_receita");
  if (!portao.ok) return portao.resposta;

  if (!PODE_MUDAR_META.has(portao.sessao.role)) {
    return NextResponse.json(
      { ok: false, error: "Definir a meta de receita é decisão do dono." },
      { status: 403 },
    );
  }

  const c = (await req.json().catch(() => ({}))) as Corpo;

  if (typeof c.competencia !== "string") {
    return NextResponse.json(
      { ok: false, error: "informe a competência no formato AAAA-MM" },
      { status: 400 },
    );
  }
  if (typeof c.valorCentavos !== "number") {
    return NextResponse.json(
      { ok: false, error: "`valorCentavos` precisa ser número (em centavos)" },
      { status: 400 },
    );
  }

  const r = await definirMeta(prisma, {
    competencia: c.competencia,
    valorCentavos: c.valorCentavos,
    alteradoPorId: portao.sessao.userId,
    alteradoPorNome: portao.sessao.nome,
    motivo: typeof c.motivo === "string" && c.motivo.trim() ? c.motivo.trim() : null,
  });

  if (!r.ok) return NextResponse.json({ ok: false, error: r.detalhe }, { status: 400 });

  return NextResponse.json({ ok: true, data: r });
}
