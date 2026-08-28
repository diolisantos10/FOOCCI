/**
 * POST /api/admin/sala-de-vendas/apagar-dados
 *
 * ⚠️ **A ROTA MAIS PERIGOSA DA SALA.** Ela apaga o contato e tudo que está
 * pendurado nele, em dez tabelas, sem volta. É o direito de eliminação da LGPD —
 * e o jeito de tirar um contato de teste da base.
 *
 * ── POR QUE POST, E NÃO DELETE ──────────────────────────────────────────────
 *
 * Porque o pedido precisa CARREGAR uma confirmação, e um `DELETE` sem corpo é
 * exatamente o que uma varredura de endereços consegue disparar por acidente. O
 * método aqui não é estética de REST: é a diferença entre "apagar exige escrever
 * o nome da pessoa" e "apagar exige acertar a URL".
 *
 * ── AS TRÊS CAMADAS, MAIS UMA ───────────────────────────────────────────────
 *
 *   1. `guardarSalaDeVendas`   — você é da Sala? (protege o endereço)
 *   2. `podeApagarDadosDoLead` — você é do CEO/Diretor? (protege o ATO)
 *   3. `podeVerOLead`          — este lead é alcançável por você? (protege o dado)
 *   4. o serviço               — nome confere? origem do pedido declarada?
 *
 * A camada 2 existe porque a guarda da Sala aceita o SDR humano e o auditor, e
 * nenhum dos dois pode destruir a base que trabalha. **A tela também esconde o
 * botão — e isso não conta.** Esconder botão não é autorização: quem souber o
 * endereço chama a rota direto, e é por isso que a recusa está aqui.
 *
 * A camada 3 é redundante HOJE, porque só papéis globais chegam nela e eles
 * enxergam todos os leads. Fica de pé porque a lista de papéis da camada 2 é
 * uma linha de código: no dia em que ela crescer, a terceira camada precisa já
 * estar aqui, e não depender de alguém lembrar.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, podeVerOLead } from "../_guarda";
import {
  apagarDadosDoLead,
  podeApagarDadosDoLead,
  ehOrigemDoPedido,
} from "@/services/salaDeVendas/lgpd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACAO = "apagar_dados_do_lead";

interface CorpoDoApagamento {
  leadId?: unknown;
  confirmacaoNome?: unknown;
  origemDoPedido?: unknown;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, ACAO);
  if (!portao.ok) return portao.resposta;

  if (!podeApagarDadosDoLead(portao.sessao)) {
    // A recusa entra na trilha. Sem isso, "ninguém tentou apagar a base" seria
    // suposição — e numa rota irreversível a tentativa negada é o alarme.
    try {
      await prisma.internalAuditEvent.create({
        data: {
          actorType: "INTERNAL_USER",
          actorId: portao.sessao.userId,
          actorLabel: `${portao.sessao.nome} (${portao.sessao.userId})`,
          acao: ACAO,
          recurso: "sala-de-vendas",
          resultado: "NEGADO",
          motivo: `papel ${portao.sessao.role} não apaga dado de contato`,
        },
      });
    } catch {
      // Trilha fora do ar não abre a porta.
    }

    return NextResponse.json(
      { ok: false, error: "Apagar dados de um contato é do CEO ou do Diretor." },
      { status: 403 },
    );
  }

  let corpo: CorpoDoApagamento;
  try {
    corpo = (await req.json()) as CorpoDoApagamento;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const leadId = typeof corpo.leadId === "string" ? corpo.leadId.trim() : "";
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId é obrigatório." }, { status: 400 });
  }

  // As duas conferências do corpo vêm ANTES de qualquer leitura do lead: um
  // pedido sem confirmação não deve nem chegar perto do contato que ele apagaria.
  const confirmacaoNome =
    typeof corpo.confirmacaoNome === "string" ? corpo.confirmacaoNome : "";
  if (!confirmacaoNome.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Escreva o nome do contato para confirmar. Sem isso o apagamento não roda — " +
          "é o que impede apagar a pessoa errada.",
      },
      { status: 400 },
    );
  }

  if (!ehOrigemDoPedido(corpo.origemDoPedido)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Diga de onde veio o pedido: TITULAR (a pessoa pediu) ou CONTATO_DE_TESTE " +
          "(limpeza da base).",
      },
      { status: 400 },
    );
  }

  const acesso = await podeVerOLead(portao.sessao, leadId, ACAO);
  if (!acesso.ok) return acesso.resposta;

  const r = await apagarDadosDoLead(prisma, {
    leadId,
    confirmacaoNome,
    origemDoPedido: corpo.origemDoPedido,
    sessao: portao.sessao,
  });

  if (r.ok) {
    return NextResponse.json({
      ok: true,
      data: { apagadoEm: r.apagadoEm, apagados: r.apagados },
    });
  }

  if (r.causa === "leadNaoExiste") {
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  }

  if (r.causa === "confirmacaoNaoConfere") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "O nome digitado não é o deste contato. Nada foi apagado — confira se a ficha " +
          "aberta é mesmo a da pessoa que pediu.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: false, error: "Pedido de apagamento incompleto. Nada foi apagado." },
    { status: 400 },
  );
}
