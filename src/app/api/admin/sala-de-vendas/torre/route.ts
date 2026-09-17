/**
 * A CONTROL TOWER — a sala do supervisor, numa leitura só.
 *
 *   GET ?de=…&ate=…
 *
 * ── O QUE ELA JUNTA, E POR QUE JUNTA ────────────────────────────────────────
 *
 * A torre responde quatro perguntas de uma vez: o que está travado AGORA, como
 * está a operação comparada com ONTEM, onde o volume para no funil, e o que a
 * Supervisora viu de errado. Cada uma dessas respostas já existia num serviço
 * diferente — o painel do gerente, o raio-X das conversas, o painel da
 * Supervisora. O que não existia era o lugar onde elas aparecem lado a lado.
 *
 * Elas vêm numa rota só, e não em quatro chamadas do navegador, por um motivo
 * medido: a comparação com ontem exige que os dois retratos sejam do MESMO
 * instante. Duas chamadas separadas dariam dois "agora" diferentes, e a
 * variação estampada na tela seria em parte o relógio, não a operação.
 *
 * ── A PORTA ─────────────────────────────────────────────────────────────────
 *
 * A mesma lista explícita de papéis do painel do gerente e do Revenue
 * Supervisor, escrita de novo aqui de propósito (ver o comentário em
 * `../supervisor/route.ts`): constante compartilhada faz afrouxamento num
 * lugar abrir a porta do outro em silêncio. `AGENTE_HUMANO` fica fora.
 *
 * ── SÓ LÊ ───────────────────────────────────────────────────────────────────
 *
 * Nenhuma escrita, nenhum envio, nenhum agendamento. E nenhum telefone: a
 * torre é visão agregada, e número de terceiro não tem o que fazer aqui — quem
 * precisa de contato abre a Central SDR, que mascara.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarInterno } from "@/lib/internal-auth";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import { conversaoDoPeriodo, visaoDoGerente } from "@/services/salaDeVendas/painel";
import { visaoGeralDaSupervisora } from "@/services/salaDeVendas/supervisora/painel";
import { raioXDasConversas } from "@/services/salaDeVendas/raioX/raioXDasConversas";
import { mascararTelefone } from "@/services/salaDeVendas/raioX/telefone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIA = 86_400_000;

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
          acao: "ler_control_tower",
          recurso: "sala-de-vendas/torre",
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

  const de = params.get("de") ? new Date(params.get("de")!) : new Date(agora.getTime() - 30 * DIA);
  const ate = params.get("ate") ? new Date(params.get("ate")!) : agora;

  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || de >= ate) {
    return NextResponse.json({ ok: false, error: "Período inválido." }, { status: 400 });
  }

  // As duas janelas de 24 h que a tela compara. `ontem` termina onde `hoje`
  // começa: janelas que se encostam, nunca que se sobrepõem — um lead contado
  // nas duas inventaria crescimento.
  const inicioDeHoje = new Date(agora.getTime() - DIA);
  const inicioDeOntem = new Date(agora.getTime() - 2 * DIA);

  const data = await comSessao(prisma, auth.sessao, async (tx) => {
    const db = tx as never;

    const [painel, supervisora, hoje, ontem, raioX] = await Promise.all([
      visaoDoGerente(db, { de, ate, agora }),
      visaoGeralDaSupervisora(db, { de, ate }),
      conversaoDoPeriodo(db, { de: inicioDeHoje, ate: agora }),
      conversaoDoPeriodo(db, { de: inicioDeOntem, ate: inicioDeHoje }),
      raioXDasConversas(db, {
        agora,
        desde: de,
        ate,
        // A torre não mostra conversa nem lista de reabordagem: ela mostra
        // onde o volume morre. Pedir amostra zero é pedir só o que a tela usa.
        amostra: 0,
        porPagina: 1,
        formatarTelefone: (v) => mascararTelefone(v),
      }),
    ]);

    return {
      periodo: { de, ate, agora },
      painel,
      supervisora,
      comparacao: {
        janelaHoras: 24,
        hoje: { desde: inicioDeHoje, ate: agora, funil: hoje },
        ontem: { desde: inicioDeOntem, ate: inicioDeHoje, funil: ontem },
      },
      raioX: {
        mensagensNaJanela: raioX.mensagensNaJanela,
        abordadosSemFicha: raioX.abordadosSemFicha,
        abordagem: raioX.abordagem,
        ondeMorreu: raioX.ondeMorreu,
        gatekeepers: raioX.gatekeepers,
        // `pistasSemTelefone` fica de fora: é lista nominal de terceiro, e o
        // lugar dela é a Central SDR, não o painel de visão geral.
        decisores: raioX.decisores.medido
          ? {
              medido: true as const,
              valor: {
                comTelefone: raioX.decisores.valor.comTelefone,
                semTelefone: raioX.decisores.valor.semTelefone,
              },
            }
          : raioX.decisores,
      },
    };
  });

  return NextResponse.json({ ok: true, data });
}
