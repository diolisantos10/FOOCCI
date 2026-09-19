/**
 * O HUNTER IA / INTELIGÊNCIA COMERCIAL.
 *
 *   GET ?pagina=1&porPagina=10
 *
 * ── A PERGUNTA QUE ESTA ROTA RESPONDE ───────────────────────────────────────
 *
 * "Quais restaurantes nós já descobrimos, em que estágio cada um está, qual o
 * ICP deles, e o que falta apurar." Tudo sai de `Empresa` e `Contato` — as
 * tabelas que a jornada comercial já mantém.
 *
 * ── ⛔ O NÚMERO PEQUENO É O NÚMERO CERTO ────────────────────────────────────
 *
 * A descoberta automática depende de uma fonte de dados paga que a empresa
 * ainda não contratou. Então esta rota vai devolver contagens baixas, e
 * possivelmente zero, por um bom tempo. **Isso é o resultado correto.** Ver o
 * cabeçalho de `telas/hunter.ts`: zero medido não é o mesmo que não medido, e
 * nenhuma das duas coisas vira número de exemplo aqui.
 *
 * ── SÓ LÊ ───────────────────────────────────────────────────────────────────
 *
 * Nenhuma escrita, nenhuma descoberta disparada, nenhum enriquecimento pedido.
 * Esta é a tela que MOSTRA o Hunter; ela não é o Hunter.
 *
 * ── TELEFONE ────────────────────────────────────────────────────────────────
 *
 * O contato geral que sai daqui é o número que a EMPRESA publica (site, Maps,
 * perfil) — não o telefone pessoal de um contato. Número publicado por uma
 * empresa no próprio site é dado comercial; o telefone de uma pessoa não sai
 * por esta porta, e por isso `Contato.telefone` nunca é selecionado.
 * ⚠️ E publicado **não é opt-in**: quem decide se dá para falar continua sendo
 * `LeadContactSafety`, sobre o lead, e não esta tela.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarInterno } from "@/lib/internal-auth";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import {
  POR_PAGINA_MAXIMA,
  POR_PAGINA_PADRAO,
  lerOHunter,
} from "@/services/salaDeVendas/telas/hunter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
          acao: "ler_hunter",
          recurso: "sala-de-vendas/hunter",
          resultado: "NEGADO",
          motivo: auth.motivo,
        },
      });
    } catch {
      /* trilha fora do ar não abre a porta */
    }
    return NextResponse.json({ ok: false, error: auth.motivo }, { status: auth.status });
  }

  const params = req.nextUrl.searchParams;
  const pagina = lerInteiro(params.get("pagina"), 1, 1, 10_000);
  const porPagina = lerInteiro(params.get("porPagina"), POR_PAGINA_PADRAO, 1, POR_PAGINA_MAXIMA);

  const data = await comSessao(prisma, auth.sessao, async (tx) => {
    const db = tx as never;
    return lerOHunter(db, { agora: new Date(), pagina, porPagina });
  });

  return NextResponse.json({ ok: true, data });
}
