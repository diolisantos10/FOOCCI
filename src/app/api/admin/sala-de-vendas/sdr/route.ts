/**
 * A CENTRAL SDR / GATEKEEPER.
 *
 *   GET ?de=…&ate=…&pagina=1&porPagina=50
 *
 * ── A PERGUNTA QUE ESTA ROTA RESPONDE ───────────────────────────────────────
 *
 * "Quantas conversas bateram num porteiro, de que tipo era o porteiro, quantos
 * decisores nós capturamos, e de quais decisores nós descobrimos o nome mas
 * não o telefone." As três primeiras vêm do raio-X; a última é a fila de
 * trabalho que ela gera. A contagem por estado da fila do SDR vem de
 * `prospeccao/filaDoSdr.ts`, que já é o dono dessa régua.
 *
 * ── TELEFONE VAI MASCARADO, SEMPRE ──────────────────────────────────────────
 *
 * O raio-X sabe devolver o número inteiro, e esta rota nunca pede isso. A tela
 * responde "quem ainda não tem telefone" — para isso basta o booleano
 * `temTelefone`. O número inteiro só sai pela porta do raio-X, que tem segredo
 * próprio e registra o pedido. Uma tela de navegador não é lugar de ampliar
 * alcance de dado sensível por comodidade.
 *
 * ── SÓ LÊ ───────────────────────────────────────────────────────────────────
 *
 * Nenhuma escrita, nenhum envio de WhatsApp, nenhum agendamento de abordagem.
 * A Central mostra a fila; quem aborda é o SDR, pelo caminho que já existe.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarInterno } from "@/lib/internal-auth";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import { contarFilaDoSdr } from "@/services/salaDeVendas/prospeccao/filaDoSdr";
import {
  POR_PAGINA_MAXIMA,
  POR_PAGINA_PADRAO,
  raioXDasConversas,
} from "@/services/salaDeVendas/raioX/raioXDasConversas";
import { mascararTelefone } from "@/services/salaDeVendas/raioX/telefone";
import { ROTULO_DO_TIPO, TIPOS_DE_GATEKEEPER, ehPorteiroHumano } from "@/services/foocci-sdr/gatekeeper/rotulos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIA = 86_400_000;

function lerInteiro(bruto: string | null, padrao: number, minimo: number, teto: number): number {
  if (!bruto) return padrao;
  const n = Number.parseInt(bruto, 10);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(Math.max(n, minimo), teto);
}

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
          acao: "ler_central_sdr",
          recurso: "sala-de-vendas/sdr",
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

  const pagina = lerInteiro(params.get("pagina"), 1, 1, 10_000);
  const porPagina = lerInteiro(params.get("porPagina"), POR_PAGINA_PADRAO, 1, POR_PAGINA_MAXIMA);

  const data = await comSessao(prisma, auth.sessao, async (tx) => {
    const db = tx as never;

    const [fila, raioX] = await Promise.all([
      contarFilaDoSdr(db, agora),
      raioXDasConversas(db, {
        agora,
        desde: de,
        ate,
        amostra: 0,
        pagina,
        porPagina,
        formatarTelefone: (v) => mascararTelefone(v),
      }),
    ]);

    return {
      periodo: { de, ate, agora },
      fila,
      /**
       * O catálogo dos nove tipos, com rótulo e se dá para insistir. Vai junto
       * para a tela poder mostrar os nove baldes inclusive os que não
       * apareceram — tipo que some quando zera é tipo que ninguém investiga.
       */
      tiposDeGatekeeper: TIPOS_DE_GATEKEEPER.map((tipo) => ({
        tipo,
        rotulo: ROTULO_DO_TIPO[tipo],
        humano: ehPorteiroHumano(tipo),
      })),
      gatekeepers: raioX.gatekeepers,
      decisores: raioX.decisores,
      abordagem: raioX.abordagem,
      reabordagem: raioX.reabordagem,
    };
  });

  return NextResponse.json({ ok: true, data });
}
