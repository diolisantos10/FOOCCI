/**
 * TranscriptionAdapter — voz → texto (Whisper), na camada de engines (o único
 * lugar que fala com a IA-piloto direto).
 *
 * ⚠️ **Por que existe `transcribeAudioResult` e não só `transcribeAudio`.**
 * Até 05/08/2026 esta função devolvia string vazia para TODA falha — chave
 * ausente, formato que o provedor recusa, provedor fora do ar, 429. Quem
 * chamava não tinha como distinguir "o lojista falou baixo" de "a nossa chave
 * está errada", e o lojista via sempre a mesma frase genérica: um alerta sem
 * evidência nenhuma (guardrail 6). O erro do provedor era engolido aqui.
 *
 * Agora a falha é **classificada** e volta com o recado do provedor para o log.
 * `transcribeAudio` continua existindo com o mesmo contrato de antes (string
 * vazia em qualquer falha) porque há chamadores que dependem disso.
 */

import { openai } from "@/lib/openai";

/** Limite do Whisper. Acima disso a chamada é recusada — nem vale gastar. */
export const TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;

export type TranscriptionFailureCode =
  /** Não há chave configurada no ambiente — problema NOSSO, não do lojista. */
  | "NOT_CONFIGURED"
  /** A chave existe mas o provedor recusou — expirada, revogada, sem crédito. */
  | "KEY_REJECTED"
  /** Chegou 0 byte. */
  | "EMPTY_AUDIO"
  /** O provedor não decodificou o arquivo (formato/extensão errada). */
  | "UNSUPPORTED_FORMAT"
  /** Passou do limite de tamanho. */
  | "TOO_LARGE"
  /** Estouro de cota/velocidade no provedor. */
  | "RATE_LIMITED"
  /** Provedor fora do ar ou rede caiu no meio. */
  | "PROVIDER_DOWN"
  /** Transcreveu, mas não havia fala nenhuma. */
  | "NO_SPEECH"
  | "UNKNOWN";

export type TranscriptionResult =
  | { ok: true; text: string }
  | {
      ok: false;
      code: TranscriptionFailureCode;
      /** Recado cru do provedor — vai para o LOG, nunca para a tela do lojista. */
      providerMessage: string;
    };

function errStatus(err: unknown): number {
  if (typeof err === "object" && err !== null && "status" in err) {
    const s = Number((err as { status: unknown }).status);
    if (Number.isFinite(s)) return s;
  }
  return 0;
}

/** Traduz a explosão do provedor num código que o log e a UI conseguem usar. */
export function classifyTranscriptionError(err: unknown): {
  code: TranscriptionFailureCode;
  providerMessage: string;
} {
  const providerMessage = err instanceof Error ? err.message : String(err);
  const lower = providerMessage.toLowerCase();
  const status = errStatus(err);

  if (
    status === 401 ||
    status === 403 ||
    lower.includes("incorrect api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("invalid authentication")
  ) {
    return { code: "KEY_REJECTED", providerMessage };
  }
  if (
    status === 413 ||
    lower.includes("maximum content size") ||
    lower.includes("file is too large") ||
    lower.includes("audio file is too long")
  ) {
    return { code: "TOO_LARGE", providerMessage };
  }
  if (
    status === 415 ||
    lower.includes("invalid file format") ||
    lower.includes("unrecognized file format") ||
    lower.includes("could not be decoded") ||
    lower.includes("format is not supported")
  ) {
    return { code: "UNSUPPORTED_FORMAT", providerMessage };
  }
  if (status === 429 || lower.includes("rate limit") || lower.includes("quota")) {
    return { code: "RATE_LIMITED", providerMessage };
  }
  if (
    status >= 500 ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed") ||
    lower.includes("socket hang up")
  ) {
    return { code: "PROVIDER_DOWN", providerMessage };
  }
  return { code: "UNKNOWN", providerMessage };
}

/**
 * Transcreve um áudio para texto (pt) **dizendo por que falhou quando falha.**
 * Nunca lança: a falha volta no valor de retorno, classificada.
 */
export async function transcribeAudioResult(file: File): Promise<TranscriptionResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === "not-configured") {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      providerMessage: "OPENAI_API_KEY ausente no ambiente",
    };
  }
  if (!file.size) {
    return { ok: false, code: "EMPTY_AUDIO", providerMessage: "arquivo com 0 byte" };
  }
  if (file.size > TRANSCRIPTION_MAX_BYTES) {
    return {
      ok: false,
      code: "TOO_LARGE",
      providerMessage: `${file.size} bytes > limite de ${TRANSCRIPTION_MAX_BYTES}`,
    };
  }

  try {
    const r = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "pt",
    });
    const text = (r.text ?? "").trim();
    if (!text) {
      return { ok: false, code: "NO_SPEECH", providerMessage: "transcrição vazia" };
    }
    return { ok: true, text };
  } catch (err) {
    return { ok: false, ...classifyTranscriptionError(err) };
  }
}

/**
 * Contrato histórico: texto, ou string vazia em qualquer falha.
 * Mantido para os chamadores que já existiam (campanha por IA, suporte técnico).
 * **Em código novo, prefira `transcribeAudioResult`** — este aqui apaga a causa.
 */
export async function transcribeAudio(file: File): Promise<string> {
  const r = await transcribeAudioResult(file);
  if (r.ok) return r.text;
  console.warn(`[transcribeAudio] falhou: ${r.code} — ${r.providerMessage}`);
  return "";
}
