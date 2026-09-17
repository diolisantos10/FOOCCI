/**
 * CATÁLOGO / OFERTA / CHECKOUT — só leitura.
 *
 * GET → os planos, o quadro das propostas e as que estão vencendo.
 *
 * ⚠️ Nenhum envio nasce aqui. Criar proposta, gerar link e mandar no WhatsApp
 * já têm caminho (`/propostas` e `checkoutDaProposta`), e é lá que moram as
 * travas de janela, opt-out e freio de ritmo.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas } from "../_guarda";
import { escopoDaConsulta } from "@/services/salaDeVendas/filas";
import { panoramaDaOferta } from "@/services/salaDeVendas/telas/oferta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ler_oferta");
  if (!portao.ok) return portao.resposta;

  const data = await panoramaDaOferta(prisma, { escopo: escopoDaConsulta(portao.sessao) });
  return NextResponse.json({ ok: true, data });
}
