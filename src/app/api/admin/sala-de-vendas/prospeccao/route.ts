/**
 * PROSPECÇÃO — a porta do lote, do interruptor e da fila do dia.
 *
 *   GET                          → fila do dia + estado do interruptor
 *   POST { acao: "importar" }    → carrega lista num lote RASCUNHO
 *   POST { acao: "liberar" }     → autoriza o lote (registra quem assinou)
 *   POST { acao: "pausarLote" }  → trava um lote
 *   POST { acao: "interruptor" } → liga/desliga/pausa a prospecção inteira
 *
 * ── QUEM PODE O QUÊ, E POR QUE NÃO É UM PAPEL SÓ ────────────────────────────
 *
 * Ler a fila é trabalho de SDR. **Liberar lote e mexer no interruptor não são.**
 * Autorizar a casa a falar com estranhos é decisão de quem responde pela marca,
 * e por isso essas duas ações exigem papel de gestão — mesmo que o SDR consiga
 * ver a tela inteira.
 *
 * ⚠️ Nenhuma ação daqui envia mensagem. A entrega continua atrás de
 * `FOOCCI_SDR_SEND_ENABLED`, que mora no ambiente e é do dono.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, vePelaOperacaoToda } from "../_guarda";
import {
  importarLote,
  liberarLote,
  pausarLote,
  ListaGrandeDemais,
  ProvenienciaAusente,
  type LinhaDaLista,
} from "@/services/salaDeVendas/prospeccao/lote";
import { montarFilaDeProspeccao } from "@/services/salaDeVendas/prospeccao/selecao";
import { canalDeVendasPronto } from "@/services/foocci-sdr/FoocciSalesChannel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Corpo {
  acao?: "importar" | "liberar" | "pausarLote" | "interruptor";
  // importar
  nome?: string;
  proveniencia?: string;
  linhas?: LinhaDaLista[];
  limiteDiario?: number;
  // liberar / pausarLote
  loteId?: string;
  // interruptor
  ligado?: boolean;
  pausar?: boolean;
  motivo?: string;
  horasEntreAbordagens?: number;
}

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ver_prospeccao");
  if (!portao.ok) return portao.resposta;

  const [fila, lotes, config] = await Promise.all([
    montarFilaDeProspeccao(prisma, { canalPronto: canalDeVendasPronto() }),
    prisma.loteDeProspeccao.findMany({
      orderBy: { criadoEm: "desc" },
      take: 20,
      include: { _count: { select: { itens: true } } },
    }),
    prisma.prospeccaoConfig.findUnique({ where: { id: "singleton" } }),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      fila,
      lotes,
      // Ausência de configuração é dita como está: desligada, teto zero. Não é
      // "sem limite", e a tela precisa poder mostrar a diferença.
      interruptor: config ?? {
        outboundLigado: false,
        limiteDiario: 0,
        horasEntreAbordagens: 72,
        pausadoEm: null,
        motivo: null,
      },
      canalPronto: canalDeVendasPronto(),
    },
  });
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "mexer_na_prospeccao");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  let c: Corpo;
  try {
    c = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const quem = `${portao.sessao.nome} (${portao.sessao.userId})`;

  // ── Importar: conferência, não autorização ──
  if (c.acao === "importar") {
    if (!Array.isArray(c.linhas) || c.linhas.length === 0) {
      return NextResponse.json({ ok: false, error: "Lista vazia." }, { status: 400 });
    }
    try {
      const r = await importarLote(prisma, {
        nome: c.nome ?? "Lote sem nome",
        proveniencia: c.proveniencia ?? "",
        linhas: c.linhas,
        criadoPor: quem,
        limiteDiario: c.limiteDiario,
      });
      return NextResponse.json({ ok: true, data: r });
    } catch (e) {
      if (e instanceof ProvenienciaAusente || e instanceof ListaGrandeDemais) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
      }
      throw e;
    }
  }

  // ── As duas ações que autorizam a casa a falar com estranhos ──
  if (c.acao === "liberar" || c.acao === "interruptor") {
    if (!vePelaOperacaoToda(portao.sessao)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Autorizar prospecção é de quem responde pela marca — SDR conduz, não autoriza.",
        },
        { status: 403 },
      );
    }
  }

  if (c.acao === "liberar") {
    if (!c.loteId) {
      return NextResponse.json({ ok: false, error: "loteId é obrigatório." }, { status: 400 });
    }
    const r = await liberarLote(prisma, c.loteId, quem);
    return NextResponse.json(r.ok ? { ok: true } : { ok: false, error: r.motivo }, {
      status: r.ok ? 200 : 400,
    });
  }

  if (c.acao === "pausarLote") {
    if (!c.loteId) {
      return NextResponse.json({ ok: false, error: "loteId é obrigatório." }, { status: 400 });
    }
    const r = await pausarLote(prisma, c.loteId, quem);
    return NextResponse.json(r.ok ? { ok: true } : { ok: false, error: r.motivo }, {
      status: r.ok ? 200 : 404,
    });
  }

  if (c.acao === "interruptor") {
    const agora = new Date();
    const pausando = c.pausar === true;

    // ── LIGAR COM TETO ZERO É LIGAR NADA ──
    //
    // O padrão do campo é 0, e uma prospecção "ligada" com teto 0 devolve fila
    // vazia para sempre. O dono clicaria em Ligar, veria "Teto do dia atingido
    // (0/0)" e concluiria que o produto está quebrado — quando na verdade ele
    // obedeceu. Recusar aqui é mais honesto que aceitar e não fazer nada.
    if (!pausando && c.ligado === true) {
      const tetoAtual =
        typeof c.limiteDiario === "number"
          ? c.limiteDiario
          : ((await prisma.prospeccaoConfig.findUnique({ where: { id: "singleton" } }))
              ?.limiteDiario ?? 0);

      if (tetoAtual <= 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Informe quantas abordagens por dia antes de ligar. Ligar com teto zero não aborda ninguém.",
          },
          { status: 400 },
        );
      }
    }

    const dados = {
      outboundLigado: pausando ? false : Boolean(c.ligado),
      pausadoEm: pausando ? agora : null,
      pausadoPor: pausando ? quem : null,
      motivo: c.motivo ?? null,
      atualizadoPor: quem,
      ...(typeof c.limiteDiario === "number" ? { limiteDiario: Math.max(0, c.limiteDiario) } : {}),
      ...(typeof c.horasEntreAbordagens === "number"
        ? { horasEntreAbordagens: Math.max(0, c.horasEntreAbordagens) }
        : {}),
    };

    const config = await prisma.prospeccaoConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...dados },
      update: dados,
    });

    return NextResponse.json({ ok: true, data: config });
  }

  return NextResponse.json({ ok: false, error: "Ação desconhecida." }, { status: 400 });
}
