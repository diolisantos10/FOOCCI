/**
 * ⭐ PAREAMENTO COM O COFRE DA CONTROL ROOM — desenho do CEO de 04/10/2026.
 *
 * Ninguém entrega token ao Foocci. O próprio Foocci:
 *   1. gera um segredo aleatório (32 bytes, hex) e o guarda SÓ no próprio banco,
 *      cifrado (`produto_no_cofre`, AES-256-GCM de src/lib/crypto.ts);
 *   2. manda à Control Room apenas o sha256 do segredo
 *      (`POST /api/v1/ai/pareamento/solicitar`);
 *   3. espera o CEO aprovar com um clique na tela do cofre;
 *   4. usa o segredo como `X-Service-Token` na porta de IA e na de chamados.
 *
 * ⛔ O segredo nunca vai para log, tela, resposta HTTP ou commit. As funções
 * daqui só o devolvem a quem vai pô-lo num cabeçalho de saída para a Control Room.
 */

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

/** Chave do Foocci no catálogo da Control Room (`dioli.foocci.*` no diretório). */
export const PRODUTO_NO_CATALOGO = "foocci";

/** Endereço da Control Room. Não é segredo — é só onde fica a porta. */
export function baseDaControlRoom(): string {
  const v = (process.env.CONTROL_ROOM_BASE_URL ?? "").trim();
  return (v || "https://controlroom-production-b42c.up.railway.app").replace(/\/+$/, "");
}

export function gerarSegredo(): string {
  return randomBytes(32).toString("hex");
}

/** sha256 em hex minúsculo — o ÚNICO derivado do segredo que sai do Foocci. */
export function hashDoSegredo(segredo: string): string {
  return createHash("sha256").update(segredo, "utf8").digest("hex");
}

let emCache: string | null = null;

/** Só para testes. */
export function __esquecerSegredoEmCache(): void {
  emCache = null;
}

/**
 * O segredo deste produto. Cria na primeira vez; depois, sempre o mesmo.
 * Corrida entre dois processos: quem perde o INSERT relê o que venceu.
 */
export async function obterOuCriarSegredo(): Promise<string> {
  if (emCache) return emCache;

  const existente = await prisma.produtoNoCofre.findUnique({ where: { id: PRODUTO_NO_CATALOGO } });
  if (existente) {
    emCache = decrypt(existente.segredoCifrado);
    return emCache;
  }

  const segredo = gerarSegredo();
  try {
    await prisma.produtoNoCofre.create({
      data: {
        id: PRODUTO_NO_CATALOGO,
        segredoCifrado: encrypt(segredo),
        hash: hashDoSegredo(segredo),
      },
    });
    emCache = segredo;
  } catch {
    const venceu = await prisma.produtoNoCofre.findUnique({ where: { id: PRODUTO_NO_CATALOGO } });
    if (!venceu) throw new Error("cofre: não consegui gravar nem ler o segredo do produto");
    emCache = decrypt(venceu.segredoCifrado);
  }
  return emCache;
}

export type ResultadoDaSolicitacao =
  | { ok: true; status: string; http: number }
  | { ok: false; motivo: string; http: number | null };

/**
 * Pede à Control Room o pareamento deste produto (idempotente: um novo pedido
 * do mesmo produto substitui o pendente). Nunca lança e nunca loga o segredo.
 */
export async function solicitarPareamento(
  origem = "boot do serviço, produção",
): Promise<ResultadoDaSolicitacao> {
  let http: number | null = null;
  try {
    const segredo = await obterOuCriarSegredo();
    const resposta = await fetch(`${baseDaControlRoom()}/api/v1/ai/pareamento/solicitar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ produto: PRODUTO_NO_CATALOGO, hash: hashDoSegredo(segredo), origem }),
      signal: AbortSignal.timeout(10_000),
    });
    http = resposta.status;
    const corpo = (await resposta.json().catch(() => null)) as { status?: string; erro?: string } | null;
    const resultado: ResultadoDaSolicitacao = resposta.status === 202 || resposta.ok
      ? { ok: true, status: corpo?.status ?? "pendente", http }
      : { ok: false, motivo: corpo?.erro ?? `HTTP ${http}`, http };

    await prisma.produtoNoCofre.update({
      where: { id: PRODUTO_NO_CATALOGO },
      data: {
        status: resultado.ok ? resultado.status : "falhou",
        ultimaSolicitacaoEm: new Date(),
        ultimaResposta: resultado.ok ? `HTTP ${http} ${resultado.status}` : `HTTP ${http ?? "—"} ${resultado.motivo}`.slice(0, 300),
      },
    }).catch(() => {});
    return resultado;
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    return { ok: false, motivo: motivo.slice(0, 200), http };
  }
}
