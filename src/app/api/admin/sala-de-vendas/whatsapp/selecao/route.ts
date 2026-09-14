import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  definirPodeEnviar,
  modelosComPermissaoDeEnvio,
} from "@/services/foocci-sdr/modelosLiberados";
import {
  guardarSalaDeVendas,
  somenteLeitura,
  vePelaOperacaoToda,
} from "../../_guarda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "ver_selecao_de_modelos_da_sala");
  if (!portao.ok) return portao.resposta;

  if (!vePelaOperacaoToda(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "Só quem enxerga a operação inteira vê a seleção de modelos." },
      { status: 403 },
    );
  }

  const modelos = await modelosComPermissaoDeEnvio(prisma);
  return NextResponse.json({ ok: true, data: { modelos } });
}

export async function PATCH(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "alterar_selecao_de_modelos_da_sala");
  if (!portao.ok) return portao.resposta;

  if (!vePelaOperacaoToda(portao.sessao)) {
    return NextResponse.json(
      { ok: false, error: "Só quem enxerga a operação inteira altera os modelos de envio." },
      { status: 403 },
    );
  }

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "O auditor lê e não escreve." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { nome?: unknown; idioma?: unknown; podeEnviar?: unknown }
    | null;

  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  const idioma = typeof body?.idioma === "string" ? body.idioma.trim() : "";
  const podeEnviar = body?.podeEnviar;

  if (!nome || !idioma || typeof podeEnviar !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "Informe nome, idioma e podeEnviar." },
      { status: 400 },
    );
  }

  const resultado = await definirPodeEnviar(prisma, { nome, idioma, podeEnviar });
  if (!resultado.ok) {
    const status = resultado.causa === "naoAprovado" ? 409 : resultado.causa === "naoEncontrado" ? 404 : 503;
    return NextResponse.json({ ok: false, error: resultado.detalhe }, { status });
  }

  return NextResponse.json({ ok: true, data: resultado });
}
