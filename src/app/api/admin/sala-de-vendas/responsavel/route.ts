/**
 * POST /api/admin/sala-de-vendas/responsavel
 *
 * Assumir um lead, devolver para a IA, ou registrar que a IA pediu gente.
 *
 * ── POR QUE O `409` E NÃO O `500` ──
 *
 * Perder a corrida do "assumir" não é erro de programa: é um resultado normal
 * que acontece toda vez que dois SDRs clicam junto. A tela precisa dizer "Fulano
 * assumiu primeiro", e para isso precisa distinguir "conflito" de "quebrou".
 */

import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas, somenteLeitura } from "../_guarda";
import {
  assumirComoHumano,
  devolverParaIA,
  pedirHumano,
} from "@/services/salaDeVendas/responsavel";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Corpo = {
  acao?: unknown;
  leadId?: unknown;
  objetivo?: unknown;
  motivo?: unknown;
};

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "mudar_responsavel_do_lead");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "auditor lê e não escreve" },
      { status: 403 },
    );
  }

  const corpo = (await req.json().catch(() => ({}))) as Corpo;
  const leadId = typeof corpo.leadId === "string" ? corpo.leadId : "";
  const acao = typeof corpo.acao === "string" ? corpo.acao : "";

  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId obrigatório" }, { status: 400 });
  }

  const conflito = (motivo: string, extra: Record<string, unknown> = {}) =>
    NextResponse.json({ ok: false, error: motivo, ...extra }, { status: 409 });

  if (acao === "assumir") {
    const r = await assumirComoHumano(prisma, { leadId, userId: portao.sessao.userId });
    if (r.ok) return NextResponse.json({ ok: true, data: { leadId } });
    if (r.causa === "naoExiste") {
      return NextResponse.json({ ok: false, error: "lead não existe" }, { status: 404 });
    }
    return conflito("outra pessoa assumiu antes", { atendidoPor: r.atendidoPor });
  }

  if (acao === "devolver") {
    const objetivo = typeof corpo.objetivo === "string" ? corpo.objetivo : "";
    const r = await devolverParaIA(prisma, {
      leadId,
      userId: portao.sessao.userId,
      objetivo,
    });
    if (r.ok) return NextResponse.json({ ok: true, data: { leadId } });
    if (r.causa === "semObjetivo") {
      return NextResponse.json(
        { ok: false, error: "escreva o objetivo: sem ele a IA retoma sem saber o que fazer" },
        { status: 400 },
      );
    }
    if (r.causa === "naoExiste") {
      return NextResponse.json({ ok: false, error: "lead não existe" }, { status: 404 });
    }
    return conflito("este lead não está com você");
  }

  if (acao === "pedirHumano") {
    const motivo = typeof corpo.motivo === "string" ? corpo.motivo : "";
    const r = await pedirHumano(prisma, { leadId, motivo });
    if (r.ok) return NextResponse.json({ ok: true, data: { leadId } });
    if (r.causa === "semMotivo") {
      return NextResponse.json(
        { ok: false, error: "escreva o motivo: quem pegar a fila precisa saber por que a IA parou" },
        { status: 400 },
      );
    }
    if (r.causa === "naoExiste") {
      return NextResponse.json({ ok: false, error: "lead não existe" }, { status: 404 });
    }
    return conflito("o lead já não estava com a IA");
  }

  return NextResponse.json(
    { ok: false, error: "ação desconhecida — use assumir, devolver ou pedirHumano" },
    { status: 400 },
  );
}
