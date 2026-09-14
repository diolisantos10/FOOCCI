/**
 * O WHATSAPP DA SALA, DESCOBERTO POR API — número, conta, teto e modelos.
 *
 * `GET` só lê o retrato atual. `POST` sincroniza a conta da Meta e, ao final de
 * uma leitura completa, reaplica o padrão executivo dos seis templates mais
 * recentemente editados para abordagem fria.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas, vePelaOperacaoToda, somenteLeitura } from "../_guarda";
import { prisma } from "@/lib/prisma";
import { comOTokenDeVendas } from "@/services/foocci-sdr/FoocciSalesChannel";
import { detalhesDoNumeroDeVendas, type DetalhesDoNumero } from "@/services/foocci-sdr/modelosDaMeta";
import { modeloConfigurado } from "@/services/salaDeVendas/abordar";
import {
  sincronizarModelosDeVendas,
  modelosSincronizadosDaSala,
} from "@/services/foocci-sdr/sincronizarModelos";
import { aplicarPadraoUltimosSeisDaMeta } from "@/services/foocci-sdr/padraoModelosRecentes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEM_TOKEN: DetalhesDoNumero = {
  phoneNumberId: "",
  wabaId: null,
  numero: null,
  nomeVerificado: null,
  qualidade: null,
  tier: null,
  erro: "FOOCCI_SALES_ACCESS_TOKEN não está no ambiente",
};

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ver_whatsapp_da_sala");
  if (!portao.ok) return portao.resposta;

  if (!vePelaOperacaoToda(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "Só quem enxerga a operação inteira vê o canal da Sala." },
      { status: 403 },
    );
  }

  const [numero, modelos] = await Promise.all([
    comOTokenDeVendas<DetalhesDoNumero>(detalhesDoNumeroDeVendas, () => SEM_TOKEN),
    modelosSincronizadosDaSala(prisma),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      numero,
      modelos,
      // Mantido apenas para compatibilidade de consumidores antigos desta rota.
      // O envio real não usa mais uma frase fixa: usa o conjunto liberado.
      selecionado: modeloConfigurado(),
    },
  });
}

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "sincronizar_modelos_da_sala");
  if (!portao.ok) return portao.resposta;

  if (!vePelaOperacaoToda(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "Só quem enxerga a operação inteira sincroniza os modelos." },
      { status: 403 },
    );
  }

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "O auditor lê e não escreve." },
      { status: 403 },
    );
  }

  const r = await sincronizarModelosDeVendas(prisma);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.erro ?? "Falha ao sincronizar." }, { status: 502 });
  }

  const padrao = await aplicarPadraoUltimosSeisDaMeta(prisma);
  if (!padrao.ok) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `Os modelos foram sincronizados, mas não foi seguro definir os seis mais recentes: ${padrao.erro}`,
      },
      { status: 502 },
    );
  }

  const modelos = await modelosSincronizadosDaSala(prisma);
  return NextResponse.json({ ok: true, data: { resultado: r, modelos, padrao } });
}
