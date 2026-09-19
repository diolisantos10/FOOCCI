/**
 * A CRM IA / DEPARTAMENTO DE CRM — o desenho 11, em leitura.
 *
 *   GET ?limite=5000
 *
 * ⛔ **Só GET, e de propósito.** Não existe POST, PUT, PATCH nem DELETE nesta
 * rota. Abrir um painel não pode ser um ato: `enfileirarPlano` — o único
 * caminho que inscreveria alguém numa cadência — NÃO é chamado aqui, e um GET
 * que enfileirasse transformaria "dar uma olhada" em "mandar mensagem para
 * setecentas pessoas".
 *
 * ⛔ **E nada aqui envia.** O envio da casa sai por `abordarLead()`, atrás de
 * `FOOCCI_SDR_SEND_ENABLED`, hoje pausado por ordem do CEO. Esta rota apenas
 * LÊ o estado dessa chave para a tela poder dizer a verdade sobre ela.
 *
 * ⚠️ O CRM aqui é o NOSSO: leads da Sala de Vendas, donos de restaurante que
 * estamos vendendo. Nada de `src/services/crm/**` (o CRM do restaurante com os
 * clientes dele) é lido por esta rota.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas } from "../_guarda";
import { escopoDaConsulta } from "@/services/salaDeVendas/filas";
import { panoramaDaCrmIa } from "@/services/salaDeVendas/telas/crmIa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_crm_ia");
  if (!portao.ok) return portao.resposta;

  const bruto = req.nextUrl.searchParams.get("limite");
  const limite = bruto
    ? Math.min(Math.max(Number.parseInt(bruto, 10) || 5000, 1), 20_000)
    : undefined;

  const data = await panoramaDaCrmIa(prisma, {
    escopo: escopoDaConsulta(portao.sessao),
    limite,
  });

  return NextResponse.json({ ok: true, data });
}
