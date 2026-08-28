/**
 * POST /api/admin/sala-de-vendas/contato-manual
 *
 * "Falei com ele por telefone." "Passei na loja." "Encontrei na feira."
 *
 * ── AS TRÊS CAMADAS, NESTA ROTA ─────────────────────────────────────────────
 *
 *   1. `guardarSalaDeVendas` — você é da Sala? (protege o endereço)
 *   2. `podeVerOLead`        — este lead é alcançável por você? (protege o dado)
 *   3. o serviço             — quem, quando e o quê precisam existir
 *
 * ── O AUTOR VEM DO CANAL, NUNCA DO CORPO ────────────────────────────────────
 *
 * `quemUserId` é a sessão. O corpo do pedido pode mandar `actor`, `quem`,
 * `usuario` — nada disso é lido. Deixar o cliente escolher o autor entrega o
 * registro de responsabilidade justamente a quem age, e este registro existe
 * para dizer quem falou com o cliente em nome da empresa.
 *
 * ── E `ocorridoEm` É OBRIGATÓRIO ────────────────────────────────────────────
 *
 * Não existe valor padrão aqui. A tela preenche o campo com "agora" para que o
 * caso comum custe um clique, mas quem manda o valor é ela — porque registro
 * manual quase sempre é lançado depois do fato, e carimbar a hora da digitação
 * embaralharia a linha do tempo do lead.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, podeVerOLead } from "../_guarda";
import {
  registrarContatoManual,
  ehTipoDeContatoManual,
  TIPOS_DE_CONTATO_MANUAL,
} from "@/services/salaDeVendas/contatoManual";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CorpoDoRegistro {
  leadId?: unknown;
  tipo?: unknown;
  ocorridoEm?: unknown;
  nota?: unknown;
}

/** Data do corpo, sem confiar no tipo. Texto ilegível vira `null`, nunca hoje. */
function dataDoCorpo(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "registrar_contato_manual");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let corpo: CorpoDoRegistro;
  try {
    corpo = (await req.json()) as CorpoDoRegistro;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const leadId = typeof corpo.leadId === "string" ? corpo.leadId.trim() : "";
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId é obrigatório." }, { status: 400 });
  }

  if (!ehTipoDeContatoManual(corpo.tipo)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Tipo de contato inválido. Use um destes: ${TIPOS_DE_CONTATO_MANUAL.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const quando = dataDoCorpo(corpo.ocorridoEm);
  if (!quando) {
    return NextResponse.json(
      { ok: false, error: "Informe quando o contato aconteceu — sem isso a linha do tempo mente." },
      { status: 400 },
    );
  }

  const acesso = await podeVerOLead(portao.sessao, leadId, "registrar_contato_manual");
  if (!acesso.ok) return acesso.resposta;

  const r = await registrarContatoManual(prisma, {
    leadId,
    tipo: corpo.tipo,
    quemUserId: portao.sessao.userId,
    quando,
    nota: typeof corpo.nota === "string" ? corpo.nota : null,
  });

  if (r.ok) {
    return NextResponse.json({
      ok: true,
      data: {
        interacaoId: r.interacaoId,
        ocorridoEm: r.quando,
        // A tela precisa dizer a verdade sobre o efeito: um registro que NÃO
        // contou como abordagem (uma anotação, ou um contato mais antigo que o
        // último já gravado) deixa o lead na fila de "falta abordar", e o
        // vendedor merece saber disso agora, não amanhã.
        contouComoAbordagem: r.contouComoAbordagem,
      },
    });
  }

  if (r.causa === "leadNaoExiste") {
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ ok: false, error: motivo(r.causa) }, { status: 400 });
}

/** O código vira frase para quem está atendendo, não para quem depura a API. */
function motivo(causa: "semQuem" | "tipoInvalido" | "semQuando" | "quandoNoFuturo" | "anotacaoSemTexto"): string {
  switch (causa) {
    case "semQuem":
      return "Não consegui identificar quem está registrando. Entre de novo na Sala.";
    case "tipoInvalido":
      return "Tipo de contato inválido.";
    case "semQuando":
      return "Informe quando o contato aconteceu.";
    case "quandoNoFuturo":
      return "A data está no futuro. Registre o contato que já aconteceu — confira o dia e o ano.";
    case "anotacaoSemTexto":
      return "Escreva a anotação: uma anotação vazia não conta nada a quem ler depois.";
  }
}
