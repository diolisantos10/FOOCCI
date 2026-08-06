/**
 * A PURGA DE UM RESTAURANTE — simulação, rede e corte.
 *
 *   GET  ?slug=X                      → SIMULAÇÃO (somente leitura): o que sairia,
 *                                       quantas linhas de cada tabela, e o que
 *                                       hoje bloquearia o corte.
 *   GET  ?slug=X&formato=exportacao   → A REDE (somente leitura): todo o dado que
 *                                       vai sumir, mais o sha256 que o corte cobra.
 *   POST                              → O CORTE. Um restaurante por chamada.
 *
 * POR QUE UMA ROTA NOVA E NÃO O CAMINHO QUE JÁ EXISTIA: não existia.
 * `/api/admin/restaurants/[id]` só tem PATCH (ativo, plano, nome); não há DELETE de
 * restaurante em rota, serviço ou script algum deste repositório. Sem esta rota, a
 * alternativa real é SQL cru em produção — sem ordem, sem contagem e sem rede.
 *
 * ⚠️ A EXPORTAÇÃO CARREGA DADO PESSOAL (nome, telefone, endereço, conversa).
 * Ela NÃO pode ser impressa em log de ferramenta pública nem virar artefato de
 * repositório aberto. Quem a consome tem que gravar em arquivo local — o script
 * `scripts/purgar-restaurante.mjs` recusa rodar dentro do GitHub Actions por isso.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import {
  simularPurga,
  exportarRestaurante,
  executarPurga,
  PurgaBloqueadaError,
} from "@/services/restaurant/RestaurantPurgeService";
import { SLUGS_PROTEGIDOS } from "@/services/restaurant/restaurantPurgeMap";

function portao(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: "Endpoint desligado — ADMIN_SECRET não configurado." },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Recusa vira resposta com o motivo e a evidência (guardrail 6), nunca 500 anônimo. */
function recusa(e: unknown): NextResponse {
  if (e instanceof PurgaBloqueadaError) {
    const status = e.motivo === "NAO_ENCONTRADO" ? 404 : e.motivo === "SLUG_PROTEGIDO" ? 403 : 409;
    return NextResponse.json(
      { error: e.message, motivo: e.motivo, slug: e.slug, evidencia: e.evidencia },
      { status },
    );
  }
  return NextResponse.json(
    { error: "Falhou", detalhe: e instanceof Error ? e.message : String(e) },
    { status: 500 },
  );
}

export async function GET(req: NextRequest) {
  const negado = portao(req);
  if (negado) return negado;

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug é obrigatório" }, { status: 400 });
  }

  try {
    if (req.nextUrl.searchParams.get("formato") === "exportacao") {
      const rede = await exportarRestaurante(slug);
      return NextResponse.json({
        aviso:
          "CONTÉM DADO PESSOAL. Grave em arquivo local e guarde fora de log, artefato " +
          "ou qualquer lugar público. Sem esta rede guardada, a purga não deve acontecer.",
        ...rede,
      });
    }
    return NextResponse.json({ simulacao: true, ...(await simularPurga(slug)) });
  } catch (e) {
    return recusa(e);
  }
}

/**
 * O CORTE. Exige, no corpo: `slug`, `confirmarSlug` idêntico, o `sha256DoBackup`
 * devolvido pela exportação e — se houver nota fiscal — `aceitoPerderNotaFiscal`.
 *
 * Não existe modo "apagar todos os que não são os dois protegidos", de propósito.
 * Um restaurante por chamada, nomeado duas vezes por quem chama.
 */
export async function POST(req: NextRequest) {
  const negado = portao(req);
  if (negado) return negado;

  let corpo: {
    slug?: string;
    confirmarSlug?: string;
    sha256DoBackup?: string;
    aceitoPerderNotaFiscal?: boolean;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 });
  }

  if (!corpo.slug) {
    return NextResponse.json(
      { error: "slug é obrigatório", protegidos: SLUGS_PROTEGIDOS },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await executarPurga({
        slug: corpo.slug,
        confirmarSlug: corpo.confirmarSlug ?? "",
        sha256DoBackup: corpo.sha256DoBackup ?? "",
        aceitoPerderNotaFiscal: corpo.aceitoPerderNotaFiscal,
      }),
    );
  } catch (e) {
    return recusa(e);
  }
}
