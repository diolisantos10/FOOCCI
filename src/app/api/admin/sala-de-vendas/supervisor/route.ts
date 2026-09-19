/**
 * O REVENUE SUPERVISOR.
 *
 *   GET ?de=…&ate=…&foco=VENDAS
 *
 * ── A PORTA É A MESMA DO PAINEL DO GERENTE, E DE PROPÓSITO ──────────────────
 *
 * Esta rota devolve funil de ponta a ponta, gargalos por etapa e diagnóstico
 * causal de TODA a operação. É informação de supervisão, não de trabalho — a
 * mesma natureza do `/painel`, e por isso a MESMA lista explícita de papéis,
 * escrita de novo aqui em vez de importada: uma constante compartilhada faria
 * um afrouxamento em qualquer uma das duas abrir a outra em silêncio.
 *
 * `AGENTE_HUMANO` continua fora. O SDR não vê a régua comparada do time.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarInterno } from "@/lib/internal-auth";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import { visaoDoSupervisor } from "@/services/salaDeVendas/revenueSupervisor";
import { ETAPAS_DA_RECEITA, type EtapaDaReceita } from "@/services/salaDeVendas/funilDeReceita";
import { extrasDaReceita } from "@/services/salaDeVendas/telas/inteligenciaDeReceita";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = autorizarInterno(req, {
    papeis: ["MASTER_CEO", "DIRETOR_FOOCCI", "GERENTE_DEPARTAMENTO", "AUDITOR_QA"],
  });

  if (!auth.ok) {
    try {
      await prisma.internalAuditEvent.create({
        data: {
          actorType: auth.sessao ? "INTERNAL_USER" : "ANONIMO",
          actorLabel: auth.sessao ? `${auth.sessao.nome} (${auth.sessao.userId})` : "anônimo",
          acao: "ler_revenue_supervisor",
          recurso: "sala-de-vendas/supervisor",
          resultado: "NEGADO",
          motivo: auth.motivo,
        },
      });
    } catch {
      /* trilha fora do ar não abre a porta */
    }

    return NextResponse.json({ ok: false, error: auth.motivo }, { status: auth.status });
  }

  const agora = new Date();
  const params = req.nextUrl.searchParams;

  const de = params.get("de") ? new Date(params.get("de")!) : new Date(agora.getTime() - 30 * 86_400_000);
  const ate = params.get("ate") ? new Date(params.get("ate")!) : agora;

  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || de >= ate) {
    return NextResponse.json({ ok: false, error: "Período inválido." }, { status: 400 });
  }

  const focoCru = params.get("foco");
  if (focoCru && !ETAPAS_DA_RECEITA.includes(focoCru as EtapaDaReceita)) {
    return NextResponse.json({ ok: false, error: "Etapa desconhecida." }, { status: 400 });
  }
  const foco = (focoCru as EtapaDaReceita | null) ?? undefined;

  // Os quatro blocos da peça 13 que o supervisor não media (reuniões,
  // reativações, clientes em risco e a receita ao longo do mês) entram na mesma
  // sessão e no mesmo período — dois recortes diferentes na mesma tela fariam o
  // cartão discordar do gráfico logo abaixo dele.
  const data = await comSessao(prisma, auth.sessao, async (tx) => {
    const db = tx as never;
    const [visao, extras] = await Promise.all([
      visaoDoSupervisor(db, { de, ate, agora, foco }),
      extrasDaReceita(db, { de, ate }),
    ]);
    return { ...visao, extras };
  });

  return NextResponse.json({ ok: true, data });
}
