/**
 * POST /api/admin/sala-de-vendas/ensaio
 *
 * O TA respondendo — para VER, não para enviar.
 *
 * ── POR QUE UMA ROTA SÓ PARA ENSAIAR ────────────────────────────────────────
 *
 * O CEO pediu para **ver o SDR trabalhando** antes de decidir ligá-lo. As duas
 * alternativas eram piores:
 *
 *   · ligar no canal de verdade e olhar — solta a IA para falar com estranho
 *     antes de qualquer evidência, que é exatamente a decisão que ele quer tomar
 *     DEPOIS de ver;
 *   · ler o teste — prova que funciona e não mostra como ele fala.
 *
 * ── ⛔ ESTA ROTA NÃO ESCREVE NADA ───────────────────────────────────────────
 *
 * Não grava mensagem, não toca em lead, não cria conversa, não chama o canal.
 * Recebe um texto, devolve o que o TA diria, e some. É por isso que ela pode
 * existir enquanto o envio está desligado: não há nada para desligar aqui.
 *
 * A garantia é estrutural e não uma promessa: este arquivo não importa
 * `prisma`, `conversa` nem `FoocciSalesChannel`. O teste confere isso lendo o
 * próprio código-fonte.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas } from "../_guarda";
import { responder } from "@/services/salaDeVendas/ta/responder";
import { VERSAO_1 } from "@/services/salaDeVendas/ta/ficha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Corpo {
  mensagem?: unknown;
  nome?: unknown;
  jaPerguntou?: unknown;
}

export async function POST(req: NextRequest) {
  // Ensaiar é ler o comportamento do agente, e a Sala inteira pode. O auditor
  // também: é exatamente o trabalho dele, e não escreve nada.
  const portao = await guardarSalaDeVendas(req, "ensaiar_o_ta");
  if (!portao.ok) return portao.resposta;

  const corpo = (await req.json().catch(() => ({}))) as Corpo;
  const mensagem = typeof corpo.mensagem === "string" ? corpo.mensagem : "";
  const nome = typeof corpo.nome === "string" && corpo.nome.trim() ? corpo.nome : null;

  const jaPerguntou = Array.isArray(corpo.jaPerguntou)
    ? corpo.jaPerguntou.filter((n): n is number => typeof n === "number")
    : [];

  if (!mensagem.trim()) {
    return NextResponse.json(
      { ok: false, error: "Escreva o que o cliente diria." },
      { status: 400 },
    );
  }

  const r = responder({ mensagem, nome, jaPerguntou });

  return NextResponse.json({
    ok: true,
    data: {
      resposta: r,
      // A ficha viaja junto para a tela poder mostrar CONTRA O QUE ele foi
      // conferido — sem isso o ensaio vira só um chat bonito.
      ficha: {
        identidade: VERSAO_1.identidade,
        proibidos: VERSAO_1.proibidos,
        perguntas: VERSAO_1.perguntas,
      },
    },
  });
}
