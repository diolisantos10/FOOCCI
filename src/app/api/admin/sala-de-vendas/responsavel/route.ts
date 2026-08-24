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
 *
 * ── O QUE MUDOU, E POR QUE IMPORTA ──
 *
 * Esta rota chamava só `responsavel.ts`: trocava o dono do lead e não gravava
 * registro nenhum. `lead_handoffs` ficava vazia para sempre — e é dela que sai
 * "taxa e motivo de handoff", que as fichas 1.4 e 1.5 declaram como a própria
 * medida do agente. O painel não dava erro; dava silêncio.
 *
 * Agora ela chama os orquestradores de `handoff.ts`, que fazem as duas coisas na
 * ordem certa: validam o dossiê, trocam o dono, e só então registram.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas, somenteLeitura } from "../_guarda";
import { assumirComoHumano } from "@/services/salaDeVendas/responsavel";
import {
  passarParaGente,
  devolverParaIAComDossie,
  fecharHandoffAbertoDoLead,
  type Dossie,
} from "@/services/salaDeVendas/handoff";
import type { MotivoDoHandoff } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Corpo = {
  acao?: unknown;
  leadId?: unknown;
  objetivo?: unknown;
  motivo?: unknown;
  /** Um dos onze do catálogo. Sem ele, o gatilho vem dos sinais. */
  gatilho?: unknown;
  /** O dossiê que vai junto — resumo, dor, objeções, próxima ação. */
  dossie?: unknown;
};

/**
 * Os onze motivos, verificados contra a lista em vez de confiados.
 *
 * O corpo vem da rede. Repassar a string direto ao Prisma faria o banco recusar
 * com erro de enum — um 500 onde a resposta certa é 400 com o nome do campo.
 */
const GATILHOS: ReadonlySet<string> = new Set<MotivoDoHandoff>([
  "PEDIU_HUMANO",
  "INTENCAO_DE_COMPRA",
  "PEDIU_PROPOSTA",
  "PEDIU_DESCONTO",
  "OBJECAO_NAO_RESOLVIDA",
  "IA_INSEGURA",
  "SENTIMENTO_NEGATIVO",
  "RISCO",
  "INFORMACAO_NAO_CONFIRMADA",
  "SCORE_ATINGIU_LIMITE",
  "IA_FALHOU",
  // `DEVOLUCAO_PARA_IA` e `DISTRIBUICAO` NÃO entram: não são a IA parando, e
  // aceitá-los aqui deixaria alguém registrar uma devolução como se fosse um
  // pedido de socorro — o oposto do que aconteceu.
]);

/** Texto do corpo, sem confiar no tipo. Vazio vira `null`, nunca `"undefined"`. */
function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function lerDossie(v: unknown): Dossie {
  const d = (v ?? {}) as Record<string, unknown>;
  return {
    resumo: texto(d.resumo),
    dorIdentificada: texto(d.dorIdentificada),
    objecoes: texto(d.objecoes),
    proximaAcao: texto(d.proximaAcao),
    // `scoreNoMomento` e `etapaNoMomento` NÃO são lidos do corpo de propósito:
    // são a fotografia do estado, e quem tira a foto é o servidor. Aceitá-los
    // da rede deixaria o cliente escrever a própria versão da história.
  };
}

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

    if (r.ok) {
      // O handoff aberto fecha DEPOIS da troca de dono, e só se a troca valeu.
      // Fechá-lo antes criaria o pior estado possível: o registro dizendo que
      // Fulano pegou, com o lead na mão de outra pessoa.
      //
      // Não achar handoff aberto é normal — lead em `NINGUEM` nunca gerou um.
      const fechado = await fecharHandoffAbertoDoLead(prisma, {
        leadId,
        userId: portao.sessao.userId,
      });
      return NextResponse.json({
        ok: true,
        data: { leadId, handoffId: fechado.handoffId, esperouMin: fechado.esperaMin },
      });
    }

    if (r.causa === "naoExiste") {
      return NextResponse.json({ ok: false, error: "lead não existe" }, { status: 404 });
    }
    return conflito("outra pessoa assumiu antes", { atendidoPor: r.atendidoPor });
  }

  if (acao === "devolver") {
    const objetivo = typeof corpo.objetivo === "string" ? corpo.objetivo : "";
    const r = await devolverParaIAComDossie(prisma, {
      leadId,
      userId: portao.sessao.userId,
      objetivo,
      dossie: lerDossie(corpo.dossie),
    });
    if (r.ok) return NextResponse.json({ ok: true, data: { leadId, handoffId: r.handoffId } });
    if (r.causa === "semObjetivo" || r.causa === "dossieIncompleto") {
      return NextResponse.json(
        {
          ok: false,
          error: "escreva o objetivo: sem ele a IA retoma sem saber o que fazer",
          recusas: r.causa === "dossieIncompleto" ? r.recusas : undefined,
        },
        { status: 400 },
      );
    }
    if (r.causa === "naoExiste") {
      return NextResponse.json({ ok: false, error: "lead não existe" }, { status: 404 });
    }
    if (r.causa === "trocouSemRegistrar") {
      // 200 com aviso, e não erro: o lead VOLTOU para a IA de verdade. Dizer
      // "falhou" faria a pessoa tentar de novo e receber "não era seu".
      return NextResponse.json({
        ok: true,
        data: { leadId, handoffId: null },
        aviso: "devolvido, mas o registro do handoff não foi gravado",
      });
    }
    return conflito("este lead não está com você");
  }

  if (acao === "pedirHumano") {
    const motivo = typeof corpo.motivo === "string" ? corpo.motivo : "";
    const gatilho =
      typeof corpo.gatilho === "string" && GATILHOS.has(corpo.gatilho)
        ? (corpo.gatilho as MotivoDoHandoff)
        : undefined;

    if (typeof corpo.gatilho === "string" && !gatilho) {
      return NextResponse.json(
        { ok: false, error: `gatilho desconhecido: ${corpo.gatilho}` },
        { status: 400 },
      );
    }

    const r = await passarParaGente(prisma, {
      leadId,
      motivoEscrito: motivo,
      // Quando quem chama não nomeia o gatilho, `PEDIU_HUMANO` é a leitura
      // honesta: esta ação é sempre alguém pedindo gente. Inferir um motivo mais
      // específico a partir de nada seria inventar a estatística.
      motivoExplicito: gatilho ?? "PEDIU_HUMANO",
      dossie: lerDossie(corpo.dossie),
    });

    if (r.ok) {
      return NextResponse.json({
        ok: true,
        data: { leadId, handoffId: r.handoffId, motivo: r.motivo },
      });
    }

    if (r.causa === "semMotivo") {
      return NextResponse.json(
        { ok: false, error: "escreva o motivo: quem pegar a fila precisa saber por que a IA parou" },
        { status: 400 },
      );
    }
    if (r.causa === "dossieIncompleto") {
      return NextResponse.json(
        {
          ok: false,
          error: "o dossiê está incompleto — quem pegar precisa saber o que já foi conversado",
          recusas: r.recusas,
        },
        { status: 400 },
      );
    }
    if (r.causa === "semGatilho") {
      return NextResponse.json(
        { ok: false, error: "informe o gatilho: handoff sem motivo não vira estatística" },
        { status: 400 },
      );
    }
    if (r.causa === "naoExiste") {
      return NextResponse.json({ ok: false, error: "lead não existe" }, { status: 404 });
    }
    if (r.causa === "trocouSemRegistrar") {
      return NextResponse.json({
        ok: true,
        data: { leadId, handoffId: null },
        aviso: "o lead foi para a fila, mas o registro do handoff não foi gravado",
      });
    }
    return conflito("o lead já não estava com a IA");
  }

  return NextResponse.json(
    { ok: false, error: "ação desconhecida — use assumir, devolver ou pedirHumano" },
    { status: 400 },
  );
}
