/**
 * A CONVERSA DE UM LEAD.
 *
 *   GET  ?leadId=…   → histórico, janela de 24h e ficha resumida
 *   POST             → escreve uma mensagem, ou marca a conversa como lida
 *
 * ── AS TRÊS CAMADAS, NESTA ROTA ─────────────────────────────────────────────
 *
 *   1. `guardarSalaDeVendas` — você é da Sala? (protege o endereço)
 *   2. `podeVerOLead`        — este lead é alcançável por você? (protege o dado)
 *   3. o serviço             — a regra do negócio decide o resto
 *
 * A segunda é a que costuma faltar, porque a tela nunca pede um lead que a
 * pessoa não deveria ver — e aí ninguém percebe que a API pediria.
 *
 * ── ⛔ O QUE ESTA ROTA NÃO FAZ ──────────────────────────────────────────────
 *
 * **Não entrega mensagem a ninguém.** `registrarSaida` grava a mensagem como
 * PENDENTE e para por aí. A entrega depende de `FOOCCI_SDR_SEND_ENABLED`, que
 * está desligada por decisão do CEO, e de credencial da Meta que não existe
 * neste ambiente. Uma mensagem PENDENTE que nunca saiu é visível e corrigível;
 * uma mensagem que sai sem autorização não volta.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, podeVerOLead } from "../_guarda";
import {
  lerConversa,
  registrarSaida,
  marcarComoLidas,
  janelaDe24h,
} from "@/services/salaDeVendas/conversa";
import { explicacaoDoScore } from "@/services/salaDeVendas/score";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import { lerOSilencio, avisoDoSilencio } from "@/services/salaDeVendas/anterioresASala";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_conversa_do_lead");
  if (!portao.ok) return portao.resposta;

  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId é obrigatório." }, { status: 400 });
  }

  const acesso = await podeVerOLead(portao.sessao, leadId, "ler_conversa_do_lead");
  if (!acesso.ok) return acesso.resposta;

  const lead = await prisma.siteLead.findUnique({
    where: { id: leadId },
    select: {
      id: true, nome: true, whatsapp: true, email: true, restaurante: true,
      cidade: true, tipo: true, stage: true, score: true, temperatura: true,
      // `createdAt` não vinha — e sem ela o vendedor não tem como saber se o
      // contato é de ontem ou de três meses atrás. É essa data que separa
      // "chegou antes de a Sala existir" de "ninguém falou com ele".
      createdAt: true,
      atendidoPor: true, atendenteUserId: true, atendenteDesde: true,
      motivoDoPedido: true, tags: true, prioritario: true,
      utmSource: true, utmCampaign: true, origem: true, codigo: true,
      optOutAt: true, consentAt: true, proximaAcaoEm: true, proximaAcaoNota: true,
      qualificacao: true,
      atendente: { select: { nome: true } },
    },
  });

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  }

  // As três leituras vão DENTRO da identidade: `lead_mensagens` e
  // `lead_score_fatores` estão sob RLS, e sem declarar quem pergunta elas
  // devolvem lista vazia — a conversa apareceria em branco para o próprio dono.
  const [mensagens, fatores, ultimaEntrada] = await comSessao(prisma, portao.sessao, (tx) =>
    Promise.all([
      lerConversa(tx, { leadId }),
      explicacaoDoScore(tx, leadId),
      tx.leadMensagem.findFirst({
        where: { leadId, direcao: "ENTRADA" },
        orderBy: { ocorreuEm: "desc" },
        select: { ocorreuEm: true },
      }),
    ]),
  );

  // POR QUE O AVISO É MONTADO NO SERVIDOR: a tela receberia `createdAt` e
  // `mensagens.length` e poderia decidir sozinha — e aí a regra do que é
  // "anterior à Sala" viveria no navegador, longe do teste, e mudaria de
  // definição no dia em que outra tela precisasse dela.
  const agora = new Date();
  const aviso = avisoDoSilencio(
    lerOSilencio(
      { criadoEm: lead.createdAt, mensagens: mensagens.length, score: lead.score },
      agora,
    ),
  );

  return NextResponse.json({
    ok: true,
    data: {
      lead,
      mensagens,
      fatoresDoScore: fatores,
      janela: janelaDe24h(ultimaEntrada?.ocorreuEm ?? null, agora),
      podeEscrever: !somenteLeitura(portao.sessao) && !lead.optOutAt,
      // `null` quando há conversa. Aviso que aparece sempre é aviso que
      // ninguém lê.
      avisoDoSilencio: aviso,
    },
  });
}

interface CorpoDaConversa {
  leadId?: string;
  acao?: "enviar" | "marcarLidas" | "notaInterna";
  texto?: string;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "escrever_na_conversa");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "Auditoria lê e não escreve." },
      { status: 403 },
    );
  }

  let corpo: CorpoDaConversa;
  try {
    corpo = (await req.json()) as CorpoDaConversa;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const leadId = corpo.leadId?.trim();
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId é obrigatório." }, { status: 400 });
  }

  const acesso = await podeVerOLead(portao.sessao, leadId, "escrever_na_conversa");
  if (!acesso.ok) return acesso.resposta;

  if (corpo.acao === "marcarLidas") {
    const r = await marcarComoLidas(prisma, { leadId });
    return NextResponse.json({ ok: true, data: r });
  }

  const texto = corpo.texto?.trim();
  if (!texto) {
    return NextResponse.json({ ok: false, error: "Escreva alguma coisa." }, { status: 400 });
  }

  // ── Nota interna: fica no sistema, o lead nunca vê ──
  if (corpo.acao === "notaInterna") {
    await prisma.siteLeadInteraction.create({
      data: {
        leadId,
        tipo: "NOTA_INTERNA",
        actor: portao.sessao.userId,
        nota: texto.slice(0, 1000),
        interna: true,
      },
    });
    return NextResponse.json({ ok: true, data: { registrada: true } });
  }

  // ── Mensagem para o lead ──
  //
  // O opt-out é verificado AQUI, no instante do envio, e não só no agendamento:
  // entre uma coisa e outra a pessoa pode ter pedido silêncio, e o pedido é
  // terminal em todos os canais.
  const lead = await prisma.siteLead.findUnique({
    where: { id: leadId },
    select: { optOutAt: true },
  });

  if (lead?.optOutAt) {
    return NextResponse.json(
      {
        ok: false,
        error: "Este contato pediu para não receber mensagens. O pedido é definitivo.",
      },
      { status: 409 },
    );
  }

  const r = await registrarSaida(prisma, {
    leadId,
    texto,
    autor: "HUMANO",
    autorUserId: portao.sessao.userId,
  });

  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.causa }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      mensagemId: r.mensagemId,
      // A tela precisa dizer a verdade sobre o que aconteceu: a mensagem foi
      // REGISTRADA, e a entrega depende de uma chave que o CEO ainda não ligou.
      entregue: false,
      aviso:
        "Mensagem registrada na conversa. O envio pelo WhatsApp está desligado " +
        "(FOOCCI_SDR_SEND_ENABLED) — nada saiu para o cliente.",
    },
  });
}
