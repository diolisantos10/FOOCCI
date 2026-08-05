/**
 * HelpAttachmentService — o print, a foto e o PDF que o lojista manda no chat
 * de suporte.
 *
 * Metade do suporte de verdade é um arquivo: "a tela está assim" é um print,
 * "a nota saiu errada" é um PDF. Até 05/08/2026 não havia como mandar nenhum
 * dos dois, e o lojista tinha que descrever com palavras o que cabia numa
 * imagem.
 *
 * ─── As três regras que este arquivo existe para impor ───────────────────────
 *
 * 1. **A trava é aqui, não no navegador (guardrail 4).** `<input accept="…">` e
 *    o `file.type` que o navegador manda são *conveniência* — qualquer um os
 *    contorna com um `curl`. Quem decide é `sniffKind`, que lê os PRIMEIROS
 *    BYTES do arquivo. Um `.png` que por dentro é um executável é recusado.
 *
 * 2. **Nada de arquivo servido sem autenticação.** O binário fica no Postgres
 *    e sai só pela rota que confere o tenant (ou pela rota de admin). O S3
 *    deste projeto grava com `ACL: "public-read"` e o `/api/media/[id]` é rota
 *    pública — servem foto de cardápio, que é feita para todo mundo ver. Print
 *    de suporte carrega nome, telefone e endereço de cliente final; link
 *    adivinhado não pode virar vazamento.
 *
 * 3. **O nome do arquivo é saneado.** O que o navegador manda é entrada de
 *    fora: caminho, `../`, byte de controle e nome quilométrico ficam de lado.
 */

import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, type ServiceResult } from "@/types";

export type AttachmentKind = "IMAGE" | "PDF" | "AUDIO";

/** Tetos por tipo. Generosos para o uso real, pequenos para quem quer abusar. */
export const ATTACHMENT_MAX_BYTES: Record<AttachmentKind, number> = {
  IMAGE: 10 * 1024 * 1024,
  PDF: 15 * 1024 * 1024,
  AUDIO: 25 * 1024 * 1024,
};

/** O maior teto que existe — o corte grosso, antes de saber o tipo. */
export const ATTACHMENT_HARD_MAX_BYTES = 25 * 1024 * 1024;

/** Quantos arquivos cabem numa mensagem só. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export interface AttachmentDTO {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  kind: AttachmentKind;
  /** Caminho autenticado. Nunca uma URL pública. */
  url: string;
  createdAt: string;
}

interface Sniffed {
  kind: AttachmentKind;
  mimeType: string;
  ext: string;
}

function startsWith(b: Uint8Array, sig: number[], offset = 0): boolean {
  if (b.length < offset + sig.length) return false;
  return sig.every((v, i) => b[offset + i] === v);
}

function ascii(b: Uint8Array, offset: number, length: number): string {
  return Array.from(b.slice(offset, offset + length))
    .map((c) => String.fromCharCode(c))
    .join("");
}

/**
 * O tipo REAL do arquivo, lido dos primeiros bytes. `null` = não é nada que a
 * gente aceita — e aí recusamos, em vez de tentar adivinhar.
 *
 * Ordem importa: `ftyp` cobre HEIC (foto de iPhone) e MPEG-4 (áudio de iPhone)
 * no mesmo lugar, e é a marca que muda entre os dois.
 */
export function sniffKind(bytes: Uint8Array): Sniffed | null {
  // ── Imagens ───────────────────────────────────────────────────────────────
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { kind: "IMAGE", mimeType: "image/jpeg", ext: "jpg" };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: "IMAGE", mimeType: "image/png", ext: "png" };
  }
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return { kind: "IMAGE", mimeType: "image/gif", ext: "gif" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { kind: "IMAGE", mimeType: "image/webp", ext: "webp" };
  }
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    // Foto tirada de iPhone chega assim — recusar HEIC seria recusar o print
    // mais comum que existe no bolso do lojista.
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return { kind: "IMAGE", mimeType: "image/heic", ext: "heic" };
    }
    if (["m4a ", "mp42", "isom", "mp41", "iso2", "avc1", "dash"].includes(brand)) {
      return { kind: "AUDIO", mimeType: "audio/mp4", ext: "m4a" };
    }
    return null;
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  if (ascii(bytes, 0, 5) === "%PDF-") {
    return { kind: "PDF", mimeType: "application/pdf", ext: "pdf" };
  }

  // ── Áudio (o ditado que não virou texto e vai anexado para um humano ouvir) ─
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { kind: "AUDIO", mimeType: "audio/webm", ext: "webm" };
  }
  if (ascii(bytes, 0, 4) === "OggS") {
    return { kind: "AUDIO", mimeType: "audio/ogg", ext: "ogg" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") {
    return { kind: "AUDIO", mimeType: "audio/wav", ext: "wav" };
  }
  if (ascii(bytes, 0, 3) === "ID3" || startsWith(bytes, [0xff, 0xfb]) || startsWith(bytes, [0xff, 0xf3])) {
    return { kind: "AUDIO", mimeType: "audio/mpeg", ext: "mp3" };
  }
  if (ascii(bytes, 0, 4) === "fLaC") {
    return { kind: "AUDIO", mimeType: "audio/flac", ext: "flac" };
  }

  return null;
}

/**
 * Deixa o nome apresentável e inofensivo, mantendo a extensão que os bytes
 * provaram. Nome é só rótulo aqui — o servidor nunca abre caminho a partir
 * dele —, mas ele aparece na tela de quem atende e vira nome de download.
 */
export function sanitizeFileName(raw: string, ext: string): string {
  const base = (raw || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^\p{L}\p{N}\-_. ]/gu, "")
    .trim()
    .slice(0, 60);
  // Nome só de pontos e espaços ("...", "   ") não é nome: viraria "....pdf".
  const usable = /[\p{L}\p{N}]/u.test(base) ? base : "";
  return `${usable || "anexo"}.${ext}`;
}

/** A frase que o lojista lê quando o arquivo não passa. Sempre com a saída. */
export const ATTACHMENT_REJECTED_TYPE =
  "Esse arquivo eu não consigo abrir. Mande uma imagem (print ou foto) ou um PDF.";

export function tooLargeMessage(kind: AttachmentKind): string {
  const mb = Math.round(ATTACHMENT_MAX_BYTES[kind] / (1024 * 1024));
  const what = kind === "PDF" ? "PDF" : kind === "AUDIO" ? "áudio" : "imagem";
  return `Esse ${what} passou de ${mb} MB. Mande uma versão menor — um print da tela costuma bastar.`;
}

export function attachmentDTO(a: {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  createdAt: Date;
}): AttachmentDTO {
  return {
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    bytes: a.bytes,
    kind: kindOfMime(a.mimeType),
    url: `/api/help/attachments/${a.id}`,
    createdAt: a.createdAt.toISOString(),
  };
}

export function kindOfMime(mime: string): AttachmentKind {
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("audio/")) return "AUDIO";
  return "PDF";
}

export class HelpAttachmentService {
  /**
   * Guarda o arquivo como RASCUNHO da conversa (`messageId` nulo). Ele só é
   * amarrado à mensagem quando o lojista aperta enviar — assim existe
   * pré-visualização e existe "remover" antes do envio.
   */
  static async upload(params: {
    restaurantId: string;
    threadId: string;
    userId: string | null;
    file: File;
  }): Promise<ServiceResult<AttachmentDTO>> {
    const { restaurantId, threadId, userId, file } = params;
    try {
      // Corte grosso antes de puxar o binário inteiro para a memória.
      if (file.size === 0) {
        return serviceFail("O arquivo chegou vazio. Escolha de novo.", 400);
      }
      if (file.size > ATTACHMENT_HARD_MAX_BYTES) {
        return serviceFail(tooLargeMessage("AUDIO"), 413);
      }

      const buf = Buffer.from(await file.arrayBuffer());
      const sniffed = sniffKind(new Uint8Array(buf.subarray(0, 64)));

      // A trava: o que manda é o conteúdo, não o `file.type` que veio de fora.
      if (!sniffed) return serviceFail(ATTACHMENT_REJECTED_TYPE, 415);
      if (buf.length > ATTACHMENT_MAX_BYTES[sniffed.kind]) {
        return serviceFail(tooLargeMessage(sniffed.kind), 413);
      }

      const pendentes = await prisma.helpAttachment.count({
        where: { threadId, messageId: null },
      });
      if (pendentes >= MAX_ATTACHMENTS_PER_MESSAGE) {
        return serviceFail(
          `Dá para mandar até ${MAX_ATTACHMENTS_PER_MESSAGE} arquivos por mensagem. Envie estes e mande o resto na próxima.`,
          400,
        );
      }

      const created = await prisma.helpAttachment.create({
        data: {
          restaurantId,
          threadId,
          uploadedBy: userId,
          fileName: sanitizeFileName(file.name, sniffed.ext),
          mimeType: sniffed.mimeType,
          bytes: buf.length,
          data: buf,
        },
        select: { id: true, fileName: true, mimeType: true, bytes: true, createdAt: true },
      });

      console.log(
        `[help/attachments] upload ${JSON.stringify({
          restaurantId,
          threadId,
          id: created.id,
          kind: sniffed.kind,
          mimeType: sniffed.mimeType,
          bytes: buf.length,
        })}`,
      );
      return serviceOk(attachmentDTO(created));
    } catch (err) {
      console.error("[HelpAttachmentService.upload]", err);
      return serviceFail("Não consegui guardar o arquivo. Tente de novo.", 500);
    }
  }

  /** Rascunhos ainda não enviados desta conversa. */
  static async listPending(threadId: string): Promise<AttachmentDTO[]> {
    const rows = await prisma.helpAttachment.findMany({
      where: { threadId, messageId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, fileName: true, mimeType: true, bytes: true, createdAt: true },
    });
    return rows.map(attachmentDTO);
  }

  /**
   * Amarra os rascunhos à mensagem recém-criada. Só amarra o que é da MESMA
   * conversa e ainda está solto — id de outro tenant não encosta.
   */
  static async attachToMessage(
    threadId: string,
    messageId: string,
    ids: string[],
  ): Promise<AttachmentDTO[]> {
    if (!ids.length) return [];
    await prisma.helpAttachment.updateMany({
      where: { id: { in: ids.slice(0, MAX_ATTACHMENTS_PER_MESSAGE) }, threadId, messageId: null },
      data: { messageId },
    });
    const rows = await prisma.helpAttachment.findMany({
      where: { messageId },
      orderBy: { createdAt: "asc" },
      select: { id: true, fileName: true, mimeType: true, bytes: true, createdAt: true },
    });
    return rows.map(attachmentDTO);
  }

  /** Remove um rascunho. Já enviado não se apaga — é evidência da conversa. */
  static async removePending(
    restaurantId: string,
    id: string,
  ): Promise<ServiceResult<{ id: string }>> {
    try {
      const r = await prisma.helpAttachment.deleteMany({
        where: { id, restaurantId, messageId: null },
      });
      if (!r.count) {
        return serviceFail("Esse anexo já foi enviado ou não é seu.", 404);
      }
      return serviceOk({ id });
    } catch (err) {
      console.error("[HelpAttachmentService.removePending]", err);
      return serviceFail("Não consegui remover o anexo.", 500);
    }
  }

  /** Anexos por mensagem, para montar o histórico de uma vez só. */
  static async byMessages(messageIds: string[]): Promise<Map<string, AttachmentDTO[]>> {
    const map = new Map<string, AttachmentDTO[]>();
    if (!messageIds.length) return map;
    const rows = await prisma.helpAttachment.findMany({
      where: { messageId: { in: messageIds } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        messageId: true,
        fileName: true,
        mimeType: true,
        bytes: true,
        createdAt: true,
      },
    });
    for (const r of rows) {
      if (!r.messageId) continue;
      const list = map.get(r.messageId) ?? [];
      list.push(attachmentDTO(r));
      map.set(r.messageId, list);
    }
    return map;
  }
}
