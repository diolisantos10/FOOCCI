/**
 * O TA — estado, publicação da ficha e o interruptor.
 *
 *   GET  → como o agente está agora
 *   POST → { acao: "publicar" } | { acao: "ligar", ligado: boolean }
 *
 * ── ⚠️ QUEM PODE APERTAR ────────────────────────────────────────────────────
 *
 * Ler é da Sala inteira: quem trabalha ao lado do TA precisa saber se ele está
 * atendendo — descobrir isso pela ausência de resposta é o pior jeito possível.
 *
 * **Ligar é do dono.** Não é hierarquia por hierarquia: ligar o TA solta um robô
 * para falar com estranho em nome da empresa, e essa decisão tem um responsável
 * com nome. O gerente distribui a fila; ele não decide que a empresa passa a
 * falar por IA.
 *
 * Publicar a ficha segue a mesma lista: publicar é dizer QUEM o agente é.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas } from "../_guarda";
import { lerEstadoDoTA, publicarAFicha, ligarOTA } from "@/services/salaDeVendas/ta/interruptor";
import { cerebroDisponivel } from "@/services/salaDeVendas/ta/cerebro";
import { describeFoocciSalesChannel } from "@/services/foocci-sdr/FoocciSalesChannel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Só quem manda na casa liga o agente. */
const PODE_LIGAR = new Set(["MASTER_CEO", "DIRETOR_FOOCCI"]);

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_estado_do_ta");
  if (!portao.ok) return portao.resposta;

  const estado = await lerEstadoDoTA(prisma);
  if (!estado) {
    return NextResponse.json(
      { ok: false, error: "A configuração do TA ainda não existe neste ambiente." },
      { status: 404 },
    );
  }

  const canal = describeFoocciSalesChannel();

  return NextResponse.json({
    ok: true,
    data: {
      ...estado,
      // As três coisas que decidem se ele de fato trabalha, juntas numa
      // resposta só. Separadas em três telas, ninguém monta o quadro inteiro —
      // e o sintoma vira "o TA não respondeu" sem causa nomeada.
      cerebroLigado: await cerebroDisponivel(),
      canalConfigurado: canal.configurado,
      envioLigado: canal.envioLigado,
      podeLigar: PODE_LIGAR.has(portao.sessao.role),
    },
  });
}

interface Corpo {
  acao?: unknown;
  ligado?: unknown;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "mexer_no_ta");
  if (!portao.ok) return portao.resposta;

  if (!PODE_LIGAR.has(portao.sessao.role)) {
    return NextResponse.json(
      { ok: false, error: "Ligar o agente é decisão do dono." },
      { status: 403 },
    );
  }

  const c = (await req.json().catch(() => ({}))) as Corpo;

  if (c.acao === "publicar") {
    const r = await publicarAFicha(prisma, { porUserId: portao.sessao.userId ?? null });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "A configuração do TA ainda não existe neste ambiente." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, data: { numero: r.numero, jaEstava: r.jaEstava } });
  }

  if (c.acao === "ligar") {
    if (typeof c.ligado !== "boolean") {
      return NextResponse.json({ ok: false, error: "Diga se é para ligar ou desligar." }, { status: 400 });
    }

    const r = await ligarOTA(prisma, c.ligado);
    if (!r.ok) {
      // A recusa vem escrita, e com o caso concreto: "não deu" não diz a
      // ninguém que falta publicar a ficha primeiro.
      const frase = r.causa === "semVersaoPublicada"
        ? "Publique a ficha antes de ligar — sem ela o agente ficaria calado do mesmo jeito."
        : "A configuração do TA ainda não existe neste ambiente.";
      return NextResponse.json({ ok: false, error: frase }, { status: 409 });
    }

    return NextResponse.json({ ok: true, data: { ligado: r.ligado } });
  }

  return NextResponse.json({ ok: false, error: "Ação desconhecida." }, { status: 400 });
}
