/**
 * GET /api/sdr/diario — o que o SDR fez, em leitura, com porta própria.
 *
 * ── FAIL-CLOSED, e é o ponto inteiro ────────────────────────────────────────
 * Sem `SDR_DIARIO_SECRET` configurado a rota NÃO abre. Não cai no admin, não
 * abre "só em desenvolvimento", não devolve versão reduzida. Esquecer de
 * configurar nunca pode significar "liberado" (guardrail 2 da casa: sem portão =
 * reprovado). O segredo é próprio, e não o `ADMIN_SECRET`, porque este diário
 * existe para ser lido por quem audita — inclusive por um robô — e o segredo do
 * admin abre o painel inteiro da empresa.
 *
 * ── SOMENTE LEITURA ─────────────────────────────────────────────────────────
 * Só existe GET. Nenhum verbo de escrita, nem de limpeza: um diário que pode ser
 * apagado pela mesma porta por onde é lido não serve de prova de nada.
 *
 * Uso:  GET /api/sdr/diario?limite=50&dias=14   com  x-sdr-diario-secret: <segredo>
 */

import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { lerDiario } from "@/services/brain/sdr/DiarioDoSdr";

export const dynamic = "force-dynamic";

/** Comparação em tempo constante, com hash dos dois lados (mesmo molde do admin). */
function iguais(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function autorizado(req: NextRequest): boolean {
  const segredo = process.env.SDR_DIARIO_SECRET;
  // Não configurado = fechado. Nunca aberto por omissão.
  if (!segredo || segredo.trim().length < 16) return false;
  const enviado = req.headers.get("x-sdr-diario-secret");
  return !!enviado && iguais(enviado, segredo);
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return unauthorized();

  try {
    const cru = Number(req.nextUrl.searchParams.get("limite"));
    const limite = Number.isFinite(cru) && cru > 0 ? Math.min(cru, 300) : 50;
    const janelaCrua = Number(req.nextUrl.searchParams.get("dias"));
    const dias = Number.isFinite(janelaCrua) && janelaCrua > 0 ? janelaCrua : undefined;
    return ok(await lerDiario(limite, dias));
  } catch (err) {
    console.error("[GET /api/sdr/diario]", err);
    return serverError();
  }
}
