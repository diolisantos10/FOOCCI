/**
 * A CONFERÊNCIA DO CANAL — "o token alcança o número real?"
 *
 * ── POR QUE ESTA ROTA EXISTE ────────────────────────────────────────────────
 *
 * As duas chaves da Meta são coladas à mão, no Railway, por quem não lê código.
 * Até aqui a única forma de saber se elas serviam era mandar uma mensagem para
 * um cliente de verdade e ver o que acontecia — o que transforma o primeiro
 * prospecto num teste de configuração.
 *
 * Esta rota faz a pergunta antes: um GET no próprio número, na Meta. Se o token
 * nasceu no portfólio errado — o erro mais provável, porque o botão de gerar
 * fica na caixa do número de TESTE — a recusa aparece aqui, com o motivo, e não
 * na conversa de um estranho.
 *
 * ── QUEM PODE ───────────────────────────────────────────────────────────────
 *
 * Só quem enxerga a operação inteira. Não é segredo o que ela devolve, mas é
 * uma chamada externa em nome da empresa: deixá-la aberta ao vendedor seria dar
 * a qualquer sessão um jeito de bater na Meta em laço.
 *
 * 🔒 Nada do token entra na resposta. O que sai é o que a META devolve sobre o
 * número — e é justamente isso que prova que a chave certa está no lugar certo.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas, vePelaOperacaoToda } from "../_guarda";
import {
  conferirCanalDeVendas,
  describeFoocciSalesChannel,
} from "@/services/foocci-sdr/FoocciSalesChannel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "conferir_canal");
  if (!portao.ok) return portao.resposta;

  if (!vePelaOperacaoToda(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "Só quem enxerga a operação inteira confere o canal." },
      { status: 403 },
    );
  }

  // A presença das variáveis vem primeiro e SEM rede: quando falta uma chave, a
  // resposta é imediata e não custa uma chamada à Meta para dizer o óbvio.
  const presenca = describeFoocciSalesChannel();
  const conferencia = await conferirCanalDeVendas();

  return NextResponse.json({ ok: true, data: { presenca, conferencia } });
}
