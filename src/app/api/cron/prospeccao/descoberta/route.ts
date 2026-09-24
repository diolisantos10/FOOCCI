/**
 * POST /api/cron/prospeccao/descoberta
 *
 * A VARREDURA DE DESCOBERTA — o disparador de contingência.
 *
 * ── POR QUE ESTA ROTA EXISTE ────────────────────────────────────────────────
 *
 * O caminho principal é o agendador dentro do processo
 * (`hunter/agendador.ts`, ligado em `instrumentation.ts`). Ele tem um defeito
 * conhecido e inevitável: se o processo reiniciar exatamente na hora da
 * varredura, o dia passa em branco — e um dia em branco na descoberta é a fila
 * vazia da rodada das 9h do dia seguinte, que é o defeito inteiro voltando.
 *
 * Esta rota é a segunda mão no mesmo interruptor. **A reserva atômica no banco
 * garante que as duas nunca varrem o mesmo dia duas vezes** — quem chegar
 * primeiro leva, a outra recebe `jaVarreuHoje` e não gasta a fonte pública.
 *
 * ── ⛔ O QUE ELA NÃO FAZ ────────────────────────────────────────────────────
 *
 * **Não aborda ninguém e não manda mensagem nenhuma.** Ela enche a fila. Quem
 * aborda é `/api/cron/prospeccao/rodada`, com os interruptores dela. Chamar
 * esta rota com a prospecção desligada é legítimo e não faz sair nada.
 *
 * ── A GUARDA É FAIL-CLOSED ──────────────────────────────────────────────────
 *
 * Sem `CRON_SECRET`, 503 e não roda. Ausência de segredo é recusa, nunca passe
 * livre — o mesmo desenho de `/api/cron/prospeccao/rodada`.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  reservarVarreduraDoDia,
  resumoDaVarredura,
} from "@/services/salaDeVendas/prospeccao/hunter/agendador";
import { descobrirEEncherAFila } from "@/services/salaDeVendas/prospeccao/hunter/descoberta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function conferirCron(
  req: NextRequest,
): { ok: true } | { ok: false; status: 401 | 503; erro: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "[cron/prospeccao/descoberta] CRON_SECRET não está configurado — a varredura NÃO roda. " +
        "Ausência de segredo é recusa, nunca passe livre.",
    );
    return { ok: false, status: 503, erro: "CRON_SECRET não configurado" };
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, erro: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const guarda = conferirCron(req);
  if (!guarda.ok) {
    return NextResponse.json({ ok: false, error: guarda.erro }, { status: guarda.status });
  }

  const agora = new Date();

  const reserva = await reservarVarreduraDoDia(prisma, agora, "cron de contingência");
  if (!reserva.reservou) {
    console.info(`[cron/prospeccao/descoberta] não varreu — ${reserva.detalhe}`);
    // 200, e não erro: "o agendador interno já varreu hoje" é o funcionamento
    // normal do par, não uma falha. Devolver 4xx faria o cron acusar problema
    // todo dia em que tudo deu certo.
    return NextResponse.json({
      ok: true,
      varreu: false,
      motivo: reserva.motivo,
      detalhe: reserva.detalhe,
    });
  }

  try {
    const r = await descobrirEEncherAFila(prisma, { agora });
    const resumo = resumoDaVarredura(r);
    console.info("[cron/prospeccao/descoberta] varredura concluída", resumo);
    return NextResponse.json({ ok: true, varreu: true, data: r });
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : String(e);
    console.error(
      "[cron/prospeccao/descoberta] a varredura quebrou DEPOIS da reserva — o dia de hoje precisa de disparo manual",
      { detalhe },
    );
    return NextResponse.json({ ok: false, varreu: false, error: detalhe }, { status: 500 });
  }
}
