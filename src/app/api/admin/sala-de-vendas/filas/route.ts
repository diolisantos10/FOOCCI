/**
 * GET /api/admin/sala-de-vendas/filas?fila=aguardandoHumano
 *
 * As filas da Sala. O escopo do SDR é aplicado no `where` da consulta, dentro
 * do serviço. A lista de Conversas pode pedir busca e ordenação sem alterar a
 * regra comercial de cada fila.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas } from "../_guarda";
import { listarFila, FILAS, type NomeDaFila } from "@/services/salaDeVendas/filas";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrdemDasConversas = "recentes" | "antigas" | "nome-az" | "nome-za" | "prioridade";

const ORDENS: readonly OrdemDasConversas[] = [
  "recentes",
  "antigas",
  "nome-az",
  "nome-za",
  "prioridade",
] as const;

function normalizar(texto: string | null): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_filas_da_sala_de_vendas");
  if (!portao.ok) return portao.resposta;

  const pedida = req.nextUrl.searchParams.get("fila");
  // Fila desconhecida cai em "todos" em vez de erro: link velho ou digitação
  // errada não deve derrubar a tela de quem está trabalhando.
  const fila: NomeDaFila = FILAS.some((f) => f.nome === pedida)
    ? (pedida as NomeDaFila)
    : "todos";

  const busca = normalizar(req.nextUrl.searchParams.get("busca"));
  const ordemPedida = req.nextUrl.searchParams.get("ordem") as OrdemDasConversas | null;
  const ordem: OrdemDasConversas = ordemPedida && ORDENS.includes(ordemPedida)
    ? ordemPedida
    : "recentes";

  // A busca da tela de Conversas precisa alcançar mais do que o corte padrão de
  // 100 registros. 500 cobre a operação atual sem transformar a rota numa
  // exportação irrestrita da base.
  const r = await listarFila(prisma, { fila, sessao: portao.sessao, limite: 500 });

  if (!r.leituraOk) {
    return NextResponse.json({ ok: false, error: r.motivo }, { status: 500 });
  }

  let leads = busca
    ? r.leads.filter((lead) => {
        const alvo = [lead.nome, lead.restaurante, lead.cidade]
          .map(normalizar)
          .join(" ");
        return alvo.includes(busca);
      })
    : [...r.leads];

  if (ordem !== "prioridade" && leads.length > 0) {
    // `ultimaMensagemEm` é o cache próprio do inbox. Ele inclui mensagem de
    // entrada também; `lastContactedAt` sozinho só diz quando a Foocci falou.
    const ultimas = await prisma.siteLead.findMany({
      where: { id: { in: leads.map((lead) => lead.id) } },
      select: { id: true, ultimaMensagemEm: true },
    });
    const porId = new Map(ultimas.map((item) => [item.id, item.ultimaMensagemEm]));

    const momento = (lead: (typeof leads)[number]): number => {
      const ultima = porId.get(lead.id);
      return (ultima ?? lead.lastContactedAt ?? lead.createdAt).getTime();
    };
    const nome = (lead: (typeof leads)[number]): string =>
      (lead.restaurante || lead.nome || "").trim();

    leads.sort((a, b) => {
      switch (ordem) {
        case "antigas":
          return momento(a) - momento(b);
        case "nome-az":
          return nome(a).localeCompare(nome(b), "pt-BR", { sensitivity: "base" });
        case "nome-za":
          return nome(b).localeCompare(nome(a), "pt-BR", { sensitivity: "base" });
        case "recentes":
        default:
          return momento(b) - momento(a);
      }
    });
  }

  return NextResponse.json({
    ok: true,
    data: { fila, filas: FILAS, contagens: r.contagens, leads },
  });
}
