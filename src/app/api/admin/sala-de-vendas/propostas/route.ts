/**
 * AS PROPOSTAS DE UM LEAD — a porta que a tabela `lead_propostas` não tinha.
 *
 *   GET  ?leadId=…                → catálogo de planos + propostas do lead
 *   POST { acao: "criar" }        → monta a proposta a partir da oportunidade
 *   POST { acao: "gerarLink" }    → link de pagamento (Mercado Pago da plataforma)
 *   POST { acao: "enviar" }       → manda no WhatsApp pelo motor de sempre
 *   POST { acao: "marcarVista" }  → o cliente abriu/respondeu
 *   POST { acao: "recusar" }      → RECUSADA + oportunidade PERDIDA com motivo
 *
 * ── AS TRÊS CAMADAS, como em `conversa/route.ts` ────────────────────────────
 *   1. `guardarSalaDeVendas` — você é da Sala? (protege o endereço)
 *   2. `podeVerOLead`        — este lead é alcançável por você? (protege o dado)
 *   3. o serviço             — a regra do negócio decide o resto
 *
 * A segunda é a que fecha o multi-tenant desta rota: toda proposta pende de um
 * `SiteLead`, e é pelo lead que o escopo do vendedor é aplicado. Uma proposta de
 * um SDR não é alcançável por outro, e a checagem é do lead de DESTINO da
 * proposta — nunca do que veio no corpo do pedido.
 *
 * ── ⛔ O QUE ESTA ROTA NÃO FAZ ──────────────────────────────────────────────
 *
 * Não entrega mensagem por conta própria e não afrouxa trava nenhuma: `enviar`
 * passa por `entregarMensagem`, igual à tela de atendimento. Com o envio
 * desligado, a mensagem fica PENDENTE, a proposta fica em RASCUNHO e a resposta
 * diz isso — com HTTP 200 e `entregue: false`, porque não é erro do chamador.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, podeVerOLead } from "../_guarda";
import {
  catalogoDePlanos,
  criarProposta,
  lerPropostasDoLead,
  marcarPropostaVista,
  recusarProposta,
} from "@/services/salaDeVendas/propostas";
import {
  enviarPropostaNoWhatsApp,
  gerarLinkDePagamento,
} from "@/services/salaDeVendas/checkoutDaProposta";
import type { Autoria } from "@/services/salaDeVendas/jornadaComercial";
import { normalizePlanCode, normalizeCycleCode } from "@/lib/billing/pricing";
import type { SessaoInterna } from "@/lib/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autoriaDa(sessao: SessaoInterna): Autoria {
  return { autor: "HUMANO", userId: sessao.userId, label: sessao.nome };
}

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_propostas_do_lead");
  if (!portao.ok) return portao.resposta;

  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId é obrigatório." }, { status: 400 });
  }

  const acesso = await podeVerOLead(portao.sessao, leadId, "ler_propostas_do_lead");
  if (!acesso.ok) return acesso.resposta;

  const [propostas, oportunidade] = await Promise.all([
    lerPropostasDoLead(prisma, { leadId }),
    prisma.oportunidade.findFirst({
      where: { leadId, estagio: { notIn: ["GANHA", "PERDIDA"] } },
      orderBy: { criadoEm: "desc" },
      select: { id: true, estagio: true, produtoDeInteresse: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      // O catálogo é de PLANOS do Foocci — é isto que a casa vende a dono de
      // restaurante. Vem derivado da mesma tabela que o cartão cobra.
      catalogo: catalogoDePlanos(),
      propostas,
      // `null` quando não há oportunidade aberta: sem ela não se monta proposta,
      // e a tela precisa dizer isso em vez de mostrar um botão que recusa.
      oportunidade,
      podeEscrever: !somenteLeitura(portao.sessao),
    },
  });
}

interface CorpoDaProposta {
  acao?: "criar" | "gerarLink" | "enviar" | "marcarVista" | "recusar";
  leadId?: string;
  oportunidadeId?: string;
  propostaId?: string;
  plano?: string;
  ciclo?: string;
  descontoPedidoPct?: number;
  validadeEmDias?: number;
  condicoes?: string;
  motivoPerdaId?: string;
  motivoPerdaDetalhe?: string;
}

/** O lead de uma proposta — é por ele que o escopo do vendedor é aplicado. */
async function leadDaProposta(propostaId: string): Promise<string | null> {
  const p = await prisma.leadProposta.findUnique({
    where: { id: propostaId },
    select: { leadId: true },
  });
  return p?.leadId ?? null;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "mexer_em_proposta");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let corpo: CorpoDaProposta;
  try {
    corpo = (await req.json()) as CorpoDaProposta;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const autoria = autoriaDa(portao.sessao);

  // ── CRIAR ────────────────────────────────────────────────────────────────
  if (corpo.acao === "criar") {
    const oportunidadeId = corpo.oportunidadeId?.trim();
    if (!oportunidadeId) {
      return NextResponse.json({ ok: false, error: "oportunidadeId é obrigatório." }, { status: 400 });
    }

    const plano = normalizePlanCode(corpo.plano);
    const ciclo = normalizeCycleCode(corpo.ciclo);
    if (!plano || !ciclo) {
      return NextResponse.json(
        { ok: false, error: "Plano e ciclo precisam ser do catálogo publicado." },
        { status: 400 },
      );
    }

    // O escopo é conferido pelo LEAD da oportunidade, antes de escrever nada.
    const oportunidade = await prisma.oportunidade.findUnique({
      where: { id: oportunidadeId },
      select: { leadId: true },
    });
    if (!oportunidade) {
      return NextResponse.json({ ok: false, error: "Oportunidade não encontrada." }, { status: 404 });
    }
    if (!oportunidade.leadId) {
      return NextResponse.json(
        { ok: false, error: "Esta oportunidade não tem conversa ligada — a proposta precisa de um lead." },
        { status: 409 },
      );
    }
    const acesso = await podeVerOLead(portao.sessao, oportunidade.leadId, "criar_proposta");
    if (!acesso.ok) return acesso.resposta;

    const r = await criarProposta(prisma, {
      oportunidadeId,
      plano,
      ciclo,
      descontoPedidoPct: corpo.descontoPedidoPct ?? null,
      validadeEmDias: corpo.validadeEmDias ?? null,
      condicoes: corpo.condicoes ?? null,
      autoria,
    });
    if (!r.ok) return recusa(r);
    return NextResponse.json({ ok: true, data: r });
  }

  // ── As demais ações trabalham sobre uma proposta existente ───────────────
  const propostaId = corpo.propostaId?.trim();
  if (!propostaId) {
    return NextResponse.json({ ok: false, error: "propostaId é obrigatório." }, { status: 400 });
  }
  const leadId = await leadDaProposta(propostaId);
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "Proposta não encontrada." }, { status: 404 });
  }
  const acesso = await podeVerOLead(portao.sessao, leadId, `proposta:${corpo.acao ?? "?"}`);
  if (!acesso.ok) return acesso.resposta;

  if (corpo.acao === "gerarLink") {
    const r = await gerarLinkDePagamento(prisma, { propostaId, autoria });
    if (!r.ok) {
      // Gateway desligado NÃO é erro do chamador: a assinatura existe e o
      // pagamento segue no modo manual. A tela precisa da verdade, não de um 500.
      const status = r.causa === "gatewayNaoConfigurado" ? 200 : 409;
      return NextResponse.json({ ok: false, error: fraseDoLink(r.causa), detalhe: r }, { status });
    }
    return NextResponse.json({ ok: true, data: r });
  }

  if (corpo.acao === "enviar") {
    // "pessoa": alguém leu, pensou e apertou. É o que separa esta saída do
    // caminho automático, que passa por uma segunda chave.
    const r = await enviarPropostaNoWhatsApp(prisma, { propostaId, autoria, quemMandou: "pessoa" });
    if (!r.ok && r.causa === "naoEntregue") {
      return NextResponse.json({
        ok: true,
        data: {
          entregue: false,
          mensagemId: r.mensagemId,
          situacaoDaProposta: r.situacaoDaProposta,
          aviso:
            "A proposta ficou registrada e a mensagem está PENDENTE — nada saiu para o cliente. " +
            `Motivo: ${r.detalhe}`,
        },
      });
    }
    if (!r.ok) return NextResponse.json({ ok: false, error: r.causa, detalhe: r }, { status: 409 });
    return NextResponse.json({ ok: true, data: { entregue: true, ...r } });
  }

  if (corpo.acao === "marcarVista") {
    const r = await marcarPropostaVista(prisma, { propostaId, autoria });
    if (!r.ok) return recusa(r);
    return NextResponse.json({ ok: true, data: r });
  }

  if (corpo.acao === "recusar") {
    const motivoPerdaId = corpo.motivoPerdaId?.trim();
    if (!motivoPerdaId) {
      return NextResponse.json(
        { ok: false, error: "Perder exige motivo do catálogo. Arquivar sem motivo não existe aqui." },
        { status: 400 },
      );
    }
    const r = await recusarProposta(prisma, {
      propostaId,
      motivoPerdaId,
      motivoPerdaDetalhe: corpo.motivoPerdaDetalhe ?? null,
      autoria,
    });
    if (!r.ok) return recusa(r);
    return NextResponse.json({ ok: true, data: r });
  }

  return NextResponse.json({ ok: false, error: "Ação desconhecida." }, { status: 400 });
}

function recusa(r: { causa: string; recusas?: Array<{ campo: string; motivo: string }> }): NextResponse {
  return NextResponse.json(
    { ok: false, error: r.causa, recusas: r.recusas ?? [] },
    { status: r.causa === "recusado" ? 400 : 409 },
  );
}

function fraseDoLink(causa: string): string {
  switch (causa) {
    case "gatewayNaoConfigurado":
      return "A assinatura foi registrada, mas o gateway de pagamento não está configurado — não há link para mandar.";
    case "semEmail":
      return "O Mercado Pago exige e-mail para criar a assinatura recorrente. Preencha o e-mail do contato.";
    case "semWhatsapp":
      return "O contato não tem WhatsApp cadastrado.";
    case "planoDesconhecido":
      return "O plano gravado nesta proposta não está mais no catálogo publicado.";
    default:
      return "Não foi possível gerar o link de pagamento.";
  }
}
