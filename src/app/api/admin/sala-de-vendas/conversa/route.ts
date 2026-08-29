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
import { entregarMensagem } from "@/services/salaDeVendas/entrega";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, podeVerOLead } from "../_guarda";
import {
  lerConversa,
  registrarSaida,
  marcarComoLidas,
  janelaDe24h,
  explicarRecusaDeSaida,
} from "@/services/salaDeVendas/conversa";
import { explicacaoDoScore } from "@/services/salaDeVendas/score";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import { lerOSilencio, avisoDoSilencio } from "@/services/salaDeVendas/anterioresASala";
import { respostasDoFormulario, origemDoLead } from "@/services/salaDeVendas/fichaDoLead";
import {
  listarContatosManuais,
  rotuloDoContatoManual,
  TIPOS_DE_CONTATO_MANUAL,
} from "@/services/salaDeVendas/contatoManual";
import {
  podeApagarDadosDoLead,
  ORIGENS_DO_PEDIDO,
  ROTULO_ORIGEM_DO_PEDIDO,
} from "@/services/salaDeVendas/lgpd";

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
      codigo: true,
      // ── ORIGEM COMPLETA, E NÃO DOIS CAMPOS ────────────────────────────────
      //
      // Vinham só `utmSource`, `utmCampaign` e `origem`, e a ficha mostrava os
      // três crus. Com isso, um lead que chegou por `utm_medium` ou por
      // `referrer` aparecia como se não tivesse origem nenhuma — e "não sei de
      // onde veio" é a resposta que mata a decisão de mídia. As sete colunas
      // vêm juntas porque quem monta o rótulo é `origemDoLead`, no servidor.
      utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true,
      utmTerm: true, clickId: true, landingPath: true, referrer: true,
      origem: true,
      // `desafio` é a dor escrita pela própria pessoa no formulário, e era a
      // única resposta que esta tela não lia.
      desafio: true,
      // `consentPolicyVersion` viaja junto com a data desde 29/08/2026. A ficha
      // mostrava só "consentiu em tal dia" — e não a QUÊ. Contatos gravados
      // entre 14/08 e 29/08 consentiram à política de pré-lançamento, que foi
      // recolhida; a ficha tem de dizer isso, e não reapresentar o passado como
      // se fosse a política de hoje.
      optOutAt: true, consentAt: true, consentPolicyVersion: true,
      proximaAcaoEm: true, proximaAcaoNota: true,
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

  // Os contatos registrados à mão ficam FORA do embrulho de identidade: a
  // tabela de interações não está sob RLS (ver a migração `autorizacao_no_banco`,
  // que lista as nove tabelas cobertas), e enfiar esta leitura lá dentro só
  // alongaria a transação que carrega a conversa.
  const contatosManuais = await listarContatosManuais(prisma, { leadId });

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

      // ── O QUE VEIO DA TELA VELHA DO CRM ───────────────────────────────────
      //
      // As três montadas no SERVIDOR, e não no navegador, pelo mesmo motivo do
      // aviso acima: são regras sobre o dado, e regra que mora na tela some da
      // vista do teste e muda de definição na próxima tela que precisar dela.
      respostas: respostasDoFormulario(lead),
      origem: origemDoLead(lead),
      contatosManuais,

      // Quem pode apagar decide a ROTA. Isto aqui é só a tela sabendo se deve
      // desenhar o botão — esconder um botão nunca foi autorização, e a rota
      // `apagar-dados` recusa igual para quem chamar direto.
      podeApagarDados: podeApagarDadosDoLead(portao.sessao),

      // ── AS OPÇÕES VIAJAM COM O DADO ───────────────────────────────────────
      //
      // Mesma razão de `admin/pessoas`, que manda `tipos` junto: a tela precisa
      // OFERECER as escolhas, e a lista oferecida tem de ser a MESMA que a rota
      // usa para validar. Duas listas discordam no primeiro dia em que alguém
      // mexe só numa — e a discordância aparece como "escolhi e não salvou".
      //
      // Elas também não podem ser importadas pela tela: `contatoManual.ts` e
      // `lgpd.ts` falam com o Prisma, e um `import` deles num componente de
      // cliente levaria o serviço de apagamento para dentro do navegador.
      opcoes: {
        contatoManual: TIPOS_DE_CONTATO_MANUAL.map((t) => ({
          valor: t,
          rotulo: rotuloDoContatoManual(t),
        })),
        origemDoPedidoDeApagamento: ORIGENS_DO_PEDIDO.map((o) => ({
          valor: o,
          rotulo: ROTULO_ORIGEM_DO_PEDIDO[o],
        })),
      },
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
    // A frase vem do serviço, e não daqui: até 28/08/2026 esta linha devolvia
    // `r.causa` cru e o vendedor lia "janelaFechada" na tela. O código da causa
    // continua indo junto, porque é dele que o suporte precisa — mas o que
    // aparece para quem está vendendo é a frase.
    //
    // 409 e não 400 para a janela: o pedido está correto, o estado da conversa
    // é que não permite — a mesma leitura que o opt-out logo acima já usa.
    return NextResponse.json(
      { ok: false, error: explicarRecusaDeSaida(r), causa: r.causa },
      { status: r.causa === "janelaFechada" ? 409 : 400 },
    );
  }

  // ── A ENTREGA, tentada na hora ──────────────────────────────────────────
  //
  // Até 26/08/2026 esta rota parava na linha de cima: gravava PENDENTE e
  // devolvia um aviso dizendo que nada tinha saído. Estava certo no aviso e
  // errado no produto — a Sala inteira era um rascunho, e um vendedor humano
  // digitando aqui achava que estava conversando com o cliente.
  //
  // `entregarMensagem` respeita a chave do dono: desligada, ela não faz nada e
  // a mensagem continua PENDENTE, como antes.
  const entrega = await entregarMensagem(prisma, r.mensagemId);

  return NextResponse.json({
    ok: true,
    data: {
      mensagemId: r.mensagemId,
      // A tela precisa dizer a VERDADE sobre o que aconteceu com esta mensagem.
      // "Enviada" quando não saiu é o defeito que faz o vendedor esperar uma
      // resposta que nunca vem.
      entregue: entrega.entregue,
      aviso: entrega.entregue ? null : avisoDaEntrega(entrega),
    },
  });
}

/**
 * O motivo, em frase de gente, para a tela de quem acabou de apertar enviar.
 *
 * Um código como `envioDesligado` não diz nada a quem está atendendo cliente — e
 * essa pessoa precisa saber, agora, se o que ela escreveu chegou ou não.
 */
function avisoDaEntrega(e: Extract<Awaited<ReturnType<typeof entregarMensagem>>, { entregue: false }>): string {
  switch (e.motivo) {
    case "envioDesligado":
      return "Mensagem registrada na conversa, mas o envio pelo WhatsApp ainda não foi ligado — nada saiu para o cliente.";
    case "leadPediuSilencio":
      return "Não enviado: este contato pediu para não receber mensagens.";
    case "semTelefone":
      return "Não enviado: este contato não tem WhatsApp cadastrado.";
    default:
      return `Mensagem registrada, mas o WhatsApp recusou o envio: ${e.detalhe}`;
  }
}
