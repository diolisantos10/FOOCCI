/**
 * O FOLLOW-UP AUTOMÁTICO — o desenho 09, em leitura.
 *
 *   GET ?logs=50
 *
 * ⛔ **Só GET.** Sem POST, PUT, PATCH ou DELETE. O desenho tem "Salvar" e
 * "Ativar automação"; esta rota não grava jornada nenhuma, porque não há onde:
 * `CadenciaPasso` não tem coluna de condição nem modelo de ramo, e o schema
 * desta entrega está fechado. O que falta está listado no próprio panorama, em
 * `oQueFaltaParaEditar`.
 *
 * ⛔ **E nada aqui envia.** O envio sai por `abordarLead()`, atrás de
 * `FOOCCI_SDR_SEND_ENABLED` — pausado por ordem do CEO. A rota LÊ o estado da
 * chave para a tela dizer a verdade sobre ela, e só.
 *
 * ⚠️ São as NOSSAS jornadas, sobre os leads da Sala de Vendas. O follow-up que
 * o restaurante faz com os clientes dele (`src/services/crm/**`) não entra aqui.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas } from "../_guarda";
import { panoramaDoFollowUpAutomatico } from "@/services/salaDeVendas/telas/followUpAutomatico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_follow_up_automatico");
  if (!portao.ok) return portao.resposta;

  const bruto = req.nextUrl.searchParams.get("logs");
  const limiteDeLogs = bruto
    ? Math.min(Math.max(Number.parseInt(bruto, 10) || 50, 1), 500)
    : undefined;

  const data = await panoramaDoFollowUpAutomatico(prisma, { limiteDeLogs });

  return NextResponse.json({ ok: true, data });
}
