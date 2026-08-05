/**
 * O contrato de erro do ditado por voz — de um lado só, para não divergir.
 *
 * Mora fora do `route.ts` porque um route handler do App Router só pode
 * exportar `GET/POST/...` e a configuração; qualquer outro export vira erro de
 * build. E porque isto é regra de produto, não detalhe de HTTP: é aqui que
 * está escrito **o que o lojista lê quando o microfone falha**.
 *
 * A regra de escrita de cada frase, aprendida no P0 de 05/08/2026 — quando o
 * lojista recebeu "Não consegui ler o áudio." e não teve o que fazer:
 *
 *   1. dizer o que aconteceu, sem jargão;
 *   2. dizer o próximo passo concreto;
 *   3. lembrar que **digitar resolve igual** — ninguém fica preso porque o
 *      microfone falhou;
 *   4. quando a culpa é nossa, assumir. Mandar o lojista "falar mais perto do
 *      microfone" quando a nossa chave está errada é mentir para ele.
 */

import type { TranscriptionFailureCode } from "@/services/brain/engines/TranscriptionAdapter";

export type TranscribeErrorCode =
  | TranscriptionFailureCode
  | "UNAUTHORIZED"
  | "BODY_UNREADABLE"
  | "NO_AUDIO";

export interface TranscribeReply {
  /** Frase para o lojista — sempre com o próximo passo. */
  error: string;
  /** Vale a pena tocar em "tentar de novo" com o MESMO áudio? */
  retriable: boolean;
  status: number;
}

export const TRANSCRIBE_REPLIES: Record<TranscribeErrorCode, TranscribeReply> = {
  UNAUTHORIZED: {
    error: "Sua sessão expirou. Atualize a página, entre de novo e o microfone volta a funcionar.",
    retriable: false,
    status: 401,
  },
  BODY_UNREADABLE: {
    error:
      "Seu áudio não chegou inteiro até aqui — costuma ser oscilação da internet. Toque em Tentar de novo: o que você gravou não foi perdido.",
    retriable: true,
    status: 400,
  },
  NO_AUDIO: {
    error:
      "Não veio som nenhum. Segure o botão do microfone enquanto fala e solte só no fim — ou digite, que a gente resolve igual.",
    retriable: false,
    status: 400,
  },
  EMPTY_AUDIO: {
    error:
      "A gravação saiu vazia. Verifique se o microfone está liberado para este site, fale perto dele e tente de novo.",
    retriable: false,
    status: 400,
  },
  UNSUPPORTED_FORMAT: {
    error:
      "Seu aparelho gravou num formato que eu não consegui abrir. Já anotamos isso para corrigir. Toque em Tentar de novo — se repetir, digite que a gente resolve igual.",
    retriable: true,
    status: 415,
  },
  TOO_LARGE: {
    error: "O áudio ficou longo demais. Grave um trecho mais curto e mande em duas partes.",
    retriable: false,
    status: 413,
  },
  RATE_LIMITED: {
    error:
      "Tem muita gente ditando ao mesmo tempo. Espere uns segundos e toque em Tentar de novo — seu áudio continua aqui.",
    retriable: true,
    status: 429,
  },
  PROVIDER_DOWN: {
    error:
      "A transcrição está instável neste momento. Toque em Tentar de novo — ou digite, que a gente resolve igual.",
    retriable: true,
    status: 503,
  },
  NOT_CONFIGURED: {
    error:
      "O ditado por voz está fora do ar do nosso lado — não é o seu aparelho. Já registramos a falha. Digite sua mensagem que a gente resolve igual.",
    retriable: false,
    status: 503,
  },
  KEY_REJECTED: {
    error:
      "O ditado por voz está fora do ar do nosso lado — não é o seu aparelho. Já registramos a falha. Digite sua mensagem que a gente resolve igual.",
    retriable: false,
    status: 503,
  },
  NO_SPEECH: {
    error:
      "Ouvi o áudio, mas não identifiquei nenhuma fala. Fale mais perto do microfone e tente de novo.",
    retriable: true,
    status: 422,
  },
  UNKNOWN: {
    error:
      "Não consegui transcrever agora. Toque em Tentar de novo — se insistir, digite que a gente resolve igual.",
    retriable: true,
    status: 502,
  },
};

/**
 * As falhas que são NOSSAS. Vão para o log como erro (e não como aviso) porque
 * exigem alguém agir do nosso lado, não do lado do lojista.
 */
export const TRANSCRIBE_OUR_FAULT: ReadonlySet<TranscribeErrorCode> =
  new Set<TranscribeErrorCode>([
    "NOT_CONFIGURED",
    "KEY_REJECTED",
    "PROVIDER_DOWN",
    "UNSUPPORTED_FORMAT",
    "UNKNOWN",
  ]);

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
}

/**
 * Extensões que o Whisper abre. **Ele decide o formato pelo NOME do arquivo**,
 * então um `.webm` que por dentro é MPEG-4 (iPhone) volta como
 * "Invalid file format". Esta é a trava de FORMATO, no servidor.
 */
export const TRANSCRIPTION_EXTENSIONS = [
  "flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm",
] as const;

export function isAcceptedAudioName(name: string): boolean {
  return (TRANSCRIPTION_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** Deriva um nome de arquivo válido a partir do content-type do corpo cru. */
export function nameFromContentType(contentType: string): string {
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/oga": "oga",
    // O Safari do iPhone grava MPEG-4. `m4a` (e não `mp4`) é o nome que deixa
    // o provedor tratar isso como ÁUDIO — e é o mesmo que o gancho do
    // navegador usa, para o log dos dois lados bater.
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/flac": "flac",
  };
  return `ditado.${map[type] ?? "webm"}`;
}
