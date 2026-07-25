/**
 * GeradorDeFoto — executa o comando forjado pela Oficina e guarda a imagem.
 *
 * Reaproveita o mesmo cliente e o mesmo armazenamento do realce, então a foto
 * gerada vive no mesmo lugar das outras e aparece pelas mesmas URLs.
 *
 * Nunca lança: falha vira `{ ok: false, erro }` com a causa REAL, porque
 * "IA indisponível" não ajuda ninguém a consertar nada.
 */

import crypto from "crypto";
import { uploadToS3 } from "@/lib/s3";
import { prisma } from "@/lib/prisma";

import { gerarImagemOpenAI, MODELO_DE_IMAGEM } from "./providers/openai";

/** Proporções aceitas pelo modelo, mapeadas do jeito que a agência fala. */
const TAMANHOS: Record<string, string> = {
  "1:1":  "1024x1024",
  "4:5":  "1024x1536",
  "9:16": "1024x1536",
  "16:9": "1536x1024",
  "3:2":  "1536x1024",
};

export function tamanhoPara(formato?: string): string {
  if (!formato) return "1024x1024";
  const chave = formato.trim().match(/\d+\s*:\s*\d+/)?.[0]?.replace(/\s/g, "");
  return (chave && TAMANHOS[chave]) || "1024x1024";
}

export type ResultadoDaGeracao =
  | { ok: true; url: string; modelo: string; tamanho: string }
  | { ok: false; erro: string };

export function geradorConfigurado(): boolean {
  const chave = process.env.OPENAI_API_KEY;
  return !!chave && chave !== "not-configured" && chave.length > 10;
}

async function guardar(buffer: Buffer, mimeType: string, restaurantId: string): Promise<string> {
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  const key = `restaurants/${restaurantId}/geradas/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  try {
    return await uploadToS3(buffer, key, mimeType);
  } catch {
    const record = await prisma.mediaUpload.create({
      data: { id: crypto.randomBytes(16).toString("hex"), restaurantId, mimeType, data: buffer },
      select: { id: true },
    });
    return `/api/media/${record.id}`;
  }
}

/**
 * Gera a imagem a partir do comando pronto.
 *
 * O comando NÃO é reescrito aqui — ele já veio forjado pela Oficina, e mexer
 * nele neste ponto desfaria justamente o trabalho que garante a qualidade.
 */
export async function gerarFoto(
  comando: string,
  restaurantId: string,
  formato?: string,
): Promise<ResultadoDaGeracao> {
  if (!geradorConfigurado()) {
    return { ok: false, erro: "Chave da OpenAI não configurada (OPENAI_API_KEY)." };
  }
  if (!comando.trim()) {
    return { ok: false, erro: "Comando vazio — nada a gerar." };
  }

  const tamanho = tamanhoPara(formato);

  try {
    const item = await gerarImagemOpenAI(comando, tamanho);
    if ("error" in item) return { ok: false, erro: item.error };

    let buffer: Buffer;
    let mimeType = "image/png";

    if (item.b64) {
      buffer = Buffer.from(item.b64, "base64");
    } else if (item.url) {
      const { fetchImageBuffer } = await import("./providers/fetchImageBuffer");
      const baixado = await fetchImageBuffer(item.url);
      if ("error" in baixado) return { ok: false, erro: `Falha ao baixar a imagem: ${baixado.error}` };
      buffer = baixado.buffer;
      mimeType = baixado.mimeType;
    } else {
      return { ok: false, erro: "A resposta da IA não trouxe nem imagem nem link." };
    }

    return { ok: true, url: await guardar(buffer, mimeType, restaurantId), modelo: MODELO_DE_IMAGEM, tamanho };
  } catch (err) {
    // A causa real, não um rótulo genérico — é o que permite consertar.
    return { ok: false, erro: err instanceof Error ? err.message.slice(0, 300) : "erro desconhecido" };
  }
}
