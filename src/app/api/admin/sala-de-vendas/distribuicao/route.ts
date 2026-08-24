/**
 * DISTRIBUIÇÃO, TRANSFERÊNCIA E ASSUNÇÃO DO GERENTE.
 *
 *   POST { acao: "distribuir" | "transferir" | "assumirComoGerente" | "disponibilidade" }
 *
 * ── AS TRÊS AÇÕES QUE MEXEM EM DONO, E POR QUE SÃO TRÊS ─────────────────────
 *
 * Poderiam ser uma só, com um parâmetro. Não são, e a separação é a regra:
 *
 *   - `distribuir` só pega lead SEM dono;
 *   - `transferir` exige que quem pede SEJA o dono;
 *   - `assumirComoGerente` é a única que tira lead de outra pessoa — e por isso
 *     exige papel de gestão E motivo escrito.
 *
 * Numa função só, o parâmetro que escolhe o comportamento vira o lugar onde a
 * regra se perde: alguém passa `forcar: true` num caso legítimo, e seis meses
 * depois todo mundo passa.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, vePelaOperacaoToda } from "../_guarda";
import { distribuir, transferir, assuncaoDoGerente } from "@/services/salaDeVendas/distribuicao";
import type { EstadoDoSdr, ModoDeDistribuicao } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Corpo {
  acao?: "distribuir" | "transferir" | "assumirComoGerente" | "disponibilidade";
  leadId?: string;
  paraUserId?: string;
  motivo?: string;
  estado?: EstadoDoSdr;
  pausadoAte?: string | null;
  motivoDaPausa?: string | null;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "distribuir_lead");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let c: Corpo;
  try {
    c = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  // ── Trocar o próprio estado (disponível, pausado, offline) ──
  //
  // Cada um mexe no SEU estado. Não há `userId` no corpo de propósito: um SDR
  // marcando outro como pausado é uma forma silenciosa de tirá-lo da fila.
  if (c.acao === "disponibilidade") {
    if (!c.estado) {
      return NextResponse.json({ ok: false, error: "estado é obrigatório." }, { status: 400 });
    }

    // Pausa sem prazo vira pausa eterna, e pausa eterna esvazia a operação sem
    // ninguém perceber. Duas horas é o padrão quando não se diz até quando.
    const pausadoAte =
      c.estado === "PAUSADO"
        ? c.pausadoAte
          ? new Date(c.pausadoAte)
          : new Date(Date.now() + 2 * 3_600_000)
        : null;

    await prisma.sdrDisponibilidade.upsert({
      where: { internalUserId: portao.sessao.userId },
      create: {
        internalUserId: portao.sessao.userId,
        estado: c.estado,
        pausadoAte,
        motivoDaPausa: c.motivoDaPausa ?? null,
        vistoEm: new Date(),
      },
      update: {
        estado: c.estado,
        pausadoAte,
        motivoDaPausa: c.estado === "PAUSADO" ? (c.motivoDaPausa ?? null) : null,
        vistoEm: new Date(),
      },
    });

    return NextResponse.json({ ok: true, data: { estado: c.estado, pausadoAte } });
  }

  if (!c.leadId) {
    return NextResponse.json({ ok: false, error: "leadId é obrigatório." }, { status: 400 });
  }

  // ── Assunção do gerente ──
  if (c.acao === "assumirComoGerente") {
    if (!vePelaOperacaoToda(portao.sessao)) {
      return NextResponse.json(
        { ok: false, error: "Só a gestão tira um lead de outro atendente." },
        { status: 403 },
      );
    }

    const r = await assuncaoDoGerente(prisma, {
      leadId: c.leadId,
      gerenteUserId: portao.sessao.userId,
      motivo: c.motivo ?? "",
    });

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: r.causa === "semMotivo" ? "Escreva o motivo." : "Lead não encontrado." },
        { status: r.causa === "semMotivo" ? 400 : 404 },
      );
    }
    return NextResponse.json({ ok: true, data: r });
  }

  // ── Transferir para outra pessoa ──
  if (c.acao === "transferir") {
    if (!c.paraUserId) {
      return NextResponse.json({ ok: false, error: "paraUserId é obrigatório." }, { status: 400 });
    }

    const r = await transferir(prisma, {
      leadId: c.leadId,
      deUserId: portao.sessao.userId,
      paraUserId: c.paraUserId,
      motivo: c.motivo ?? "",
    });

    if (!r.ok) {
      const status = r.causa === "naoEhSeu" ? 403 : 400;
      return NextResponse.json({ ok: false, error: r.causa }, { status });
    }
    return NextResponse.json({ ok: true, data: r });
  }

  // ── Distribuição automática ──
  //
  // Só a gestão dispara: distribuir é decidir de quem é o trabalho dos outros.
  if (!vePelaOperacaoToda(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "Distribuição é da gestão. Puxe o lead pela fila." },
      { status: 403 },
    );
  }

  const config = await prisma.sdrIaConfig.findUnique({
    where: { slug: "ta" },
    select: { distribuicao: true },
  });

  const modo: ModoDeDistribuicao = config?.distribuicao ?? "MANUAL";
  const r = await distribuir(prisma, { leadId: c.leadId, modo });

  if (!r.ok) {
    const status = r.causa === "leadJaTemDono" ? 409 : 409;
    const error = r.causa === "leadJaTemDono" ? "Este lead já tem responsável." : r.detalhe;
    return NextResponse.json({ ok: false, error }, { status });
  }

  return NextResponse.json({ ok: true, data: r });
}
