/**
 * O COPILOTO DO VENDEDOR.
 *
 *   GET  ?leadId=…              → o painel de contexto (os 14 itens)
 *   GET  ?leadId=…&ler=1        → o painel MAIS a leitura da IA (custa uma chamada)
 *   POST { acao: "registrarNoCrm" }   → grava na jornada o que o copiloto aprendeu
 *   POST { acao: "devolverParaIA" }   → devolve a conversa ao modo automático
 *
 * ── ⛔ O QUE ESTA ROTA NÃO FAZ, E É O PONTO ─────────────────────────────────
 *
 * **Não envia mensagem nenhuma.** Nem no GET, nem no POST, nem por engano: esta
 * rota não importa `registrarSaida` nem `entregarMensagem`. A sugestão que o
 * copiloto escreve desce até a tela, cai no campo de texto, e o vendedor decide.
 * Quem envia continua sendo `POST /conversa`, com uma pessoa apertando o botão.
 *
 * Isso é código e não boa intenção: um copiloto com permissão de envio seria a
 * IA falando com o cliente sem revisor — exatamente o que a Supervisora existe
 * para impedir do outro lado.
 *
 * ── POR QUE A LEITURA DA IA É OPT-IN (`ler=1`) ──────────────────────────────
 *
 * O painel de contexto é leitura de banco: barato, e pode vir sempre. A leitura
 * da IA é uma chamada paga por conversa aberta. Se viesse junto, abrir dez
 * conversas para achar uma custaria dez chamadas — e a conta chegaria sem
 * ninguém saber de onde. O vendedor pede a leitura; o contexto vem de graça.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, podeVerOLead } from "../_guarda";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import {
  montarPainelDoVendedor,
  lerTurnosParaOCopiloto,
} from "@/services/salaDeVendas/painelDoVendedor";
import { lerComOCopiloto, EXPLICACAO_DA_FALHA } from "@/services/salaDeVendas/copiloto";
import { devolverParaIAComDossie } from "@/services/salaDeVendas/handoff";
import { registrarAprendizadoDoCopiloto } from "@/services/salaDeVendas/copilotoNoCrm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "abrir_copiloto");
  if (!portao.ok) return portao.resposta;

  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId é obrigatório." }, { status: 400 });
  }

  const acesso = await podeVerOLead(portao.sessao, leadId, "abrir_copiloto");
  if (!acesso.ok) return acesso.resposta;

  const resultado = await montarPainelDoVendedor(prisma, { leadId });
  if (!resultado.ok) {
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  }

  const painel = resultado.painel;

  if (req.nextUrl.searchParams.get("ler") !== "1") {
    return NextResponse.json({ ok: true, data: { painel, leitura: null, falha: null } });
  }

  // ⚠️ DENTRO da identidade: `lead_mensagens` está sob RLS e sem declarar quem
  // pergunta a conversa volta vazia — o copiloto diria "não há o que ler" sobre
  // uma conversa cheia.
  const turnos = await comSessao(prisma, portao.sessao, (tx) =>
    lerTurnosParaOCopiloto(tx, { leadId }),
  );

  const leitura = await lerComOCopiloto(turnos, {
    nomeDoLead: painel.nome,
    restaurante: painel.oQueOHunterAchou?.empresa ?? null,
    cidade: painel.oQueOHunterAchou?.cidade ?? null,
    etapa: painel.estagio,
    score: painel.leadScore?.valor ?? null,
    temperatura: painel.leadScore?.temperatura ?? null,
    dorConhecida: painel.necessidade,
    sistemaAtual: painel.oQueOSdrDescobriu?.sistemaAtual ?? painel.oQueOHunterAchou?.sistemaIdentificado ?? null,
    unidades: painel.oQueOSdrDescobriu?.unidades ?? painel.oQueOHunterAchou?.unidades ?? null,
    planoDeInteresse: painel.produto,
  });

  // ── A falha da IA NÃO derruba o painel ────────────────────────────────────
  //
  // Sem chave, com o motor fora do ar ou com a conversa vazia, os catorze itens
  // de contexto continuam valendo — eles vieram do banco. Devolver 500 aqui
  // apagaria da tela o dossiê inteiro por causa de uma chamada que falhou.
  if (!leitura.ok) {
    return NextResponse.json({
      ok: true,
      data: {
        painel,
        leitura: null,
        falha: { causa: leitura.causa, explicacao: EXPLICACAO_DA_FALHA[leitura.causa] },
      },
    });
  }

  return NextResponse.json({ ok: true, data: { painel, leitura: leitura.leitura, falha: null } });
}

interface CorpoDoCopiloto {
  leadId?: string;
  acao?: "registrarNoCrm" | "devolverParaIA";
  /** `registrarNoCrm` */
  objecoes?: string[];
  necessidade?: string | null;
  proximaAcao?: string | null;
  resumo?: string | null;
  /** `devolverParaIA` */
  objetivo?: string;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "acao_do_copiloto");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let corpo: CorpoDoCopiloto;
  try {
    corpo = (await req.json()) as CorpoDoCopiloto;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const leadId = corpo.leadId?.trim();
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId é obrigatório." }, { status: 400 });
  }

  const acesso = await podeVerOLead(portao.sessao, leadId, "acao_do_copiloto");
  if (!acesso.ok) return acesso.resposta;

  // ── DEVOLVER PARA IA ──────────────────────────────────────────────────────
  //
  // Reusa `devolverParaIAComDossie` inteiro, e não uma segunda escrita: a troca
  // de dono é atômica lá dentro e a linha em `lead_handoffs` é o denominador de
  // "quantas vezes a IA largou e quantas voltaram". Duplicar isso aqui produziria
  // duas contagens que nunca batem.
  if (corpo.acao === "devolverParaIA") {
    const objetivo = corpo.objetivo?.trim();
    if (!objetivo) {
      return NextResponse.json(
        { ok: false, error: "Diga para quê está devolvendo — sem objetivo, o lead volta com um passo extra." },
        { status: 400 },
      );
    }

    const r = await devolverParaIAComDossie(prisma, {
      leadId,
      userId: portao.sessao.userId,
      objetivo,
      dossie: { resumo: corpo.resumo ?? null, proximaAcao: corpo.proximaAcao ?? null },
    });

    if (!r.ok) {
      if (r.causa === "naoExiste") {
        return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
      }
      if (r.causa === "naoEraSeu") {
        return NextResponse.json(
          { ok: false, error: "Esta conversa não é sua — só quem está atendendo pode devolver." },
          { status: 409 },
        );
      }
      if (r.causa === "dossieIncompleto") {
        return NextResponse.json({ ok: false, recusas: r.recusas }, { status: 400 });
      }
      return NextResponse.json({ ok: false, error: "Não foi possível devolver." }, { status: 500 });
    }

    // A trilha da jornada registra QUEM devolveu e QUANDO. `lead_handoffs` já
    // guarda isso do lado do lead; a jornada é onde a empresa e a oportunidade
    // enxergam o mesmo fato — e é lá que o relatório de "o que a IA fez" mora.
    await registrarAprendizadoDoCopiloto(prisma, {
      leadId,
      evento: "devolvido",
      objetivo,
      autoria: {
        autor: "HUMANO",
        userId: portao.sessao.userId,
        label: portao.sessao.nome,
      },
    });

    return NextResponse.json({ ok: true, data: { handoffId: r.handoffId } });
  }

  // ── REGISTRAR NO CRM ──────────────────────────────────────────────────────
  if (corpo.acao === "registrarNoCrm") {
    const r = await registrarAprendizadoDoCopiloto(prisma, {
      leadId,
      evento: "aprendizado",
      objecoes: corpo.objecoes ?? [],
      necessidade: corpo.necessidade ?? null,
      proximaAcao: corpo.proximaAcao ?? null,
      // ⭐ Autor IA, e o `userId` de quem CONFIRMOU no campo de quem agiu.
      //
      // O texto é da IA — dizer que foi a pessoa que escreveu apagaria a
      // pergunta "o que a IA acertou?", que é o número que decide se o copiloto
      // fica ou sai. E o `label` diz quem apertou, porque a IA não aperta nada
      // sozinha nesta casa.
      autoria: {
        autor: "IA",
        userId: portao.sessao.userId,
        label: `copiloto (confirmado por ${portao.sessao.nome})`,
      },
    });

    if (!r.ok) {
      if (r.causa === "nadaParaGravar") {
        return NextResponse.json(
          { ok: false, error: "Não havia nada para registrar." },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: { gravados: r.gravados } });
  }

  return NextResponse.json({ ok: false, error: "Ação desconhecida." }, { status: 400 });
}
